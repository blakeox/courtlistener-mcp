import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createCloudflareTelemetryRuntime } from '../../src/server/worker-cloudflare-telemetry-runtime.js';
import { buildWorkerOperationalTelemetryEvent } from '../../src/server/worker-operational-telemetry.js';

describe('Worker Cloudflare operational telemetry', () => {
  it('keeps the event low-cardinality and drops payload-like fields', () => {
    const event = buildWorkerOperationalTelemetryEvent(
      {
        event: 'request_completed',
        worker_role: 'edge',
        route: '/mcp',
        authorization: 'Bearer should-not-survive',
        request_body: 'legal search terms should not survive',
        tool: 'search_cases',
        duration_ms: 42,
      },
      new Date('2026-08-03T00:00:00.000Z'),
    );

    assert.deepEqual(event, {
      schema_version: 'v1',
      timestamp: '2026-08-03T00:00:00.000Z',
      event: 'request_completed',
      worker_role: 'edge',
      route: '/mcp',
      tool: 'search_cases',
      duration_ms: 42,
    });
  });

  it('emits structured logs only when explicitly enabled', () => {
    const lines: string[] = [];
    const originalLog = console.log;
    console.log = (value?: unknown) => lines.push(String(value));
    try {
      const runtime = createCloudflareTelemetryRuntime();
      runtime.setCurrentEnv({ MCP_CF_STRUCTURED_LOGS_ENABLED: 'false' });
      runtime.recordRouteLatency('GET /health', 3);
      assert.equal(lines.length, 0);

      runtime.setCurrentEnv({ MCP_CF_STRUCTURED_LOGS_ENABLED: 'true' });
      runtime.recordRouteLatency('GET /health', 4);
      assert.equal(lines.length, 1);
      assert.equal(JSON.parse(lines[0]).event, 'route_latency');
    } finally {
      console.log = originalLog;
    }
  });
});
