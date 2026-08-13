import './styles.css';
import type { Issue, ProjectFiles, ScanReport } from './types';
import { loadProjectFromDirectoryHandle, loadProjectFromFileList, readTragoVersion } from './core/project';
import { getTargetVersionOptions } from './core/versions';
import { runFullScan } from './core/scan';
import {
  downloadJson,
  downloadPdf,
  downloadSheet,
  saveReportsToHugoAssistantFolder
} from './core/exports';
import { hideLoader, showConfirm, showLoader, showPopup, updateLoader, withLoader } from './ui/overlay';

type AppState = {
  project: ProjectFiles | null;
  currentVersion: string | null;
  targetVersion: string | null;
  report: ScanReport | null;
  view: 'table' | 'json';
  busy: boolean;
  error: string | null;
  status: string;
};

const state: AppState = {
  project: null,
  currentVersion: null,
  targetVersion: null,
  report: null,
  view: 'table',
  busy: false,
  error: null,
  status: 'Upload your project folder to begin.'
};

const app = document.querySelector<HTMLDivElement>('#app')!;

function render(): void {
  const versionReady = Boolean(state.currentVersion);
  const canSubmit = Boolean(
    state.project && state.currentVersion && state.targetVersion && !state.busy
  );

  app.innerHTML = `
    <header class="hero">
      <h1>Hugo Assistant</h1>
      <p>Private upgrade checker — Hugo deprecations and broken images only. Upload your project, pick a target version, then review Website + Vendor results.</p>
    </header>

    <section class="panel">
      <p class="step-label">Step 1</p>
      <h2>Upload project folder</h2>
      <div class="upload-box">
        <p>Select the root folder that contains <code>website/</code> (with <code>trago.js</code> inside). Files stay on your machine.</p>
        <button type="button" id="choose-folder-btn" ${state.busy ? 'disabled' : ''}>
          Select folder
        </button>
        <input id="folder-input" type="file" webkitdirectory multiple />
      </div>
      <p class="status ${state.error ? 'error' : ''}">${escapeHtml(state.error || state.status)}</p>
    </section>

    <section class="panel ${versionReady ? '' : 'hidden'}">
      <p class="step-label">Step 2</p>
      <h2>Current Hugo version</h2>
      <p class="divider-label">Read from <code>website/trago.js</code></p>
      <div class="version-pill">Detected <code>${escapeHtml(state.currentVersion || '—')}</code></div>

      <p class="step-label">Step 3</p>
      <h2>Select target version</h2>
      <p class="divider-label">Options from your current version through the latest Hugo release</p>
      <div class="radio-grid">
        ${renderVersionRadios()}
      </div>

      <div class="actions">
        <button type="button" class="primary" id="submit-btn" ${canSubmit ? '' : 'disabled'}>
          ${state.busy ? 'Scanning…' : 'Run checks'}
        </button>
      </div>
    </section>

    <section class="panel ${state.report ? '' : 'hidden'}">
      <p class="step-label">Results</p>
      <h2>Scan complete</h2>
      ${state.report ? renderSummary(state.report) : ''}
      <div class="cta-row">
        <button type="button" data-export="pdf" ${state.busy ? 'disabled' : ''}>Download PDF</button>
        <button type="button" data-export="sheet" ${state.busy ? 'disabled' : ''}>Download Sheet</button>
        <button type="button" data-export="json" ${state.busy ? 'disabled' : ''}>Download JSON</button>
        <button type="button" data-export="bundle" ${state.busy ? 'disabled' : ''}>Save .hugo-assistant reports</button>
      </div>
      <div class="tabs">
        <button type="button" data-view="table" class="${state.view === 'table' ? 'active' : ''}">Table list</button>
        <button type="button" data-view="json" class="${state.view === 'json' ? 'active' : ''}">JSON list</button>
      </div>
      ${state.report ? renderResults(state.report) : ''}
    </section>
  `;

  bindEvents();
}

function renderVersionRadios(): string {
  if (!state.currentVersion) return '';
  return getTargetVersionOptions(state.currentVersion)
    .map(
      (v) => `<label>
        <input type="radio" name="target-version" value="${escapeHtml(v)}" ${
          state.targetVersion === v ? 'checked' : ''
        } />
        ${escapeHtml(v)}
      </label>`
    )
    .join('');
}

function renderSummary(report: ScanReport): string {
  return `<div class="summary-row">
    <div class="stat"><span>Total</span><strong>${report.summary.total}</strong></div>
    <div class="stat"><span>Errors</span><strong>${report.summary.errors}</strong></div>
    <div class="stat"><span>Warnings</span><strong>${report.summary.warnings}</strong></div>
    <div class="stat"><span>Infos</span><strong>${report.summary.infos}</strong></div>
    <div class="stat"><span>Current → Target</span><strong>${escapeHtml(report.currentVersion)} → ${escapeHtml(report.targetVersion)}</strong></div>
  </div>`;
}

