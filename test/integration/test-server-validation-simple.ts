#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createLocalMcpV2Server } from '../../src/server/mcp-v2-server.js';

const PROTOCOL_VERSION = '2026-07-28';

describe('MCP v2 runtime validation', () => {
  it('publishes the supported v2 package entry points', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      name?: string;
      type?: string;
      main?: string;
      bin?: Record<string, string>;
      dependencies?: Record<string, string>;
    };

    assert.equal(packageJson.name, 'courtlistener-mcp');
    assert.equal(packageJson.type, 'module');
    assert.equal(packageJson.main, 'dist/index.js');
    assert.deepEqual(packageJson.bin, { 'courtlistener-mcp': 'dist/index.js' });
    assert.ok(packageJson.dependencies?.['@modelcontextprotocol/server']);
    assert.ok(packageJson.dependencies?.['@modelcontextprotocol/server']);
  });

  it('creates a v2 server with a stateless discovery contract', async () => {
    const handler = createMcpHandler(() => createLocalMcpV2Server(), {
      legacy: 'reject',
      responseMode: 'json',
    });

    try {
      const response = await handler.fetch(
        new Request('http://localhost/mcp', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'MCP-Protocol-Version': PROTOCOL_VERSION,
            'Mcp-Method': 'server/discover',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'server/discover',
            params: {
              _meta: {
                'io.modelcontextprotocol/protocolVersion': PROTOCOL_VERSION,
                'io.modelcontextprotocol/clientCapabilities': {},
              },
            },
          }),
        }),
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('mcp-session-id'), null);
      const payload = (await response.json()) as {
        result?: { supportedVersions?: string[]; capabilities?: Record<string, unknown> };
      };
      assert.deepEqual(payload.result?.supportedVersions, [PROTOCOL_VERSION]);
      assert.ok(payload.result?.capabilities?.tools);
      assert.ok(payload.result?.capabilities?.resources);
    } finally {
      await handler.close();
    }
  });
});
