#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PACKAGE_VERSION } from '../../src/infrastructure/package-version.js';
import {
  buildLocalStdioHealthPayload,
  buildRuntimeHealthCore,
  buildSharedRuntimeDiagnostics,
  extractRuntimeHealthCore,
  RUNTIME_HEALTH_SERVICE,
  validateRuntimeHealthExtendedPayload,
} from '../../src/infrastructure/runtime-health-contract.js';
import { buildWorkerHealthPayload } from '../../src/server/worker-health-runtime.js';

function buildTestLocalDiagnostics(
  overrides: Record<string, unknown> = {},
): Parameters<typeof buildLocalStdioHealthPayload>[0] {
  return {
    ...buildSharedRuntimeDiagnostics({}),
    ...overrides,
  };
}

describe('runtime health contract', () => {
  it('builds shared core fields for local stdio and worker payloads', () => {
    const localHealth = buildLocalStdioHealthPayload(
      buildTestLocalDiagnostics({ backpressure: { activeRequests: 0 } }),
    );
    const workerHealth = buildWorkerHealthPayload(
      { route_latency_ms: {} },
      {
        analyticsEnabled: true,
        asyncQueueConfigured: false,
        asyncJobsKvConfigured: true,
        turnstileEnforcedRoutes: [],
      },
    );

    assert.equal(localHealth.service, RUNTIME_HEALTH_SERVICE);
    assert.equal(localHealth.runtime, 'local-stdio');
    assert.equal(localHealth.transport, 'local-stdio');
    assert.equal(localHealth.version, PACKAGE_VERSION);
    assert.ok(Date.parse(localHealth.timestamp));
    assert.ok(localHealth.diagnostics.cloudflare);
    assert.ok(localHealth.diagnostics.metrics);

    assert.equal(workerHealth.service, RUNTIME_HEALTH_SERVICE);
    assert.equal(workerHealth.runtime, 'cloudflare-worker');
    assert.equal(workerHealth.transport, 'cloudflare-mcp-v2-streamable-http');
    assert.equal(workerHealth.version, PACKAGE_VERSION);
    assert.ok(Date.parse(workerHealth.timestamp));
    assert.ok(workerHealth.diagnostics.cloudflare);
    assert.ok(workerHealth.diagnostics.metrics);
  });

  it('extracts runtime health core from compatible payloads', () => {
    const core = buildRuntimeHealthCore('local-stdio', 'degraded');
    const extracted = extractRuntimeHealthCore(core as unknown as Record<string, unknown>);

    assert.deepEqual(extracted, core);
    assert.equal(extractRuntimeHealthCore({ status: 'ok' }), null);
  });

  it('preserves optional diagnostics on the local stdio contract', () => {
    const payload = buildLocalStdioHealthPayload(
      {
        ...buildSharedRuntimeDiagnostics({}),
        metrics_health: {
          status: 'warning',
          checks: { uptime: { status: 'pass', message: 'running' } },
          metrics: { uptime_seconds: 10 },
        },
        cache_stats: { enabled: true, totalEntries: 0 },
      },
      'degraded',
    );

    assert.equal(payload.status, 'degraded');
    assert.equal(payload.runtime, 'local-stdio');
    assert.equal(payload.transport, 'local-stdio');
    assert.equal(payload.service, RUNTIME_HEALTH_SERVICE);
    assert.equal((payload.diagnostics.metrics_health as { status: string }).status, 'warning');
    assert.deepEqual(payload.diagnostics.cache_stats, { enabled: true, totalEntries: 0 });
    assert.ok(payload.diagnostics.cloudflare);
    assert.ok(payload.diagnostics.metrics);
  });

  it('uses the same diagnostics sections across local and worker payloads', () => {
    const local = buildLocalStdioHealthPayload(
      buildTestLocalDiagnostics({ backpressure: { activeRequests: 0 } }),
    );
    const worker = buildWorkerHealthPayload(
      { route_latency_ms: {} },
      {
        analyticsEnabled: false,
        asyncQueueConfigured: false,
        asyncJobsKvConfigured: false,
        turnstileEnforcedRoutes: [],
      },
    );

    for (const payload of [local, worker]) {
      assert.equal(validateRuntimeHealthExtendedPayload(payload).ok, true);
      assert.ok(payload.diagnostics.cloudflare);
      assert.ok(payload.diagnostics.metrics);
    }

    assert.equal(local.transport, 'local-stdio');
    assert.equal(worker.transport, 'cloudflare-mcp-v2-streamable-http');
  });
});
