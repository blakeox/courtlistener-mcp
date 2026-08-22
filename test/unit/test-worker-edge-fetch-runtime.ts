#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createWorkerEdgeFetchHandler } from '../../src/server/worker-edge-fetch-runtime.js';

describe('worker edge fetch runtime', () => {
  it('forwards public MCP paths to the private service binding', async () => {
    const forwarded: { pathname: string; authorization: string | null }[] = [];
    const handler = createWorkerEdgeFetchHandler({
      getRequestOrigin: () => null,
      getCachedAllowedOrigins: () => [],
      buildWorkerRouteMetricKey: (method, pathname) => `${method} ${pathname}`,
      recordRouteLatency: () => undefined,
      now: () => 0,
      forwardMcpRequest: async (request) => {
        forwarded.push({
          pathname: new URL(request.url).pathname,
          authorization: request.headers.get('authorization'),
        });
        return new Response('forwarded', { status: 200 });
      },
      workerCoreRouteDeps: {} as never,
      workerEdgeDelegatedRouteDeps: {} as never,
    });

    const response = await handler(
      new Request('https://edge.example/mcp', {
        headers: { authorization: 'Bearer provider-validated-token' },
      }),
      {} as never,
      {} as ExecutionContext,
    );

    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'forwarded');
    assert.deepEqual(forwarded, [
      { pathname: '/mcp', authorization: 'Bearer provider-validated-token' },
    ]);
  });
});
