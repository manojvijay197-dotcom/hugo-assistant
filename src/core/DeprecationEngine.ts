import type { DeprecationRule, Issue } from '../types';
import { getDeprecationRules } from './rulesLoader';

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

/** Returns true when a > b. */
export function versionGt(a: string, b: string): boolean {
  const pa = coerceParts(a);
  const pb = coerceParts(b);
  if (!pa || !pb) return false;
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return true;
    if (pa[i] < pb[i]) return false;
  }
  return false;
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

/** Event versions on a rule that can fall inside a migration window. */
export function ruleEventVersions(rule: DeprecationRule): string[] {
  const out: string[] = [];
  for (const v of [rule.deprecatedIn, rule.removedIn, rule.introducedIn, rule.sinceVersion]) {
    if (!v || !coerceParts(v)) continue;
    if (!out.some((x) => versionEq(x, v))) out.push(v);
  }
  return out;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Rule is in the migration window: an event version is after `current`
 * and at or before `target`.
 * Deprecation at 0.138 with current 0.124 and target 0.164 → included.
 * Removal at 0.120 with current 0.124 → excluded (already behind current).
 */
export function ruleAppliesToTarget(
  rule: DeprecationRule,
  targetVersion: string,
  currentVersion?: string | null
): boolean {
  const current =
    currentVersion && coerceParts(currentVersion) ? normalizeVersion(currentVersion) : null;
  const target = normalizeVersion(targetVersion);
  if (current && !versionGt(target, current)) return false;

  const events = [rule.deprecatedIn, rule.removedIn, rule.introducedIn].filter(
    (v): v is string => Boolean(v && coerceParts(v))
  );
  if (!events.length) return false;

  return events.some((event) => {
    const v = normalizeVersion(event);
    if (!versionGte(target, v)) return false;
    if (!current) return true;
    return versionGt(v, current);
  });
}

function matchesStructurePath(rule: DeprecationRule, filePath: string): boolean {
  const p = normalizePath(filePath);
  // Normalize "layouts/partials/" and "layouts/partials" to the same key
  const feature = rule.feature.trim().replace(/\/+$/, '');

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
    case 'layouts/index.html':
    case 'index.html':
      return /(?:^|\/)layouts\/(?:_default\/)?index\.html$/i.test(p);
    case 'list-baseof.html':
      return /(?:^|\/)[^/]*list-baseof\.html$/i.test(p);
    case 'taxonomy/term template structure':
      return (
        /(?:^|\/)layouts\/(?:_default\/)?(?:taxonomy|terms?)\.html$/i.test(p) ||
        /(?:^|\/)layouts\/taxonomy\//.test(p)
      );
    case '_markup':
      // Flag old render-hook paths still nested under _default
      return /(?:^|\/)layouts\/_default\/_markup(?:\/|$)/.test(p);
    case 'all.html':
      return /(?:^|\/)layouts\/(?:_default\/)?all\.html$/i.test(p);
    case 'relative partial references':
      return false; // content-only
    default:
      if (
        (feature.includes('layouts/') || feature.endsWith('.html')) &&
        !feature.includes('<') &&
        !feature.includes(' ')
      ) {
        const needle = feature.replace(/^\/+/, '');
        return p === needle || p.startsWith(needle + '/') || p.includes('/' + needle);
      }
      return false;
  }
}

/**
 * A rule matches only its exact feature from deprecations.json.
 * `.Summary` matches `.Summary` / `$page.Summary`. It does not match the word "Summary".
 * Future rules are picked up from the JSON feature + usageBefore. No per-feature word lists.
 */
type ExactMatcher = {
  /** File must contain every string. */
  fileAll: string[];
  /** File must contain at least one string. Empty means no extra file filter. */
  fileAny: string[];
  /** Line must contain at least one string before the regex runs. */
  lineAny: string[];
  line: RegExp;
};

