import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { handleWorkerMcpTransportBoundary } from '../../src/server/worker-mcp-transport-boundary.js';

describe('worker-mcp-transport-boundary abuse hooks', () => {
  it('short-circuits when boundary abuse guard returns an error response', async () => {
    let mcpHandlerCalled = false;

    const response = await handleWorkerMcpTransportBoundary({
      request: new Request('https://example.com/mcp', {
        method: 'POST',
        headers: { Authorization: 'Bearer token', 'MCP-Protocol-Version': '2025-03-26' },
      }),
      env: { MCP_AUTH_TOKEN: 'token' },
      ctx: {} as ExecutionContext,
      pathname: '/mcp',
      requestMethod: 'POST',
      origin: null,
      allowedOrigins: [],
      mcpPath: true,
      supportedProtocolVersions: new Set(['2025-03-26']),
      mcpStreamableHandler: {
        fetch: async () => {
          mcpHandlerCalled = true;
          return new Response('ok', { status: 200 });
        },
      },
      mcpSseCompatibilityHandler: { fetch: async () => new Response('sse', { status: 200 }) },
      withCors: (res) => res,
      buildCorsHeaders: () => new Headers(),
      getClientIdentifier: () => 'client-1',
      getAuthRateLimitedResponse: async () => null,
      recordAuthFailure: async () => {},
      clearAuthFailures: async () => {},
      evaluateMcpBoundaryRequest: async () =>
        Response.json({ error: 'mcp_rate_limited' }, { status: 429 }),
    });

    assert.ok(response);
    assert.equal(response.status, 429);
    assert.equal(mcpHandlerCalled, false);
  });
});
