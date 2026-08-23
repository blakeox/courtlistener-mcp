#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const wranglerBinary = join(
  process.cwd(),
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler',
);
const configs = [
  ['edge', 'wrangler.edge.jsonc'],
  ['mcp', 'wrangler.mcp.jsonc'],
  ['auth-limiter', 'wrangler.auth-limiter.jsonc'],
];

const profileDirectory = mkdtempSync(join(tmpdir(), 'courtlistener-worker-startup-'));

try {
  if (!existsSync(wranglerBinary)) {
    throw new Error('Repository-pinned Wrangler binary is missing. Run pnpm install first.');
  }

  for (const [label, config] of configs) {
    process.stdout.write(`\n==> Wrangler startup profile: ${label}\n`);
    execFileSync(
      wranglerBinary,
      [
        'check',
        'startup',
        '--config',
        config,
        `--args=-c ${config}`,
        '--outfile',
        join(profileDirectory, `${label}.cpuprofile`),
      ],
      { cwd: process.cwd(), stdio: 'inherit' },
    );
  }
} finally {
  rmSync(profileDirectory, { recursive: true, force: true });
}

console.log('\nCloudflare Worker startup profiles completed.');
