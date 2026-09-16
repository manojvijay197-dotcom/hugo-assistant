import type { ProjectFiles, ProjectKind, VirtualFile } from '../types';
import { parseHugoVersionFromTrago } from './versions';

function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

function dirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
}

function join(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '');
}

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '.hugo-assistant',
  '.svn',
  '.hg',
  'dist',
  'coverage'
]);

function isTragoPath(rel: string): boolean {
  const p = toPosix(rel);
  return p === 'trago.js' || /(^|\/)trago\.js$/i.test(p);
}

function modeMismatchError(kind: ProjectKind, tragoPresent: boolean): Error | null {
  if (kind === 'module' && tragoPresent) {
    return new Error(
      'Hugo modules (vendor) selected, but trago.js was found. This is a Regular Repo. Switch to “Regular Repo” or upload a module folder without trago.js.'
    );
  }
  if (kind === 'regular' && !tragoPresent) {
    return new Error(
      'Regular Repo selected, but no trago.js was found. This looks like a Hugo module. Switch to “Hugo modules (vendor)” or upload a project with website/trago.js.'
    );
  }
  return null;
}

function shouldReadText(rel: string, size: number): boolean {
  if (
    /\.(html?|md|markdown|ya?ml|toml|json|js|ts|css|scss|svg|txt|xml)$/i.test(rel) ||
    /(^|\/)(trago\.js|config\.(ya?ml|toml|yml)|hugo\.(ya?ml|toml|yml))$/i.test(rel)
  ) {
    return true;
  }
  return size > 0 && size < 512 * 1024;
}

async function ingestFile(
  files: Map<string, VirtualFile>,
  rel: string,
  file: File
): Promise<void> {
  if (!rel || rel.endsWith('.DS_Store')) return;
  if (rel.includes('/.git/') || rel.includes('/node_modules/')) return;

  let content = '';
  if (shouldReadText(rel, file.size)) {
    try {
      content = await file.text();
    } catch {
      content = '';
    }
  }

  files.set(rel, { path: rel, content, size: file.size });
}

type DirHandle = FileSystemDirectoryHandle & {
  entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
  getDirectoryHandle(name: string): Promise<FileSystemDirectoryHandle>;
  getFileHandle(name: string): Promise<FileSystemFileHandle>;
};

/** Instant checks for the usual Regular Repo layout — no file reads. */
async function probeCommonTragoPaths(root: FileSystemDirectoryHandle): Promise<string | null> {
  const dir = root as DirHandle;

  try {
    const website = await dir.getDirectoryHandle('website');
    await (website as DirHandle).getFileHandle('trago.js');
    return 'website/trago.js';
  } catch {
    /* not present */
  }

  try {
    await dir.getFileHandle('trago.js');
    return 'trago.js';
  } catch {
    /* not present */
  }

  return null;
}

/**
 * Name-only walk looking for trago.js. Stops at first hit.
 * Does not read file contents.
 */
async function findTragoPathByName(
  root: FileSystemDirectoryHandle,
  onProgress?: (msg: string) => void
): Promise<string | null> {
  const queue: Array<{ dir: FileSystemDirectoryHandle; prefix: string }> = [
    { dir: root, prefix: '' }
  ];
  let seen = 0;

  while (queue.length) {
    const { dir, prefix } = queue.shift()!;
    const iterable = dir as DirHandle;

    for await (const [name, handle] of iterable.entries()) {
      if (SKIP_DIRS.has(name)) continue;
      const rel = prefix ? `${prefix}/${name}` : name;
      seen += 1;
      if (seen % 400 === 0) onProgress?.(`Checking folder type… ${seen} entries`);

      if (handle.kind === 'directory') {
        queue.push({ dir: handle as FileSystemDirectoryHandle, prefix: rel });
        continue;
      }

      if (handle.kind === 'file' && /^trago\.js$/i.test(name)) {
        return toPosix(rel);
      }
    }
  }

  return null;
}

