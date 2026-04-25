#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  WORKER_DO_OUTLIER_MIN_SAMPLES,
  WORKER_DO_OUTLIER_SCORE_THRESHOLD,
  WORKER_EXPORT_TOP_SLOW_OPERATION_LIMIT,
  WORKER_ROUTE_LATENCY_MAX_ROUTES,
  WORKER_ROUTE_LATENCY_OVERFLOW_ROUTE,
} from '../../src/server/worker-runtime-contract.js';
import { createWorkerObservabilityRuntime } from '../../src/server/worker-observability-runtime.js';

function createRuntime() {
  return createWorkerObservabilityRuntime({
    routeLatencyMaxRoutes: WORKER_ROUTE_LATENCY_MAX_ROUTES,
    routeLatencyOverflowRoute: WORKER_ROUTE_LATENCY_OVERFLOW_ROUTE,
    exportTopSlowOperationLimit: WORKER_EXPORT_TOP_SLOW_OPERATION_LIMIT,
    doOutlierScoreThreshold: WORKER_DO_OUTLIER_SCORE_THRESHOLD,
    doOutlierMinSamples: WORKER_DO_OUTLIER_MIN_SAMPLES,
    resolveWorkerMcpSessionTopologyV2: () => ({
      version: 'v2',
      shardCount: 16,
      idleTtlMs: 1800,
      absoluteTtlMs: 86400,
      evictionSweepLimit: 64,
    }),
  });
}

describe('worker observability runtime', () => {
  it('derives a client identifier from CF and forwarded IP headers', () => {
    const runtime = createRuntime();

    assert.equal(
      runtime.getClientIdentifier(
        new Request('https://worker.example', { headers: { 'CF-Connecting-IP': '1.2.3.4' } }),
      ),
      '1.2.3.4',
    );
    assert.equal(
      runtime.getClientIdentifier(
        new Request('https://worker.example', {
          headers: { 'X-Forwarded-For': '5.6.7.8, 9.9.9.9' },
        }),
      ),
      '5.6.7.8',
    );
  });

  it('normalizes route metric keys and caps route cardinality with an overflow bucket', () => {
    const runtime = createRuntime();

    assert.equal(
      runtime.buildWorkerRouteMetricKey(
        'post',
        '/api/123/item/550e8400-e29b-41d4-a716-446655440000',
      ),
      'POST /api/:id/item/:uuid',
    );

    for (let i = 0; i < 80; i += 1) {
      runtime.recordRouteLatency(`GET /route-${i}`, i + 1);
    }

    const snapshot = runtime.getWorkerLatencySnapshot();
    const routeKeys = Object.keys(snapshot.routes);

    assert.ok(routeKeys.length <= WORKER_ROUTE_LATENCY_MAX_ROUTES);
    assert.ok(routeKeys.includes(WORKER_ROUTE_LATENCY_OVERFLOW_ROUTE));
  });

  it('caches session topology and allowed origins', () => {
    const runtime = createRuntime();
    const env = {
      MCP_SESSION_SHARD_COUNT: '16',
      MCP_SESSION_IDLE_TTL_SECONDS: '1800',
      MCP_SESSION_ABSOLUTE_TTL_SECONDS: '86400',
      MCP_SESSION_EVICTION_SWEEP_LIMIT: '64',
    } as never;

    const firstTopology = runtime.getCachedSessionTopology(env);
    const secondTopology = runtime.getCachedSessionTopology(env);
    assert.equal(firstTopology, secondTopology);

    const origins = runtime.getCachedAllowedOrigins('https://chatgpt.com');
    assert.deepEqual(origins, ['https://chatgpt.com']);
    assert.equal(runtime.getCachedAllowedOrigins('https://chatgpt.com'), origins);
  });

  it('tracks DO unavailable counts for bounded health visibility', () => {
    const runtime = createRuntime();

    runtime.recordDurableObjectLatency('session_revocation', 12);
    runtime.recordDurableObjectUnavailable('session_revocation');
    runtime.recordDurableObjectLatency('mcp_session_lifecycle', 8);
    runtime.recordDurableObjectUnavailable('mcp_session_lifecycle');

    const snapshot = runtime.getWorkerLatencySnapshot();

    assert.deepEqual(Object.keys(snapshot.durable_objects).sort(), [
      'ai_chat_quota',
      'auth_limiter',
      'mcp_session_lifecycle',
      'session_revocation',
    ]);
    assert.equal(snapshot.durable_objects.session_revocation.unavailable_count, 1);
    assert.equal(snapshot.durable_objects.mcp_session_lifecycle.unavailable_count, 1);
    assert.equal(snapshot.durable_objects.ai_chat_quota.unavailable_count, 0);
  });
});
