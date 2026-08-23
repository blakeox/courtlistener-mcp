#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createLocalMcpV2Server } from '../../src/server/mcp-v2-server.js';

function modernRequest(method: string, id: number): Request {
  return new Request('http://localhost/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'MCP-Protocol-Version': '2026-07-28',
      'Mcp-Method': method,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params: {
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
  });
}

describe('MCP v2 HTTP handler', () => {
  it('serves stateless discovery without a session header', async () => {
    const handler = createMcpHandler(() => createLocalMcpV2Server(), {
      legacy: 'reject',
      responseMode: 'json',
    });
    const response = await handler.fetch(modernRequest('server/discover', 1));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('mcp-session-id'), null);
    const payload = (await response.json()) as { result?: { supportedVersions?: string[] } };
    assert.deepEqual(payload.result?.supportedVersions, ['2026-07-28']);
    await handler.close();
  });

  it('rejects a claimless legacy initialize request', async () => {
    const handler = createMcpHandler(() => createLocalMcpV2Server(), {
      legacy: 'reject',
      responseMode: 'json',
    });
    const response = await handler.fetch(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: '2025-06-18', capabilities: {} },
        }),
      }),
    );
    assert.equal(response.status, 400);
    await handler.close();
  });
});
