#!/usr/bin/env node

/**
 * Unit tests for Cloudflare Worker SSE rate limiting logic.
 * These tests exercise the exported default.fetch with env bridging for limits
 * and validate that exceeding per-IP and total limits results in 429.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Import the worker module (compiled JS) to access default export
const worker = await import('../../dist/worker.js');

function mockRequest(path, opts = {}) {
  const url = `https://example.com${path}`;
  const headers = new Headers(opts.headers || {});
  return new Request(url, { method: opts.method || 'GET', headers });
}

function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

describe('Worker SSE rate limiting', () => {
  it('should enforce per-IP and total limits with 429 Too Many Connections', async () => {
    const env = {
      MAX_SSE_CONNECTIONS: '1',
      MAX_SSE_CONNECTIONS_PER_IP: '1',
      // disable auth for test simplicity
      SSE_AUTH_TOKEN: undefined,
      OIDC_ISSUER: undefined
    };

    // First connection should succeed (SSE stream)
    const req1 = mockRequest('/sse', { headers: { 'cf-connecting-ip': '1.2.3.4' } });
    const res1 = await worker.default.fetch(req1, env, {});
    assert.equal(res1.status, 200, 'first SSE should be accepted');

    // Second connection from same IP should be rejected due to per-IP limit
    const req2 = mockRequest('/sse', { headers: { 'cf-connecting-ip': '1.2.3.4' } });
    const res2 = await worker.default.fetch(req2, env, {});
    assert.equal(res2.status, 429, 'second SSE from same IP should be limited');
    assert.equal(res2.headers.get('Retry-After'), '30');

    // Close the first stream by canceling its body (simulate client disconnect)
    const reader = res1.body.getReader();
    reader.cancel();

    // Give the worker a tick to update counters
    await delay(10);

    // Now a new connection should succeed again
    const res3 = await worker.default.fetch(
      mockRequest('/sse', { headers: { 'cf-connecting-ip': '1.2.3.4' } }),
      env,
      {}
    );
    assert.equal(res3.status, 200, 'SSE should be accepted after prior stream closed');

    // Clean up
    res3.body.getReader().cancel();
  });

  it('should require static token when configured and reject missing/invalid tokens', async () => {
    const env = {
      SSE_AUTH_TOKEN: 'secret',
      OIDC_ISSUER: undefined
    };

    // Missing token -> 401
    const resMissing = await worker.default.fetch(
      mockRequest('/sse', { headers: { 'cf-connecting-ip': '5.6.7.8' } }),
      env,
      {}
    );
    assert.equal(resMissing.status, 401);

    // Wrong token -> 401
    const resWrong = await worker.default.fetch(
      mockRequest('/sse?access_token=wrong', { headers: { 'cf-connecting-ip': '5.6.7.8' } }),
      env,
      {}
    );
    assert.equal(resWrong.status, 401);

    // Correct token via header -> 200
    const resOk = await worker.default.fetch(
      mockRequest('/sse', { headers: { 'cf-connecting-ip': '5.6.7.8', authorization: 'Bearer secret' } }),
      env,
      {}
    );
    assert.equal(resOk.status, 200);
    resOk.body.getReader().cancel();
  });
});
