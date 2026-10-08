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

function contentMatchAllowed(rule: DeprecationRule, filePath: string): boolean {
  const feature = rule.feature.toLowerCase();
  const configFile = /\.(ya?ml|yml|toml)$/i.test(filePath);
  const contentFile = /\.(md|markdown|html?)$/i.test(filePath);
  if (
    feature.includes('front matter') ||
    feature.startsWith('kind ') ||
    feature.startsWith('lang ') ||
    feature.startsWith('path ') ||
    feature.startsWith('cascade') ||
    feature.includes('template lookup')
  ) {
    return contentFile;
  }
  if (feature.includes('layout') || feature.includes('partial') || feature.endsWith('.html')) {
    return /layouts\//i.test(filePath);
  }
  return configFile;
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

/** Content patterns for structureChange rules that are config/front-matter shaped. */
function structureContentRegex(rule: DeprecationRule): RegExp | null {
  const feature = rule.feature.trim();
  const usage = (rule.usageBefore || '').trim();

  switch (feature) {
    case 'kind front matter':
      return /^kind\s*:/m;
    case 'lang front matter':
      return /^lang\s*:/m;
    case 'path front matter':
      return /^path\s*:/m;
    case 'cascade._target':
      return /_target\s*:/;
    case 'paginate':
      return /\bpaginate\b\s*[:=]/i;
    case 'paginatePath':
      return /\bpaginatePath\b\s*[:=]/i;
    case 'minifyOutput':
      return /\bminifyOutput\b\s*[:=]/i;
    case 'services.twitter':
    case 'twitter service':
      return /\[services\.twitter\]|services:\s*\n\s*twitter\s*:/i;
    case 'module.mounts.lang':
      return /\blang\b\s*[:=]/i;
    case 'segments.lang':
      return /\blang\b\s*[:=]/i;
    case 'module.mounts.includeFiles':
      return /\bincludeFiles\b\s*[:=]/i;
    case 'module.mounts.excludeFiles':
      return /\bexcludeFiles\b\s*[:=]/i;
    case 'languageCode':
      return /^\s*languageCode\s*[:=]/m;
    case 'languages.<lang>.languageCode':
      return /^\s*languageCode\s*[:=]/m;
    case 'languages.<lang>.languageName':
      return /^\s*languageName\s*[:=]/m;
    case 'languages.<lang>.languageDirection':
      return /^\s*languageDirection\s*[:=]/m;
    case 'imaging.compression':
      return /\bcompression\b\s*[:=]/i;
    case 'global imaging quality':
      return /\[imaging\]|imaging:\s*\n[\s\S]*?\bquality\b\s*[:=]/i;
    case '_internal templates':
      return /template\s+"_internal\/|partial\s+"_internal\/|_internal\//;
    case 'relative partial references':
      return /partial(?:Cached)?\s+["']\.\.?\//;
    case 'type front matter template lookup':
      return /^type\s*:/m;
    case 'layout front matter template lookup':
      return /^layout\s*:/m;
    case 'resources.Get symlinked entries':
      return /resources\.Get\b/;
    default:
      break;
  }

  if (usage) {
    // Prefer exact usageBefore snippet when present
    const escaped = usage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escaped);
  }

  return featureRegex(feature);
}

function matchesStructureContent(rule: DeprecationRule, content: string): boolean {
  const re = structureContentRegex(rule);
  if (!re) return false;
  return re.test(content);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build a content regex for a single API / config token. */
function featureRegex(feature: string): RegExp | null {
  const f = feature.trim();
  if (!f) return null;

  // Never treat full example templates as the primary matcher.
  // Callers should pass extracted tokens, not "{{ .Scratch.Set ... }}".
  if (f.includes('{{') || f.includes('}}')) return null;

  // Phrases that are not literal code tokens
  if (/\bfront matter\b/i.test(f) || /\btemplate lookup\b/i.test(f)) {
    const key = f
      .replace(/\s*front matter.*$/i, '')
      .replace(/\s*template lookup.*$/i, '')
      .trim();
    if (key) return new RegExp(`^\\s*${escapeRe(key)}\\s*:`, 'm');
    return null;
  }

  if (/\bshortcode\b/i.test(f) && !f.includes('.')) {
    const name = f.replace(/\bshortcodes?\b/gi, '').trim();
    if (!name || /\s/.test(name)) return null;
    if (/^scratch$/i.test(name)) {
      return /(?<![A-Za-z0-9_])\.Scratch(?![A-Za-z0-9_])/;
    }
    // Shortcode call only. Never the bare word (that flagged "user" / prose).
    return new RegExp(`\\{\\{[<%]\\s*${escapeRe(name)}\\b`);
  }

  // CLI flags
  if (f.startsWith('--')) {
    return new RegExp(`${escapeRe(f)}\\b`);
  }

  // Permalink tokens like :filename
  if (f.startsWith(':')) {
    return new RegExp(`${escapeRe(f)}\\b`);
  }

  // Nested config keys with placeholders: languages.<lang>.languageCode
  if (f.includes('.<') || f.includes('>.')) {
    const leaf = f.split('.').pop() || f;
    return new RegExp(`\\b${escapeRe(leaf)}\\b\\s*[:=]`, 'i');
  }

  // Dot-path / dotted identifiers: .Site.Author, resources.PostProcess, Page.IsNode
  if (f.startsWith('.') || f.includes('.')) {
    return dottedPathRegex(f);
  }

  // Plain identifiers (getJSON, LibSass). Case-sensitive — "Get it on Google Play" is not getJSON.
  return new RegExp(`(?<![A-Za-z0-9_])${escapeRe(f)}(?![A-Za-z0-9_])`);
}

/**
 * Match dotted Hugo APIs in real code:
 *   .Site.Data  ↔  site.Data
 *   .Page.Sites ↔  .Sites (when feature is .Page.Sites)
 *   Page.Language.Lang ↔ .Language.Lang / .Page.Language.Lang
 */
function dottedPathRegex(feature: string): RegExp {
  const f = feature.trim();
  const variants = new Set<string>([f]);

  if (f.startsWith('.Site.')) {
    variants.add('site.' + f.slice('.Site.'.length));
    variants.add(f.slice(1)); // Site.X
  } else if (f.startsWith('site.')) {
    variants.add('.Site.' + f.slice('site.'.length));
  } else if (f.startsWith('.Page.')) {
    variants.add(f.slice('.Page.'.length)); // .Sites from .Page.Sites? careful
    variants.add(f.slice(1)); // Page.X
    // Also allow bare .X only for unambiguous Page methods (IsNode, Sites)
    const leaf = f.slice('.Page.'.length);
    if (/^(Sites|IsNode|NextPage|PrevPage)$/i.test(leaf)) {
      variants.add('.' + leaf);
    }
  } else if (f.startsWith('Page.')) {
    variants.add('.' + f);
    variants.add('.' + f.slice('Page.'.length));
  } else if (f.startsWith('Site.')) {
    variants.add('.' + f);
    variants.add('site.' + f.slice('Site.'.length));
  } else if (f.startsWith('Language.')) {
    variants.add('.' + f);
    variants.add('.Language.' + f.slice('Language.'.length));
    variants.add('.Page.Language.' + f.slice('Language.'.length));
    variants.add('.Site.Language.' + f.slice('Language.'.length));
  } else if (!f.startsWith('.')) {
    variants.add('.' + f);
  }

  const body = [...variants]
    .map((v) => escapeRe(v))
    .sort((a, b) => b.length - a.length)
    .join('|');
  return new RegExp(`(?<![A-Za-z0-9_])(?:${body})(?![A-Za-z0-9_])`);
}

const TEMPLATE_NOISE = new Set([
  'if', 'else', 'end', 'with', 'range', 'and', 'or', 'not', 'true', 'false',
  'dict', 'index', 'len', 'printf', 'print', 'eq', 'ne', 'lt', 'gt', 'ge', 'le',
  'isset', 'default', 'partial', 'partialcached', 'block', 'define', 'template',
  'where', 'first', 'last', 'after', 'delimit', 'slice', 'append', 'merge'
]);

/** Feature text that is itself a code symbol, not a sentence. */
function isStrictCodeToken(feature: string): boolean {
  const f = feature.trim();
  if (!f || /\s/.test(f) || f.includes('{{') || f.includes('/')) return false;
  if (f.startsWith('--') || f.startsWith(':') || f.startsWith('.')) return true;
  if (f.includes('.')) return true;
  return /[A-Z]/.test(f) && /^[A-Za-z_][\w]*$/.test(f);
}

/**
 * Needles come only from the rule feature and usageBefore in deprecations.json.
 * Sample URLs and shortcode attributes (https:, user=, id=) are never needles.
 */
function contentPatternsForRule(rule: DeprecationRule): RegExp[] {
  const usage = rule.usageBefore || '';
  const feature = rule.feature.trim();
  const patterns: RegExp[] = [];
  const seen = new Set<string>();
  const add = (re: RegExp | null) => {
    if (!re || seen.has(re.source)) return;
    seen.add(re.source);
    patterns.push(re);
  };

  const shortcodeNames = new Set<string>();
  for (const m of usage.matchAll(/\{\{[<%]\s*([A-Za-z_][\w-]*)/g)) {
    shortcodeNames.add(m[1]);
  }
  const phrase = feature.match(/^(?:shortcode\s+)?([A-Za-z_][\w-]*)\s+shortcodes?$/i);
  if (phrase) shortcodeNames.add(phrase[1]);

  // Shortcode rules match only `{{< name` / `{{% name`, never the word in prose.
  if (shortcodeNames.size) {
    for (const name of shortcodeNames) {
      if (/^scratch$/i.test(name)) {
        add(/(?<![A-Za-z0-9_])\.Scratch(?![A-Za-z0-9_])/);
      } else {
        add(new RegExp(`\\{\\{[<%]\\s*${escapeRe(name)}\\b`));
      }
    }
    return patterns;
  }

  if (isStrictCodeToken(feature)) add(featureRegex(feature));
  if (/scratch/i.test(feature)) add(/(?<![A-Za-z0-9_])\.Scratch(?![A-Za-z0-9_])/);

  // Identifiers inside {{ }} only. Quoted strings are removed so sample URLs cannot match.
  // Dotted paths stay whole: never split .Site.Author into the word "Site".
  const withoutQuotes = usage.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, ' ');
  for (const block of withoutQuotes.matchAll(/\{\{[<%]?\s*([\s\S]*?)\}\}/g)) {
    const inner = block[1];
    for (const m of inner.matchAll(/\.?[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)+/g)) {
      add(featureRegex(m[0]));
    }
    const rest = inner.replace(/\.?[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)+/g, ' ');
    for (const m of rest.matchAll(/\b([A-Za-z_][\w]*)\b/g)) {
      const name = m[1];
      if (TEMPLATE_NOISE.has(name.toLowerCase())) continue;
      if (!/[A-Z]/.test(name)) continue;
      add(featureRegex(name));
    }
  }

  if (!usage.includes('{{')) {
    for (const m of usage.matchAll(/\[[A-Za-z0-9_.]+\]/g)) {
      add(new RegExp(escapeRe(m[0])));
      const inner = m[0].slice(1, -1);
      if (inner.includes('.')) add(featureRegex(inner));
    }
    for (const m of usage.matchAll(/(?:^|\n)\s*([A-Za-z_][\w.]*)\s*[=:]/gm)) {
      const key = m[1];
      if (key.length < 4 || /^(https?|true|false|null)$/i.test(key)) continue;
      add(new RegExp(`(?<![A-Za-z0-9_])${escapeRe(key)}\\s*[=:]`));
    }
    for (const m of usage.matchAll(/:([A-Za-z]+)/g)) {
      add(new RegExp(`:${escapeRe(m[1])}\\b`));
    }
  }

  return patterns;
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

function findMatchLine(content: string, rule: DeprecationRule): number | undefined {
  const patterns = [structureContentRegex(rule), ...contentPatternsForRule(rule)].filter(
    (re): re is RegExp => Boolean(re)
  );
  if (!patterns.length) return undefined;
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const re of patterns) {
      if (re.test(lines[i])) {
        re.lastIndex = 0;
        return i + 1;
      }
      re.lastIndex = 0;
    }
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
    const lines = content.split(/\r?\n/);
    const commonRules = activeRules.filter((r) => !r.structureChange && !r.advisory);
    const seen = new Set<string>();
    const markdown = /\.(md|markdown|org)$/i.test(filePath);
    const configLike = /\.(ya?ml|yml|toml|json)$/i.test(filePath) || /trago\.js$/i.test(filePath);
    const codeFile = /\.(html?|xml|js|ts|css|scss|sass|svg)$/i.test(filePath);
    const lineOk: boolean[] = [];
    let inFrontMatter = false;
    let frontMatterClosed = false;
    for (let i = 0; i < lines.length; i++) {
      const lineContent = lines[i];
      if (markdown) {
        if (!frontMatterClosed && lineContent.trim() === '---') {
          inFrontMatter = !inFrontMatter;
          if (!inFrontMatter) frontMatterClosed = true;
          lineOk.push(false);
          continue;
        }
        lineOk.push(inFrontMatter || lineContent.includes('{{'));
      } else if (configLike || codeFile) {
        lineOk.push(true);
      } else {
        lineOk.push(lineContent.includes('{{') || lineContent.includes('='));
      }
    }

    for (const rule of commonRules) {
      // Skip rules that only apply inside shortcode templates when the file isn't one
      if (/^shortcode\s+Scratch$/i.test(rule.feature.trim())) {
        if (!/(^|\/)layouts\/(?:_?shortcodes)\//i.test(filePath)) continue;
      }

      const patterns = contentPatternsForRule(rule);
      if (!patterns.length) continue;

      for (let i = 0; i < lines.length; i++) {
        if (!lineOk[i]) continue;
        const lineContent = lines[i];
        let matched = false;
        let idx = 0;
        for (const regex of patterns) {
          const m = lineContent.match(regex);
          regex.lastIndex = 0;
          if (!m || m.index == null) continue;
          matched = true;
          idx = m.index;
          break;
        }
        if (!matched) continue;

        const key = `${rule.id}::${filePath}::${i + 1}`;
        if (seen.has(key)) continue;
        seen.add(key);

        issues.push({
          id: `${rule.id}-deprecation`,
          title: `Deprecated Feature: ${rule.feature}`,
          description: rule.description,
          severity: rule.severity,
          category: 'deprecation',
          file: filePath,
          line: i + 1,
          column: idx + 1,
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
      const contentHit =
        !pathHit && content && contentMatchAllowed(rule, filePath)
          ? matchesStructureContent(rule, content)
          : false;
      if (!pathHit && !contentHit) continue;

      const line =
        contentHit && content ? findMatchLine(content, rule) : undefined;

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
