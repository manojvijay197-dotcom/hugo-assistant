export type Severity = 'error' | 'warning' | 'info';
export type IssueCategory = 'deprecation' | 'structure';
export type ProjectKind = 'regular' | 'module';

export interface Issue {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  category: IssueCategory;
  file?: string;
  line?: number;
  column?: number;
  replacement?: string;
  documentation?: string;
  deprecatedIn?: string;
  removedIn?: string;
  scope: 'website' | 'module';
  structureChange?: boolean;
}

export interface DeprecationRule {
  id: string;
  feature: string;
  category: string;
  introducedIn?: string;
  deprecatedIn: string;
  removedIn: string;
  replacement: string;
  description: string;
  usageBefore?: string;
  usageAfter?: string;
  documentation: string;
  severity: Severity;
  structureChange?: boolean;
}

export interface ScanSection {
  title: string;
  issues: Issue[];
  commonIssues: Issue[];
  structureIssues: Issue[];
}

export interface ScanReport {
  generatedAt: string;
  mode: ProjectKind;
  currentVersion: string;
  targetVersion: string;
  results: ScanSection;
  summary: {
    total: number;
    errors: number;
    warnings: number;
    infos: number;
    common: number;
    structure: number;
  };
}

export interface VirtualFile {
  path: string;
  content: string;
  size: number;
}

export interface ProjectFiles {
  files: Map<string, VirtualFile>;
  /** Scan root: website/ for regular repos, module root for Hugo modules. */
  websiteRoot: string;
  kind: ProjectKind;
}
