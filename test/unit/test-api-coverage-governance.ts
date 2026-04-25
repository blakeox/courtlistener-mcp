#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { getEnhancedToolDefinitions } from '../../src/tool-definitions.js';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const testRoot = path.join(repoRoot, 'test');

const handlerAliasOverrides: Record<string, string[]> = {
  get_enhanced_recap_data: ['GetEnhancedRECAPDataHandler', 'GetEnhancedRecapDataHandler'],
};

function toPascalCase(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('');
}

function expectedCoverageTokens(toolName: string): string[] {
  return [toolName, `${toPascalCase(toolName)}Handler`, ...(handlerAliasOverrides[toolName] ?? [])];
}

function collectTestFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'runners' || entry.name === 'utils') {
      continue;
    }

    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(absolutePath));
      continue;
    }

    if (/\.(ts|js)$/.test(entry.name)) {
      files.push(absolutePath);
    }
  }

  return files;
}

describe('CourtListener tool coverage governance', () => {
  it('keeps every exposed tool covered by a non-runner automated test', () => {
    const testFiles = collectTestFiles(testRoot);
    const coverageByTool = new Map<string, string[]>();

    for (const tool of getEnhancedToolDefinitions()) {
      const tokens = expectedCoverageTokens(tool.name);
      const matchingFiles = testFiles
        .filter((file) => {
          const source = fs.readFileSync(file, 'utf8');
          return tokens.some((token) => source.includes(token));
        })
        .map((file) => path.relative(repoRoot, file));

      coverageByTool.set(tool.name, matchingFiles);
    }

    const missing = [...coverageByTool.entries()]
      .filter(([, files]) => files.length === 0)
      .map(([toolName]) => toolName)
      .sort();

    assert.deepEqual(
      missing,
      [],
      `Missing direct automated coverage for exposed tools: ${missing.join(', ')}`,
    );
  });
});
