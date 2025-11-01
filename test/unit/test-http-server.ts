#!/usr/bin/env node

/**
 * ✅ COMPREHENSIVE Unit Tests for HTTP Health Server (TypeScript)
 * Tests health endpoints, metrics endpoints, and error handling
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Logger } from '../../src/infrastructure/logger.js';
import type { MetricsCollector } from '../../src/infrastructure/metrics.js';
import type { CacheManager } from '../../src/infrastructure/cache.js';

// Import compiled JS artifacts
const { HealthServer } = await import('../../dist/http-server.js');
const { Logger: LoggerClass } = await import('../../dist/infrastructure/logger.js');
const { MetricsCollector: MetricsCollectorClass } = await import('../../dist/infrastructure/metrics.js');
const { CacheManager: CacheManagerClass } = await import('../../dist/infrastructure/cache.js');

// Simple helpers
function getFreePort(server: { address: () => { port: number } | null | string }): number {
  const address = server.address();
  if (typeof address === 'object' && address !== null && 'port' in address) {
    return address.port;
  }
  throw new Error('Unable to determine dynamic port');
}

interface HealthServerInstance {
  server: { address: () => { port: number } | null | string };
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

describe('HealthServer endpoints (TypeScript)', () => {
  let logger: Logger;
  let metrics: MetricsCollector;
  let cache: CacheManager;
  let server: HealthServerInstance;
  let baseUrl: string;

  before(async () => {
    logger = new LoggerClass({ level: 'error', format: 'json', enabled: false }, 'test');
    metrics = new MetricsCollectorClass(logger);
    cache = new CacheManagerClass(
      { enabled: true, ttl: 60, maxSize: 10 },
      logger
    );
    server = new HealthServer(0, logger, metrics, cache) as HealthServerInstance;
    await server.start();
    const port = getFreePort(server.server);
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    if (server) {
      await server.stop();
    }
    if (cache && typeof (cache as { destroy?: () => void }).destroy === 'function') {
      (cache as { destroy: () => void }).destroy();
    }
  });

  it('GET /health returns 200 with status and timestamp', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      status: string;
      timestamp: string;
      cache_stats?: unknown;
    };
    assert.ok(
      data.status === 'healthy' ||
        data.status === 'warning' ||
        data.status === 'unhealthy'
    );
    assert.ok(typeof data.timestamp === 'string');
    assert.ok(data.cache_stats !== undefined);
  });

  it('GET /metrics returns 200 and includes metrics and cache_stats', async () => {
    const res = await fetch(`${baseUrl}/metrics`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      metrics?: unknown;
      cache_stats?: unknown;
    };
    assert.ok(data.metrics !== undefined);
    assert.ok(data.cache_stats !== undefined);
  });

  it('GET /unknown returns 404 with available_endpoints', async () => {
    const res = await fetch(`${baseUrl}/not-a-real-route`);
    assert.equal(res.status, 404);
    const data = (await res.json()) as {
      available_endpoints?: string[];
    };
    assert.ok(Array.isArray(data.available_endpoints));
  });

  it('GET /cache returns cache stats', async () => {
    const res = await fetch(`${baseUrl}/cache`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      totalEntries?: number;
      validEntries?: number;
      expiredEntries?: number;
      maxSize?: number;
      enabled?: boolean;
    };
    assert.ok(typeof data.totalEntries === 'number');
    assert.ok(typeof data.validEntries === 'number');
    assert.ok(typeof data.expiredEntries === 'number');
    assert.ok(typeof data.maxSize === 'number');
    assert.ok(typeof data.enabled === 'boolean');
  });

  it('responds to HEAD requests on /health', async () => {
    const res = await fetch(`${baseUrl}/health`, { method: 'HEAD' });
    assert.equal(res.status, 200);
  });

  it('GET /config returns config summary', async () => {
    const res = await fetch(`${baseUrl}/config`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      timestamp?: string;
      features?: unknown;
    };
    assert.ok(data.timestamp !== undefined);
    assert.ok(data.features !== undefined);
  });

  it('GET /circuit-breakers returns status', async () => {
    const res = await fetch(`${baseUrl}/circuit-breakers`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      enabled?: boolean;
      [key: string]: unknown;
    };
    assert.ok(typeof data.enabled === 'boolean');
  });

  it('GET /security returns security status', async () => {
    const res = await fetch(`${baseUrl}/security`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      security_features?: unknown;
      security_config?: unknown;
    };
    assert.ok(data.security_features !== undefined);
    assert.ok(data.security_config !== undefined);
  });
});

