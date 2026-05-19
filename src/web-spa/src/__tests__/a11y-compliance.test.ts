import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('accessibility compliance', () => {
  it('enforces WCAG-oriented static rules for the SPA', () => {
    const output = execFileSync('node', ['scripts/reports/check-a11y.mjs'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    expect(output).toMatch(/Accessibility check passed/);
  });
});