async function assertKindMatchesDirectory(
  root: FileSystemDirectoryHandle,
  kind: ProjectKind,
  onProgress?: (msg: string) => void
): Promise<void> {
  onProgress?.('Checking folder type…');

  const quick = await probeCommonTragoPaths(root);
  if (quick) {
    const err = modeMismatchError(kind, true);
    if (err) throw err;
    return; // regular + trago found at common path — good
  }

  // No common-path trago.js. For module mode that's usually enough (fast path).
  // For regular mode we must confirm it isn't elsewhere; for module we still
  // do a cheap name-only scan so nested trago.js can't sneak through.
  if (kind === 'module') {
    onProgress?.('Confirming no trago.js…');
    const nested = await findTragoPathByName(root, onProgress);
    const err = modeMismatchError(kind, Boolean(nested));
    if (err) throw err;
    return;
  }

  onProgress?.('Looking for trago.js…');
  const nested = await findTragoPathByName(root, onProgress);
  const err = modeMismatchError(kind, Boolean(nested));
  if (err) throw err;
}

function assertKindMatchesPaths(paths: string[], kind: ProjectKind): void {
  const tragoPresent = paths.some(isTragoPath);
  const err = modeMismatchError(kind, tragoPresent);
  if (err) throw err;
}

export async function loadProjectFromFileList(
  fileList: FileList,
  kind: ProjectKind
): Promise<ProjectFiles> {
  const entries = Array.from(fileList);
  const paths = entries.map((file) =>
    toPosix((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name)
  );

  // Fail before reading any file contents
  assertKindMatchesPaths(paths, kind);

  const files = new Map<string, VirtualFile>();
  await Promise.all(
    entries.map(async (file, i) => {
      await ingestFile(files, paths[i], file);
    })
  );

  return finalizeProject(files, kind);
}

export async function loadProjectFromDirectoryHandle(
  root: FileSystemDirectoryHandle,
  kind: ProjectKind,
  onProgress?: (scanned: number, current: string) => void
): Promise<ProjectFiles> {
  // Validate mode before reading file contents
  await assertKindMatchesDirectory(root, kind, (msg) => onProgress?.(0, msg));

  const files = new Map<string, VirtualFile>();
  let scanned = 0;

  async function walk(dir: FileSystemDirectoryHandle, prefix: string): Promise<void> {
    const iterable = dir as DirHandle;
    for await (const [name, handle] of iterable.entries()) {
      if (SKIP_DIRS.has(name)) continue;

      const rel = prefix ? `${prefix}/${name}` : name;

      if (handle.kind === 'directory') {
        await walk(handle as FileSystemDirectoryHandle, rel);
        continue;
      }

      if (handle.kind !== 'file') continue;

      // Safety: if module mode somehow still hits trago.js mid-walk, abort
      if (kind === 'module' && /^trago\.js$/i.test(name)) {
        throw modeMismatchError(kind, true)!;
      }

      const fileHandle = handle as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      await ingestFile(files, toPosix(rel), file);
      scanned += 1;
      if (scanned % 200 === 0) onProgress?.(scanned, rel);
    }
  }

  await walk(root, '');
  onProgress?.(scanned, 'done');
  return finalizeProject(files, kind);
}

export function hasTragoJs(files: Map<string, VirtualFile>): boolean {
  return [...files.keys()].some(isTragoPath);
}

function finalizeProject(files: Map<string, VirtualFile>, kind: ProjectKind): ProjectFiles {
  const tragoPresent = hasTragoJs(files);
  const mismatch = modeMismatchError(kind, tragoPresent);
  if (mismatch) throw mismatch;

  if (kind === 'regular') {
    const websiteRoot = detectWebsiteRoot(files);
    if (!websiteRoot) {
      throw new Error(
        'Could not find a website/ folder with trago.js in the selected project.'
      );
    }
    return { files, websiteRoot, kind };
  }

  const websiteRoot = detectModuleRoot(files);
  if (!websiteRoot) {
    throw new Error(
      'Could not find Hugo module folders. Upload a module root that contains layouts/, content/, config/hugo files, assets/, data/, and/or i18n/.'
    );
  }

  return { files, websiteRoot, kind };
}

export function detectWebsiteRoot(files: Map<string, VirtualFile>): string | null {
  const tragoPaths = [...files.keys()].filter((p) => /(^|\/)website\/trago\.js$/i.test(p));
  if (tragoPaths.length === 0) {
    const direct = [...files.keys()].find((p) => p === 'trago.js' || p.endsWith('/trago.js'));
    if (direct) return dirname(direct) || '.';
    return null;
  }

  tragoPaths.sort((a, b) => a.split('/').length - b.split('/').length);
  return dirname(tragoPaths[0]);
}

/** Shallowest folder that looks like a Hugo module/theme package. */
export function detectModuleRoot(files: Map<string, VirtualFile>): string | null {
  const roots = new Set<string>();

  for (const path of files.keys()) {
    const p = toPosix(path);
    const lower = p.toLowerCase();

    const folderMatch = lower.match(
      /(?:^|\/)(layouts|content|assets|data|i18n|static)(?:\/|$)/
    );
    if (folderMatch && folderMatch.index != null) {
      const before = p.slice(0, folderMatch.index);
      roots.add(before.replace(/\/$/, '') || '.');
      continue;
    }

    if (/(^|\/)(config|hugo)\.(ya?ml|yml|toml)$/i.test(p)) {
      const dir = dirname(p);
      roots.add(dir || '.');
    }
  }

  if (roots.size === 0) return null;

  return [...roots].sort((a, b) => {
    const da = a === '.' ? 0 : a.split('/').length;
    const db = b === '.' ? 0 : b.split('/').length;
    return da - db || a.localeCompare(b);
  })[0];
}

export function readTragoVersion(project: ProjectFiles): string {
  const tragoPath = join(project.websiteRoot === '.' ? '' : project.websiteRoot, 'trago.js');
  const candidates = [
    tragoPath,
    join(project.websiteRoot, 'trago.js'),
    'website/trago.js',
    'trago.js'
  ];

  for (const c of candidates) {
    const f = project.files.get(c) || project.files.get(toPosix(c));
    if (f?.content) {
      const version = parseHugoVersionFromTrago(f.content);
      if (version) return version;
    }
  }

  for (const [path, file] of project.files) {
    if (!path.endsWith('/trago.js') && path !== 'trago.js') continue;
    if (!path.includes(project.websiteRoot) && project.websiteRoot !== '.') continue;
    const version = parseHugoVersionFromTrago(file.content);
    if (version) return version;
  }

  throw new Error('Found website/trago.js but could not parse a Hugo version from it.');
}

export function listUnder(project: ProjectFiles, prefix: string): VirtualFile[] {
  const norm = toPosix(prefix).replace(/\/$/, '');
  // Empty / "." means the project scan root itself — include every file.
  if (!norm || norm === '.') {
    return [...project.files.values()];
  }

  const out: VirtualFile[] = [];
  for (const [path, file] of project.files) {
    if (path === norm || path.startsWith(norm + '/')) out.push(file);
  }
  return out;
}

export function websitePath(project: ProjectFiles, ...segments: string[]): string {
  const root =
    project.websiteRoot === '.' || project.websiteRoot === ''
      ? ''
      : project.websiteRoot;
  if (!segments.length) return root || '.';
  if (!root) return join(...segments);
  return join(root, ...segments);
}

export function fileExists(project: ProjectFiles, relativeFromWebsite: string): boolean {
  const full = websitePath(project, relativeFromWebsite);
  if (project.files.has(full)) return true;
  const lower = full.toLowerCase();
  for (const key of project.files.keys()) {
    if (key.toLowerCase() === lower) return true;
  }
  return false;
}

export function getWebsiteFile(
  project: ProjectFiles,
  relativeFromWebsite: string
): VirtualFile | undefined {
  const full = websitePath(project, relativeFromWebsite);
  return project.files.get(full);
}

export function toWebsiteRelative(project: ProjectFiles, absoluteRel: string): string {
  const root = project.websiteRoot === '.' ? '' : project.websiteRoot + '/';
  if (root && absoluteRel.startsWith(root)) return absoluteRel.slice(root.length);
  return absoluteRel;
}

export { join, toPosix, dirname };
