import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { stdin } from 'node:process';
import { buildReportCsv, buildReportHtml } from '../core/exports';
import { runFullScan } from '../core/scan';
import { readTragoVersion } from '../core/project';
import { getAllTargetVersionOptions, getTargetVersionOptions } from '../core/versions';
import type { ProjectKind, ScanReport } from '../types';
import { detectRunningProject } from './detectProject';
import { loadProjectFromDisk } from './loadProjectFromDisk';
import { promptTargetVersion } from './promptVersion';

export interface HugoAssistantOptions {
  /** Project directory. Defaults to the current working directory (the project Trago is running). */
  cwd?: string;
  /** Skip the prompt when the target version is already known. */
  targetVersion?: string;
  /** Write report.html, report.json, and report.csv under .hugo-assistant/. Defaults to true. */
  writeReports?: boolean;
}

export interface HugoAssistantResult {
  projectRoot: string;
  kind: ProjectKind;
  currentVersion: string | null;
  report: ScanReport;
  reportDir: string | null;
}

function printLine(text = ''): void {
  console.log(text);
}

function resolveTarget(options: string[], requested: string | undefined): string | null {
  if (!requested) return null;
  const normalized = requested.trim().replace(/^v/i, '');
  return options.find((version) => version === requested.trim() || version === normalized) || null;
}

async function chooseTarget(versions: string[], requested: string | undefined): Promise<string> {
  if (requested) {
    const match = resolveTarget(versions, requested);
    if (!match) {
      throw new Error(
        `Target version "${requested}" is not available. Choose one of: ${versions.join(', ')}`
      );
    }
    return match;
  }

  if (versions.length === 1) {
    printLine(`Only one target version is available: ${versions[0]}`);
    return versions[0];
  }

  if (!stdin.isTTY) {
    throw new Error(
      `No interactive terminal to choose a version. Re-run with --target <version>. Available: ${versions.join(', ')}`
    );
  }

  return promptTargetVersion(versions);
}

function printSummary(result: HugoAssistantResult): void {
  const { report } = result;
  printLine('');
  printLine('Scan complete');
  printLine(`  Mode:      ${report.mode === 'module' ? 'Hugo module' : 'Regular repo'}`);
  if (report.mode === 'regular') {
    printLine(`  Current:   ${report.currentVersion}`);
  }
  printLine(`  Target:    ${report.targetVersion}`);
  printLine(`  Issues:    ${report.summary.total}`);
  printLine(`  Structure: ${report.summary.structure}`);
  printLine(`  Other:     ${report.summary.common}`);
  printLine(`  Errors:    ${report.summary.errors}`);
  printLine(`  Warnings:  ${report.summary.warnings}`);

  const preview = [...report.results.structureIssues, ...report.results.commonIssues].slice(0, 20);
  if (preview.length) {
    printLine('');
    for (const issue of preview) {
      const where = issue.file ? `${issue.file}${issue.line ? ':' + issue.line : ''}` : 'project';
      printLine(`  [${issue.severity}] ${issue.title} — ${where}`);
    }
    const hidden = report.summary.total - preview.length;
    if (hidden > 0) printLine(`  … ${hidden} more in the report files`);
  }

  if (result.reportDir) {
    printLine('');
    printLine(`Reports written to ${result.reportDir}`);
  }
}

export async function runHugoAssistant(options: HugoAssistantOptions = {}): Promise<HugoAssistantResult> {
  const startDir = options.cwd || process.cwd();
  const detected = detectRunningProject(startDir);
  const project = loadProjectFromDisk(detected.projectRoot, detected.kind);

  let currentVersion: string | null = null;
  let versions: string[];

  printLine('');
  printLine('Hugo Assistant');
  printLine(`  Project: ${detected.projectRoot}`);

  if (detected.kind === 'regular') {
    currentVersion = readTragoVersion(project);
    versions = getTargetVersionOptions(currentVersion);
    const tragoLabel = relative(detected.projectRoot, detected.tragoFile || 'trago.js') || 'trago.js';
    printLine(`  Mode:    Regular repo (${tragoLabel})`);
    printLine(`  Current Hugo version: ${currentVersion}`);
    if (!versions.length) {
      throw new Error(`No target versions are available after Hugo ${currentVersion}.`);
    }
  } else {
    versions = getAllTargetVersionOptions();
    printLine('  Mode:    Hugo module (trago.js was not found)');
    printLine('  Pick the Hugo version this module should be updated to.');
  }

  const targetVersion = await chooseTarget(versions, options.targetVersion);
  const currentLabel = detected.kind === 'module' ? 'n/a (module)' : currentVersion!;
  const report = runFullScan(project, currentLabel, targetVersion);

  let reportDir: string | null = null;
  if (options.writeReports !== false) {
    reportDir = join(detected.projectRoot, '.hugo-assistant');
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(join(reportDir, 'report.json'), JSON.stringify(report, null, 2));
    writeFileSync(join(reportDir, 'report.html'), buildReportHtml(report));
    writeFileSync(join(reportDir, 'report.csv'), buildReportCsv(report));
  }

  const result: HugoAssistantResult = {
    projectRoot: detected.projectRoot,
    kind: detected.kind,
    currentVersion,
    report,
    reportDir
  };
  printSummary(result);
  return result;
}
