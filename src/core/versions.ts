import { normalizeVersion, versionGte } from './DeprecationEngine';

/** Known Hugo releases used to build the target-version radio list (up to current latest). */
export const HUGO_RELEASES: string[] = [
  '0.55.0',
  '0.60.0',
  '0.80.0',
  '0.100.0',
  '0.110.0',
  '0.115.0',
  '0.120.0',
  '0.121.0',
  '0.122.0',
  '0.123.0',
  '0.124.0',
  '0.125.0',
  '0.126.0',
  '0.127.0',
  '0.128.0',
  '0.129.0',
  '0.130.0',
  '0.131.0',
  '0.132.0',
  '0.133.0',
  '0.134.0',
  '0.135.0',
  '0.136.0',
  '0.137.0',
  '0.138.0',
  '0.139.0',
  '0.140.0',
  '0.141.0',
  '0.142.0',
  '0.143.0',
  '0.144.0',
  '0.145.0',
  '0.146.0',
  '0.147.0',
  '0.148.0',
  '0.149.0',
  '0.150.0',
  '0.151.0',
  '0.152.0',
  '0.153.0',
  '0.154.0',
  '0.155.0',
  '0.156.0',
  '0.157.0',
  '0.158.0',
  '0.159.0',
  '0.160.0',
  '0.161.0',
  '0.162.0',
  '0.163.0',
  '0.164.0',
  '0.165.0'
];

export const LATEST_HUGO = HUGO_RELEASES[HUGO_RELEASES.length - 1];

/**
 * Target versions the user can compare against: from the project's current
 * version up through the latest Hugo release (inclusive of current).
 */
export function getTargetVersionOptions(currentVersion: string): string[] {
  const current = normalizeVersion(currentVersion);
  const options = HUGO_RELEASES.filter((v) => versionGte(v, current));

  if (!options.includes(current) && coerceOk(current)) {
    options.unshift(current);
  }

  // Always ensure latest is present
  if (!options.includes(LATEST_HUGO) && versionGte(LATEST_HUGO, current)) {
    options.push(LATEST_HUGO);
  }

  return [...new Set(options)];
}

function coerceOk(v: string): boolean {
  return /^\d+\.\d+(\.\d+)?$/.test(v.replace(/^v/i, ''));
}

/**
 * Extract Hugo version from trago.js source text.
 * Supports common patterns used in Traogo / project bootstrap files.
 */
export function parseHugoVersionFromTrago(source: string): string | null {
  const patterns: RegExp[] = [
    /hugoVersion\s*[:=]\s*['"`]([^'"`]+)['"`]/i,
    /hugo_version\s*[:=]\s*['"`]([^'"`]+)['"`]/i,
    /HUGO_VERSION\s*[:=]\s*['"`]([^'"`]+)['"`]/,
    /["']hugo["']\s*:\s*['"`]([^'"`]+)['"`]/i,
    /version\s*[:=]\s*['"`](v?\d+\.\d+(?:\.\d+)?)['"`]/i,
    /hugo\s*[:=]\s*['"`](v?\d+\.\d+(?:\.\d+)?)['"`]/i
  ];

  for (const re of patterns) {
    const m = source.match(re);
    if (m?.[1]) return normalizeVersion(m[1]);
  }

  // Fallback: first semver-looking token near "hugo"
  const nearHugo = source.match(/hugo[^0-9]{0,40}(v?\d+\.\d+(?:\.\d+)?)/i);
  if (nearHugo?.[1]) return normalizeVersion(nearHugo[1]);

  return null;
}
