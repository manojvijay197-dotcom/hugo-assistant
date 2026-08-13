import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

/**
 * Node smoke test (dev only) — mirrors browser folder upload against mock-hugo-project.
 * Run: npx --yes tsx scripts/smoke-scan.ts
 */
import type { ProjectFiles, VirtualFile } from '../src/types';
import { parseHugoVersionFromTrago, getTargetVersionOptions } from '../src/core/versions';
import { runFullScan } from '../src/core/scan';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'mock-hugo-project');

function walk(dir: string, base = root, map = new Map<string, VirtualFile>()): Map<string, VirtualFile> {
  for (const name of readdirSync(dir)) {
    if (name === '.DS_Store' || name === '.git') continue;
    const abs = join(dir, name);
    const rel = relative(base, abs).replace(/\\/g, '/');
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, base, map);
    else {
      let content = '';
      try {
        content = readFileSync(abs, 'utf8');
      } catch {
        content = '';
      }
      map.set(rel, { path: rel, content, size: st.size });
    }
  }
  return map;
}

const files = walk(root);
const project: ProjectFiles = { files, websiteRoot: 'website' };
const trago = files.get('website/trago.js')!.content;
const current = parseHugoVersionFromTrago(trago)!;
const targets = getTargetVersionOptions(current);
const target = targets.includes('0.140.0') ? '0.140.0' : targets[targets.length - 1];
const report = runFullScan(project, current, target);

console.log('Current:', current);
console.log('Target options (first 5):', targets.slice(0, 5), '... total', targets.length);
console.log('Target used:', target);
console.log('Summary:', report.summary);
console.log('Website issues:', report.website.issues.length);
console.log('Vendor issues:', report.vendor.issues.length);
console.log(
  'Sample:',
  report.website.issues.slice(0, 3).map((i) => `${i.category}:${i.title}@${i.file}`)
);

if (report.summary.total < 1) {
  console.error('Expected at least one issue in mock project');
  process.exit(1);
}
console.log('✓ smoke scan ok');
