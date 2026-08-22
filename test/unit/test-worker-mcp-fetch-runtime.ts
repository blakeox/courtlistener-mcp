import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createWorkerMcpFetchHandler } from '../../src/server/worker-mcp-fetch-runtime.js';

describe('createWorkerMcpFetchHandler', () => {
  it('serves health from the MCP worker boundary', async () => {
    const handler = createWorkerMcpFetchHandler<any>({
      getRequestOrigin: () => null,
      getCachedAllowedOrigins: () => [],
      buildWorkerRouteMetricKey: (method, pathname) => `${method} ${pathname}`,
      recordRouteLatency: () => undefined,
      now: () => 1_700_000_000_000,
      workerCoreRouteDeps: {
        isAllowedOrigin: () => true,
        buildCorsHeaders: () => new Headers(),
        withCors: (response: Response) => response,
        jsonError: (message: string, status: number, errorCode: string) =>
          new Response(JSON.stringify({ error: message, error_code: errorCode }), { status }),
        jsonResponse: (payload: unknown, status = 200) =>
          new Response(JSON.stringify(payload), {
            status,
            headers: { 'content-type': 'application/json' },
          }),
        workerUiSessionRuntime: {},
        getWorkerLatencySnapshot: () => ({ routes: {} }),
        getUsageSnapshot: async () => null,
        workerDurableRuntime: {},
        now: () => 1_700_000_000_000,
      },
      mcpBoundaryPolicy: {},
    });

    const response = await handler(
      new Request('https://worker.example/health'),
      {},
      {} as ExecutionContext,
    );

    assert.equal(response.status, 200);
    const payload = (await response.json()) as Record<string, unknown>;
    assert.equal(payload.service, 'courtlistener-mcp');
    assert.equal(payload.runtime, 'cloudflare-worker');

    const readinessResponse = await handler(
      new Request('https://worker.example/ready'),
      {},
      {} as ExecutionContext,
    );
    assert.equal(readinessResponse.status, 200);
    const readiness = (await readinessResponse.json()) as Record<string, unknown>;
    assert.equal(readiness.status, 'ready');
  });
});
