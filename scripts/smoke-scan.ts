import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProjectFiles, VirtualFile } from '../src/types';
import { parseHugoVersionFromTrago, getTargetVersionOptions } from '../src/core/versions';
import { runFullScan } from '../src/core/scan';
import { ruleAppliesToTarget as applies, DeprecationEngine } from '../src/core/DeprecationEngine';
import { getDeprecationRules as rules } from '../src/core/rulesLoader';

/**
 * Node smoke test — mirrors browser folder upload against mock-hugo-project.
 * Run: npm run smoke
 */

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
const project: ProjectFiles = { files, websiteRoot: 'website', kind: 'regular' };
const trago = files.get('website/trago.js')!.content;
const detected = parseHugoVersionFromTrago(trago)!;
const current = process.argv[2] || '0.124.1';
const targets = getTargetVersionOptions(current);
const target =
  process.argv[3] ||
  targets.find((v) => v.startsWith('0.164')) ||
  targets.find((v) => v.startsWith('0.146')) ||
  targets[targets.length - 1];

console.log('Detected trago.js:', detected);
const report = runFullScan(project, current, target);
const structure = report.results.structureIssues;
const common = report.results.commonIssues;
const partialHits = structure.filter(
  (i) => /partials/i.test(i.title) || /partials/i.test(i.file || '')
);
const scratchHits = common.filter((i) => /\.Scratch|Scratch/i.test(i.title));
const urlHits = common.filter((i) => /\.URL\b/.test(i.title));
const buildHits = [...structure, ...common].filter((i) => /build\/|\/public\//i.test(i.file || ''));

console.log('Current:', current);
console.log('Target used:', target);
console.log(
  'Target options span:',
  targets[0],
  '→',
  targets[targets.length - 1],
  `(${targets.length})`
);
console.log('Summary:', report.summary);
console.log(
  'Structure sample:',
  structure.slice(0, 12).map((i) => `${i.title} @ ${i.file} (since ${i.sinceVersion})`)
);
console.log(
  'Code sample:',
  common.slice(0, 12).map((i) => `${i.title} @ ${i.file}:${i.line}`)
);
console.log('partials hits:', partialHits.length);
console.log('Scratch hits:', scratchHits.length);
console.log('.URL hits (should be 0 when already removed before current):', urlHits.length);
console.log('build/public hits:', buildHits.length);

files.set('website/build/public/index.html', {
  path: 'website/build/public/index.html',
  content: '{{ .Scratch }} {{ .URL }}',
  size: 20
});
const report2 = runFullScan(project, current, target);
const leaked = [...report2.results.structureIssues, ...report2.results.commonIssues].filter((i) =>
  /build\/|\/public\//i.test(i.file || '')
);
console.log('leaked build findings:', leaked.length);

for (const feat of ['.Scratch', '.URL', 'layouts/partials', 'layouts/partials/']) {
  const r = rules().find((x) => x.feature === feat);
  if (!r) continue;
  console.log('applies', feat, applies(r, target, current));
}

if (partialHits.length < 1) {
  console.error('Expected layouts/partials structure findings');
  process.exit(1);
}
if (scratchHits.length < 1) {
  console.error('Expected .Scratch code finding in layouts/partials/header.html');
  process.exit(1);
}
if (urlHits.length > 0) {
  console.error('.URL was removed before current 0.124 and must not be reported');
  process.exit(1);
}
if (leaked.length > 0) {
  console.error('Build/public output must not be scanned');
  process.exit(1);
}

const engine = new DeprecationEngine();
const active = engine.evaluate('0.164.0', '0.124.1');
const playLine =
  '<a href="https://play.google.com/store/apps/details?id=com.zoho.expense&referrer=utm_source%3Dzohoexpense_website%26utm_medium%3Dmobile_apps_android%26anid%3Dadmob" title="Get it on Google Play">';
const playHits = engine.scanContent('layouts/expense/receipt-scanner-app/single.amp.html', playLine, active, 'website');
const testimony = `<div class="testimony-designation">\n              Zoho Expense user\n            </div>`;
const testimonyHits = engine.scanContent('layouts/partials/quote.html', testimony, active, 'website');
const realShortcode = engine.scanContent(
  'layouts/partials/quote.html',
  '{{< twitter user="zoho" id="123" >}}',
  active,
  'website'
);
const realGetJson = engine.scanContent(
  'layouts/partials/data.html',
  '{{ getJSON "https://example.com/data.json" }}',
  active,
  'website'
);

console.log('false getJSON on Google Play link:', playHits.map((i) => i.title));
console.log('false hits on testimony markup:', testimonyHits.map((i) => i.title));
console.log('real twitter shortcode:', realShortcode.map((i) => i.title));
console.log('real getJSON:', realGetJson.map((i) => i.title));

if (playHits.some((i) => /getJSON/i.test(i.title))) {
  console.error('getJSON must not match a Google Play URL');
  process.exit(1);
}
if (testimonyHits.length) {
  console.error('Plain HTML must not be reported as a shortcode or config error');
  process.exit(1);
}
if (!realShortcode.some((i) => /twitter shortcode/i.test(i.title))) {
  console.error('Expected twitter shortcode hit on {{< twitter ... >}}');
  process.exit(1);
}
if (!realGetJson.some((i) => /getJSON/.test(i.title))) {
  console.error('Expected getJSON hit on {{ getJSON ... }}');
  process.exit(1);
}
const pagesLine = engine.scanContent(
  'layouts/partials/header.html',
  '{{ range .Site.Pages }}',
  active,
  'website'
);
console.log('.Site.Pages line hits:', pagesLine.map((i) => i.title));
if (pagesLine.length) {
  console.error('.Site.Pages must not be reported as other .Site.* deprecations');
  process.exit(1);
}
console.log('✓ smoke scan ok');
