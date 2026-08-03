#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

import { SubscriptionManager } from '../../src/server/subscription-manager.js';

describe('SubscriptionManager', () => {
  it('tracks subscriptions per session and emits resource update notifications', async () => {
    const manager = new SubscriptionManager();
    const notifications: string[] = [];

    const server = {
      sendResourceUpdated: async ({ uri }: { uri: string }) => {
        notifications.push(uri);
      },
    } as unknown as Server;

    manager.bindServer(server);
    manager.subscribe('courtlistener://status/api', 'session-a');
    manager.subscribe('courtlistener://status/api', 'session-b');
    manager.subscribe('courtlistener://opinion/1', 'session-a');

    await manager.notifyResourceUpdated('courtlistener://status/api');
    assert.deepEqual(notifications, ['courtlistener://status/api']);

    manager.unsubscribe('courtlistener://status/api', 'session-a');
    manager.removeSession('session-b');

    await manager.notifyResourceUpdated('courtlistener://status/api');
    assert.deepEqual(notifications, ['courtlistener://status/api']);

    manager.removeSession('session-a');
    await manager.notifyResourceUpdated('courtlistener://status/api');
    assert.deepEqual(notifications, ['courtlistener://status/api']);
  });

  it('schedules proactive refresh notifications while subscriptions remain active', async () => {
    const manager = new SubscriptionManager();
    const notifications: string[] = [];

    try {
      manager.setRefreshTtlResolver((uri) =>
        uri === 'courtlistener://api/status' ? 25 : undefined,
      );
      manager.bindServer({
        sendResourceUpdated: async ({ uri }: { uri: string }) => {
          notifications.push(uri);
        },
      } as unknown as Server);

      manager.subscribe('courtlistener://api/status', 'session-a');
      await new Promise((resolve) => setTimeout(resolve, 40));
      assert.ok(notifications.includes('courtlistener://api/status'));

      manager.unsubscribe('courtlistener://api/status', 'session-a');
      const countAfterUnsub = notifications.length;
      await new Promise((resolve) => setTimeout(resolve, 40));
      assert.equal(notifications.length, countAfterUnsub);
    } finally {
      manager.destroy();
    }
  });
});
