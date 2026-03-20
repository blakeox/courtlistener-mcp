import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { handleWorkerMcpTransportBoundary } from '../../src/server/worker-mcp-transport-boundary.js';

describe('worker-mcp-transport-boundary abuse hooks', () => {
  it('short-circuits when boundary abuse guard returns an error response', async () => {
    let mcpHandlerCalled = false;

    const response = await handleWorkerMcpTransportBoundary({
      request: new Request('https://example.com/mcp', {
        method: 'POST',
        headers: {
          'x-mcp-service-token': 'token',
          'MCP-Protocol-Version': '2025-03-26',
        },
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

  it('routes GET /mcp event-stream requests without a session id to the streamable handler', async () => {
    let streamableCalled = false;

    const response = await handleWorkerMcpTransportBoundary({
      request: new Request('https://example.com/mcp', {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          'x-mcp-service-token': 'token',
        },
      }),
      env: { MCP_AUTH_TOKEN: 'token' },
      ctx: {} as ExecutionContext,
      pathname: '/mcp',
      requestMethod: 'GET',
      origin: null,
      allowedOrigins: [],
      mcpPath: true,
      supportedProtocolVersions: new Set(['2025-03-26']),
      mcpStreamableHandler: {
        fetch: async () => {
          streamableCalled = true;
          return new Response('streamable', { status: 200 });
        },
      },
      mcpSseCompatibilityHandler: {
        fetch: async () => {
          return new Response('sse', {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          });
        },
      },
      withCors: (res) => res,
      buildCorsHeaders: () => new Headers(),
      getClientIdentifier: () => 'client-1',
      getAuthRateLimitedResponse: async () => null,
      recordAuthFailure: async () => {},
      clearAuthFailures: async () => {},
    });

    assert.ok(response);
    assert.equal(response.status, 200);
    assert.equal(streamableCalled, true);
  });

  it('returns a session lifecycle error when finalizing a session mutation fails', async () => {
    const response = await handleWorkerMcpTransportBoundary({
      request: new Request('https://example.com/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'x-mcp-service-token': 'token',
        },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1, params: {} }),
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
        fetch: async () =>
          new Response(JSON.stringify({ jsonrpc: '2.0', result: {} }), {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'mcp-session-id': '123e4567-e89b-12d3-a456-426614174000',
            },
          }),
      },
      mcpSseCompatibilityHandler: { fetch: async () => new Response('sse', { status: 200 }) },
      withCors: (res) => res,
      buildCorsHeaders: () => new Headers(),
      getClientIdentifier: () => 'client-1',
      getAuthRateLimitedResponse: async () => null,
      recordAuthFailure: async () => {},
      clearAuthFailures: async () => {},
      finalizeSessionResponse: async () =>
        Response.json(
          {
            jsonrpc: '2.0',
            error: {
              code: -32001,
              message: 'Session lifecycle service unavailable',
            },
          },
          { status: 503 },
        ),
    });

    assert.ok(response);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Session lifecycle service unavailable',
      },
    });
  });

  it('returns a session lifecycle error when closing a session mutation fails', async () => {
    const response = await handleWorkerMcpTransportBoundary({
      request: new Request('https://example.com/mcp', {
        method: 'DELETE',
        headers: {
          Accept: 'application/json, text/event-stream',
          'x-mcp-service-token': 'token',
          'mcp-session-id': '123e4567-e89b-12d3-a456-426614174000',
        },
      }),
      env: { MCP_AUTH_TOKEN: 'token' },
      ctx: {} as ExecutionContext,
      pathname: '/mcp',
      requestMethod: 'DELETE',
      origin: null,
      allowedOrigins: [],
      mcpPath: true,
      supportedProtocolVersions: new Set(['2025-03-26']),
      mcpStreamableHandler: {
        fetch: async () => new Response(null, { status: 204 }),
      },
      mcpSseCompatibilityHandler: { fetch: async () => new Response('sse', { status: 200 }) },
      withCors: (res) => res,
      buildCorsHeaders: () => new Headers(),
      getClientIdentifier: () => 'client-1',
      getAuthRateLimitedResponse: async () => null,
      recordAuthFailure: async () => {},
      clearAuthFailures: async () => {},
      finalizeSessionResponse: async () =>
        Response.json(
          {
            jsonrpc: '2.0',
            error: {
              code: -32001,
              message: 'Session lifecycle service unavailable',
            },
          },
          { status: 503 },
        ),
    });

    assert.ok(response);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Session lifecycle service unavailable',
      },
    });
  });
});

describe('worker-mcp-transport-boundary skipGatewayAuth (OAuth provider pre-validated)', () => {
  it('bypasses gateway auth and constructs principal from OAuth headers', async () => {
    let mcpHandlerCalled = false;
    let gatewayAuthCalled = false;

    const response = await handleWorkerMcpTransportBoundary({
      request: new Request('https://example.com/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'x-oauth-user-id': 'user_abc123',
          'x-oauth-auth-method': 'clerk',
        },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1, params: {} }),
      }),
      env: {
        MCP_AUTH_TOKEN: 'should-not-be-checked',
        OIDC_ISSUER: 'https://issuer.example.com',
        MCP_REQUIRE_PROTOCOL_VERSION: 'true',
      },
      ctx: {} as ExecutionContext,
      pathname: '/mcp',
      requestMethod: 'POST',
      origin: null,
      allowedOrigins: [],
      mcpPath: true,
      supportedProtocolVersions: new Set(['2025-03-26']),
      skipGatewayAuth: true,
      mcpStreamableHandler: {
        fetch: async () => {
          mcpHandlerCalled = true;
          return new Response('ok', { status: 200 });
        },
      },
      mcpSseCompatibilityHandler: { fetch: async () => new Response('sse', { status: 200 }) },
      withCors: (res) => res,
      buildCorsHeaders: () => new Headers(),
      getClientIdentifier: () => {
        gatewayAuthCalled = true;
        return 'client-1';
      },
      getAuthRateLimitedResponse: async () => {
        gatewayAuthCalled = true;
        return null;
      },
      recordAuthFailure: async () => {
        gatewayAuthCalled = true;
      },
      clearAuthFailures: async () => {
        gatewayAuthCalled = true;
      },
    });

    assert.ok(response);
    assert.equal(response.status, 200);
    assert.equal(mcpHandlerCalled, true, 'MCP handler should be reached');
    assert.equal(gatewayAuthCalled, false, 'Gateway auth should be completely bypassed');
  });

  it('skips protocol version enforcement when skipGatewayAuth is true', async () => {
    let mcpHandlerCalled = false;

    // POST /mcp WITHOUT MCP-Protocol-Version header — would fail with
    // MCP_REQUIRE_PROTOCOL_VERSION=true in the normal path
    const response = await handleWorkerMcpTransportBoundary({
      request: new Request('https://example.com/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'x-oauth-user-id': 'user_abc123',
        },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1, params: {} }),
      }),
      env: {
        MCP_REQUIRE_PROTOCOL_VERSION: 'true',
        OIDC_ISSUER: 'https://issuer.example.com',
      },
      ctx: {} as ExecutionContext,
      pathname: '/mcp',
      requestMethod: 'POST',
      origin: null,
      allowedOrigins: [],
      mcpPath: true,
      supportedProtocolVersions: new Set(['2025-03-26']),
      skipGatewayAuth: true,
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
    });

    assert.ok(response);
    assert.equal(response.status, 200);
    assert.equal(
      mcpHandlerCalled,
      true,
      'MCP handler should be reached despite missing protocol version',
    );
  });
});
