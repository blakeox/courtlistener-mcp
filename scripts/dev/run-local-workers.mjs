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
console.log('Edge is exposed on :8787; the MCP Worker is internal to the local binding.');
console.log('Vite SPA dev should proxy to http://localhost:8787 (see vite.config.ts)\n');

const worker = spawn(
  wranglerBinary,
  ['dev', '-c', 'wrangler.edge.jsonc', '-c', 'wrangler.mcp.jsonc', '--port', '8787'],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  },
);

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
