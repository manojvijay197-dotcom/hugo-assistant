import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';
import type { ProjectKind } from '../types';

const MODULE_MARKERS = ['layouts', 'content', 'assets', 'data', 'i18n', 'static'];

export interface DetectedProject {
  kind: ProjectKind;
  /** Directory the scan walks. For a regular repo this is the folder that owns trago.js. */
  projectRoot: string;
  /** Absolute path to trago.js when this is a regular repo. */
  tragoFile: string | null;
}

function tragoFileIn(dir: string): string | null {
  const atRoot = join(dir, 'trago.js');
  if (existsSync(atRoot)) return atRoot;
  const inWebsite = join(dir, 'website', 'trago.js');
  if (existsSync(inWebsite)) return inWebsite;
  return null;
}

function looksLikeModuleRoot(dir: string): boolean {
  if (tragoFileIn(dir)) return false;
  for (const name of MODULE_MARKERS) {
    if (existsSync(join(dir, name))) return true;
  }
  try {
    return readdirSync(dir).some((name) => /^(config|hugo)\.(ya?ml|yml|toml)$/i.test(name));
  } catch {
    return false;
  }
}

/**
 * Decide regular vs Hugo module from the project the command is already running in.
 * A folder is regular only when it contains trago.js (root or website/trago.js).
 * A folder that already looks like a module is not walked upward into a parent repo.
 */
export function detectRunningProject(startDir: string): DetectedProject {
  const start = resolve(startDir);
  const here = tragoFileIn(start);
  if (here) {
    return { kind: 'regular', projectRoot: start, tragoFile: here };
  }

  if (looksLikeModuleRoot(start)) {
    return { kind: 'module', projectRoot: start, tragoFile: null };
  }

  let dir = start;
  const filesystemRoot = parse(dir).root;
  while (dir !== filesystemRoot) {
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
    const found = tragoFileIn(dir);
    if (found) {
      return { kind: 'regular', projectRoot: dir, tragoFile: found };
    }
  }

  return { kind: 'module', projectRoot: start, tragoFile: null };
}
