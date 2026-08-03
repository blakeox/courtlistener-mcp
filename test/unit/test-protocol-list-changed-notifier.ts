#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';

import { buildServerCapabilities } from '../../src/infrastructure/protocol-constants.js';
import { ProtocolListChangedNotifier } from '../../src/server/protocol-list-changed-notifier.js';

describe('ProtocolListChangedNotifier', () => {
  it('does not emit notifications when disabled', async () => {
    const notifier = new ProtocolListChangedNotifier(false);
    const server = new Server(
      { name: 'list-changed-test', version: '1.0.0' },
      { capabilities: buildServerCapabilities() },
    );
    notifier.bindServer(server);

    await notifier.notifyToolsListChanged();
    notifier.destroy();
  });

  it('forwards tools/list_changed when enabled and connected', async () => {
    const notifications: string[] = [];
    const server = new Server(
      { name: 'list-changed-test', version: '1.0.0' },
      {
        capabilities: buildServerCapabilities({
          TOOLS: true,
          LOGGING: false,
          RESOURCES: true,
          PROMPTS: true,
          SAMPLING: false,
          RESOURCE_SUBSCRIPTIONS: false,
          NATIVE_TASKS: false,
          LIST_CHANGED: true,
        }),
      },
    );
    const notifier = new ProtocolListChangedNotifier(true);
    notifier.bindServer(server);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'list-changed-client', version: '1.0.0' });
    client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
      notifications.push('tools');
    });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
    await notifier.notifyToolsListChanged();
    await new Promise((resolve) => setTimeout(resolve, 25));

    assert.deepEqual(notifications, ['tools']);

    await client.close();
    await server.close();
    notifier.destroy();
  });
});
