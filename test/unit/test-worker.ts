#!/usr/bin/env node
/// <reference types="node" />

/**
 * ✅ COMPREHENSIVE Unit Tests for Cloudflare Worker (TypeScript)
 * Tests SSE rate limiting logic and authentication
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

let worker: {
  default: { fetch: (request: Request, env: WorkerEnv, ctx: unknown) => Promise<Response> };
} | null = null;
try {
  // Import the worker module (compiled JS) to access default export
  worker = (await import('../../dist/worker.js')) as unknown as {
    default: { fetch: (request: Request, env: WorkerEnv, ctx: unknown) => Promise<Response> };
  };
} catch {
  worker = null;
}

interface WorkerEnv {
  MCP_OBJECT: unknown;
  MAX_SSE_CONNECTIONS?: string;
  MAX_SSE_CONNECTIONS_PER_IP?: string;
  SSE_AUTH_TOKEN?: string;
  OIDC_ISSUER?: string;
  [key: string]: unknown;
}

interface MockRequestOptions {
  method?: string;
  headers?: Record<string, string>;
}

function mockRequest(path: string, opts: MockRequestOptions = {}): Request {
  const url = `https://example.com${path}`;
  const headers = new Headers(opts.headers || {});
  return new Request(url, { method: opts.method || 'GET', headers });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Worker SSE rate limiting (TypeScript)', () => {
  if (!worker) {
    it('skips in Node runtime without cloudflare:* loader support', { skip: true }, () => {});
    return;
  }

  it('should enforce per-IP and total limits with 429 Too Many Connections', async () => {
    const env: WorkerEnv = {
      MCP_OBJECT: {},
      MAX_SSE_CONNECTIONS: '1',
      MAX_SSE_CONNECTIONS_PER_IP: '1',
    };

    // First connection should succeed (SSE stream)
    const req1 = mockRequest('/sse', {
      headers: { 'cf-connecting-ip': '1.2.3.4' },
    });
    const res1 = await worker.default.fetch(req1, env, {});
    assert.equal(res1.status, 200, 'first SSE should be accepted');

    // Second connection from same IP should be rejected due to per-IP limit
    const req2 = mockRequest('/sse', {
      headers: { 'cf-connecting-ip': '1.2.3.4' },
    });
    const res2 = await worker.default.fetch(req2, env, {});
    assert.equal(res2.status, 429, 'second SSE from same IP should be limited');
    assert.equal(res2.headers.get('Retry-After'), '30');

    // Close the first stream by canceling its body (simulate client disconnect)
    if (res1.body) {
      const reader = res1.body.getReader();
      reader.cancel();
    }

    // Give the worker a tick to update counters
    await delay(10);

    // Now a new connection should succeed again
    const res3 = await worker.default.fetch(
      mockRequest('/sse', { headers: { 'cf-connecting-ip': '1.2.3.4' } }),
      env,
      {},
    );
    assert.equal(res3.status, 200, 'SSE should be accepted after prior stream closed');

    // Clean up
    if (res3.body) {
      res3.body.getReader().cancel();
    }
  });

  it('should require static token when configured and reject missing/invalid tokens', async () => {
    const env: WorkerEnv = {
      MCP_OBJECT: {},
      SSE_AUTH_TOKEN: 'secret',
    };

    // Missing token -> 401
    const resMissing = await worker.default.fetch(
      mockRequest('/sse', { headers: { 'cf-connecting-ip': '5.6.7.8' } }),
      env,
      {},
    );
    assert.equal(resMissing.status, 401);

    // Wrong token -> 401
    const resWrong = await worker.default.fetch(
      mockRequest('/sse?access_token=wrong', {
        headers: { 'cf-connecting-ip': '5.6.7.8' },
      }),
      env,
      {},
    );
    assert.equal(resWrong.status, 401);

    // Correct token via header -> 200
    const resOk = await worker.default.fetch(
      mockRequest('/sse', {
        headers: {
          'cf-connecting-ip': '5.6.7.8',
          authorization: 'Bearer secret',
        },
      }),
      env,
      {},
    );
    assert.equal(resOk.status, 200);
    if (resOk.body) {
      resOk.body.getReader().cancel();
    }
  });
});