function renderResults(report: ScanReport): string {
  if (state.view === 'json') {
    return `<pre class="json-view">${escapeHtml(JSON.stringify(report, null, 2))}</pre>`;
  }

  return `
    <h3 class="section-title">${escapeHtml(report.website.title)}</h3>
    ${renderTable(report.website.issues)}
    <h3 class="section-title">${escapeHtml(report.vendor.title)}</h3>
    ${renderTable(report.vendor.issues)}
  `;
}

function renderTable(issues: Issue[]): string {
  if (!issues.length) {
    return `<div class="table-wrap"><table><tbody><tr><td>No issues found.</td></tr></tbody></table></div>`;
  }

  const rows = issues
    .map(
      (i) => `<tr>
      <td><span class="badge ${i.severity}">${i.severity}</span></td>
      <td>${escapeHtml(i.category)}</td>
      <td>${escapeHtml(i.title)}</td>
      <td><code>${escapeHtml(i.file || '')}${i.line ? ':' + i.line : ''}</code></td>
      <td>${escapeHtml(i.deprecatedIn || '—')}</td>
      <td>${renderFixCell(i)}</td>
      <td>${escapeHtml(i.description)}</td>
      <td>${escapeHtml(i.vendorModule || '—')}</td>
    </tr>`
    )
    .join('');

  return `<div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Severity</th>
          <th>Category</th>
          <th>Title</th>
          <th>Where used</th>
          <th>Deprecated in</th>
          <th>How to fix</th>
          <th>Details</th>
          <th>Vendor module</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function renderFixCell(issue: Issue): string {
  const fix = escapeHtml(issue.replacement || '—');
  if (!issue.documentation) return fix;
  const href = escapeHtml(issue.documentation);
  return `${fix}<div class="fix-docs"><a class="doc-link" href="${href}" target="_blank" rel="noopener noreferrer">Official docs</a></div>`;
}

function bindEvents(): void {
  const input = document.querySelector<HTMLInputElement>('#folder-input');
  const chooseBtn = document.querySelector<HTMLButtonElement>('#choose-folder-btn');
  const submit = document.querySelector<HTMLButtonElement>('#submit-btn');

  chooseBtn?.addEventListener('click', () => {
    void startFolderUpload(input);
  });

  // Legacy fallback only (Safari / older browsers) — may show Chrome's bulk upload dialog
  input?.addEventListener('change', async () => {
    if (!input.files?.length) {
      hideLoader();
      state.status = 'No folder selected.';
      render();
      return;
    }
    await processProject(loadProjectFromFileList(input.files));
    input.value = '';
  });

  document.querySelectorAll<HTMLInputElement>('input[name="target-version"]').forEach((el) => {
    el.addEventListener('change', () => {
      state.targetVersion = el.value;
      render();
    });
  });

  submit?.addEventListener('click', () => void runScan());

  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view === 'json' ? 'json' : 'table';
      render();
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-export]').forEach((btn) => {
    btn.addEventListener('click', () => {
      void handleExport(btn.dataset.export || '');
    });
  });
}

async function startFolderUpload(input: HTMLInputElement | null): Promise<void> {
  if (state.busy) return;

  const confirmed = await showConfirm(
    'Select project folder?',
    'Pick the root folder that contains website/ (with trago.js). Files are read locally in your browser — nothing is uploaded to a server.',
    {
      kind: 'info',
      confirmLabel: 'Select folder',
      cancelLabel: 'Cancel',
      showCancel: true
    }
  );

  if (!confirmed) {
    state.status = 'Folder selection cancelled.';
    render();
    return;
  }

  // Prefer File System Access API — avoids Chrome's "Upload N files to this site?" alert
  if (typeof window.showDirectoryPicker === 'function') {
    showLoader('Waiting for folder', 'Folder picker is open — choose your project folder…');
    state.status = 'Waiting for folder selection…';
    render();
    showLoader('Waiting for folder', 'Folder picker is open — choose your project folder…');

    try {
      const dir = await window.showDirectoryPicker({ mode: 'read' });
      await processProject(
        loadProjectFromDirectoryHandle(dir, (scanned, current) => {
          updateLoader(
            'Reading project files',
            `Scanned ${scanned} file(s)… ${current === 'done' ? '' : current}`
          );
        })
      );
    } catch (err) {
      hideLoader();
      if (err instanceof DOMException && err.name === 'AbortError') {
        state.status = 'No folder selected.';
        render();
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      state.error = message;
      await showPopup('Folder selection failed', message, 'error');
      state.busy = false;
      render();
    }
    return;
  }

  // Fallback: legacy input (may trigger browser trust dialog on large folders)
  if (!input) {
    await showPopup(
      'Folder picker unavailable',
      'This browser does not support local folder selection. Please use Chrome or Edge.',
      'warning'
    );
    return;
  }

  await showPopup(
    'Using legacy folder picker',
    'Your browser may show a system trust dialog for large folders. Prefer Chrome/Edge for the smoother local folder picker.',
    'info'
  );

  showLoader('Waiting for folder', 'System folder picker is open — select your project folder…');
  state.status = 'Waiting for folder selection…';
  render();
  showLoader('Waiting for folder', 'System folder picker is open — select your project folder…');
  input.click();
}

async function processProject(loadPromise: Promise<import('./types').ProjectFiles>): Promise<void> {
  state.busy = true;
  state.error = null;
  state.report = null;
  state.targetVersion = null;
  state.currentVersion = null;
  state.project = null;
  state.status = 'Reading folder…';

  showLoader('Reading folder', 'Loading project files from disk…');
  render();
  showLoader('Reading folder', 'Loading project files from disk…');

  try {
    await tick(40);
    updateLoader('Locating website', 'Looking for website/ and trago.js…');

    const project = await loadPromise;

    updateLoader('Reading Hugo version', `Parsing ${project.websiteRoot}/trago.js…`);
    await tick(60);

    const currentVersion = readTragoVersion(project);
    state.project = project;
    state.currentVersion = currentVersion;
    state.status = `Loaded “${project.websiteRoot}”. Current Hugo version: ${currentVersion}. Select a target version.`;

    hideLoader();
    await showPopup(
      'Folder loaded',
      `Website found at “${project.websiteRoot}”. Current Hugo version is ${currentVersion}. Choose a target version, then run checks.`,
      'success'
    );
  } catch (err) {
    state.project = null;
    state.currentVersion = null;
    state.error = err instanceof Error ? err.message : String(err);
    state.status = '';
    hideLoader();
    await showPopup('Upload failed', state.error, 'error');
  } finally {
    state.busy = false;
    render();
  }
}

async function runScan(): Promise<void> {
  if (!state.project || !state.currentVersion || !state.targetVersion) return;
  state.busy = true;
  state.error = null;
  state.status = 'Running checks…';
  render();

  try {
    await withLoader(
      'Starting scan',
      `Comparing Hugo ${state.currentVersion} → ${state.targetVersion}`,
      async (update) => {
        await tick(120);
        update('Checking Hugo deprecations', 'Scanning templates and config for deprecated methods…');
        await tick(180);
        update('Checking broken images', 'Resolving image paths against static/ and assets/…');
        await tick(180);
        update('Scanning vendor modules', 'Checking _vendor layouts, assets, static, data, and i18n…');
        await tick(120);
        state.report = runFullScan(state.project!, state.currentVersion!, state.targetVersion!);
        update('Finishing report', `Found ${state.report.summary.total} issue(s)…`);
        await tick(100);
      }
    );

    state.status = `Done. ${state.report!.summary.total} issue(s).`;
    await showPopup(
      'Scan complete',
      `Found ${state.report!.summary.total} issue(s) — ${state.report!.summary.errors} error(s), ${state.report!.summary.warnings} warning(s). Review Website Result and Vendor Result below.`,
      'success'
    );
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
    await showPopup('Scan failed', state.error, 'error');
  } finally {
    state.busy = false;
    render();
  }
}

async function handleExport(kind: string): Promise<void> {
  if (!state.report || state.busy) return;
  state.busy = true;
  render();

  try {
    if (kind === 'pdf') {
      const result = await withLoader(
        'Preparing PDF',
        'Building print-ready report and opening the print dialog…',
        async () => {
          await tick(220);
          return downloadPdf(state.report!);
        }
      );
      if (!result.ok) {
        await showPopup('Could not open PDF window', result.reason, 'warning');
      } else {
        await showPopup(
          'PDF ready',
          'A print window opened. Choose “Save as PDF” in the print dialog to download.',
          'success'
        );
      }
      return;
    }

    if (kind === 'sheet') {
      await withLoader('Building spreadsheet', 'Creating CSV with Website + Vendor issues…', async () => {
        await tick(250);
        downloadSheet(state.report!);
      });
      await showPopup('Sheet ready', 'report.csv has been downloaded.', 'success');
      return;
    }

    if (kind === 'json') {
      await withLoader('Building JSON', 'Serializing the full scan report…', async () => {
        await tick(200);
        downloadJson(state.report!);
      });
      await showPopup('JSON ready', 'report.json has been downloaded.', 'success');
      return;
    }

    if (kind === 'bundle') {
      const mode = await withLoader(
        'Saving reports',
        'Preparing report.html and report.json…',
        async (update) => {
          await tick(150);
          update('Saving reports', 'Choose a folder if prompted, or files will download…');
          return saveReportsToHugoAssistantFolder(state.report!);
        }
      );

      if (mode === 'written') {
        state.status = 'Wrote .hugo-assistant/report.html and report.json.';
        await showPopup(
          'Reports saved',
          'Wrote .hugo-assistant/report.html and report.json into the folder you selected.',
          'success'
        );
      } else {
        state.status = 'Downloaded report.html + report.json.';
        await showPopup(
          'Reports downloaded',
          'report.html and report.json were downloaded. Place them in your project’s .hugo-assistant/ folder.',
          'info'
        );
      }
    }
  } finally {
    state.busy = false;
    render();
  }
}

function tick(ms = 40): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

render();
