#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { MCP_SERVER_INSTRUCTIONS } from '../../src/infrastructure/mcp-server-instructions.js';
import { createLocalMcpV2Server } from '../../src/server/mcp-v2-server.js';

const PROTOCOL_VERSION = '2026-07-28';

function request(method: string, id = 1, params: Record<string, unknown> = {}): Request {
  return new Request('http://localhost/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'MCP-Protocol-Version': PROTOCOL_VERSION,
      'Mcp-Method': method,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params: {
        ...params,
        _meta: {
          'io.modelcontextprotocol/protocolVersion': PROTOCOL_VERSION,
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
  });
}

async function call(
  method: string,
  params: Record<string, unknown> = {},
): Promise<Record<string, any>> {
  const handler = createMcpHandler(() => createLocalMcpV2Server(), {
    legacy: 'reject',
    responseMode: 'json',
  });
  try {
    const response = await handler.fetch(request(method, 1, params));
    assert.equal(response.status, 200);
    return (await response.json()) as Record<string, any>;
  } finally {
    await handler.close();
  }
}

describe('MCP v2 surface protocol integration', () => {
  it('advertises the v2 protocol, capabilities, and instructions', async () => {
    const payload = await call('server/discover');
    assert.deepEqual(payload.result?.supportedVersions, [PROTOCOL_VERSION]);
    assert.equal(payload.result?.instructions, MCP_SERVER_INSTRUCTIONS);
    assert.equal(payload.result?.capabilities?.tools?.listChanged, true);
    assert.equal(payload.result?.capabilities?.resources?.subscribe, undefined);
    assert.equal(payload.result?.capabilities?.logging, undefined);
  });

  it('serves governed tools, resources, templates, and prompts over v2', async () => {
    const [tools, resources, templates, prompts] = await Promise.all([
      call('tools/list'),
      call('resources/list'),
      call('resources/templates/list'),
      call('prompts/list'),
    ]);

    assert.ok(tools.result?.tools?.length >= 40);
    const listCourts = tools.result.tools.find(
      (tool: { name?: string }) => tool.name === 'list_courts',
    );
    assert.ok(listCourts?.outputSchema);
    assert.ok(resources.result?.resources?.length >= 7);
    assert.ok(
      templates.result?.resourceTemplates?.some((template: { uriTemplate?: string }) =>
        template.uriTemplate?.includes('{id}'),
      ),
    );
    assert.ok(
      prompts.result?.prompts?.some(
        (prompt: { name?: string }) => prompt.name === 'legal_assistant',
      ),
    );
  });

  it('rejects claimless legacy initialize requests', async () => {
    const handler = createMcpHandler(() => createLocalMcpV2Server(), {
      legacy: 'reject',
      responseMode: 'json',
    });
    try {
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
    } finally {
      await handler.close();
    }
  });
});
