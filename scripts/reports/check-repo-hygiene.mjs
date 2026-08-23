#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';

const args = new Set(process.argv.slice(2));
const stagedOnly = args.has('--staged');

const duplicateNamePattern = /(?:^|\/)[^/]* [2-9](?:\.[^/]*)?$/;
const blockedArtifacts = [
  /^\.playwright-mcp(?:\/|$)/,
  /^\.spa-dist(?:\/|$)/,
  /^\.copilot-home-.*\.png$/,
];
const ignoredPrefixes = ['.git/', 'node_modules/', 'coverage/', 'dist/', 'test-results/'];

function gitLines(commandArgs) {
  try {
    return execFileSync('git', commandArgs, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    const stderr =
      error && typeof error === 'object' && 'stderr' in error ? String(error.stderr) : '';
    throw new Error(stderr || `git ${commandArgs.join(' ')} failed`);
  }
}

function normalizeStatusPath(line) {
  const payload = line.length > 3 ? line.slice(3).trim() : line.trim();
  const renameParts = payload.split(' -> ');
  const path = renameParts[renameParts.length - 1];
  if (path.startsWith('"') && path.endsWith('"')) {
    try {
      return JSON.parse(path);
    } catch {
      return path;
    }
  }
  return path;
}

function shouldIgnore(path) {
  return ignoredPrefixes.some((prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix));
}

function isUnmaterializedCloudPlaceholder(path) {
  try {
    const stat = statSync(path);
    // Cloud-synced macOS placeholders report their logical size but have no
    // allocated blocks. They cannot be read or committed until materialized.
    return stat.size > 0 && stat.blocks === 0;
  } catch {
    return false;
  }
}

function collectPaths() {
  if (stagedOnly) {
    return gitLines(['diff', '--cached', '--name-only', '--diff-filter=ACMR']).filter(
      (path) => !shouldIgnore(path),
    );
  }

  const tracked = gitLines(['ls-files']);
  const others = gitLines(['status', '--short', '--untracked-files=all'])
    .map(normalizeStatusPath)
    .filter((path) => !isUnmaterializedCloudPlaceholder(path));
  return [...new Set([...tracked, ...others])].filter((path) => !shouldIgnore(path));
}

const paths = collectPaths();
const duplicatePaths = paths.filter((path) => duplicateNamePattern.test(path));
const blockedPaths = paths.filter((path) => blockedArtifacts.some((pattern) => pattern.test(path)));

if (duplicatePaths.length === 0 && blockedPaths.length === 0) {
  process.stdout.write('Repo hygiene check passed.\n');
  process.exit(0);
}

if (duplicatePaths.length > 0) {
  process.stderr.write('Found numbered duplicate paths that should not be committed:\n');
  for (const path of duplicatePaths) {
    process.stderr.write(`- ${path}\n`);
  }
}

if (blockedPaths.length > 0) {
  process.stderr.write('Found local artifact paths that should stay out of the repo:\n');
  for (const path of blockedPaths) {
    process.stderr.write(`- ${path}\n`);
  }
}

process.exit(1);