function exactMatcherFor(rule: DeprecationRule): ExactMatcher | null {
  const feature = rule.feature.trim();
  const usage = rule.usageBefore || '';
  const sources: string[] = [];
  const literals: string[] = [];
  const fileAll: string[] = [];

  const add = (source: string, literal: string) => {
    if (!source || !literal || sources.includes(source)) return;
    sources.push(source);
    literals.push(literal);
  };

  const shortName = shortcodeName(feature);
  if (shortName) {
    add(shortcodePattern(shortName), shortName);
  } else if (feature === 'shortcode Scratch' || /^shortcode\s+Scratch$/i.test(feature)) {
    add(identPattern('.Scratch'), '.Scratch');
  } else if (feature.startsWith('--')) {
    add(`${escapeRe(feature)}\\b`, feature);
  } else if (feature.startsWith(':')) {
    add(`${escapeRe(feature)}(?![A-Za-z0-9_])`, feature);
  } else if (/[<>]/.test(feature)) {
    const leaf = feature.split('.').pop() || '';
    if (leaf && !/[<>]/.test(leaf)) add(configAssignPattern(leaf), leaf);
  } else if (isTemplateFeature(feature, usage)) {
    for (const needle of templateNeedles(feature, usage)) add(identPattern(needle), needle);
    if (feature.startsWith('.Site.')) {
      const alias = 'site.' + feature.slice('.Site.'.length);
      add(identPattern(alias), alias);
    } else if (feature.startsWith('Site.')) {
      add(identPattern('.Site.' + feature.slice('Site.'.length)), '.Site.' + feature.slice('Site.'.length));
      add(identPattern('site.' + feature.slice('Site.'.length)), 'site.' + feature.slice('Site.'.length));
    }
  } else if (isConfigFeature(feature)) {
    addConfigNeedles(feature, usage, add, fileAll);
  } else {
    addPhraseNeedles(feature, usage, add, fileAll);
  }

  if (!sources.length) return null;
  return {
    fileAll,
    fileAny: literals.filter((lit) => lit.length >= 2),
    lineAny: literals.filter((lit) => lit.length >= 2),
    line: new RegExp(sources.join('|'))
  };
}

function shortcodeName(feature: string): string | null {
  const m = feature.match(/^(?:shortcode\s+)?([A-Za-z_][\w-]*)\s+shortcodes?$/i);
  return m ? m[1] : null;
}

function shortcodePattern(name: string): string {
  // Opening or closing call only. `twitter` must not match `twitter_simple` or the word in prose.
  return `\\{\\{[<%]\\s*/?\\s*${escapeRe(name)}(?![\\w-])`;
}

function identPattern(token: string): string {
  const body = `${escapeRe(token)}(?![A-Za-z0-9_])`;
  // A leading dot is the field access itself (`$page.Summary`, `.Summary`).
  if (token.startsWith('.')) return body;
  return `(?<![A-Za-z0-9_])${body}`;
}

function configAssignPattern(key: string): string {
  // Top-level key only. `paginate` must not match `paginatePath` or `minify.minifyOutput`.
  return `(?<![A-Za-z0-9_.])${escapeRe(key)}\\s*[:=]`;
}

function isTemplateFeature(feature: string, usage: string): boolean {
  if (feature.startsWith('.') || feature.startsWith(':') || feature.startsWith('--')) return true;
  if (usage.includes('{{')) return true;
  if (feature.includes('.')) return /^[A-Z]/.test(feature);
  return false;
}

function isConfigFeature(feature: string): boolean {
  if (!feature || /\s/.test(feature) || feature.includes('{{')) return false;
  if (feature.startsWith('.') || feature.startsWith(':') || feature.startsWith('--')) return false;
  return /^[A-Za-z_][\w.-]*$/.test(feature);
}

function pathParts(token: string): string[] {
  let t = token.trim().replace(/^\$/, '');
  if (/^[A-Za-z_][\w]*\./.test(t) && !/^[A-Z]/.test(t)) {
    // $image.Exif → image.Exif → drop the variable and keep the field
    t = t.replace(/^[A-Za-z_][\w]*/, '');
  }
  if (t.startsWith('.')) t = t.slice(1);
  return t.split('.').filter(Boolean);
}

/** Dotted tokens written in usageBefore. Quoted sample URLs are ignored. */
function extractDotted(usage: string): string[] {
  const bare = usage.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, ' ');
  const found = new Set<string>();
  for (const m of bare.matchAll(/\$?[A-Za-z_]*\.[A-Za-z_][\w.]*/g)) {
    const token = m[0].replace(/\.+$/, '');
    if (token.includes('.')) found.add(token);
  }
  return [...found];
}

/**
 * Keep a usage token only when it is the same API as the feature.
 * `.Page.NextPage` → `.NextPage`. `.Summary` stays `.Summary`, never `Summary`.
 */
function templateNeedles(feature: string, usage: string): string[] {
  const needles = new Set<string>();
  if (feature.includes('.') || feature.startsWith('.')) {
    needles.add(feature);
    if (!feature.startsWith('.')) needles.add('.' + feature);
  }

  const last = pathParts(feature).pop();
  if (last) {
    for (const token of extractDotted(usage)) {
      // Only template spellings (`.NextPage`, `$image.Exif`). Never a bare word.
      if (!token.startsWith('.') && !token.startsWith('$')) continue;
      const parts = pathParts(token);
      if (!parts.length || parts[parts.length - 1] !== last) continue;
      const body = token.startsWith('$') ? token.replace(/^\$[A-Za-z_][\w]*/, '') : token;
      if (!body.startsWith('.')) continue;
      needles.add(body);
      // `.Paginator.PageSize` is the feature `PageSize`. Do not reduce
      // `Page.Language.Lang` to the common field `.Lang`.
      if (pathParts(feature).length === 1 && body !== '.' + last) needles.add('.' + last);
    }
  }

  if (!needles.size && !/[\s/]/.test(feature)) needles.add(feature);
  return [...needles].sort((a, b) => b.length - a.length);
}

