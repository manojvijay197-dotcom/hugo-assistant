import './styles.css';
import type { Issue, ProjectKind, ProjectFiles, ScanReport } from './types';
import { loadProjectFromDirectoryHandle, loadProjectFromFileList, readTragoVersion } from './core/project';
import { getAllTargetVersionOptions, getTargetVersionOptions } from './core/versions';
import { runFullScan } from './core/scan';
import {
  downloadJson,
  downloadPdf,
  downloadSheet,
  saveReportsToHugoAssistantFolder
} from './core/exports';
import { buildAiFixPrompt, copyTextToClipboard } from './core/aiFixPrompt';
import { hideLoader, showConfirm, showLoader, showPopup, showReportModal, updateLoader, withLoader } from './ui/overlay';

type AppState = {
  projectKind: ProjectKind | null;
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
  projectKind: null,
  project: null,
  currentVersion: null,
  targetVersion: null,
  report: null,
  view: 'table',
  busy: false,
  error: null,
  status: 'Choose Regular Repo or Hugo modules (vendor), then select a folder.'
};

const app = document.querySelector<HTMLDivElement>('#app')!;

function render(): void {
  const modeSelected = Boolean(state.projectKind);
  const isModule = state.projectKind === 'module';
  const versionReady = isModule
    ? Boolean(state.project)
    : Boolean(state.project && state.currentVersion);
  const canSubmit = Boolean(
    state.project &&
      state.targetVersion &&
      !state.busy &&
      (isModule || state.currentVersion)
  );

  app.innerHTML = `
    <header class="hero">
      <h1>Hugo Assistant</h1>
      <p>Private Hugo migration checker — upload a Regular Repo or a Hugo module separately, pick a target version, then review structure vs other changes.</p>
    </header>

    <section class="panel">
      <p class="step-label">Step 1</p>
      <h2>What are you checking?</h2>
      <div class="mode-radios">
        <label class="mode-option">
          <input type="radio" name="project-kind" value="regular" ${
            state.projectKind === 'regular' ? 'checked' : ''
          } ${state.busy ? 'disabled' : ''} />
          <span>
            <strong>Regular Repo</strong>
          </span>
        </label>
        <label class="mode-option">
          <input type="radio" name="project-kind" value="module" ${
            state.projectKind === 'module' ? 'checked' : ''
          } ${state.busy ? 'disabled' : ''} />
          <span>
            <strong>Hugo modules (vendor)</strong>
          </span>
        </label>
      </div>

      <p class="step-label">Step 2</p>
      <h2>Upload folder</h2>
      <div class="upload-box ${modeSelected ? '' : 'upload-disabled'}">
        <p>${uploadHint()}</p>
        <button type="button" id="choose-folder-btn" ${
          !modeSelected || state.busy ? 'disabled' : ''
        }>
          Select folder
        </button>
        <input id="folder-input" type="file" webkitdirectory multiple />
      </div>
      <p class="status ${state.error ? 'error' : ''}">${escapeHtml(state.error || state.status)}</p>
    </section>

    <section class="panel ${versionReady ? '' : 'hidden'}">
      ${
        isModule
          ? `
      <p class="step-label">Step 3</p>
      <h2>Select target Hugo version</h2>
      <p class="divider-label">No <code>trago.js</code> in modules — pick the Hugo version you are migrating this module to</p>
      `
          : `
      <p class="step-label">Step 3</p>
      <h2>Current Hugo version</h2>
      <p class="divider-label">Read from <code>website/trago.js</code></p>
      <div class="version-pill">Detected <code>${escapeHtml(state.currentVersion || '—')}</code></div>

      <p class="step-label">Step 4</p>
      <h2>Select target version</h2>
      <p class="divider-label">Options from your current version through the latest Hugo release</p>
      `
      }
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
      <div class="results-toolbar">
        <div class="cta-row">
          <button type="button" data-export="pdf" ${state.busy ? 'disabled' : ''}>Download PDF</button>
          <button type="button" data-export="sheet" ${state.busy ? 'disabled' : ''}>Download Sheet</button>
          <button type="button" data-export="json" ${state.busy ? 'disabled' : ''}>Download JSON</button>
          <button type="button" data-export="bundle" ${state.busy ? 'disabled' : ''}>Save .hugo-assistant reports</button>
        </div>
        <button type="button" class="ai-prompt-cta" data-export="ai-prompt" ${state.busy ? 'disabled' : ''}>
          <span class="ai-prompt-cta-glow" aria-hidden="true"></span>
          <span class="ai-prompt-cta-inner">
            <svg class="ai-prompt-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v12h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
            </svg>
            <span>Copy AI fix prompt</span>
          </span>
        </button>
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

function uploadHint(): string {
  if (!state.projectKind) {
    return 'Select Regular Repo or Hugo modules (vendor) above before choosing a folder.';
  }
  if (state.projectKind === 'regular') {
    return 'Select the root folder that contains <code>website/</code> (with <code>trago.js</code> inside). Files stay on your machine.';
  }
  return 'Select the Hugo module / theme folder (layouts, content, config, assets, data, i18n — no <code>trago.js</code>). Files stay on your machine.';
}

function renderVersionRadios(): string {
  const options =
    state.projectKind === 'module'
      ? getAllTargetVersionOptions()
      : state.currentVersion
        ? getTargetVersionOptions(state.currentVersion)
        : [];

  if (!options.length) return '';

  return options
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
  const versionStat =
    report.mode === 'module'
      ? `<div class="stat"><span>Target</span><strong>${escapeHtml(report.targetVersion)}</strong></div>`
      : `<div class="stat"><span>Current → Target</span><strong>${escapeHtml(report.currentVersion)} → ${escapeHtml(report.targetVersion)}</strong></div>`;

  return `<div class="summary-row">
    <div class="stat"><span>Mode</span><strong>${
      report.mode === 'module' ? 'Hugo modules' : 'Regular Repo'
    }</strong></div>
    <div class="stat"><span>Total</span><strong>${report.summary.total}</strong></div>
    <div class="stat"><span>Other</span><strong>${report.summary.common}</strong></div>
    <div class="stat"><span>Structure</span><strong>${report.summary.structure}</strong></div>
    <div class="stat"><span>Errors</span><strong>${report.summary.errors}</strong></div>
    ${versionStat}
  </div>`;
}

function renderResults(report: ScanReport): string {
  if (state.view === 'json') {
    return `<pre class="json-view">${escapeHtml(JSON.stringify(report, null, 2))}</pre>`;
  }

  const { title, commonIssues, structureIssues } = report.results;
  return `
    <h3 class="section-title">${escapeHtml(title)}</h3>
    <div class="result-cards">
      <article class="result-card">
        <p class="result-card-kicker">Structure</p>
        <h4 class="result-card-title">Structure related issues (${structureIssues.length})</h4>
        <p class="result-card-copy">Folder and template-system changes found in this upload.</p>
        <button type="button" class="primary" data-report="structure" ${
          structureIssues.length ? '' : 'disabled'
        }>
          Click to view report
        </button>
      </article>
      <article class="result-card">
        <p class="result-card-kicker">Code &amp; config</p>
        <h4 class="result-card-title">Other changes (${commonIssues.length})</h4>
        <p class="result-card-copy">Deprecated features and config usage found in this upload.</p>
        <button type="button" class="primary" data-report="other" ${
          commonIssues.length ? '' : 'disabled'
        }>
          Click to view report
        </button>
      </article>
    </div>
  `;
}

function renderTable(issues: Issue[], opts: { showCategory: boolean }): string {
  if (!issues.length) {
    return `<div class="table-wrap"><table><tbody><tr><td>No issues found.</td></tr></tbody></table></div>`;
  }

  const categoryHeader = opts.showCategory ? '<th>Category</th>' : '';
  const rows = issues
    .map((i) => {
      const categoryCell = opts.showCategory ? `<td>${escapeHtml(i.category)}</td>` : '';
      return `<tr>
      <td><span class="badge ${i.severity}">${i.severity}</span></td>
      ${categoryCell}
      <td>${escapeHtml(i.title)}</td>
      <td><code>${escapeHtml(i.file || '')}${i.line ? ':' + i.line : ''}</code></td>
      <td>${escapeHtml(i.deprecatedIn || '—')}</td>
      <td>${renderFixCell(i)}</td>
      <td>${escapeHtml(i.description)}</td>
    </tr>`;
    })
    .join('');

  return `<div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Severity</th>
          ${categoryHeader}
          <th>Title</th>
          <th>Where used</th>
          <th>Deprecated in</th>
          <th>How to fix</th>
          <th>Details</th>
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

  document.querySelectorAll<HTMLInputElement>('input[name="project-kind"]').forEach((el) => {
    el.addEventListener('change', () => {
      const kind = el.value === 'module' ? 'module' : 'regular';
      state.projectKind = kind;
      state.project = null;
      state.currentVersion = null;
      state.targetVersion = null;
      state.report = null;
      state.error = null;
      state.status =
        kind === 'regular'
          ? 'Regular Repo selected. Now choose a folder with website/trago.js.'
          : 'Hugo modules selected. Now choose a module folder (no trago.js).';
      render();
    });
  });

  chooseBtn?.addEventListener('click', () => {
    void startFolderUpload(input);
  });

  input?.addEventListener('change', async () => {
    if (!input.files?.length) {
      hideLoader();
      state.status = 'No folder selected.';
      render();
      return;
    }
    if (!state.projectKind) {
      state.error = 'Select Regular Repo or Hugo modules before uploading.';
      render();
      return;
    }
    await processProject(loadProjectFromFileList(input.files, state.projectKind));
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

  document.querySelectorAll<HTMLButtonElement>('[data-report]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!state.report) return;
      const kind = btn.dataset.report;
      if (kind === 'structure') {
        showReportModal(
          `Structure related issues (${state.report.results.structureIssues.length})`,
          renderTable(state.report.results.structureIssues, { showCategory: false })
        );
      } else if (kind === 'other') {
        showReportModal(
          `Other changes (${state.report.results.commonIssues.length})`,
          renderTable(state.report.results.commonIssues, { showCategory: true })
        );
      }
    });
  });
}

