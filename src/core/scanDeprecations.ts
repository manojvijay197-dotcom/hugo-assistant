import type { Issue, ProjectFiles, ProjectKind } from '../types';
import { DeprecationEngine } from './DeprecationEngine';
import { isMigrationSourcePath, listUnder, toWebsiteRelative, websitePath } from './project';

/**
 * Scan source files only:
 * content/, layouts/, data/, i18n/, assets/, config/, config.yaml, trago.js.
 * Never build/, public/, resources/, themes/, or _vendor/.
 */
export function scanDeprecations(
  project: ProjectFiles,
  targetVersion: string,
  currentVersion?: string | null
): Issue[] {
  const engine = new DeprecationEngine();
  const current =
    currentVersion && !/^n\/a/i.test(currentVersion) ? currentVersion : null;
  const active = engine.evaluate(targetVersion, current);
  const issues: Issue[] = [];
  const scope: Issue['scope'] = project.kind === 'module' ? 'module' : 'website';
  const seen = new Set<string>();

  const rootPrefix = websitePath(project);
  const files = listUnder(project, rootPrefix);

  for (const file of files) {
    let rel = toWebsiteRelative(project, file.path).replace(/\\/g, '/');
    if (rel.startsWith('./')) rel = rel.slice(2);
    if (!isMigrationSourcePath(rel)) continue;
    if (!file.content && !/layouts\//i.test(rel)) continue;

    const found = [
      ...engine.scanStructure(rel, file.content || undefined, active, scope),
      ...(file.content ? engine.scanContent(rel, file.content, active, scope) : [])
    ];

    for (const issue of found) {
      const key = `${issue.id}::${issue.file || rel}::${issue.line || 0}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push(issue);
    }
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
