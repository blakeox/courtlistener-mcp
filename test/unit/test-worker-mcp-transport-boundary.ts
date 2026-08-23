import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { handleMcpTransportBoundary } from '../../src/server/mcp-transport-runtime-facade.js';

describe('MCP transport boundary abuse hooks', () => {
  it('short-circuits when boundary abuse guard returns an error response', async () => {
    let mcpHandlerCalled = false;

    const response = await handleMcpTransportBoundary({
      request: new Request('https://example.com/mcp', {
        method: 'POST',
        headers: {
          'x-mcp-service-token': 'token',
          'MCP-Protocol-Version': '2026-07-28',
        },
      }),
      env: { MCP_AUTH_TOKEN: 'token' },
      ctx: {} as ExecutionContext,
      pathname: '/mcp',
      requestMethod: 'POST',
      origin: null,
      allowedOrigins: [],
      mcpPath: true,
      supportedProtocolVersions: new Set(['2026-07-28']),
      mcpStreamableHandler: {
        fetch: async () => {
          mcpHandlerCalled = true;
          return new Response('ok', { status: 200 });
        },
      },
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

  it('rejects the removed standalone GET /mcp event stream', async () => {
    let streamableCalled = false;

    const response = await handleMcpTransportBoundary({
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
      supportedProtocolVersions: new Set(['2026-07-28']),
      mcpStreamableHandler: {
        fetch: async () => {
          streamableCalled = true;
          return new Response('streamable', { status: 200 });
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
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'POST, OPTIONS');
    assert.equal(streamableCalled, false);
  });

  it('preserves request-scoped SSE responses from POST /mcp', async () => {
    const response = await handleMcpTransportBoundary({
      request: new Request('https://example.com/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'subscriptions/listen', params: {} }),
      }),
      env: { MCP_AUTH_TOKEN: 'not-used' },
      ctx: { props: { userId: 'user-1', authMethod: 'oidc' } } as ExecutionContext,
      pathname: '/mcp',
      requestMethod: 'POST',
      origin: null,
      allowedOrigins: [],
      mcpPath: true,
      supportedProtocolVersions: new Set(['2026-07-28']),
      skipGatewayAuth: true,
      mcpStreamableHandler: {
        fetch: async () =>
          new Response('event: message\ndata: {"jsonrpc":"2.0"}\n\n', {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          }),
      },
      withCors: (res) => res,
      buildCorsHeaders: () => new Headers(),
      getClientIdentifier: () => 'client-1',
      getAuthRateLimitedResponse: async () => null,
      recordAuthFailure: async () => {},
      clearAuthFailures: async () => {},
    });

    assert.ok(response);
    assert.equal(response.headers.get('content-type'), 'text/event-stream');
    assert.equal(await response.text(), 'event: message\ndata: {"jsonrpc":"2.0"}\n\n');
  });
});

describe('MCP transport boundary skipGatewayAuth (OAuth provider pre-validated)', () => {
  it('bypasses gateway auth and constructs principal from prevalidated context props', async () => {
    let mcpHandlerCalled = false;
    let gatewayAuthCalled = false;

    const response = await handleMcpTransportBoundary({
      request: new Request('https://example.com/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1, params: {} }),
      }),
      env: {
        MCP_AUTH_TOKEN: 'should-not-be-checked',
        OIDC_ISSUER: 'https://issuer.example.com',
        MCP_REQUIRE_PROTOCOL_VERSION: 'true',
      },
      ctx: {
        props: { userId: 'user_abc123', authMethod: 'oidc' },
      } as ExecutionContext,
      pathname: '/mcp',
      requestMethod: 'POST',
      origin: null,
      allowedOrigins: [],
      mcpPath: true,
      supportedProtocolVersions: new Set(['2026-07-28']),
      skipGatewayAuth: true,
      mcpStreamableHandler: {
        fetch: async () => {
          mcpHandlerCalled = true;
          return new Response('ok', { status: 200 });
        },
      },
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
    const response = await handleMcpTransportBoundary({
      request: new Request('https://example.com/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1, params: {} }),
      }),
      env: {
        MCP_REQUIRE_PROTOCOL_VERSION: 'true',
        OIDC_ISSUER: 'https://issuer.example.com',
      },
      ctx: {
        props: { userId: 'user_abc123', authMethod: 'oidc' },
      } as ExecutionContext,
      pathname: '/mcp',
      requestMethod: 'POST',
      origin: null,
      allowedOrigins: [],
      mcpPath: true,
      supportedProtocolVersions: new Set(['2026-07-28']),
      skipGatewayAuth: true,
      mcpStreamableHandler: {
        fetch: async () => {
          mcpHandlerCalled = true;
          return new Response('ok', { status: 200 });
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
    assert.equal(
      mcpHandlerCalled,
      true,
      'MCP handler should be reached despite missing protocol version',
    );
  });

  it('fails closed when skipGatewayAuth lacks prevalidated context props', async () => {
    let mcpHandlerCalled = false;

    const response = await handleMcpTransportBoundary({
      request: new Request('https://example.com/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'x-oauth-user-id': 'spoofed-user',
          'x-oauth-auth-method': 'oidc',
        },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1, params: {} }),
      }),
      env: {
        MCP_AUTH_TOKEN: 'should-not-be-checked',
        OIDC_ISSUER: 'https://issuer.example.com',
      },
      ctx: {} as ExecutionContext,
      pathname: '/mcp',
      requestMethod: 'POST',
      origin: null,
      allowedOrigins: [],
      mcpPath: true,
      supportedProtocolVersions: new Set(['2026-07-28']),
      skipGatewayAuth: true,
      mcpStreamableHandler: {
        fetch: async () => {
          mcpHandlerCalled = true;
          return new Response('ok', { status: 200 });
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
    assert.equal(response.status, 401);
    assert.equal(mcpHandlerCalled, false);
    assert.deepEqual(await response.json(), {
      error: 'invalid_prevalidated_oauth_context',
      message: 'Validated OAuth context is required for the internal provider fast path.',
    });
  });
});
