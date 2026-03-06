#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  composeWorkerDelegatedRouteHandlers,
  runWorkerRouteHandlers,
} from '../../src/server/worker-route-composition.js';

describe('composeWorkerDelegatedRouteHandlers', () => {
  it('preserves delegated route priority order', async () => {
    const callOrder: string[] = [];

    const response = await runWorkerRouteHandlers(
      composeWorkerDelegatedRouteHandlers({
        oauth: async () => {
          callOrder.push('oauth');
          return null;
        },
        aiUi: async () => {
          callOrder.push('aiUi');
          return null;
        },
        uiShell: async () => {
          callOrder.push('uiShell');
          return null;
        },
        mcpGateway: async () => {
          callOrder.push('mcpGateway');
          return new Response('mcp', { status: 200 });
        },
      }),
    );

    assert.deepEqual(callOrder, ['oauth', 'aiUi', 'uiShell', 'mcpGateway']);
    assert.ok(response);
    assert.equal(response.status, 200);
  });

  it('short-circuits after the first matched delegated route', async () => {
    const callOrder: string[] = [];

    const response = await runWorkerRouteHandlers(
      composeWorkerDelegatedRouteHandlers({
        oauth: async () => {
          callOrder.push('oauth');
          return new Response('auth', { status: 200 });
        },
        aiUi: async () => {
          callOrder.push('aiUi');
          return null;
        },
        uiShell: async () => {
          callOrder.push('uiShell');
          return null;
        },
        mcpGateway: async () => {
          callOrder.push('mcpGateway');
          return null;
        },
      }),
    );

    assert.deepEqual(callOrder, ['oauth']);
    assert.ok(response);
    assert.equal(await response.text(), 'auth');
  });
});
