import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { detectModuleRoot, detectWebsiteRoot, isMigrationSourcePath } from '../core/project';
import type { ProjectFiles, ProjectKind, VirtualFile } from '../types';

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '.hugo-assistant',
  '.svn',
  '.hg',
  'dist',
  'coverage',
  'build',
  'public',
  'resources',
  '.cache',
  'tp_checkout',
  'website-vendor'
]);

function shouldReadText(rel: string, size: number): boolean {
  if (
    /\.(html?|md|markdown|ya?ml|toml|json|js|ts|css|scss|svg|txt|xml)$/i.test(rel) ||
    /(^|\/)(trago\.js|config\.(ya?ml|toml|yml)|hugo\.(ya?ml|toml|yml))$/i.test(rel)
  ) {
    return true;
  }
  return size > 0 && size < 512 * 1024;
}

function walk(
  dir: string,
  base: string,
  kind: ProjectKind,
  files: Map<string, VirtualFile>
): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }

  for (const name of names) {
    if (name === '.DS_Store') continue;
    if (SKIP_DIRS.has(name) || SKIP_DIRS.has(name.toLowerCase())) continue;
    if (kind === 'regular' && (name === 'themes' || name === '_vendor')) continue;

    const abs = join(dir, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }

    if (st.isDirectory()) {
      walk(abs, base, kind, files);
      continue;
    }
    if (!st.isFile()) continue;

    const rel = relative(base, abs).replace(/\\/g, '/');
    if (!isMigrationSourcePath(rel)) continue;

    let content = '';
    if (shouldReadText(rel, st.size)) {
      try {
        content = readFileSync(abs, 'utf8');
      } catch {
        content = '';
      }
    }
    files.set(rel, { path: rel, content, size: st.size });
  }
}

export function loadProjectFromDisk(projectRoot: string, kind: ProjectKind): ProjectFiles {
  const files = new Map<string, VirtualFile>();
  walk(projectRoot, projectRoot, kind, files);

  if (kind === 'regular') {
    const websiteRoot = detectWebsiteRoot(files);
    if (!websiteRoot) {
      throw new Error(
        `trago.js was found in ${projectRoot}, but its Hugo version file could not be loaded.`
      );
    }
    return { files, websiteRoot, kind };
  }

  const websiteRoot = detectModuleRoot(files);
  if (!websiteRoot) {
    throw new Error(
      `No trago.js in ${projectRoot}, and no Hugo module folders were found (layouts, content, assets, data, i18n, or a config file).`
    );
  }
  return { files, websiteRoot, kind };
}
