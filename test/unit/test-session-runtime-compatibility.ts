#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createInvalidSessionLifecycleResponse } from '../../src/server/mcp-session-lifecycle-contract.js';
import { handleMcpGatewayRoute } from '../../src/server/worker-mcp-gateway.js';
import {
  createInvalidSessionLifecycleCases,
  assertInvalidSessionLifecycleShape,
  type InvalidSessionLifecycleCase,
} from '../utils/mcp-transport-contract.js';

describe('session lifecycle runtime compatibility contract', () => {
  it('keeps node and worker invalid-session behavior aligned', async () => {
    const fixtures = createInvalidSessionLifecycleCases('closed-session-id');
    const workerStatuses: number[] = [];
    const nodeStatuses: number[] = [];

    for (const fixture of fixtures) {
      const nodeResponse = createInvalidSessionLifecycleResponse();
      nodeStatuses.push(nodeResponse.status);
      assertInvalidSessionLifecycleShape(await nodeResponse.json());

      let workerHandlerReached = false;
      const workerResponse = await handleMcpGatewayRoute({
        request: new Request('https://example.com/mcp', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'mcp-session-id': fixture.sessionId,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: fixture.name,
            method: 'tools/list',
            params: {},
          }),
        }),
        env: {},
        ctx: {} as ExecutionContext,
        pathname: '/mcp',
        requestMethod: 'POST',
        origin: null,
        allowedOrigins: [],
        mcpPath: true,
        supportedProtocolVersions: new Set(['2025-03-26']),
        mcpStreamableHandler: {
          fetch: async () => {
            workerHandlerReached = true;
            return new Response('should-not-run');
          },
        },
        mcpSseCompatibilityHandler: {
          fetch: async () => new Response('sse'),
        },
        withCors: (response) => response,
        buildCorsHeaders: () => new Headers(),
        getClientIdentifier: () => 'test-client',
        getAuthRateLimitedResponse: async () => null,
        recordAuthFailure: async () => {},
        clearAuthFailures: async () => {},
        validateSessionRequest: async (
          request: Request,
          _env: {},
          _nowMs: number,
        ): Promise<Response | null> => {
          if (request.headers.get('mcp-session-id')) {
            return createInvalidSessionLifecycleResponse();
          }
          return null;
        },
      });

      assert.equal(workerHandlerReached, false);
      assert.ok(workerResponse);
      workerStatuses.push(workerResponse.status);
      assertInvalidSessionLifecycleShape(await workerResponse.json());
    }

    assert.deepEqual(workerStatuses, nodeStatuses);
    assert.deepEqual(nodeStatuses, fixtures.map(() => 400));
  });

  it('maintains the shared invalid-session payload shape', async () => {
    const fixture: InvalidSessionLifecycleCase = {
      name: 'shared payload',
      sessionId: 'invalid-session',
    };

    const response = createInvalidSessionLifecycleResponse();
    assert.equal(response.status, 400);
    assertInvalidSessionLifecycleShape(await response.json());
    assert.equal(fixture.sessionId, 'invalid-session');
  });
});
