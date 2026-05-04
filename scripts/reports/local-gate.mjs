#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const skipSpaAuth = args.has('--skip-spa-auth');

const steps = [
  ['repo hygiene', ['pnpm', ['run', 'ci:check:repo-hygiene']]],
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
  });
}
