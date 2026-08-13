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

export class DeprecationEngine {
  private rules: DeprecationRule[];

  constructor(rules: DeprecationRule[] = rulesData as DeprecationRule[]) {
    this.rules = rules;
  }

  evaluate(targetVersion: string | null): DeprecationRule[] {
    if (!targetVersion) return [];

    const active: DeprecationRule[] = [];
    for (const rule of this.rules) {
      if (!versionGte(targetVersion, rule.deprecatedIn)) continue;

      const isRemoved = rule.removedIn ? versionGte(targetVersion, rule.removedIn) : false;
      active.push({
        ...rule,
        // All deprecations are reported as errors for upgrade readiness
        severity: 'error',
        description: isRemoved
          ? `[REMOVED IN ${rule.removedIn}] ${rule.description}`
          : rule.description
      });
    }
    return active;
  }

  scanContent(
    filePath: string,
    content: string,
    activeRules: DeprecationRule[],
    scope: Issue['scope'],
    vendorModule?: string
  ): Issue[] {
    const issues: Issue[] = [];
    const lines = content.split(/\r?\n/);

    for (const rule of activeRules) {
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
          deprecatedIn: rule.deprecatedIn,
          removedIn: rule.removedIn || undefined,
          scope,
          vendorModule
        });
      }
    }

    return issues;
  }
}
