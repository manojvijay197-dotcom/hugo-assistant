import { normalizeVersion, versionGte } from './DeprecationEngine';

/**
 * Canonical Hugo target versions (includes patch / sub versions).
 * Radios are rendered from this list only.
 */
export const HUGO_RELEASES: string[] = [
  '0.124.0',
  '0.124.1',
  '0.125.0',
  '0.125.1',
  '0.125.2',
  '0.125.3',
  '0.125.4',
  '0.126.0',
  '0.126.1',
  '0.127.0',
  '0.127.1',
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
  '0.159.1',
  '0.159.2',
  '0.160.0',
  '0.160.1',
  '0.161.0',
  '0.161.1',
  '0.162.0',
  '0.162.1',
  '0.163.0',
  '0.163.1',
  '0.163.2',
  '0.163.3',
  '0.164.0',
  '0.165.0',
  '0.166.0',
  '0.167.0'
];

export const LATEST_HUGO = HUGO_RELEASES[HUGO_RELEASES.length - 1];

/**
 * Regular Repo: read current from trago.js, then show this array from that
 * version through the last entry (inclusive).
 * If current is not an exact list entry, start at the first list version >= current.
 */
export function getTargetVersionOptions(currentVersion: string): string[] {
  const current = normalizeVersion(currentVersion);
  const exactIndex = HUGO_RELEASES.findIndex((v) => v === current);

  if (exactIndex >= 0) {
    return HUGO_RELEASES.slice(exactIndex);
  }

  // Current not in list (e.g. older than 0.124.0, or a missing patch)
  const startIndex = HUGO_RELEASES.findIndex((v) => versionGte(v, current));
  if (startIndex >= 0) {
    return HUGO_RELEASES.slice(startIndex);
  }

  // Current is newer than every listed release
  return [LATEST_HUGO];
}

/** Hugo modules (no trago.js): full list as selectable targets. */
export function getAllTargetVersionOptions(): string[] {
  return [...HUGO_RELEASES];
}

/**
 * Extract Hugo version from trago.js source text.
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

  const nearHugo = source.match(/hugo[^0-9]{0,40}(v?\d+\.\d+(?:\.\d+)?)/i);
  if (nearHugo?.[1]) return normalizeVersion(nearHugo[1]);

  return null;
}