function addConfigNeedles(
  feature: string,
  usage: string,
  add: (source: string, literal: string) => void,
  fileAll: string[]
): void {
  const brackets = [...usage.matchAll(/\[([A-Za-z0-9_.]+)\]/g)].map((m) => m[1]);
  if (brackets.length && !feature.includes('.')) {
    for (const table of brackets) {
      add(escapeRe('[' + table + ']'), '[' + table);
      add(identPattern(table), table);
    }
    return;
  }

  if (feature.includes('.')) {
    add(identPattern(feature), feature);
    const parts = feature.split('.');
    const leaf = parts[parts.length - 1];
    const parent = parts.slice(0, -1).join('.');
    if (!leaf || leaf.length < 2 || !parent) return;
    // The leaf key counts only when the parent table is in the same file.
    fileAll.push(parent);
    add(configAssignPattern(leaf), leaf);
    return;
  }

  if (/[=:]/.test(usage)) {
    add(configAssignPattern(feature), feature);
    return;
  }

  add(identPattern(feature), feature);
}

function addPhraseNeedles(
  feature: string,
  usage: string,
  add: (source: string, literal: string) => void,
  fileAll: string[]
): void {
  if (usage.includes('_internal/')) add(escapeRe('_internal/'), '_internal/');
  if (/relative partial/i.test(feature)) {
    add(`partial(?:Cached)?\\s+["']\\.\\.?/`, 'partial');
  }

  const api = feature.match(/[a-z][A-Za-z0-9]*\.[A-Za-z_][\w.]*/);
  if (api && /[A-Z]/.test(api[0])) add(identPattern(api[0]), api[0]);

  const table = usage.match(/\[([A-Za-z0-9_.]+)\]/);
  const key = usage.match(/(?:^|\n)\s*([A-Za-z_][\w]*)\s*[:=]/);
  if (table && table[1].includes('.')) {
    add(escapeRe('[' + table[1] + ']'), '[' + table[1]);
    add(identPattern(table[1]), table[1]);
    return;
  }
  if (table && key) {
    fileAll.push('[' + table[1] + ']');
    add(configAssignPattern(key[1]), key[1]);
  }
}

function includesScoped(content: string, bit: string): boolean {
  if (bit.includes('.')) {
    if (content.includes(bit) || content.includes('[[' + bit + ']]')) return true;
    return bit.split('.').every((seg) =>
      new RegExp(`(?:^|\\n)\\s*${escapeRe(seg)}\\s*:`).test(content)
    );
  }
  return new RegExp(`(?:^|[\\n\\[.\\s])${escapeRe(bit)}(?:$|[\\]\\s:=])`).test(content);
}

function fileMatches(matcher: ExactMatcher, content: string): boolean {
  if (matcher.fileAll.length) {
    const parentOk = matcher.fileAll.every((bit) => includesScoped(content, bit));
    const dottedLiteral = matcher.fileAny.some((bit) => bit.includes('.') && content.includes(bit));
    if (!parentOk && !dottedLiteral) return false;
  }
  if (!matcher.fileAny.length) return true;
  return matcher.fileAny.some((bit) => content.includes(bit));
}

function lineMatches(matcher: ExactMatcher, line: string): { index: number } | null {
  if (matcher.lineAny.length && !matcher.lineAny.some((bit) => line.includes(bit))) return null;
  matcher.line.lastIndex = 0;
  const found = line.match(matcher.line);
  if (!found || found.index == null) return null;
  return { index: found.index };
}

/** Used feature is a migration failure. Introductions keep their own severity. */
function severityForHit(rule: DeprecationRule): DeprecationRule['severity'] {
  if (rule.removedIn || rule.deprecatedIn) return 'error';
  if (rule.severity === 'info') return 'warning';
  return rule.severity;
}

