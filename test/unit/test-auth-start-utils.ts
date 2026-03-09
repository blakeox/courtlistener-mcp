#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

async function loadAuthStartUtils() {
  return import('../../apps/clerk-portal/lib/auth-start.ts');
}

describe('auth-start utils', () => {
  it('normalizes empty values to the worker root path and marks them implicit', async () => {
    const { resolveAuthStartReturnTarget } = await loadAuthStartUtils();
    assert.deepEqual(resolveAuthStartReturnTarget(null), { value: '/', isExplicit: false });
    assert.deepEqual(resolveAuthStartReturnTarget('   '), { value: '/', isExplicit: false });
  });

  it('preserves relative return targets', async () => {
    const { resolveAuthStartReturnTarget } = await loadAuthStartUtils();
    assert.deepEqual(resolveAuthStartReturnTarget('/authorize?state=abc'), {
      value: 'https://courtlistenermcp.blakeoxford.com/authorize?state=abc',
      isExplicit: true,
    });
  });

  it('preserves trusted workers.dev authorize targets for direct OAuth completion', async () => {
    const {
      resolveAuthStartReturnTarget,
      isDirectOauthReturnTarget,
      resolveDirectOauthWorkerOrigin,
    } = await loadAuthStartUtils();
    const resolved = resolveAuthStartReturnTarget(
      'https://courtlistener-mcp.blakeoxford.workers.dev/authorize?response_type=code&state=abc',
    );
    assert.deepEqual(resolved, {
      value: 'https://courtlistener-mcp.blakeoxford.workers.dev/authorize?response_type=code&state=abc',
      isExplicit: true,
    });
    assert.equal(isDirectOauthReturnTarget(resolved.value), true);
    assert.equal(
      resolveDirectOauthWorkerOrigin(resolved.value),
      'https://courtlistener-mcp.blakeoxford.workers.dev',
    );
  });

  it('drops invalid absolute return targets while preserving explicit intent', async () => {
    const { resolveAuthStartReturnTarget } = await loadAuthStartUtils();
    assert.deepEqual(resolveAuthStartReturnTarget('not-a-valid-url'), { value: '/', isExplicit: true });
  });
});
