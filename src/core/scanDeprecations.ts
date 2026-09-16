import type { Issue, ProjectFiles, ProjectKind } from '../types';
import { DeprecationEngine } from './DeprecationEngine';
import { listUnder, toWebsiteRelative, websitePath } from './project';

const TEXT_EXTS = /\.(html?|md|markdown|ya?ml|toml|json|js|css|scss|svg|xml|txt)$/i;

/** Same targets for Regular Repo and Hugo modules. */
function isScanTarget(relFromRoot: string): boolean {
  const p = relFromRoot.replace(/\\/g, '/').replace(/^\.\//, '');
  return (
    p.startsWith('content/') ||
    p === 'content' ||
    p.startsWith('layouts/') ||
    p === 'layouts' ||
    p.startsWith('layout/') ||
    p.startsWith('data/') ||
    p === 'data' ||
    p.startsWith('i18n/') ||
    p === 'i18n' ||
    p.startsWith('assets/') ||
    p === 'assets' ||
    p.startsWith('static/') ||
    p === 'static' ||
    /^config\.(ya?ml|yml|toml)$/i.test(p) ||
    /^hugo\.(ya?ml|yml|toml)$/i.test(p)
  );
}

function isStructureCandidate(rel: string): boolean {
  const p = rel.replace(/\\/g, '/').replace(/^\.\//, '');
  return (
    p.startsWith('layouts/') ||
    p.startsWith('layout/') ||
    p.startsWith('content/') ||
    /\.(html?|md|markdown|svg)$/i.test(p)
  );
}

/**
 * Scan one uploaded project (regular website OR Hugo module).
 * Same folder set for both modes: content, layouts, data, i18n, assets, static, config/hugo.
 * Regular mode never walks _vendor/ or themes/ — those are uploaded separately.
 */
export function scanDeprecations(project: ProjectFiles, targetVersion: string): Issue[] {
  const engine = new DeprecationEngine();
  const active = engine.evaluate(targetVersion);
  const issues: Issue[] = [];
  const scope: Issue['scope'] = project.kind === 'module' ? 'module' : 'website';

  const rootPrefix = websitePath(project);
  const files = listUnder(project, rootPrefix);

  for (const file of files) {
    let rel = toWebsiteRelative(project, file.path).replace(/\\/g, '/');
    if (rel.startsWith('./')) rel = rel.slice(2);

    // Regular repos: ignore nested vendor/theme trees (checked via Hugo modules mode).
    if (project.kind === 'regular') {
      if (rel.startsWith('_vendor/') || rel.startsWith('themes/')) continue;
    }

    if (!isScanTarget(rel)) continue;

    if (isStructureCandidate(rel)) {
      issues.push(...engine.scanStructure(rel, file.content || undefined, active, scope));
    }

    if (
      !TEXT_EXTS.test(rel) &&
      !/^config\./i.test(rel) &&
      !/^hugo\./i.test(rel)
    ) {
      continue;
    }
    if (!file.content) continue;
    issues.push(...engine.scanContent(rel, file.content, active, scope));
  }

  return issues;
}

export function splitIssues(issues: Issue[]): {
  commonIssues: Issue[];
  structureIssues: Issue[];
} {
  const structureIssues = issues.filter(
    (i) => i.structureChange || i.category === 'structure'
  );
  const commonIssues = issues.filter(
    (i) => !i.structureChange && i.category !== 'structure'
  );
  return { commonIssues, structureIssues };
}

export function resultTitleFor(kind: ProjectKind): string {
  return kind === 'module' ? 'Hugo Module Result' : 'Website Result';
}
