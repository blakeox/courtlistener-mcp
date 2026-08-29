#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = process.cwd();
const spaDistJs = resolve(repoRoot, '.spa-dist/app/spa.js');
const wranglerBinary = resolve(
  repoRoot,
  'node_modules/.bin',
  process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler',
);

if (!existsSync(spaDistJs)) {
  console.error('Missing .spa-dist — run: pnpm run generate:web:spa');
  process.exit(1);
}

if (!existsSync(wranglerBinary)) {
  console.error('Missing repository-pinned Wrangler — run: pnpm install');
  process.exit(1);
}

console.log('Starting local Edge + MCP Workers with a connected MCP_SERVICE binding.');

const useTestConfigs = process.env.LOCAL_WORKERS_CONFIG === 'test';
const edgeConfig = useTestConfigs ? 'wrangler.edge.test.jsonc' : 'wrangler.edge.jsonc';
const mcpConfig = useTestConfigs ? 'wrangler.mcp.test.jsonc' : 'wrangler.mcp.jsonc';
const port = process.env.LOCAL_WORKERS_PORT ?? '8787';
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
  console.error(`Invalid LOCAL_WORKERS_PORT: ${port}`);
  process.exit(1);
}
if (useTestConfigs) {
  console.log('Using offline test Worker configs (no remote Cloudflare bindings).\n');
}

console.log(`Starting local Workers on 127.0.0.1:${port}.`);
const worker = spawn(wranglerBinary, ['dev', '-c', edgeConfig, '-c', mcpConfig, '--port', port], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: process.env,
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  worker.kill(signal);
}

worker.on('exit', (code, signal) => {
  if (shuttingDown) {
    process.exit(code ?? 0);
  }
  if (signal) {
    console.error(`Local Workers exited on signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 0);
});

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
