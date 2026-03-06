#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  aiToolArguments,
  aiToolFromPrompt,
  createWorkerMcpAiRuntime,
  hasValidMcpRpcShape,
  isPlainObject,
} from '../../src/server/worker-mcp-ai-runtime.js';

describe('worker MCP AI runtime', () => {
  it('selects citation lookup when the prompt looks like a legal citation', () => {
    const result = aiToolFromPrompt('410 U.S. 113 Roe v. Wade');

    assert.equal(result.tool, 'lookup_citation');
  });

  it('builds tool arguments for docket and search tools', () => {
    assert.deepEqual(aiToolArguments('get_docket_entries', 'docket 42'), { docket: '42' });
    assert.deepEqual(aiToolArguments('search_cases', 'qualified immunity'), {
      query: 'qualified immunity',
      page_size: 5,
      order_by: 'score desc',
    });
  });

  it('fails closed when an id-based tool is missing a numeric identifier', () => {
    assert.throws(
      () => aiToolArguments('get_case_details', 'tell me about this case'),
      /requires an explicit numeric identifier/i,
    );
  });

  it('validates MCP JSON-RPC result and error payload shapes', () => {
    assert.equal(hasValidMcpRpcShape({ result: { ok: true } }), true);
    assert.equal(hasValidMcpRpcShape({ error: { code: -32000, message: 'failed' } }), true);
    assert.equal(hasValidMcpRpcShape({ nope: true }), false);
    assert.equal(isPlainObject({ foo: 'bar' }), true);
    assert.equal(isPlainObject(['array']), false);
  });

  it('records authorized MCP usage only for MCP routes with a user id', async () => {
    const calls: Array<{ route?: string; method?: string; userId: string }> = [];
    const runtime = createWorkerMcpAiRuntime({
      authorizeMcpGatewayRequest: async () => ({ principal: {} }),
      runWithPrincipalContext: async (_principal, callback) => callback(),
      mcpStreamableFetch: async () => new Response('{}', { status: 200 }),
      preferredMcpProtocolVersion: '2025-03-26',
      supportedMcpProtocolVersions: new Set(['2025-03-26']),
      redactSecretsInText: (value) => value,
      incrementUserUsage: async (_env, userId, metadata) => {
        calls.push({ userId, ...metadata });
      },
    });

    await runtime.recordAuthorizedMcpUsage(
      new Request('https://worker.example/mcp', { method: 'POST' }),
      {} as never,
      { userId: 'user-77' },
    );
    await runtime.recordAuthorizedMcpUsage(
      new Request('https://worker.example/health', { method: 'GET' }),
      {} as never,
      { userId: 'user-77' },
    );

    assert.deepEqual(calls, [{ userId: 'user-77', route: '/mcp', method: 'POST' }]);
  });

  it('prefers the caller token over the static service token for internal MCP calls', async () => {
    let seenAuthorization = '';
    let seenServiceHeader = '';
    const runtime = createWorkerMcpAiRuntime({
      authorizeMcpGatewayRequest: async ({ request }) => {
        seenAuthorization = request.headers.get('authorization') || '';
        seenServiceHeader = request.headers.get('x-mcp-service-token') || '';
        return { principal: { userId: 'user-1' } };
      },
      runWithPrincipalContext: async (_principal, callback) => callback(),
      mcpStreamableFetch: async () => new Response('{"result":{"ok":true}}', { status: 200 }),
      preferredMcpProtocolVersion: '2025-03-26',
      supportedMcpProtocolVersions: new Set(['2025-03-26']),
      redactSecretsInText: (value) => value,
      incrementUserUsage: async () => {},
    });

    await runtime.callMcpJsonRpc(
      { MCP_AUTH_TOKEN: 'service-token' } as never,
      {} as ExecutionContext,
      'caller-token',
      'initialize',
      {},
      1,
    );

    assert.equal(seenAuthorization, 'Bearer caller-token');
    assert.equal(seenServiceHeader, '');
  });
});
