#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const repositoryRoot = process.cwd();
const wranglerBinary = join(
  repositoryRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler',
);
const checks = [
  ['wrangler.edge.jsonc', 'GeneratedEdgeEnv', 'src/worker-env/edge-env.d.ts'],
  ['wrangler.mcp.jsonc', 'GeneratedMcpEnv', 'src/worker-env/mcp-env.d.ts'],
  [
    'wrangler.auth-limiter.jsonc',
    'GeneratedAuthLimiterEnv',
    'src/worker-env/auth-limiter-env.d.ts',
  ],
];

function readJsonc(path) {
  return JSON.parse(
    readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/.*$/gm, '$1')
      .replace(/,\s*([}\]])/g, '$1'),
  );
}

try {
  if (!existsSync(wranglerBinary)) {
    throw new Error('Repository-pinned Wrangler binary is missing. Run pnpm install first.');
  }

  const accountIds = checks.map(([config]) => readJsonc(config).account_id);
  if (new Set(accountIds).size !== 1 || accountIds.some((id) => typeof id !== 'string')) {
    throw new Error('All deployed Wrangler configs must declare the same explicit account_id.');
  }

  for (const [config, envInterface, outputPath] of checks) {
    execFileSync(
      wranglerBinary,
      [
        'types',
        outputPath,
        '--config',
        config,
        '--env-interface',
        envInterface,
        '--include-runtime=false',
        '--check',
      ],
      { cwd: repositoryRoot, stdio: 'pipe', encoding: 'utf8' },
    );
    process.stdout.write(`Wrangler bindings are current: ${config}\n`);
  }
  process.stdout.write(
    `Cloudflare generated binding and account-targeting checks passed (${accountIds[0]}).\n`,
  );
} catch (error) {
  const details = error?.stdout?.toString?.() || error?.stderr?.toString?.() || error.message;
  process.stderr.write(`${details}\n`);
  process.exitCode = 1;
}
