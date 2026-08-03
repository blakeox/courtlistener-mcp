#!/usr/bin/env node

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  LoggingMessageNotificationSchema,
  PromptListChangedNotificationSchema,
  ResourceListChangedNotificationSchema,
  ResourceUpdatedNotificationSchema,
  ToolListChangedNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { bootstrapServices } from '../../src/infrastructure/bootstrap.js';
import { container } from '../../src/infrastructure/container.js';
import { CacheManager } from '../../src/infrastructure/cache.js';
import { MCP_SERVER_INSTRUCTIONS } from '../../src/infrastructure/mcp-server-instructions.js';
import type { Logger } from '../../src/infrastructure/logger.js';
import { BestPracticeLegalMCPServer } from '../../src/server/mcp-server.js';
import { BaseToolHandler, ToolHandlerRegistry } from '../../src/server/tool-handler.js';
import type { ToolContext } from '../../src/server/tool-handler.js';

async function withConnectedClient(
  run: (client: Client, legalServer: BestPracticeLegalMCPServer) => Promise<void>,
): Promise<void> {
  const legalServer = new BestPracticeLegalMCPServer();
  const server = legalServer.getServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);
  const client = new Client({ name: 'surface-protocol-test', version: '1.0.0' });

  try {
    await client.connect(clientTransport);
    await run(client, legalServer);
  } finally {
    await client.close();
    await server.close();
    await legalServer.stop();
  }
}

