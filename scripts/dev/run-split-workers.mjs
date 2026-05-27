#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = process.cwd();
const spaDistJs = resolve(repoRoot, '.spa-dist/app/spa.js');

if (!existsSync(spaDistJs)) {
  console.error('Missing .spa-dist — run: pnpm run generate:web:spa');
  process.exit(1);
}

function run(command, args, label) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code, signal) => {
    if (signal) {
      console.error(`[${label}] exited on signal ${signal}`);
      process.exit(1);
    }
    if (code && code !== 0) {
      process.exit(code);
    }
  });
  return child;
}

console.log('Starting split workers: MCP :3001, edge :8787');
console.log('Vite SPA dev should proxy to http://localhost:8787 (see vite.config.ts)\n');

const mcp = run(
  'pnpm',
  ['exec', 'wrangler', 'dev', '-c', 'wrangler.mcp.jsonc', '--port', '3001'],
  'mcp',
);
const edge = run(
  'pnpm',
  ['exec', 'wrangler', 'dev', '-c', 'wrangler.edge.jsonc', '--port', '8787'],
  'edge',
);

function shutdown() {
  mcp.kill('SIGINT');
  edge.kill('SIGINT');
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
