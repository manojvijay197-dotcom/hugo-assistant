type PopupKind = 'info' | 'success' | 'error' | 'warning';

function ensureHost(): HTMLElement {
  let host = document.getElementById('ui-overlay-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'ui-overlay-host';
    document.body.appendChild(host);
  }
  return host;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getPopupEl(): HTMLElement {
  const host = ensureHost();
  let el = document.getElementById('app-popup');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-popup';
    el.className = 'overlay-layer hidden';
    host.appendChild(el);
  }
  return el;
}

function getLoaderEl(): HTMLElement {
  const host = ensureHost();
  let el = document.getElementById('app-loader');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-loader';
    el.className = 'overlay-layer hidden';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    host.appendChild(el);
  }
  return el;
}

function anyOverlayVisible(): boolean {
  const loader = document.getElementById('app-loader');
  const popup = document.getElementById('app-popup');
  const report = document.getElementById('app-report-modal');
  const loaderOpen = Boolean(loader && !loader.classList.contains('hidden'));
  const popupOpen = Boolean(popup && !popup.classList.contains('hidden'));
  const reportOpen = Boolean(report && !report.classList.contains('hidden'));
  return loaderOpen || popupOpen || reportOpen;
}

function syncBodyLock(): void {
  if (anyOverlayVisible()) document.body.classList.add('overlay-open');
  else document.body.classList.remove('overlay-open');
}

/** Full-screen loader with descriptive status text. */
export function showLoader(title: string, detail?: string): void {
  // Hide popup while loading so only one overlay shows
  const popup = document.getElementById('app-popup');
  if (popup) popup.classList.add('hidden');

  const el = getLoaderEl();
  el.innerHTML = `
    <div class="overlay-card loader-card">
      <div class="spinner" aria-hidden="true"></div>
      <p class="overlay-title">${escapeHtml(title)}</p>
      ${detail ? `<p class="overlay-detail">${escapeHtml(detail)}</p>` : ''}
    </div>
  `;
  el.classList.remove('hidden');
  syncBodyLock();
}

export function updateLoader(title: string, detail?: string): void {
  const el = document.getElementById('app-loader');
  if (!el || el.classList.contains('hidden')) {
    showLoader(title, detail);
    return;
  }
  const titleEl = el.querySelector('.overlay-title');
  const detailEl = el.querySelector('.overlay-detail');
  if (titleEl) titleEl.textContent = title;
  if (detail) {
    if (detailEl) detailEl.textContent = detail;
    else {
      const p = document.createElement('p');
      p.className = 'overlay-detail';
      p.textContent = detail;
      el.querySelector('.loader-card')?.appendChild(p);
    }
  } else if (detailEl) {
    detailEl.remove();
  }
}

export function hideLoader(): void {
  const el = document.getElementById('app-loader');
  if (el) el.classList.add('hidden');
  syncBodyLock();
}

/** In-app modal popup (never uses window.alert / confirm). */
export function showPopup(
  title: string,
  message: string,
  kind: PopupKind = 'info',
  extras?: Pick<ConfirmOptions, 'label' | 'labelDetail'>
): Promise<void> {
  return showConfirm(title, message, {
    kind,
    confirmLabel: 'OK',
    showCancel: false,
    ...extras
  }).then(() => undefined);
}

export type ConfirmOptions = {
  kind?: PopupKind;
  confirmLabel?: string;
  cancelLabel?: string;
  showCancel?: boolean;
  /** Highlighted callout under the message (e.g. report.json reminder). */
  label?: string;
  labelDetail?: string;
};

/** Custom confirm popup — returns true if confirmed. */
export function showConfirm(
  title: string,
  message: string,
  options: ConfirmOptions = {}
): Promise<boolean> {
  const {
    kind = 'info',
    confirmLabel = 'Continue',
    cancelLabel = 'Cancel',
    showCancel = true,
    label,
    labelDetail
  } = options;

  return new Promise((resolve) => {
    hideLoader();
    const el = getPopupEl();

    el.innerHTML = `
      <div class="overlay-card popup-card popup-${kind}" role="dialog" aria-modal="true">
        <p class="overlay-kicker">Hugo Assistant</p>
        <p class="overlay-title">${escapeHtml(title)}</p>
        <p class="overlay-detail">${escapeHtml(message)}</p>
        ${
          label
            ? `<div class="popup-label-box">
                <span class="popup-label">${escapeHtml(label)}</span>
                ${labelDetail ? `<p class="popup-label-detail">${escapeHtml(labelDetail)}</p>` : ''}
              </div>`
            : ''
        }
        <div class="popup-actions">
          ${
            showCancel
              ? `<button type="button" class="btn-secondary" id="popup-cancel-btn">${escapeHtml(cancelLabel)}</button>`
              : ''
          }
          <button type="button" class="primary" id="popup-ok-btn">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;
    el.classList.remove('hidden');
    syncBodyLock();

    const finish = (ok: boolean) => {
      el.classList.add('hidden');
      syncBodyLock();
      resolve(ok);
    };

    el.querySelector('#popup-ok-btn')?.addEventListener('click', () => finish(true), { once: true });
    el.querySelector('#popup-cancel-btn')?.addEventListener('click', () => finish(false), { once: true });
  });
}

export async function withLoader<T>(
  title: string,
  detail: string | undefined,
  work: (update: (title: string, detail?: string) => void) => Promise<T>
): Promise<T> {
  showLoader(title, detail);
  try {
    return await work(updateLoader);
  } finally {
    hideLoader();
  }
}

function getReportModalEl(): HTMLElement {
  const host = ensureHost();
  let el = document.getElementById('app-report-modal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-report-modal';
    el.className = 'overlay-layer report-overlay hidden';
    host.appendChild(el);
  }
  return el;
}

/** Full-width report table modal. */
export function showReportModal(title: string, bodyHtml: string): void {
  hideLoader();
  const el = getReportModalEl();
  el.innerHTML = `
    <div class="report-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <header class="report-modal-header">
        <div>
          <p class="overlay-kicker">Hugo Assistant</p>
          <h2 class="report-modal-title">${escapeHtml(title)}</h2>
        </div>
        <button type="button" class="btn-secondary" id="report-modal-close">Close</button>
      </header>
      <div class="report-modal-body">${bodyHtml}</div>
    </div>
  `;
  el.classList.remove('hidden');
  syncBodyLock();

  const close = () => {
    el.classList.add('hidden');
    syncBodyLock();
  };

  el.querySelector('#report-modal-close')?.addEventListener('click', close, { once: true });
  el.addEventListener(
    'click',
    (e) => {
      if (e.target === el) close();
    },
    { once: true }
  );
}
