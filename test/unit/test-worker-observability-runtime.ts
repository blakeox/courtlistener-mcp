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
        new Request('https://worker.example', { headers: { 'X-Forwarded-For': '5.6.7.8, 9.9.9.9' } }),
      ),
      '5.6.7.8',
    );
  });

  it('normalizes route metric keys and caps route cardinality with an overflow bucket', () => {
    const runtime = createRuntime();

    assert.equal(runtime.buildWorkerRouteMetricKey('post', '/api/123/item/550e8400-e29b-41d4-a716-446655440000'), 'POST /api/:id/item/:uuid');

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

    const origins = runtime.getCachedAllowedOrigins('https://chatgpt.com', 'https://auth.courtlistenermcp.blakeoxford.com');
    assert.deepEqual(origins, ['https://chatgpt.com', 'https://auth.courtlistenermcp.blakeoxford.com']);
    assert.equal(
      runtime.getCachedAllowedOrigins('https://chatgpt.com', 'https://auth.courtlistenermcp.blakeoxford.com'),
      origins,
    );
  });
});
