import { chmodSync, mkdirSync } from 'node:fs';
import * as esbuild from 'esbuild';

mkdirSync('lib', { recursive: true });

const shared = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  legalComments: 'none',
  logLevel: 'info'
};

await esbuild.build({
  ...shared,
  entryPoints: ['src/node/index.ts'],
  outfile: 'lib/index.cjs'
});

await esbuild.build({
  ...shared,
  entryPoints: ['src/node/cli.ts'],
  outfile: 'lib/cli.cjs',
  banner: { js: '#!/usr/bin/env node' }
});

chmodSync('lib/cli.cjs', 0o755);
