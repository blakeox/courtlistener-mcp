#!/usr/bin/env node

import assert from 'node:assert';
import { describe, it } from 'node:test';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { setupHandlers } from '../../src/server/handler-registry.js';

type RegisteredHandler = (request?: unknown) => Promise<unknown>;

class TestServer {
  private readonly handlers = new Map<unknown, RegisteredHandler>();

  setRequestHandler(schema: unknown, handler: RegisteredHandler): void {
    this.handlers.set(schema, handler);
  }

  get(schema: unknown): RegisteredHandler {
    const handler = this.handlers.get(schema);
    assert.ok(handler);
    return handler;
  }
}

function createDeps(server: TestServer) {
  return {
    server: server as unknown as Server,
    logger: {
      startTimer: () => ({
        end: () => 0,
        endWithError: () => 0,
      }),
      info: () => {},
    } as never,
    metrics: {
      recordRequest: () => {},
      recordFailure: () => {},
    } as never,
    subscriptionManager: {
      subscribe: () => {},
      unsubscribe: () => {},
    } as never,
    listTools: async () => ({ tools: [], metadata: { categories: [] } }),
    listResources: async () => ({ resources: [] }),
    readResource: async () => ({ contents: [] }),
    listPrompts: async () => ({ prompts: [] }),
  };
}

describe('setupHandlers', () => {
  it('normalizes prompt arguments before delegating', async () => {
    const server = new TestServer();
    let receivedArgs: Record<string, string> | undefined;

    setupHandlers({
      ...createDeps(server),
      getPrompt: async (_name, args) => {
        receivedArgs = args;
        return { messages: [] };
      },
      executeTool: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    });

    const getPrompt = server.get(GetPromptRequestSchema);
    await getPrompt({
      params: {
        name: 'sample_prompt',
        arguments: { count: 1, active: true },
      },
    });

    assert.deepStrictEqual(receivedArgs, {
      count: '1',
      active: 'true',
    });
  });

  it('delegates tool execution through injected operation', async () => {
    const server = new TestServer();
    let forwardedRequest: unknown;

    setupHandlers({
      ...createDeps(server),
      getPrompt: async () => ({ messages: [] }),
      executeTool: async (request) => {
        forwardedRequest = request;
        return { content: [{ type: 'text', text: 'ok' }] };
      },
    });

    const callTool = server.get(CallToolRequestSchema);
    const request = {
      params: {
        name: 'test_tool',
        arguments: {},
      },
    };

    await callTool(request);
    assert.strictEqual(forwardedRequest, request);
  });
});
