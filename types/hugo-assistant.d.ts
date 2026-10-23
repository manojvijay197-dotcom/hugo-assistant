export interface HugoAssistantSummary {
  total: number;
  errors: number;
  warnings: number;
  infos: number;
  common: number;
  structure: number;
}

export interface HugoAssistantReport {
  generatedAt: string;
  mode: 'regular' | 'module';
  currentVersion: string;
  targetVersion: string;
  summary: HugoAssistantSummary;
}

export interface HugoAssistantOptions {
  /** Project directory. Defaults to process.cwd(). */
  cwd?: string;
  /** Skip the version prompt. */
  targetVersion?: string;
  /** Write .hugo-assistant reports. Defaults to true. */
  writeReports?: boolean;
}

export interface HugoAssistantResult {
  projectRoot: string;
  kind: 'regular' | 'module';
  currentVersion: string | null;
  report: HugoAssistantReport;
  reportDir: string | null;
}

/** Scan the current Trago project. Asks for a target version when one is not provided. */
export function runHugoAssistant(options?: HugoAssistantOptions): Promise<HugoAssistantResult>;
