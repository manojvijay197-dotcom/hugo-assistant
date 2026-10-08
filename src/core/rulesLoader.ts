import type { DeprecationRule, Severity } from '../types';
import rawRules from '../rules/deprecations.json';

type RawRule = {
  id: string;
  feature: string;
  category: string;
  introducedIn?: string;
  deprecatedIn?: string;
  removedIn?: string;
  replacement?: string;
  description?: string;
  usageBefore?: string;
  usageAfter?: string;
  documentation?: string;
  severity?: Severity;
  structureChange?: boolean;
};

function versionParts(v: string): number[] | null {
  const m = v.trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3] || 0)];
}

function compareVersions(a: string, b: string): number {
  const pa = versionParts(a);
  const pb = versionParts(b);
  if (!pa || !pb) return a.localeCompare(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function normalizeRule(raw: RawRule): DeprecationRule {
  const deprecatedIn = raw.deprecatedIn || '';
  const removedIn = raw.removedIn || '';
  const introducedIn = raw.introducedIn || '';
  const sinceVersion = deprecatedIn || removedIn || introducedIn;

  return {
    id: raw.id,
    feature: raw.feature,
    category: raw.category || 'deprecation',
    introducedIn,
    deprecatedIn,
    removedIn,
    sinceVersion,
    replacement: raw.replacement || '',
    description: raw.description || '',
    usageBefore: raw.usageBefore,
    usageAfter: raw.usageAfter,
    documentation: raw.documentation || '',
    severity: raw.severity || 'error',
    structureChange: Boolean(raw.structureChange),
    // Config / front-matter “structure” flags still need content matching
    advisory: false
  };
}

/**
 * Flat deprecations.json → DeprecationRule[].
 * Format: array of { id, feature, deprecatedIn, removedIn, structureChange, ... }
 */
export function loadDeprecationRules(): DeprecationRule[] {
  const list = rawRules as RawRule[];
  if (!Array.isArray(list)) {
    throw new Error('deprecations.json must be an array of rule objects');
  }
  return list.map(normalizeRule);
}

let cachedRules: DeprecationRule[] | null = null;

export function getDeprecationRules(): DeprecationRule[] {
  if (!cachedRules) cachedRules = loadDeprecationRules();
  return cachedRules;
}

/** Unique versions referenced by the rules, sorted ascending. */
export function getVersionsFromRules(): string[] {
  const set = new Set<string>();
  for (const rule of getDeprecationRules()) {
    for (const v of [rule.introducedIn, rule.deprecatedIn, rule.removedIn, rule.sinceVersion]) {
      if (v) set.add(v);
    }
  }
  return [...set].sort(compareVersions);
}

/**
 * Target picker list: every x.y.0 between the earliest and latest rule version,
 * plus any exact patch versions that appear in the JSON.
 */
export function getCatalogVersions(): string[] {
  const fromRules = getVersionsFromRules();
  if (!fromRules.length) return [];

  const set = new Set(fromRules);
  const first = versionParts(fromRules[0])!;
  const last = versionParts(fromRules[fromRules.length - 1])!;

  // Fill minor .0 releases across the span (Hugo 0.x line)
  if (first[0] === last[0]) {
    for (let minor = first[1]; minor <= last[1]; minor++) {
      set.add(`${first[0]}.${minor}.0`);
    }
  }

  return [...set].sort(compareVersions);
}

export function getCatalogScope(): { from: string; to: string } {
  const versions = getCatalogVersions();
  return {
    from: versions[0] || '',
    to: versions[versions.length - 1] || ''
  };
}