function matchesStructureContent(rule: DeprecationRule, content: string): boolean {
  const matcher = matcherFor(rule);
  if (!matcher || !fileMatches(matcher, content)) return false;
  return content.split(/\r?\n/).some((line) => lineMatches(matcher, line));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function annotateRule(rule: DeprecationRule, targetVersion: string): DeprecationRule {
  const isRemoved = rule.removedIn ? versionGte(targetVersion, rule.removedIn) : false;
  const since = rule.sinceVersion || rule.deprecatedIn || rule.removedIn;
  return {
    ...rule,
    severity: rule.severity || 'error',
    description: isRemoved
      ? `[REMOVED IN ${rule.removedIn}] ${rule.description}`
      : rule.deprecatedIn
        ? `[DEPRECATED IN ${rule.deprecatedIn}] ${rule.description}`
        : since
          ? `[SINCE ${since}] ${rule.description}`
          : rule.description
  };
}

const matcherCache = new Map<string, ExactMatcher | null>();

function matcherFor(rule: DeprecationRule): ExactMatcher | null {
  const key = `${rule.id}\0${rule.feature}\0${rule.usageBefore || ''}`;
  const cached = matcherCache.get(key);
  if (cached !== undefined) return cached;
  const built = exactMatcherFor(rule);
  matcherCache.set(key, built);
  return built;
}

function findMatchLine(content: string, rule: DeprecationRule): number | undefined {
  const matcher = matcherFor(rule);
  if (!matcher) return undefined;
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lineMatches(matcher, lines[i])) return i + 1;
  }
  return undefined;
}

export class DeprecationEngine {
  private rules: DeprecationRule[];

  constructor(rules: DeprecationRule[] = getDeprecationRules()) {
    this.rules = rules;
  }

  evaluate(targetVersion: string | null, currentVersion?: string | null): DeprecationRule[] {
    if (!targetVersion) return [];

    return this.rules
      .filter((rule) => ruleAppliesToTarget(rule, targetVersion, currentVersion))
      .map((rule) => annotateRule(rule, targetVersion));
  }

  scanContent(
    filePath: string,
    content: string,
    activeRules: DeprecationRule[],
    scope: Issue['scope']
  ): Issue[] {
    const issues: Issue[] = [];
    const commonRules = activeRules.filter((r) => !r.structureChange && !r.advisory);
    const prepared: Array<{ rule: DeprecationRule; matcher: ExactMatcher }> = [];
    for (const rule of commonRules) {
      if (/^shortcode\s+Scratch$/i.test(rule.feature.trim())) {
        if (!/(^|\/)layouts\/(?:_?shortcodes)\//i.test(filePath)) continue;
      }
      const matcher = matcherFor(rule);
      if (!matcher || !fileMatches(matcher, content)) continue;
      prepared.push({ rule, matcher });
    }
    if (!prepared.length) return issues;

    const lines = content.split(/\r?\n/);
    const seen = new Set<string>();
    for (let i = 0; i < lines.length; i++) {
      const lineContent = lines[i];
      for (const { rule, matcher } of prepared) {
        const hit = lineMatches(matcher, lineContent);
        if (!hit) continue;
        const key = `${rule.id}::${filePath}::${i + 1}`;
        if (seen.has(key)) continue;
        seen.add(key);
        issues.push({
          id: `${rule.id}-deprecation`,
          title: `Deprecated Feature: ${rule.feature}`,
          description: rule.description,
          severity: severityForHit(rule),
          category: 'deprecation',
          file: filePath,
          line: i + 1,
          column: hit.index + 1,
          replacement: rule.replacement,
          documentation: rule.documentation,
          deprecatedIn: rule.deprecatedIn || undefined,
          removedIn: rule.removedIn || undefined,
          sinceVersion: rule.sinceVersion || rule.deprecatedIn || rule.removedIn || undefined,
          scope,
          structureChange: false
        });
      }
    }

    return issues;
  }

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
      const contentHit = !pathHit && content ? matchesStructureContent(rule, content) : false;
      if (!pathHit && !contentHit) continue;

      const line =
        contentHit && content ? findMatchLine(content, rule) : undefined;

      issues.push({
        id: `${rule.id}-structure`,
        title: `Structure Change: ${rule.feature}`,
        description: rule.description,
        severity: severityForHit(rule),
        category: 'structure',
        file: filePath,
        line,
        replacement: rule.replacement,
        documentation: rule.documentation,
        deprecatedIn: rule.deprecatedIn || undefined,
        removedIn: rule.removedIn || undefined,
        sinceVersion: rule.sinceVersion || rule.deprecatedIn || rule.removedIn || undefined,
        scope,
        structureChange: true
      });
    }

    return issues;
  }

  emitAdvisories(activeRules: DeprecationRule[], scope: Issue['scope']): Issue[] {
    const issues: Issue[] = [];
    for (const rule of activeRules.filter((r) => r.advisory && !r.structureChange)) {
      issues.push({
        id: `${rule.id}-advisory`,
        title: `Release note (${rule.sinceVersion}): ${rule.feature}`,
        description: rule.description,
        severity: rule.severity,
        category: 'deprecation',
        file: `release:${rule.sinceVersion}`,
        replacement: rule.replacement,
        documentation: rule.documentation,
        deprecatedIn: rule.deprecatedIn || undefined,
        removedIn: rule.removedIn || undefined,
        sinceVersion: rule.sinceVersion,
        scope,
        structureChange: false
      });
    }
    return issues;
  }
}
