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

const generatedBaseline = Object.fromEntries(
  trackedGeneratedFiles.map((filePath) => [
    filePath,
    crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'),
  ]),
);

const args = new Set(process.argv.slice(2));
const skipSpaAuth = args.has('--skip-spa-auth');

const steps = [
  ['repo hygiene', ['pnpm', ['run', 'ci:check:repo-hygiene']]],
  ['design system', ['pnpm', ['run', 'ci:check:design-system']]],
  ['accessibility', ['pnpm', ['run', 'ci:check:a11y']]],
  ['accessibility vitest', ['pnpm', ['run', 'test:spa:a11y']]],
  ['typecheck', ['pnpm', ['run', 'typecheck']]],
  ['build', ['pnpm', ['run', 'build']]],
  ['generated files', ['pnpm', ['run', 'ci:check:generated']]],
  ['unit tests', ['pnpm', ['run', 'test:unit']]],
  ...(skipSpaAuth ? [] : [['spa auth tests', ['pnpm', ['run', 'test:spa:auth']]]]),
];

for (const [label, [command, args]] of steps) {
  process.stdout.write(`\n==> ${label}\n`);
  execFileSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env:
      label === 'generated files'
        ? { ...process.env, GENERATED_FILES_BASELINE: JSON.stringify(generatedBaseline) }
        : process.env,
  });
}
