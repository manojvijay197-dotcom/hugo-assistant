import type { Issue, ProjectFiles } from '../types';
import { fileExists, listUnder, toWebsiteRelative, websitePath } from './project';

const IMG_EXT = /\.(png|jpe?g|webp|gif|svg|bmp|tiff?|ico|avif)$/i;

/**
 * Resolve an image URL against Hugo static/ and assets/ trees
 * (plus vendor module static/assets when provided).
 */
function imageExists(
  project: ProjectFiles,
  webPath: string,
  vendorModulePrefix?: string
): boolean {
  const cleaned = webPath.split('#')[0].split('?')[0].replace(/\\/g, '/');
  const rel = cleaned.replace(/^\//, '');
  if (!rel) return false;

  const candidates = [
    `static/${rel}`,
    `assets/${rel}`,
    rel,
    // sometimes authors already prefix static/ or assets/ in the src
    rel.startsWith('static/') ? rel : '',
    rel.startsWith('assets/') ? rel : ''
  ].filter(Boolean);

  for (const c of candidates) {
    if (fileExists(project, c)) return true;
  }

  if (vendorModulePrefix) {
    const vendorCandidates = [
      `${vendorModulePrefix}/static/${rel}`,
      `${vendorModulePrefix}/assets/${rel}`,
      `${vendorModulePrefix}/${rel}`
    ];
    for (const full of vendorCandidates) {
      if (project.files.has(full)) return true;
      const lower = full.toLowerCase();
      for (const key of project.files.keys()) {
        if (key.toLowerCase() === lower) return true;
      }
    }
  }

  return false;
}

function collectImageRefs(content: string): string[] {
  const refs: string[] = [];
  const cleaned = content.replace(/\{\{[\s\S]*?\}\}/g, ' ');

  const md = /!\[[^\]]*\]\(([^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = md.exec(cleaned)) !== null) refs.push(m[1].trim());

  const html = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  while ((m = html.exec(cleaned)) !== null) refs.push(m[1].trim());

  const css = /url\(\s*['"]?([^'")\s]+)['"]?\s*\)/gi;
  while ((m = css.exec(cleaned)) !== null) {
    if (IMG_EXT.test(m[1])) refs.push(m[1].trim());
  }

  return refs;
}

export function scanImages(
  project: ProjectFiles,
  scope: 'website' | 'vendor',
  vendorModule?: string,
  modulePrefix?: string
): Issue[] {
  const issues: Issue[] = [];

  const checkFile = (displayPath: string, content: string, fileScope: Issue['scope'], mod?: string) => {
    for (const raw of collectImageRefs(content)) {
      if (
        !raw ||
        raw.startsWith('http://') ||
        raw.startsWith('https://') ||
        raw.startsWith('data:') ||
        raw.startsWith('#') ||
        raw.includes('{{')
      ) {
        continue;
      }

      if (!IMG_EXT.test(raw) && !raw.startsWith('/')) continue;

      const webPath = raw.startsWith('/') ? raw : `/${raw}`;
      if (!imageExists(project, webPath, modulePrefix)) {
        issues.push({
          id: 'broken-image',
          title: 'Broken Image Reference',
          description: `Image "${raw}" is referenced but was not found under static/ or assets/.`,
          severity: 'error',
          category: 'image',
          file: displayPath,
          replacement: 'Add the file under static/ or assets/, or update the image path.',
          documentation: 'https://gohugo.io/content-management/static-files/',
          scope: fileScope,
          vendorModule: mod
        });
      }
    }
  };

  if (scope === 'website') {
    for (const root of ['content', 'layouts', 'layout', 'data', 'i18n', 'assets', 'static']) {
      for (const file of listUnder(project, websitePath(project, root))) {
        const rel = toWebsiteRelative(project, file.path);
        if (!file.content) continue;
        if (!/\.(html?|md|markdown|css|scss|svg)$/i.test(rel)) continue;
        checkFile(rel, file.content, 'website');
      }
    }
    return issues;
  }

  const prefix = modulePrefix || '';
  for (const file of listUnder(project, prefix)) {
    const relInside = file.path.slice(prefix.length).replace(/^\//, '');
    if (!/^(layouts|layout|assets|static|data|i18n)\//.test(relInside)) continue;
    if (!file.content) continue;
    if (!/\.(html?|md|markdown|css|scss|svg)$/i.test(relInside)) continue;
    checkFile(toWebsiteRelative(project, file.path), file.content, 'vendor', vendorModule);
  }

  return issues;
}
