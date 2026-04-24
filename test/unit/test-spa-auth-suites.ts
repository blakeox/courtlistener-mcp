import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildSpaAuthPlaywrightCommand,
  buildSpaAuthVitestCommand,
  spaAuthPlaywrightSpecs,
  spaAuthVitestFiles,
} from '../../scripts/testing/spa-auth-suites.mjs';

describe('spa-auth-suites', () => {
  it('keeps the Vitest auth suite file list stable and duplicate-free', () => {
    assert.deepEqual(spaAuthVitestFiles, [
      'src/web-spa/src/__tests__/api.test.ts',
      'src/web-spa/src/__tests__/auth-provider.test.tsx',
      'src/web-spa/src/__tests__/auth-routing.test.tsx',
      'src/web-spa/src/__tests__/contexts.test.tsx',
      'src/web-spa/src/__tests__/hooks2.test.ts',
      'src/web-spa/src/__tests__/lib.test.ts',
      'src/web-spa/src/__tests__/pages.test.tsx',
      'src/web-spa/src/__tests__/mcp-runtime-readiness.test.ts',
      'src/web-spa/src/__tests__/shell.test.tsx',
      'src/web-spa/src/__tests__/shell-heartbeat.integration.test.tsx',
    ]);
    assert.equal(new Set(spaAuthVitestFiles).size, spaAuthVitestFiles.length);
  });

  it('keeps the Playwright auth suite spec list stable and duplicate-free', () => {
    assert.deepEqual(spaAuthPlaywrightSpecs, [
      'src/web-spa/e2e/operator-console.spec.ts',
      'src/web-spa/e2e/auth-routing.spec.ts',
      'src/web-spa/e2e/real-auth-flow.spec.ts',
      'src/web-spa/e2e/session-recovery.spec.ts',
    ]);
    assert.equal(new Set(spaAuthPlaywrightSpecs).size, spaAuthPlaywrightSpecs.length);
  });

  it('builds the Vitest command from the shared suite manifest', () => {
    assert.deepEqual(buildSpaAuthVitestCommand(), [
      'pnpm',
      'exec',
      'vitest',
      'run',
      '--config',
      'src/web-spa/vitest.config.ts',
      ...spaAuthVitestFiles,
    ]);
  });

  it('builds the Playwright command from the shared suite manifest', () => {
    assert.deepEqual(buildSpaAuthPlaywrightCommand(), [
      'pnpm',
      'exec',
      'playwright',
      'test',
      ...spaAuthPlaywrightSpecs,
    ]);
  });
});
