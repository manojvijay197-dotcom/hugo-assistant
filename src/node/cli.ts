import { runHugoAssistant } from './run';

function readFlag(argv: string[], name: string): string | undefined {
  const inline = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for --${name}`);
  }
  return value;
}

function help(): void {
  console.log(`Hugo Assistant — scan the current project for Hugo migration issues.

Usage:
  hugo-assistant [--target <version>] [--cwd <dir>]

The command uses the project it is started in. It does not ask for a folder.
  - trago.js or website/trago.js present → regular repo, current version is read from that file
  - trago.js absent → Hugo module

You are asked only for the target Hugo version, unless --target is passed.

Reports are written to <project>/.hugo-assistant/report.html, report.json, and report.csv.
`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    help();
    return;
  }

  const known = new Set(['--help', '-h', '--target', '--cwd']);
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const name = arg.split('=')[0];
    if (!known.has(name)) throw new Error(`Unknown argument ${arg}`);
  }

  await runHugoAssistant({
    cwd: readFlag(argv, 'cwd'),
    targetVersion: readFlag(argv, 'target')
  });
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('');
  console.error(message);
  process.exit(1);
});
