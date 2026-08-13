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
      'Vendor Module',
      'Severity',
      'Category',
      'Title',
      'File',
      'Line',
      'Deprecated In',
      'Removed In',
      'Replacement / Fix',
      'Official Docs',
      'Description'
    ]
  ];

  const push = (issue: Issue, scopeTitle: string) => {
    rows.push([
      scopeTitle,
      issue.vendorModule || '',
      issue.severity,
      issue.category,
      issue.title,
      issue.file || '',
      issue.line != null ? String(issue.line) : '',
      issue.deprecatedIn || '',
      issue.removedIn || '',
      issue.replacement || '',
      issue.documentation || '',
      issue.description.replace(/\r?\n/g, ' ')
    ]);
  };

  for (const issue of report.website.issues) push(issue, 'Website Result');
  for (const issue of report.vendor.issues) push(issue, 'Vendor Result');

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
  const fixCell = (i: Issue) => {
    const fix = escapeHtml(i.replacement || '—');
    if (!i.documentation) return fix;
    const href = escapeHtml(i.documentation);
    return `${fix}<div><a href="${href}" target="_blank" rel="noopener noreferrer">Official docs</a></div>`;
  };

  const issueRows = (issues: Issue[]) =>
    issues
      .map(
        (i) => `<tr class="sev-${i.severity}">
      <td><span class="badge ${i.severity}">${i.severity}</span></td>
      <td>${escapeHtml(i.category)}</td>
      <td>${escapeHtml(i.title)}</td>
      <td><code>${escapeHtml(i.file || '')}${i.line ? ':' + i.line : ''}</code></td>
      <td>${escapeHtml(i.deprecatedIn || '—')}</td>
      <td>${fixCell(i)}</td>
      <td>${escapeHtml(i.description)}</td>
      <td>${escapeHtml(i.vendorModule || '—')}</td>
    </tr>`
      )
      .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Hugo Assistant Report</title>
<style>
  :root {
    --bg: #0f1419;
    --panel: #1a222c;
    --text: #e7eef5;
    --muted: #8b9aab;
    --line: #2a3542;
    --accent: #3d9a7a;
    --error: #e85d5d;
    --warning: #e0a045;
    --info: #4c8fd9;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "DM Sans", system-ui, sans-serif;
    background: radial-gradient(1200px 600px at 10% -10%, #1c2e28 0%, var(--bg) 55%);
    color: var(--text);
    padding: 2rem;
    line-height: 1.5;
  }
  h1 { font-family: "Instrument Serif", Georgia, serif; font-weight: 400; font-size: 2.4rem; margin: 0 0 .25rem; }
  h2 { margin: 2rem 0 .75rem; font-size: 1.25rem; }
  .meta { color: var(--muted); margin-bottom: 1.5rem; }
  .cards { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
  .card { background: var(--panel); border: 1px solid var(--line); padding: 1rem 1.25rem; min-width: 120px; }
  .card strong { display: block; font-size: 1.6rem; }
  table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--line); font-size: .9rem; }
  th, td { padding: .65rem .75rem; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
  th { color: var(--muted); font-weight: 600; font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; }
  code { font-size: .85em; }
  a { color: var(--accent); }
  .badge { display: inline-block; padding: .15rem .45rem; border-radius: 2px; font-size: .72rem; text-transform: uppercase; font-weight: 700; }
  .badge.error { background: rgba(232,93,93,.2); color: var(--error); }
  .badge.warning { background: rgba(224,160,69,.2); color: var(--warning); }
  .badge.info { background: rgba(76,143,217,.2); color: var(--info); }
  @media print {
    body { background: white; color: #111; padding: 0; }
    .card, table { background: white; border-color: #ccc; }
    th, td { border-color: #ddd; }
  }
</style>
</head>
<body>
  <h1>Hugo Assistant</h1>
  <p class="meta">
    Current: <strong>${escapeHtml(report.currentVersion)}</strong>
    · Target: <strong>${escapeHtml(report.targetVersion)}</strong>
    · Generated: ${escapeHtml(report.generatedAt)}
  </p>
  <div class="cards">
    <div class="card"><span>Total</span><strong>${report.summary.total}</strong></div>
    <div class="card"><span>Errors</span><strong>${report.summary.errors}</strong></div>
    <div class="card"><span>Warnings</span><strong>${report.summary.warnings}</strong></div>
    <div class="card"><span>Infos</span><strong>${report.summary.infos}</strong></div>
  </div>

  <h2>${escapeHtml(report.website.title)}</h2>
  <table>
    <thead>
      <tr>
        <th>Severity</th><th>Category</th><th>Title</th><th>File</th>
        <th>Deprecated In</th><th>Fix</th><th>Description</th><th>Module</th>
      </tr>
    </thead>
    <tbody>
      ${report.website.issues.length ? issueRows(report.website.issues) : '<tr><td colspan="8">No issues found.</td></tr>'}
    </tbody>
  </table>

  <h2>${escapeHtml(report.vendor.title)}</h2>
  <table>
    <thead>
      <tr>
        <th>Severity</th><th>Category</th><th>Title</th><th>File</th>
        <th>Deprecated In</th><th>Fix</th><th>Description</th><th>Module</th>
      </tr>
    </thead>
    <tbody>
      ${report.vendor.issues.length ? issueRows(report.vendor.issues) : '<tr><td colspan="8">No issues found.</td></tr>'}
    </tbody>
  </table>
</body>
</html>`;
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

/** Bundle both artifacts named for .hugo-assistant/ usage. */
export function downloadHugoAssistantBundle(report: ScanReport): void {
  downloadJson(report);
  setTimeout(() => downloadHtmlReport(report), 200);
}

/**
 * Write `.hugo-assistant/report.html` + `report.json` into a user-picked folder
 * (Chrome/Edge File System Access API). Falls back to downloads if unavailable.
 */
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
    // User cancelled or permission denied — still offer downloads
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
