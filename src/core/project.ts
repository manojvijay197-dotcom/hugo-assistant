import type { ProjectFiles, VirtualFile } from '../types';
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

/**
 * Build a virtual file map from a browser FileList (webkitdirectory upload).
 * Prefer loadProjectFromDirectoryHandle — it avoids Chrome's bulk "Upload N files?" alert.
 */
export async function loadProjectFromFileList(fileList: FileList): Promise<ProjectFiles> {
  const files = new Map<string, VirtualFile>();

  const entries = Array.from(fileList);
  await Promise.all(entries.map(async (file) => {
    const rel = toPosix(
      (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    );
    await ingestFile(files, rel, file);
  }));

  return finalizeProject(files);
}

type DirHandle = FileSystemDirectoryHandle & {
  entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
};

/**
 * Read a folder via the File System Access API (no Chrome "Upload N files?" trust dialog).
 */
export async function loadProjectFromDirectoryHandle(
  root: FileSystemDirectoryHandle,
  onProgress?: (scanned: number, current: string) => void
): Promise<ProjectFiles> {
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

      const fileHandle = handle as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      await ingestFile(files, toPosix(rel), file);
      scanned += 1;
      if (scanned % 200 === 0) onProgress?.(scanned, rel);
    }
  }

  await walk(root, '');
  onProgress?.(scanned, 'done');
  return finalizeProject(files);
}

function finalizeProject(files: Map<string, VirtualFile>): ProjectFiles {
  const websiteRoot = detectWebsiteRoot(files);
  if (!websiteRoot) {
    throw new Error(
      'Could not find a website/ folder with trago.js in the selected project.'
    );
  }
  return { files, websiteRoot };
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
  const out: VirtualFile[] = [];
  for (const [path, file] of project.files) {
    if (path === norm || path.startsWith(norm + '/')) out.push(file);
  }
  return out;
}

export function websitePath(project: ProjectFiles, ...segments: string[]): string {
  if (project.websiteRoot === '.' || project.websiteRoot === '') {
    return join(...segments);
  }
  return join(project.websiteRoot, ...segments);
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
