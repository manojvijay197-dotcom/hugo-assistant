import type { Issue, ScanReport } from '../types';

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(report: ScanReport): void {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  downloadBlob('report.json', blob);
}

export function downloadSheet(report: ScanReport): void {
  const rows: string[][] = [
    [
      'Scope',
      'Issue Group',
      'Severity',
      'Category',
      'Title',
      'File',
      'Line',
      'Since Version',
      'Removed In',
      'Replacement / Fix',
      'Official Docs',
      'Description'
    ]
  ];

  const push = (issue: Issue) => {
    const group =
      issue.structureChange || issue.category === 'structure'
        ? 'Structure related'
        : 'Other changes';
    rows.push([
      report.results.title,
      group,
      issue.severity,
      issue.category,
      issue.title,
      issue.file || '',
      issue.line != null ? String(issue.line) : '',
      issue.sinceVersion || issue.deprecatedIn || '',
      issue.removedIn || '',
      issue.replacement || '',
      issue.documentation || '',
      issue.description.replace(/\r?\n/g, ' ')
    ]);
  };

  for (const issue of report.results.structureIssues) push(issue);
  for (const issue of report.results.commonIssues) push(issue);

  const csv = rows
    .map((r) =>
      r
        .map((cell) => {
          const needsQuote = /[",\n]/.test(cell);
          const escaped = cell.replace(/"/g, '""');
          return needsQuote ? `"${escaped}"` : escaped;
        })
        .join(',')
    )
    .join('\n');

  downloadBlob('report.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }));
}

export function buildReportHtml(report: ScanReport): string {
  const modeLabel = report.mode === 'module' ? 'Hugo modules (vendor)' : 'Regular Repo';
  const versionLine =
    report.mode === 'module'
      ? `Target: <strong>${escapeHtml(report.targetVersion)}</strong>`
      : `Current: <strong>${escapeHtml(report.currentVersion)}</strong> · Target: <strong>${escapeHtml(report.targetVersion)}</strong>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Hugo Jump Report</title>
<style>
  :root {
    --bg: #fdfbf7;
    --panel: #ffffff;
    --text: #111111;
    --muted: #5c5c5c;
    --line: #e4ddd0;
    --accent: #5d7052;
    --error: #c23b3b;
    --warning: #b57a1a;
    --info: #3d6b8f;
    --sage: #5d7052;
    --sand: #cdba9e;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "DM Sans", system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
    padding: 2rem;
    line-height: 1.55;
  }
  h1 { font-family: "Instrument Serif", Georgia, serif; font-weight: 400; font-size: 2.4rem; margin: 0 0 .25rem; }
  h2 { margin: 2rem 0 .75rem; font-size: 1.25rem; }
  .meta { color: var(--muted); margin-bottom: 1.5rem; }
  .cards { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
  .card { background: #f4efe6; border: 1px solid var(--line); border-radius: 16px; padding: 1rem 1.25rem; min-width: 120px; }
  .card:nth-child(2) { background: var(--sage); color: #fff; border-color: var(--sage); }
  .card:nth-child(3) { background: var(--sand); border-color: var(--sand); }
  .card strong { display: block; font-size: 1.6rem; }
  table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--line); border-radius: 16px; font-size: .9rem; overflow: hidden; }
  th, td { padding: .65rem .75rem; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
  th { color: var(--muted); font-weight: 600; font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; background: #f4efe6; }
  code { font-size: .85em; }
  a { color: var(--accent); }
  .badge { display: inline-block; padding: .15rem .5rem; border-radius: 999px; font-size: .72rem; text-transform: uppercase; font-weight: 700; }
  .badge.error { background: rgba(194,59,59,.12); color: var(--error); }
  .badge.warning { background: rgba(181,122,26,.14); color: var(--warning); }
  .badge.info { background: rgba(61,107,143,.12); color: var(--info); }
  .split { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; align-items: start; }
  .split h3 { margin: 0 0 .5rem; font-size: 1rem; color: var(--muted); }
  @media (max-width: 1100px), print {
    .split { grid-template-columns: 1fr; }
  }
  @media print {
    body { background: white; color: #111; padding: 0; }
    .card, table { background: white; border-color: #ccc; }
    th, td { border-color: #ddd; }
  }
</style>
</head>
<body>
  <h1>Hugo Jump</h1>
  <p class="meta">
    Mode: <strong>${escapeHtml(modeLabel)}</strong>
    · ${versionLine}
    · Generated: ${escapeHtml(report.generatedAt)}
  </p>
  <div class="cards">
    <div class="card"><span>Total</span><strong>${report.summary.total}</strong></div>
    <div class="card"><span>Other</span><strong>${report.summary.common}</strong></div>
    <div class="card"><span>Structure</span><strong>${report.summary.structure}</strong></div>
    <div class="card"><span>Errors</span><strong>${report.summary.errors}</strong></div>
    <div class="card"><span>Warnings</span><strong>${report.summary.warnings}</strong></div>
  </div>

  ${sectionHtml(report.results)}
</body>
</html>`;
}

function sectionHtml(section: ScanReport['results']): string {
  return `
  <h2>${escapeHtml(section.title)}</h2>
  <div class="split">
    <div>
      <h3>Structure related issues (${section.structureIssues.length})</h3>
      ${issueTable(section.structureIssues, false)}
    </div>
    <div>
      <h3>Other changes (${section.commonIssues.length})</h3>
      ${issueTable(section.commonIssues, true)}
    </div>
  </div>
  `;
}

function issueTable(issues: Issue[], showCategory: boolean): string {
  const categoryHeader = showCategory ? '<th>Category</th>' : '';
  const colspan = showCategory ? 7 : 6;
  return `<table>
    <thead>
      <tr>
        <th>Severity</th>${categoryHeader}<th>Title</th><th>File</th>
        <th>Since Version</th><th>Fix</th><th>Description</th>
      </tr>
    </thead>
    <tbody>
      ${issues.length ? issueRows(issues, showCategory) : `<tr><td colspan="${colspan}">No issues found.</td></tr>`}
    </tbody>
  </table>`;
}

function issueRows(issues: Issue[], showCategory: boolean): string {
  return issues
    .map((i) => {
      const categoryCell = showCategory ? `<td>${escapeHtml(i.category)}</td>` : '';
      const fix = i.documentation
        ? `${escapeHtml(i.replacement || '—')}<div><a href="${escapeHtml(i.documentation)}" target="_blank" rel="noopener noreferrer">Official docs</a></div>`
        : escapeHtml(i.replacement || '—');
      return `<tr class="sev-${i.severity}">
      <td><span class="badge ${i.severity}">${i.severity}</span></td>
      ${categoryCell}
      <td>${escapeHtml(i.title)}</td>
      <td><code>${escapeHtml(i.file || '')}${i.line ? ':' + i.line : ''}</code></td>
      <td>${escapeHtml(i.sinceVersion || i.deprecatedIn || i.removedIn || '—')}</td>
      <td>${fix}</td>
      <td>${escapeHtml(i.description)}</td>
    </tr>`;
    })
    .join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function downloadHtmlReport(report: ScanReport): void {
  downloadBlob('report.html', new Blob([buildReportHtml(report)], { type: 'text/html' }));
}

export function downloadPdf(report: ScanReport): { ok: true } | { ok: false; reason: string } {
  const html = buildReportHtml(report);
  const w = window.open('', '_blank');
  if (!w) {
    return {
      ok: false,
      reason:
        'The browser blocked the print window. Allow popups for this site, or use “Download JSON” / “Save .hugo-assistant reports” and print report.html yourself.'
    };
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
  }, 350);
  return { ok: true };
}

export function downloadHugoAssistantBundle(report: ScanReport): void {
  downloadJson(report);
  setTimeout(() => downloadHtmlReport(report), 200);
}

export async function saveReportsToHugoAssistantFolder(report: ScanReport): Promise<'written' | 'downloaded'> {
  const html = buildReportHtml(report);
  const json = JSON.stringify(report, null, 2);

  const picker = (window as Window & {
    showDirectoryPicker?: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle>;
  }).showDirectoryPicker;

  if (!picker) {
    downloadHugoAssistantBundle(report);
    return 'downloaded';
  }

  try {
    const root = await picker({ mode: 'readwrite' });
    const dir = await root.getDirectoryHandle('.hugo-assistant', { create: true });

    const htmlFile = await dir.getFileHandle('report.html', { create: true });
    const htmlWritable = await htmlFile.createWritable();
    await htmlWritable.write(html);
    await htmlWritable.close();

    const jsonFile = await dir.getFileHandle('report.json', { create: true });
    const jsonWritable = await jsonFile.createWritable();
    await jsonWritable.write(json);
    await jsonWritable.close();

    return 'written';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return 'downloaded';
    }
    downloadHugoAssistantBundle(report);
    return 'downloaded';
  }
}

interface FileSystemDirectoryHandle {
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileSystemFileHandle>;
}

interface FileSystemFileHandle {
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}
