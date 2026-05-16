import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('design system compliance', () => {
  it('enforces Tailwind v4 wiring and token-only component CSS', () => {
    const output = execFileSync('node', ['scripts/reports/check-design-system.mjs'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    expect(output).toMatch(/Tailwind v4/);
  });
});
