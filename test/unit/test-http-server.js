#!/usr/bin/env node

/**
 * Unit tests for the enhanced HTTP HealthServer.
 * Covers /health, /metrics, and 404 handling.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Import compiled JS artifacts
const { HealthServer } = await import('../../dist/http-server.js');
const { Logger } = await import('../../dist/infrastructure/logger.js');
const { MetricsCollector } = await import('../../dist/infrastructure/metrics.js');
const { CacheManager } = await import('../../dist/infrastructure/cache.js');

// Simple helpers
function getFreePort(server) {
  const address = server.address();
  if (typeof address === 'object' && address && 'port' in address) return address.port;
  throw new Error('Unable to determine dynamic port');
}

describe('HealthServer endpoints', () => {
  let logger;
  let metrics;
  let cache;
  let server;
  let baseUrl;

  before(async () => {
    logger = new Logger('test');
    metrics = new MetricsCollector(logger);
    cache = new CacheManager({ enabled: true, ttl: 60, maxSize: 10 }, logger);
    server = new HealthServer(0, logger, metrics, cache);
    await server.start();
    const port = getFreePort(server['server']);
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    if (server) await server.stop();
    if (cache && typeof cache.destroy === 'function') cache.destroy();
  });

  it('GET /health returns 200 with status and timestamp', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.status === 'healthy' || data.status === 'warning' || data.status === 'unhealthy');
    assert.ok(typeof data.timestamp === 'string');
    assert.ok(data.cache_stats);
  });

  it('GET /metrics returns 200 and includes metrics and cache_stats', async () => {
    const res = await fetch(`${baseUrl}/metrics`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.metrics);
    assert.ok(data.cache_stats);
  });

  it('GET /unknown returns 404 with available_endpoints', async () => {
    const res = await fetch(`${baseUrl}/not-a-real-route`);
    assert.equal(res.status, 404);
    const data = await res.json();
    assert.ok(Array.isArray(data.available_endpoints));
  });

  it('GET /cache returns cache stats', async () => {
    const res = await fetch(`${baseUrl}/cache`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(typeof data.totalEntries === 'number');
    assert.ok(typeof data.validEntries === 'number');
    assert.ok(typeof data.expiredEntries === 'number');
    assert.ok(typeof data.maxSize === 'number');
    assert.ok(typeof data.enabled === 'boolean');
    assert.ok(typeof data.ttl === 'number');
  });

  it('GET /config returns config summary', async () => {
    const res = await fetch(`${baseUrl}/config`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.timestamp);
    assert.ok(data.features);
  });

  it('GET /circuit-breakers returns disabled when no manager provided', async () => {
    const res = await fetch(`${baseUrl}/circuit-breakers`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.enabled, false);
  });

  it('GET /security returns security status', async () => {
    const res = await fetch(`${baseUrl}/security`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.security_features);
    assert.ok(data.security_config);
  });
});
