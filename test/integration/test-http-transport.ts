#!/usr/bin/env node

/**
 * Integration tests for HTTP transport and InMemoryEventStore
 *
 * Validates that the StreamableHTTP transport starts, responds to health checks,
 * accepts MCP JSON-RPC requests, handles invalid sessions, and that the
 * InMemoryEventStore correctly stores and replays events.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { InMemoryEventStore } from '../../src/infrastructure/event-store.js';
import { startHttpTransport } from '../../src/server/http-transport-server.js';
import { Logger } from '../../src/infrastructure/logger.js';
import { runAuthFailureContract, runInvalidSessionLifecycleContract, runProtocolHeaderNegotiationContract } from '../utils/mcp-contract-harness.js';

// Silent logger for tests — disabled output to avoid noise
const logger = new Logger({ level: 'error', format: 'json', enabled: false }, 'test');

describe('HTTP Transport Server', () => {
  const port = 19000 + Math.floor(Math.random() * 1000);
  const baseUrl = `http://127.0.0.1:${port}`;
  let close: () => Promise<void>;
  let initializedSessionId: string | null = null;

  const initializeRequestBody = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' },
    },
  };

  const sendInitializeRequest = async (): Promise<Response> =>
    fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(initializeRequestBody),
    });

  const getInitializedSessionId = async (): Promise<string> => {
    if (initializedSessionId) {
      return initializedSessionId;
    }
    const res = await sendInitializeRequest();
    assert.equal(res.status, 200);
    initializedSessionId = res.headers.get('mcp-session-id');
    assert.ok(initializedSessionId, 'Initialize response should include mcp-session-id');
    return initializedSessionId;
  };

  before(async () => {
    const mcpServer = new Server({ name: 'test-server', version: '1.0.0' }, { capabilities: {} });

    const result = await startHttpTransport(mcpServer, logger, {
      port,
      host: '127.0.0.1',
      enableSessions: true,
      enableJsonResponse: true,
    });
    close = result.close;

    // Give the server time to bind
    await new Promise((r) => setTimeout(r, 200));
  });

  after(async () => {
    if (close) await close();
  });

  it('GET /health returns 200 with status ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);

    const data = (await res.json()) as { status: string; transport: string };
    assert.equal(data.status, 'ok');
    assert.equal(data.transport, 'streamable-http');
  });

  it('OPTIONS /mcp returns consolidated CORS headers', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://example-client.test' },
    });

    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://example-client.test');
    assert.equal(res.headers.get('access-control-allow-methods'), 'GET, POST, DELETE, OPTIONS');
    assert.equal(
      res.headers.get('access-control-allow-headers'),
      'Content-Type, Authorization, mcp-session-id, MCP-Protocol-Version',
    );
    assert.equal(res.headers.get('access-control-expose-headers'), 'mcp-session-id, MCP-Protocol-Version');
    assert.equal(res.headers.get('vary'), 'Origin');
  });

  it('POST /mcp with initialize request returns valid response with session ID', async () => {
    const res = await sendInitializeRequest();

    assert.equal(res.status, 200);

    initializedSessionId = res.headers.get('mcp-session-id');
    assert.ok(initializedSessionId, 'Response should include mcp-session-id header');

    const data = (await res.json()) as { jsonrpc: string; id: number; result?: unknown };
    assert.equal(data.jsonrpc, '2.0');
    assert.equal(data.id, 1);
    assert.ok(data.result, 'Response should include result');
  });

  it('enforces invalid session lifecycle contract', async () => {
    const sessionId = await getInitializedSessionId();

    const deleteRes = await fetch(`${baseUrl}/mcp`, {
      method: 'DELETE',
      headers: {
        'mcp-session-id': sessionId,
      },
    });
    assert.ok(
      deleteRes.status === 200 || deleteRes.status === 204 || deleteRes.status === 202,
      `Unexpected delete status: ${deleteRes.status}`,
    );

    await runInvalidSessionLifecycleContract(
      { closedSessionId: sessionId, expectedStatus: 400 },
      async (fixture) =>
        fetch(`${baseUrl}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'mcp-session-id': fixture.sessionId,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/list',
            params: {},
          }),
        }),
    );
  });
});

describe('HTTP Transport Server auth parity', () => {
  const port = 20000 + Math.floor(Math.random() * 1000);
  const baseUrl = `http://127.0.0.1:${port}`;
  let close: () => Promise<void>;
  const authEnvKeys = [
    'MCP_AUTH_TOKEN',
    'MCP_AUTH_PRIMARY',
    'MCP_ALLOW_STATIC_FALLBACK',
    'MCP_REQUIRE_PROTOCOL_VERSION',
    'OIDC_ISSUER',
    'OIDC_AUDIENCE',
    'OIDC_JWKS_URL',
    'OIDC_REQUIRED_SCOPE',
    'SUPABASE_URL',
    'SUPABASE_SECRET_KEY',
    'SUPABASE_API_KEYS_TABLE',
  ];
  const previousEnv = new Map<string, string | undefined>();

  before(async () => {
    for (const key of authEnvKeys) {
      previousEnv.set(key, process.env[key]);
      delete process.env[key];
    }
    process.env.MCP_AUTH_TOKEN = 'http-static-token';
    process.env.MCP_REQUIRE_PROTOCOL_VERSION = 'true';

    const mcpServer = new Server({ name: 'test-server-auth', version: '1.0.0' }, { capabilities: {} });
    const result = await startHttpTransport(mcpServer, logger, {
      port,
      host: '127.0.0.1',
      enableSessions: true,
      enableJsonResponse: true,
    });
    close = result.close;

    await new Promise((r) => setTimeout(r, 200));
  });

  after(async () => {
    if (close) await close();
    for (const key of authEnvKeys) {
      const value = previousEnv.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('enforces static bearer token with consistent auth error shape', async () => {
    await runAuthFailureContract(
      [
        { name: 'missing token', expectedStatus: 401, expectedError: 'invalid_token' },
        { name: 'wrong token', expectedStatus: 401, expectedError: 'invalid_token' },
      ],
      async (fixture) => {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (fixture.name === 'wrong token') {
          headers.Authorization = 'Bearer wrong-token';
        }

        return fetch(`${baseUrl}/mcp`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2025-03-26',
              capabilities: {},
              clientInfo: { name: 'test-client', version: '1.0.0' },
            },
          }),
        });
      },
    );
  });

  it('applies protocol negotiation contract for authenticated initialize requests', async () => {
    await runProtocolHeaderNegotiationContract(
      {
        supportedVersion: '2025-03-26',
        acceptedStatus: 200,
        filterCase: (fixture) => fixture.required,
        assertAcceptedResponse: async (response) => {
          const data = (await response.json()) as { jsonrpc: string; id: number; result?: unknown };
          assert.equal(data.jsonrpc, '2.0');
          assert.equal(data.id, 1);
          assert.ok(data.result);
        },
      },
      async (fixture) => {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Authorization: 'Bearer http-static-token',
          Accept: 'application/json, text/event-stream',
        };
        if (fixture.headerValue) {
          headers['MCP-Protocol-Version'] = fixture.headerValue;
        }

        return fetch(`${baseUrl}/mcp`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2025-03-26',
              capabilities: {},
              clientInfo: { name: 'test-client', version: '1.0.0' },
            },
          }),
        });
      },
    );
  });
});

describe('InMemoryEventStore', () => {
  it('stores events and returns unique IDs', async () => {
    const store = new InMemoryEventStore();

    const msg1 = { jsonrpc: '2.0' as const, method: 'notification1' };
    const msg2 = { jsonrpc: '2.0' as const, method: 'notification2' };

    const id1 = await store.storeEvent('stream-1', msg1);
    const id2 = await store.storeEvent('stream-1', msg2);

    assert.ok(id1, 'Should return an event ID');
    assert.ok(id2, 'Should return an event ID');
    assert.notEqual(id1, id2, 'Event IDs should be unique');
  });

  it('replays events after a given event ID', async () => {
    const store = new InMemoryEventStore();

    const msg1 = { jsonrpc: '2.0' as const, method: 'notify', params: { seq: 1 } };
    const msg2 = { jsonrpc: '2.0' as const, method: 'notify', params: { seq: 2 } };
    const msg3 = { jsonrpc: '2.0' as const, method: 'notify', params: { seq: 3 } };

    const id1 = await store.storeEvent('stream-a', msg1);
    await store.storeEvent('stream-a', msg2);
    await store.storeEvent('stream-a', msg3);

    const replayed: Array<{ eventId: string; message: unknown }> = [];
    const streamId = await store.replayEventsAfter(id1, {
      send: async (eventId, message) => {
        replayed.push({ eventId, message });
      },
    });

    assert.equal(streamId, 'stream-a');
    assert.equal(replayed.length, 2, 'Should replay 2 events after the first');
    assert.deepStrictEqual(replayed[0].message, msg2);
    assert.deepStrictEqual(replayed[1].message, msg3);
  });

  it('throws when replaying from unknown event ID', async () => {
    const store = new InMemoryEventStore();

    await assert.rejects(
      () => store.replayEventsAfter('nonexistent-id', { send: async () => {} }),
      { message: /not found/ },
    );
  });

  it('respects maxEvents cap', async () => {
    const store = new InMemoryEventStore({ maxEvents: 3 });

    const msg = { jsonrpc: '2.0' as const, method: 'test' };
    await store.storeEvent('s1', msg);
    const id2 = await store.storeEvent('s1', msg);
    await store.storeEvent('s1', msg);
    await store.storeEvent('s1', msg); // This should evict the first event

    // The first event was evicted, so replaying from id2 should still work
    // because id2 is within the retained window
    const replayed: unknown[] = [];
    await store.replayEventsAfter(id2, {
      send: async (_eventId, message) => {
        replayed.push(message);
      },
    });
    assert.equal(replayed.length, 2, 'Should replay events after id2 within cap');
  });
});
