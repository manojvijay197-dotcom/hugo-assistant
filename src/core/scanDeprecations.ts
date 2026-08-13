import type { Issue, ProjectFiles } from '../types';
import { DeprecationEngine } from './DeprecationEngine';
import {
  listUnder,
  toWebsiteRelative,
  websitePath,
  join
} from './project';

const TEXT_EXTS = /\.(html?|md|markdown|ya?ml|toml|json|js|css|scss|svg|xml|txt)$/i;

function isScanTarget(relFromWebsite: string, area: 'website' | 'vendor'): boolean {
  const p = relFromWebsite.replace(/\\/g, '/');

  if (area === 'website') {
    return (
      p.startsWith('content/') ||
      p.startsWith('layouts/') ||
      p.startsWith('layout/') ||
      p.startsWith('data/') ||
      p.startsWith('i18n/') ||
      p.startsWith('assets/') ||
      p.startsWith('static/') ||
      /^config\.(ya?ml|yml|toml)$/i.test(p) ||
      /^hugo\.(ya?ml|yml|toml)$/i.test(p)
    );
  }

  // vendor module relative: layouts|assets|static|data|i18n
  return (
    p.startsWith('layouts/') ||
    p.startsWith('layout/') ||
    p.startsWith('assets/') ||
    p.startsWith('static/') ||
    p.startsWith('data/') ||
    p.startsWith('i18n/')
  );
}

export function scanDeprecations(
  project: ProjectFiles,
  targetVersion: string,
  scope: 'website' | 'vendor',
  vendorModule?: string,
  modulePrefix?: string
): Issue[] {
  const engine = new DeprecationEngine();
  const active = engine.evaluate(targetVersion);
  const issues: Issue[] = [];

  if (scope === 'website') {
    const rootPrefix = websitePath(project);
    const files = listUnder(project, rootPrefix);
    for (const file of files) {
      const rel = toWebsiteRelative(project, file.path);
      if (rel.startsWith('_vendor/')) continue;
      if (!isScanTarget(rel, 'website')) continue;
      if (!TEXT_EXTS.test(rel) && !/^config\./i.test(rel) && !/^hugo\./i.test(rel)) continue;
      if (!file.content) continue;
      issues.push(...engine.scanContent(rel, file.content, active, 'website'));
    }
    return issues;
  }

  // vendor
  const prefix = modulePrefix || '';
  const files = listUnder(project, prefix);
  for (const file of files) {
    const relInsideModule = file.path.slice(prefix.length).replace(/^\//, '');
    if (!isScanTarget(relInsideModule, 'vendor')) continue;
    if (!TEXT_EXTS.test(relInsideModule)) continue;
    if (!file.content) continue;
    const display = toWebsiteRelative(project, file.path);
    issues.push(
      ...engine.scanContent(display, file.content, active, 'vendor', vendorModule)
    );
  }
  return issues;
}

export function listVendorModules(project: ProjectFiles): Array<{ name: string; prefix: string }> {
  const vendorRoot = websitePath(project, '_vendor');
  const modules = new Map<string, string>();

  for (const path of project.files.keys()) {
    if (!path.startsWith(vendorRoot + '/') && path !== vendorRoot) continue;
    const rest = path.slice(vendorRoot.length + 1);
    if (!rest) continue;
    // _vendor/github.com/org/repo/...  → module key = first 3 segments when github-style,
    // otherwise first segment.
    const parts = rest.split('/');
    let name: string;
    let prefix: string;
    if (parts[0].includes('.')) {
      // host/owner/repo
      name = parts.slice(0, Math.min(3, parts.length)).join('/');
      prefix = join(vendorRoot, name);
    } else {
      name = parts[0];
      prefix = join(vendorRoot, name);
    }
    modules.set(name, prefix);
  }

  return [...modules.entries()].map(([name, prefix]) => ({ name, prefix }));
}
