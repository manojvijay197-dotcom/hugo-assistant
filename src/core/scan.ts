import type { Issue, ProjectFiles, ScanReport } from '../types';
import { listVendorModules, scanDeprecations } from './scanDeprecations';
import { scanImages } from './scanImages';

function summarize(issues: Issue[]) {
  return {
    total: issues.length,
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    infos: issues.filter((i) => i.severity === 'info').length
  };
}

export function runFullScan(
  project: ProjectFiles,
  currentVersion: string,
  targetVersion: string
): ScanReport {
  const websiteIssues: Issue[] = [
    ...scanDeprecations(project, targetVersion, 'website'),
    ...scanImages(project, 'website')
  ];

  const vendorIssues: Issue[] = [];
  for (const mod of listVendorModules(project)) {
    vendorIssues.push(
      ...scanDeprecations(project, targetVersion, 'vendor', mod.name, mod.prefix),
      ...scanImages(project, 'vendor', mod.name, mod.prefix)
    );
  }

  const all = [...websiteIssues, ...vendorIssues];

  return {
    generatedAt: new Date().toISOString(),
    currentVersion,
    targetVersion,
    website: {
      title: 'Website Result',
      issues: websiteIssues
    },
    vendor: {
      title: 'Vendor Result',
      issues: vendorIssues
    },
    summary: summarize(all)
  };
}
