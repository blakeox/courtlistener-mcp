#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PACKAGE_VERSION } from '../../src/infrastructure/package-version.js';
import {
  buildNodeDiagnosticsHealthPayload,
  buildNodeStreamableHttpHealthPayload,
  buildRuntimeHealthCore,
  buildSharedRuntimeDiagnostics,
  extractRuntimeHealthCore,
  mapDiagnosticsMetricsHealthStatus,
  RUNTIME_HEALTH_SERVICE,
  validateRuntimeHealthExtendedPayload,
} from '../../src/infrastructure/runtime-health-contract.js';
import { buildWorkerHealthPayload } from '../../src/server/worker-health-runtime.js';

function buildTestStreamableDiagnostics(
  overrides: Record<string, unknown> = {},
): Parameters<typeof buildNodeStreamableHttpHealthPayload>[0] {
  return {
    ...buildSharedRuntimeDiagnostics({}),
    ...overrides,
  };
}

describe('runtime health contract', () => {
  it('builds shared core fields for node and worker payloads', () => {
    const nodeHealth = buildNodeStreamableHttpHealthPayload(
      buildTestStreamableDiagnostics({ backpressure: { activeRequests: 0 } }),
    );
    const workerHealth = buildWorkerHealthPayload(
      {
        version: 'v2',
        shardCount: 4,
        idleTtlMs: 1_800_000,
        absoluteTtlMs: 43_200_000,
        evictionSweepLimit: 100,
      },
      { route_latency_ms: {} },
      {
        analyticsEnabled: true,
        asyncQueueConfigured: false,
        asyncJobsKvConfigured: true,
        turnstileEnforcedRoutes: [],
      },
    );

    assert.equal(nodeHealth.service, RUNTIME_HEALTH_SERVICE);
    assert.equal(nodeHealth.runtime, 'node');
    assert.equal(nodeHealth.transport, 'streamable-http');
    assert.equal(nodeHealth.version, PACKAGE_VERSION);
    assert.ok(Date.parse(nodeHealth.timestamp));
    assert.ok(nodeHealth.diagnostics.session_topology);
    assert.ok(nodeHealth.diagnostics.cloudflare);
    assert.ok(nodeHealth.diagnostics.metrics);

    assert.equal(workerHealth.service, RUNTIME_HEALTH_SERVICE);
    assert.equal(workerHealth.runtime, 'cloudflare-worker');
    assert.equal(workerHealth.transport, 'cloudflare-agents-streamable-http');
    assert.equal(workerHealth.version, PACKAGE_VERSION);
    assert.ok(Date.parse(workerHealth.timestamp));
    assert.ok(workerHealth.diagnostics.session_topology);
    assert.ok(workerHealth.diagnostics.cloudflare);
    assert.ok(workerHealth.diagnostics.metrics);
  });

  it('extracts runtime health core from compatible payloads', () => {
    const core = buildRuntimeHealthCore('node', 'degraded');
    const extracted = extractRuntimeHealthCore(core as unknown as Record<string, unknown>);

    assert.deepEqual(extracted, core);
    assert.equal(extractRuntimeHealthCore({ status: 'ok' }), null);
  });

  it('maps diagnostics metrics health into the shared runtime contract', () => {
    assert.equal(mapDiagnosticsMetricsHealthStatus('healthy'), 'ok');
    assert.equal(mapDiagnosticsMetricsHealthStatus('warning'), 'degraded');
    assert.equal(mapDiagnosticsMetricsHealthStatus('critical'), 'unhealthy');

    const payload = buildNodeDiagnosticsHealthPayload(
      {
        status: 'warning',
        checks: {
          uptime: { status: 'pass', message: 'running' },
        },
        metrics: { uptime_seconds: 10 },
      },
      { enabled: true, totalEntries: 0 },
    );

    assert.equal(payload.status, 'degraded');
    assert.equal(payload.runtime, 'node');
    assert.equal(payload.transport, 'diagnostics-http');
    assert.equal(payload.service, RUNTIME_HEALTH_SERVICE);
    assert.equal(payload.diagnostics.metrics_health?.status, 'warning');
    assert.deepEqual(payload.diagnostics.cache_stats, { enabled: true, totalEntries: 0 });
    assert.ok(payload.diagnostics.session_topology);
    assert.ok(payload.diagnostics.cloudflare);
    assert.ok(payload.diagnostics.metrics);
  });

  it('uses the same diagnostics sections across streamable, diagnostics, and worker payloads', () => {
    const streamable = buildNodeStreamableHttpHealthPayload(
      buildTestStreamableDiagnostics({ backpressure: { activeRequests: 0 } }),
    );
    const diagnostics = buildNodeDiagnosticsHealthPayload(
      {
        status: 'healthy',
        checks: { uptime: { status: 'pass', message: 'running' } },
        metrics: { uptime_seconds: 10 },
      },
      { enabled: true, totalEntries: 0 },
    );
    const worker = buildWorkerHealthPayload(
      {
        version: 'v2',
        shardCount: 4,
        idleTtlMs: 1_800_000,
        absoluteTtlMs: 43_200_000,
        evictionSweepLimit: 100,
      },
      { route_latency_ms: {} },
      {
        analyticsEnabled: false,
        asyncQueueConfigured: false,
        asyncJobsKvConfigured: false,
        turnstileEnforcedRoutes: [],
      },
    );

    for (const payload of [streamable, diagnostics, worker]) {
      assert.equal(validateRuntimeHealthExtendedPayload(payload).ok, true);
      assert.ok(payload.diagnostics.session_topology);
      assert.ok(payload.diagnostics.cloudflare);
      assert.ok(payload.diagnostics.metrics);
    }

    assert.equal(streamable.transport, 'streamable-http');
    assert.equal(diagnostics.transport, 'diagnostics-http');
    assert.equal(worker.transport, 'cloudflare-agents-streamable-http');
  });
});
