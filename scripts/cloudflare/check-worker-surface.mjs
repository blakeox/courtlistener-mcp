#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const configs = [
  ['edge', 'wrangler.edge.jsonc'],
  ['mcp', 'wrangler.mcp.jsonc'],
  ['auth-limiter', 'wrangler.auth-limiter.jsonc'],
];

const forbiddenPatterns = [
  ['process.env', /process\.env/],
  ['node:buffer', /node:buffer/],
  ['node:crypto', /node:crypto/],
  ['node:fs', /node:fs/],
  ['node:http', /node:http/],
  ['node:os', /node:os/],
  ['node:path', /node:path/],
  ['node:stream', /node:stream/],
];

const allowedNodeImports = new Set(['node:async_hooks']);

function resolveWranglerBinary(repoRoot) {
  const binaryName = process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler';
  const binary = resolve(repoRoot, 'node_modules', '.bin', binaryName);
  if (!existsSync(binary)) {
    throw new Error('Repository-pinned Wrangler binary is missing. Run pnpm install first.');
  }
  return binary;
}

function findBundle(directory) {
  const bundle = readdirSync(directory).find((file) => /^worker(?:-[^/]+)?\.js$/.test(file));
  if (!bundle) throw new Error(`Wrangler produced no Worker bundle in ${directory}`);
  return join(directory, bundle);
}

function checkBundle(label, config, repoRoot, wranglerBinary) {
  const outputDirectory = mkdtempSync(join(tmpdir(), `courtlistener-${label}-surface-`));
  try {
    execFileSync(
      wranglerBinary,
      ['deploy', '--dry-run', '--outdir', outputDirectory, '--config', config],
      { cwd: repoRoot, stdio: ['ignore', 'pipe', 'inherit'] },
    );

    const source = readFileSync(findBundle(outputDirectory), 'utf8');
    const violations = forbiddenPatterns
      .filter(([, pattern]) => pattern.test(source))
      .map(([name]) => name);

    const nodeImports = [...source.matchAll(/node:[A-Za-z0-9_/-]+/g)].map((match) => match[0]);
    for (const nodeImport of nodeImports) {
      if (!allowedNodeImports.has(nodeImport)) violations.push(nodeImport);
    }

    if (violations.length > 0) {
      throw new Error(
        `${label} Worker contains forbidden runtime surface: ${[...new Set(violations)].join(', ')}`,
      );
    }
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
}

const repoRoot = process.cwd();
const wranglerBinary = resolveWranglerBinary(repoRoot);
for (const [label, config] of configs) {
  process.stdout.write(`Checking Worker platform surface: ${label}\n`);
  checkBundle(label, config, repoRoot, wranglerBinary);
}
console.log('Cloudflare Worker platform surface checks passed.');
