#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runWorkerRouteHandlers } from '../../src/server/worker-route-orchestration.js';

describe('runWorkerRouteHandlers', () => {
  it('returns first matching response in declared order', async () => {
    const callOrder: string[] = [];
    const response = await runWorkerRouteHandlers([
      async () => {
        callOrder.push('first');
        return null;
      },
      async () => {
        callOrder.push('second');
        return new Response('matched', { status: 202 });
      },
      async () => {
        callOrder.push('third');
        return new Response('should-not-run');
      },
    ]);

    assert.deepEqual(callOrder, ['first', 'second']);
    assert.ok(response);
    assert.equal(response.status, 202);
    assert.equal(await response.text(), 'matched');
  });

  it('returns null when no routes match', async () => {
    const response = await runWorkerRouteHandlers([async () => null, async () => null]);
    assert.equal(response, null);
  });
});
