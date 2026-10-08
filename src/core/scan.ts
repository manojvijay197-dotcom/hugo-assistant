import type { Issue, ProjectFiles, ScanReport, ScanSection } from '../types';
import { resultTitleFor, scanDeprecations, splitIssues } from './scanDeprecations';

function summarize(issues: Issue[]) {
  const { commonIssues, structureIssues } = splitIssues(issues);
  return {
    total: issues.length,
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    infos: issues.filter((i) => i.severity === 'info').length,
    common: commonIssues.length,
    structure: structureIssues.length
  };
}

function toSection(title: string, issues: Issue[]): ScanSection {
  const { commonIssues, structureIssues } = splitIssues(issues);
  return {
    title,
    issues,
    commonIssues,
    structureIssues
  };
}

export function runFullScan(
  project: ProjectFiles,
  currentVersion: string,
  targetVersion: string
): ScanReport {
  const issues = scanDeprecations(project, targetVersion, currentVersion);

  return {
    generatedAt: new Date().toISOString(),
    mode: project.kind,
    currentVersion,
    targetVersion,
    results: toSection(resultTitleFor(project.kind), issues),
    summary: summarize(issues)
  };
}
