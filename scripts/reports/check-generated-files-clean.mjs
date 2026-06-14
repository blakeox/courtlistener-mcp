#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const trackedGeneratedFiles = [
  'manifest.json',
  'src/server/generated/tool-input-schemas.ts',
  'src/server/hosted-auth-page-styles.generated.ts',
];

function gitLines(commandArgs) {
  return execFileSync('git', commandArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

const dirtyGenerated = gitLines(['status', '--short', '--', ...trackedGeneratedFiles])
  .map((line) => line.replace(/^[ MADRCU?!]{1,2}\s+/, '').trim())
  .filter(Boolean);

if (dirtyGenerated.length === 0) {
  process.stdout.write('Generated file check passed.\n');
  process.exit(0);
}

process.stderr.write(
  'Generated tracked files changed after the gate ran. Commit regenerated outputs or fix the generator drift:\n',
);
for (const path of dirtyGenerated) {
  process.stderr.write(`- ${path}\n`);
}
process.exit(1);
