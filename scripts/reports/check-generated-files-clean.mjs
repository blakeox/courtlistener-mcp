#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';

const trackedGeneratedFiles = [
  'manifest.json',
  'src/server/generated/tool-input-schemas.ts',
  'src/server/generated/tool-output-schemas.ts',
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

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

let baseline;
if (process.env.GENERATED_FILES_BASELINE) {
  try {
    baseline = JSON.parse(process.env.GENERATED_FILES_BASELINE);
  } catch (error) {
    process.stderr.write(`Invalid GENERATED_FILES_BASELINE: ${error.message}\n`);
    process.exit(1);
  }
}

const dirtyGenerated = baseline
  ? trackedGeneratedFiles.filter((filePath) => hashFile(filePath) !== baseline[filePath])
  : gitLines(['status', '--short', '--', ...trackedGeneratedFiles])
      .map((line) => line.replace(/^[ MADRCU?!]{1,2}\s+/, '').trim())
      .filter(Boolean);

if (dirtyGenerated.length === 0) {
  process.stdout.write('Generated file check passed.\n');
  process.exit(0);
}

process.stderr.write(
  baseline
    ? 'Generated files changed while the local gate ran; fix generator drift before proceeding:\n'
    : 'Generated tracked files are dirty. Commit regenerated outputs or fix the generator drift:\n',
);
for (const path of dirtyGenerated) {
  process.stderr.write(`- ${path}\n`);
}
process.exit(1);
