#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildCorsHeaders,
  generateCspNonce,
  htmlResponse,
  jsonError,
  jsonResponse,
  redirectResponse,
  spaAssetResponse,
  withCors,
} from '../../src/server/worker-response-runtime.js';

describe('worker response runtime', () => {
  it('applies secure headers to JSON responses', async () => {
    const response = jsonResponse({ ok: true });
    const payload = (await response.json()) as Record<string, unknown>;

    assert.equal(payload.ok, true);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'self'/);
  });

  it('builds structured JSON errors', async () => {
    const response = jsonError('Denied', 403, 'forbidden_origin', { detail: 'bad-origin' });
    const payload = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 403);
    assert.equal(payload.error, 'Denied');
    assert.equal(payload.error_code, 'forbidden_origin');
    assert.equal(payload.detail, 'bad-origin');
  });

  it('adds nonce-aware CSP to HTML responses', async () => {
    const nonce = generateCspNonce();
    const response = htmlResponse('<html></html>', nonce);

    assert.equal(response.status, 200);
    assert.ok((response.headers.get('content-security-policy') ?? '').includes(`nonce-${nonce}`));
  });

  it('preserves redirect location and security headers', () => {
    const response = redirectResponse('https://example.com/app', 302);

    assert.equal(response.headers.get('location'), 'https://example.com/app');
    assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains; preload');
  });

  it('applies CORS and security headers when wrapping responses', () => {
    const response = withCors(
      new Response('ok', { status: 200 }),
      'https://auth.courtlistenermcp.blakeoxford.com',
      ['https://auth.courtlistenermcp.blakeoxford.com'],
    );

    assert.equal(response.headers.get('access-control-allow-origin'), 'https://auth.courtlistenermcp.blakeoxford.com');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  });

  it('builds SPA asset responses with cache metadata', () => {
    const response = spaAssetResponse('body{}', 'text/css; charset=utf-8', 'build-7');

    assert.equal(response.headers.get('etag'), '"build-7"');
    assert.equal(response.headers.get('cache-control'), 'public, max-age=300');
  });

  it('builds MCP CORS headers through the shared transport helper', () => {
    const headers = buildCorsHeaders('https://chatgpt.com', ['https://chatgpt.com']);
    assert.equal(headers.get('access-control-allow-origin'), 'https://chatgpt.com');
  });
});