describe('MCP surface protocol integration', () => {
  before(() => {
    bootstrapServices();
  });

  after(() => {
    const cache = container.get<CacheManager>('cache');
    cache.destroy();
    container.clearAll();
  });

  it('returns server instructions and resource templates over an in-memory transport', async () => {
    await withConnectedClient(async (client) => {
      assert.equal(client.getInstructions(), MCP_SERVER_INSTRUCTIONS);

      const templates = await client.listResourceTemplates();
      assert.ok(templates.resourceTemplates.length >= 7);
      assert.ok(
        templates.resourceTemplates.some((template) => template.uriTemplate.includes('{id}')),
      );
    });
  });

  it('supports logging/setLevel and forwards notifications/message', async () => {
    const notifications: Array<{ level?: string; data?: string }> = [];
    const legalServer = new BestPracticeLegalMCPServer();
    const server = legalServer.getServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'logging-protocol-test', version: '1.0.0' });

    client.setNotificationHandler(LoggingMessageNotificationSchema, (notification) => {
      notifications.push(notification.params);
    });

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      await client.setLoggingLevel('info');

      const logger = container.get<Logger>('logger');
      logger.info('integration logging probe', { probe: true });

      await new Promise((resolve) => setTimeout(resolve, 100));

      assert.ok(
        notifications.some(
          (entry) =>
            entry.data?.includes('integration logging probe') ||
            entry.data?.includes('"probe":true'),
        ),
        'expected MCP logging notification from server bridge',
      );
    } finally {
      await client.close();
      await server.close();
      await legalServer.stop();
    }
  });

  it('accepts resource subscriptions and emits resources/updated on subscribed reads', async () => {
    const uri = 'courtlistener://schema/court';
    const updates: string[] = [];

    await withConnectedClient(async (client) => {
      client.setNotificationHandler(ResourceUpdatedNotificationSchema, (notification) => {
        updates.push(notification.params.uri);
      });

      await client.subscribeResource({ uri });
      await client.readResource({ uri });

      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.deepEqual(updates, [uri]);
    });
  });

  it('advertises honest initialize capabilities for default feature flags', async () => {
    await withConnectedClient(async (client) => {
      const caps = client.getServerCapabilities();

      assert.ok(caps?.tools);
      assert.equal(caps?.resources?.subscribe, true);
      assert.ok(caps?.logging);
      assert.equal(caps?.tasks, undefined);
      assert.equal(caps?.sampling, undefined);
    });
  });

  it('emits notifications/progress when clients request progress via onprogress', async () => {
    const progressEvents: Array<{ progress: number; total?: number; message?: string }> = [];

    await withConnectedClient(async (client) => {
      await client.callTool(
        {
          name: 'list_courts',
          arguments: { page_size: 1 },
        },
        undefined,
        {
          onprogress: (progress) => {
            progressEvents.push(progress);
          },
        },
      );

      assert.ok(
        progressEvents.some((event) => typeof event.progress === 'number'),
        'expected MCP progress notifications for tool execution',
      );
    });
  });

  it('emits proactive resources/updated on TTL while subscribed', async () => {
    const uri = 'courtlistener://api/status';
    const updates: string[] = [];
    const previousRefreshOverride = process.env.MCP_TEST_SUBSCRIPTION_REFRESH_MS;

    process.env.MCP_TEST_SUBSCRIPTION_REFRESH_MS = '50';
    container.clearAll();
    bootstrapServices();

    try {
      await withConnectedClient(async (client) => {
        client.setNotificationHandler(ResourceUpdatedNotificationSchema, (notification) => {
          updates.push(notification.params.uri);
        });

        await client.subscribeResource({ uri });
        await new Promise((resolve) => setTimeout(resolve, 150));

        assert.ok(
          updates.includes(uri),
          'expected proactive resources/updated notification after subscription TTL',
        );
      });
    } finally {
      if (previousRefreshOverride === undefined) {
        delete process.env.MCP_TEST_SUBSCRIPTION_REFRESH_MS;
      } else {
        process.env.MCP_TEST_SUBSCRIPTION_REFRESH_MS = previousRefreshOverride;
      }

      container.clearAll();
      bootstrapServices();
    }
  });

  it('advertises native tasks when MCP_NATIVE_TASKS_ENABLED=true', async () => {
    const previousNativeTasksFlag = process.env.MCP_NATIVE_TASKS_ENABLED;
    process.env.MCP_NATIVE_TASKS_ENABLED = 'true';
    container.clearAll();
    bootstrapServices();

    try {
      await withConnectedClient(async (client) => {
        const caps = client.getServerCapabilities();

        assert.ok(caps?.tasks);
        assert.ok(caps.tasks?.list);
        assert.ok(caps.tasks?.cancel);
        assert.ok(caps.tasks?.requests?.tools?.call);
      });
    } finally {
      if (previousNativeTasksFlag === undefined) {
        delete process.env.MCP_NATIVE_TASKS_ENABLED;
      } else {
        process.env.MCP_NATIVE_TASKS_ENABLED = previousNativeTasksFlag;
      }

      container.clearAll();
      bootstrapServices();
    }
  });

  it('emits notifications/*/list_changed when MCP_LIST_CHANGED_ENABLED=true', async () => {
    const previousListChangedFlag = process.env.MCP_LIST_CHANGED_ENABLED;
    process.env.MCP_LIST_CHANGED_ENABLED = 'true';
    container.clearAll();
    bootstrapServices();

    const notifications: string[] = [];

    try {
      const legalServer = new BestPracticeLegalMCPServer();
      const server = legalServer.getServer();
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: 'list-changed-protocol-test', version: '1.0.0' });

      client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
        notifications.push('tools');
      });
      client.setNotificationHandler(ResourceListChangedNotificationSchema, () => {
        notifications.push('resources');
      });
      client.setNotificationHandler(PromptListChangedNotificationSchema, () => {
        notifications.push('prompts');
      });

      try {
        await server.connect(serverTransport);
        await client.connect(clientTransport);

        assert.equal(client.getServerCapabilities()?.tools?.listChanged, true);
        assert.equal(client.getServerCapabilities()?.resources?.listChanged, true);
        assert.equal(client.getServerCapabilities()?.prompts?.listChanged, true);

        await legalServer.getListChangedNotifier().notifyAllListChanged();
        await new Promise((resolve) => setTimeout(resolve, 50));

        assert.deepEqual(notifications.sort(), ['prompts', 'resources', 'tools']);
      } finally {
        await client.close();
        await server.close();
        await legalServer.stop();
      }
    } finally {
      if (previousListChangedFlag === undefined) {
        delete process.env.MCP_LIST_CHANGED_ENABLED;
      } else {
        process.env.MCP_LIST_CHANGED_ENABLED = previousListChangedFlag;
      }

      container.clearAll();
      bootstrapServices();
    }
  });

  it('emits tools/list_changed when a handler is registered after connect', async () => {
    const previousListChangedFlag = process.env.MCP_LIST_CHANGED_ENABLED;
    process.env.MCP_LIST_CHANGED_ENABLED = 'true';
    container.clearAll();
    bootstrapServices();

    const notifications: string[] = [];

    class CatalogProbeHandler extends BaseToolHandler<Record<string, never>, { ok: boolean }> {
      name = 'catalog_probe_tool';
      description = 'Ephemeral tool for listChanged registry wiring test';
      category = 'test';

      validate(
        input: unknown,
      ): { success: true; data: Record<string, never> } | { success: false; error: Error } {
        if (input && typeof input === 'object') {
          return { success: true, data: {} };
        }
        return { success: true, data: {} };
      }

      async execute(_input: Record<string, never>, _context: ToolContext) {
        return this.success({ ok: true });
      }

      getSchema(): Record<string, unknown> {
        return { type: 'object', properties: {} };
      }
    }

    try {
      const legalServer = new BestPracticeLegalMCPServer();
      const server = legalServer.getServer();
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: 'list-changed-registry-test', version: '1.0.0' });

      client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
        notifications.push('tools');
      });

      try {
        await server.connect(serverTransport);
        await client.connect(clientTransport);

        const toolRegistry = container.get<ToolHandlerRegistry>('toolRegistry');
        toolRegistry.register(new CatalogProbeHandler());
        await new Promise((resolve) => setTimeout(resolve, 50));

        assert.deepEqual(notifications, ['tools']);
      } finally {
        await client.close();
        await server.close();
        await legalServer.stop();
      }
    } finally {
      if (previousListChangedFlag === undefined) {
        delete process.env.MCP_LIST_CHANGED_ENABLED;
      } else {
        process.env.MCP_LIST_CHANGED_ENABLED = previousListChangedFlag;
      }

      container.clearAll();
      bootstrapServices();
    }
  });

  it('returns structuredContent for tool results with human-readable text content', async () => {
    if (!process.env.COURTLISTENER_API_KEY?.trim()) {
      return;
    }

    await withConnectedClient(async (client) => {
      const result = await client.callTool({
        name: 'list_courts',
        arguments: { jurisdiction: 'F', page_size: 1 },
      });

      assert.ok(result.structuredContent);
      assert.equal(result.content[0]?.type, 'text');
      assert.equal((result.content[0] as { text: string }).text.trim().startsWith('{'), false);
    });
  });

  it('advertises outputSchema on tools/list for governed tools', async () => {
    await withConnectedClient(async (client) => {
      const { tools } = await client.listTools();
      const listCourts = tools.find((tool) => tool.name === 'list_courts');

      assert.ok(listCourts?.outputSchema, 'list_courts must expose outputSchema');
      assert.equal(listCourts.outputSchema.type, 'object');
      assert.ok(listCourts.outputSchema.properties?.success);
      assert.ok(listCourts.outputSchema.properties?.data);
    });
  });
});
