import type { DeprecationRule, Issue } from '../types';
import rulesData from '../rules/deprecations.json';

function coerceParts(version: string): number[] | null {
  const cleaned = version.trim().replace(/^v/i, '');
  const m = cleaned.match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3] || 0)];
}

/** Returns true when a >= b (semver-ish, Hugo style 0.x.y). */
export function versionGte(a: string, b: string): boolean {
  const pa = coerceParts(a);
  const pb = coerceParts(b);
  if (!pa || !pb) return false;
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return true;
    if (pa[i] < pb[i]) return false;
  }
  return true;
}

export function versionEq(a: string, b: string): boolean {
  const pa = coerceParts(a);
  const pb = coerceParts(b);
  if (!pa || !pb) return false;
  return pa[0] === pb[0] && pa[1] === pb[1] && pa[2] === pb[2];
}

export function normalizeVersion(version: string): string {
  const parts = coerceParts(version);
  if (!parts) return version.trim().replace(/^v/i, '');
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/** True when the rule applies for the chosen target Hugo version. */
export function ruleAppliesToTarget(rule: DeprecationRule, targetVersion: string): boolean {
  if (rule.deprecatedIn) {
    return versionGte(targetVersion, rule.deprecatedIn);
  }
  if (rule.removedIn) {
    return versionGte(targetVersion, rule.removedIn);
  }
  // Introduced-only / advisory entries are not scanned as findings.
  return false;
}

/**
 * Path/name matchers for structureChange rules.
 * Returns true when the project still uses the old layout/path shape.
 */
function matchesStructurePath(rule: DeprecationRule, filePath: string): boolean {
  const p = normalizePath(filePath);
  const feature = rule.feature.trim();

  switch (feature) {
    case 'layouts/_default':
      return /(?:^|\/)layouts\/_default(?:\/|$)/.test(p);
    case 'layouts/partials':
      return /(?:^|\/)layouts\/partials(?:\/|$)/.test(p);
    case 'layouts/shortcodes':
      return /(?:^|\/)layouts\/shortcodes(?:\/|$)/.test(p);
    case 'layouts/section':
      return /(?:^|\/)layouts\/section(?:\/|$)/.test(p);
    case 'layouts/taxonomy':
      return /(?:^|\/)layouts\/taxonomy(?:\/|$)/.test(p);
    case 'index.html':
      return /(?:^|\/)layouts\/(?:_default\/)?index\.html$/i.test(p);
    case 'list-baseof.html':
      return /(?:^|\/)[^/]*list-baseof\.html$/i.test(p);
    case 'taxonomy/term template structure':
      return (
        /(?:^|\/)layouts\/_default\/(?:taxonomy|terms|term)\.html$/i.test(p) ||
        /(?:^|\/)layouts\/taxonomy\//.test(p)
      );
    default:
      // Generic: feature looks like a path fragment
      if (feature.includes('/') || feature.endsWith('.html')) {
        return p.includes(feature.replace(/^\/+/, ''));
      }
      return false;
  }
}

/** Content matchers used for some structure rules (e.g. _internal templates). */
function matchesStructureContent(rule: DeprecationRule, content: string): boolean {
  const feature = rule.feature.trim();
  if (feature === '_internal templates') {
    return /template\s+"_internal\//.test(content) || /partial\s+"_internal\//.test(content);
  }
  if (feature === 'type front matter template lookup') {
    return /^type\s*:/m.test(content);
  }
  if (feature === 'layout front matter template lookup') {
    return /^layout\s*:/m.test(content);
  }
  return false;
}

function annotateRule(rule: DeprecationRule, targetVersion: string): DeprecationRule {
  const isRemoved = rule.removedIn ? versionGte(targetVersion, rule.removedIn) : false;
  return {
    ...rule,
    severity: rule.structureChange ? rule.severity : 'error',
    description: isRemoved
      ? `[REMOVED IN ${rule.removedIn}] ${rule.description}`
      : rule.description
  };
}

export class DeprecationEngine {
  private rules: DeprecationRule[];

  constructor(rules: DeprecationRule[] = rulesData as DeprecationRule[]) {
    this.rules = rules;
  }

  evaluate(targetVersion: string | null): DeprecationRule[] {
    if (!targetVersion) return [];

    return this.rules
      .filter((rule) => ruleAppliesToTarget(rule, targetVersion))
      .map((rule) => annotateRule(rule, targetVersion));
  }

  /** Code / config pattern checks (structureChange: false). */
  scanContent(
    filePath: string,
    content: string,
    activeRules: DeprecationRule[],
    scope: Issue['scope']
  ): Issue[] {
    const issues: Issue[] = [];
    const lines = content.split(/\r?\n/);
    const commonRules = activeRules.filter((r) => !r.structureChange);

    for (const rule of commonRules) {
      let regex: RegExp;
      if (rule.feature.startsWith('.')) {
        const escaped = rule.feature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regex = new RegExp(`(?<![\\w.])${escaped}(?![\\w])`, 'g');
      } else {
        regex = new RegExp(
          `\\b${rule.feature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
          'g'
        );
      }

      for (let i = 0; i < lines.length; i++) {
        const lineContent = lines[i];
        if (!regex.test(lineContent)) continue;
        regex.lastIndex = 0;

        issues.push({
          id: `${rule.id}-deprecation`,
          title: `Deprecated Feature: ${rule.feature}`,
          description: rule.description,
          severity: rule.severity,
          category: 'deprecation',
          file: filePath,
          line: i + 1,
          column: Math.max(0, lineContent.indexOf(rule.feature)) + 1,
          replacement: rule.replacement,
          documentation: rule.documentation,
          deprecatedIn: rule.deprecatedIn || undefined,
          removedIn: rule.removedIn || undefined,
          scope,
          structureChange: false
        });
      }
    }

    return issues;
  }

  /**
   * Folder / template-system shape checks (structureChange: true).
   * Reports once per matching file (or content hit), not per line.
   */
  scanStructure(
    filePath: string,
    content: string | undefined,
    activeRules: DeprecationRule[],
    scope: Issue['scope']
  ): Issue[] {
    const issues: Issue[] = [];
    const structureRules = activeRules.filter((r) => r.structureChange);

    for (const rule of structureRules) {
      const pathHit = matchesStructurePath(rule, filePath);
      const contentHit = content ? matchesStructureContent(rule, content) : false;
      if (!pathHit && !contentHit) continue;

      let line: number | undefined;
      if (contentHit && content) {
        const lines = content.split(/\r?\n/);
        const idx = lines.findIndex(
          (l) =>
            /_internal\//.test(l) ||
            /^type\s*:/.test(l) ||
            /^layout\s*:/.test(l)
        );
        if (idx >= 0) line = idx + 1;
      }

      issues.push({
        id: `${rule.id}-structure`,
        title: `Structure Change: ${rule.feature}`,
        description: rule.description,
        severity: rule.severity === 'info' ? 'warning' : rule.severity,
        category: 'structure',
        file: filePath,
        line,
        replacement: rule.replacement,
        documentation: rule.documentation,
        deprecatedIn: rule.deprecatedIn || undefined,
        removedIn: rule.removedIn || undefined,
        scope,
        structureChange: true
      });
    }

    return issues;
  }
}
