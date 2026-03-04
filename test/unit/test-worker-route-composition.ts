#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { composeWorkerDelegatedRouteHandlers } from '../../src/server/worker-route-composition.js';
import { runWorkerRouteHandlers } from '../../src/server/worker-route-orchestration.js';

describe('composeWorkerDelegatedRouteHandlers', () => {
  it('preserves delegated route priority order', async () => {
    const callOrder: string[] = [];

    const response = await runWorkerRouteHandlers(
      composeWorkerDelegatedRouteHandlers({
        oauthConsent: async () => {
          callOrder.push('oauthConsent');
          return null;
        },
        auth: async () => {
          callOrder.push('auth');
          return null;
        },
        uiKeys: async () => {
          callOrder.push('uiKeys');
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

    assert.deepEqual(callOrder, ['oauthConsent', 'auth', 'uiKeys', 'aiUi', 'uiShell', 'mcpGateway']);
    assert.ok(response);
    assert.equal(response.status, 200);
  });

  it('short-circuits after the first matched delegated route', async () => {
    const callOrder: string[] = [];

    const response = await runWorkerRouteHandlers(
      composeWorkerDelegatedRouteHandlers({
        oauthConsent: async () => {
          callOrder.push('oauthConsent');
          return null;
        },
        auth: async () => {
          callOrder.push('auth');
          return new Response('auth', { status: 200 });
        },
        uiKeys: async () => {
          callOrder.push('uiKeys');
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
          return null;
        },
      }),
    );

    assert.deepEqual(callOrder, ['oauthConsent', 'auth']);
    assert.ok(response);
    assert.equal(await response.text(), 'auth');
  });
});