async function startFolderUpload(input: HTMLInputElement | null): Promise<void> {
  if (state.busy) return;
  if (!state.projectKind) {
    await showPopup(
      'Choose a mode first',
      'Select Regular Repo or Hugo modules (vendor), then select a folder.',
      'warning'
    );
    return;
  }

  const confirmBody =
    state.projectKind === 'regular'
      ? 'Pick the root folder that contains website/ (with trago.js). Files are read locally in your browser.'
      : 'Pick the Hugo module / theme folder (no trago.js). Files are read locally in your browser.';

  const confirmed = await showConfirm('Select project folder?', confirmBody, {
    kind: 'info',
    confirmLabel: 'Select folder',
    cancelLabel: 'Cancel',
    showCancel: true
  });

  if (!confirmed) {
    state.status = 'Folder selection cancelled.';
    render();
    return;
  }

  if (typeof window.showDirectoryPicker === 'function') {
    showLoader('Waiting for folder', 'Folder picker is open — choose your project folder…');
    state.status = 'Waiting for folder selection…';
    render();
    showLoader('Waiting for folder', 'Folder picker is open — choose your project folder…');

    try {
      const dir = await window.showDirectoryPicker({ mode: 'read' });
      await processProject(
        loadProjectFromDirectoryHandle(dir, state.projectKind!, (scanned, current) => {
          if (scanned === 0) {
            updateLoader('Checking folder type', current || 'Validating before reading files…');
            return;
          }
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

async function processProject(loadPromise: Promise<ProjectFiles>): Promise<void> {
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
    updateLoader('Checking folder type', 'Validating Regular Repo vs Hugo modules before reading files…');

    const project = await loadPromise;

    if (project.kind === 'regular') {
      updateLoader('Reading Hugo version', `Parsing ${project.websiteRoot}/trago.js…`);
      await tick(60);
      const currentVersion = readTragoVersion(project);
      state.project = project;
      state.currentVersion = currentVersion;
      state.status = `Loaded “${project.websiteRoot}”. Current Hugo version: ${currentVersion}. Select a target version.`;
      hideLoader();
      await showPopup(
        'Regular Repo loaded',
        `Website found at “${project.websiteRoot}”. Current Hugo version is ${currentVersion}. Choose a target version, then run checks.`,
        'success'
      );
    } else {
      state.project = project;
      state.currentVersion = null;
      state.status = `Hugo module loaded from “${project.websiteRoot}”. Select a target Hugo version.`;
      hideLoader();
      await showPopup(
        'Hugo module loaded',
        `Module root “${project.websiteRoot}” is ready. Choose the Hugo version you are migrating to, then run checks.`,
        'success'
      );
    }
  } catch (err) {
    state.project = null;
    state.currentVersion = null;
    state.error = err instanceof Error ? err.message : String(err);
    state.status = 'Choose the correct mode and select the matching folder again.';
    hideLoader();
    await showPopup('Wrong folder for selected mode', state.error, 'error');
  } finally {
    state.busy = false;
    render();
  }
}

async function runScan(): Promise<void> {
  if (!state.project || !state.targetVersion) return;
  if (state.project.kind === 'regular' && !state.currentVersion) return;

  state.busy = true;
  state.error = null;
  state.status = 'Running checks…';
  render();

  const currentLabel =
    state.project.kind === 'module' ? 'n/a (module)' : state.currentVersion!;

  try {
    await withLoader(
      'Starting scan',
      state.project.kind === 'module'
        ? `Checking Hugo module against ${state.targetVersion}`
        : `Comparing Hugo ${state.currentVersion} → ${state.targetVersion}`,
      async (update) => {
        await tick(120);
        update('Checking Hugo deprecations', 'Scanning templates and config for deprecated methods…');
        await tick(180);
        update('Checking structure changes', 'Looking for old layout folders and template paths…');
        await tick(120);
        state.report = runFullScan(state.project!, currentLabel, state.targetVersion!);
        update('Finishing report', `Found ${state.report.summary.total} issue(s)…`);
        await tick(100);
      }
    );

    state.status = `Done. ${state.report!.summary.total} issue(s).`;
    await showPopup(
      'Scan complete',
      `Found ${state.report!.summary.total} issue(s) — ${state.report!.summary.errors} error(s), ${state.report!.summary.warnings} warning(s).`,
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
    if (kind === 'ai-prompt') {
      await withLoader(
        'Building AI prompt',
        'Preparing migration prompt (without embedding JSON)…',
        async () => {
          await tick(100);
          const prompt = buildAiFixPrompt(state.report!);
          await copyTextToClipboard(prompt);
        }
      );
      state.status = 'AI fix prompt copied to clipboard.';
      await showPopup(
        'Prompt copied',
        'Paste it into Cursor, ChatGPT, or another coding AI with your project open. One prompt includes instructions — no extra back-and-forth needed.',
        'success',
        {
          label: 'Please include report.json',
          labelDetail:
            'Attach the report.json file generated from this tool (Download JSON or Save .hugo-assistant reports) together with the prompt.'
        }
      );
      return;
    }

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
      await withLoader('Building spreadsheet', 'Creating CSV with scan issues…', async () => {
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
