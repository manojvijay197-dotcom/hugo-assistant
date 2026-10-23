import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

export async function promptTargetVersion(versions: string[]): Promise<string> {
  if (versions.length === 1) return versions[0];

  console.log('');
  console.log('Select the Hugo version to update to:');
  versions.forEach((version, index) => {
    const n = String(index + 1).padStart(2, ' ');
    console.log(`  ${n}. ${version}`);
  });
  console.log('');

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    while (true) {
      const answer = (await rl.question('Enter the number or version: ')).trim();
      if (!answer) {
        console.log('Choose a version from the list.');
        continue;
      }

      const asIndex = Number(answer);
      if (Number.isInteger(asIndex) && asIndex >= 1 && asIndex <= versions.length) {
        return versions[asIndex - 1];
      }

      const normalized = answer.replace(/^v/i, '');
      const match = versions.find((version) => version === answer || version === normalized);
      if (match) return match;

      console.log(`"${answer}" is not in the list. Enter a number from 1 to ${versions.length}, or a version such as ${versions[0]}.`);
    }
  } finally {
    rl.close();
  }
}
