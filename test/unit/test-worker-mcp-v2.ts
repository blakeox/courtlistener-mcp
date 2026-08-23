import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createCourtListenerMcpV2Handler } from '../../src/worker/courtlistener-mcp-v2.js';

const env = { COURTLISTENER_API_KEY: 'test-worker-key' } as never;

async function postModernMcp(method: string, id: number) {
  const handler = createCourtListenerMcpV2Handler(env);
  const response = await handler.fetch(
    new Request('https://mcp.test/mcp', {
      method: 'POST',
      headers: {
        host: 'mcp.test',
        'MCP-Protocol-Version': '2026-07-28',
        'Mcp-Method': method,
        accept: 'application/json',
        'content-type': 'application/json',
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
    }),
  );
  return { response, payload: (await response.json()) as Record<string, any> };
}

describe('MCP Worker SDK v2 handler', () => {
  it('discovers the modern protocol revision and stateless capabilities', async () => {
    const { response, payload } = await postModernMcp('server/discover', 1);

    assert.equal(response.status, 200);
    assert.deepEqual(payload.result.supportedVersions, ['2026-07-28']);
    assert.ok(payload.result.capabilities.tools);
    assert.ok(payload.result.capabilities.resources);
    assert.ok(payload.result.capabilities.prompts);
  });

  it('publishes the complete governed tool catalog', async () => {
    const { response, payload } = await postModernMcp('tools/list', 2);

    assert.equal(response.status, 200);
    assert.equal(payload.result.tools.length, 52);
    assert.equal(payload.result.tools[0].name, 'search_opinions');
    assert.equal(payload.result.tools.at(-1).name, 'mcp_async_cancel_job');
  });
});
