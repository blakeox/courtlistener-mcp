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
import { installNodeWebCryptoForTests } from '../utils/node-webcrypto.ts';

installNodeWebCryptoForTests();

function withoutSetCookieAccessors(headers: Headers): Headers {
  Object.defineProperty(headers, 'getSetCookie', {
    value: undefined,
    configurable: true,
  });
  Object.defineProperty(headers, 'raw', {
    value: undefined,
    configurable: true,
  });
  return headers;
}

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

  it('allows explicit callback origins in HTML form-action CSP', () => {
    const response = htmlResponse('<html></html>', 'nonce', undefined, {
      formActionOrigins: ['http://127.0.0.1:59547/callback', 'https://chatgpt.com/oauth/callback'],
    });

    assert.match(
      response.headers.get('content-security-policy') ?? '',
      /form-action 'self' http:\/\/127\.0\.0\.1:59547 https:\/\/chatgpt\.com/,
    );
  });

  it('omits form-action when requested for hosted auth HTML', () => {
    const response = htmlResponse('<html></html>', 'nonce', undefined, {
      omitFormAction: true,
      allowHostedAuthInlineScriptHashes: true,
    });

    const csp = response.headers.get('content-security-policy') ?? '';
    assert.doesNotMatch(csp, /form-action/);
    assert.match(csp, /sha256-CsRg1c\/uAShTQr6MSbfT26yXsxtsm7ZpMgc41yupCOo=/);
  });

  it('ignores opaque and custom-scheme origins in HTML form-action CSP', () => {
    const response = htmlResponse('<html></html>', 'nonce', undefined, {
      formActionOrigins: [
        'null',
        'cursor://anysphere.cursor-mcp/oauth/callback',
        'https://worker.example',
      ],
    });

    const csp = response.headers.get('content-security-policy') ?? '';
    assert.match(csp, /form-action 'self' https:\/\/worker\.example/);
    assert.doesNotMatch(csp, /cursor:/);
    assert.doesNotMatch(csp, /\bnull\b/);
  });

  it('preserves multiple Set-Cookie headers passed into HTML responses', () => {
    const extraHeaders = new Headers();
    extraHeaders.append('Set-Cookie', 'first=value-1; Path=/; HttpOnly');
    extraHeaders.append('Set-Cookie', 'second=value-2; Path=/; HttpOnly');

    const response = htmlResponse('<html></html>', 'nonce', extraHeaders);
    const cookies = response.headers.getSetCookie();

    assert.equal(cookies.length, 2);
    assert.equal(cookies[0], 'first=value-1; Path=/; HttpOnly');
    assert.equal(cookies[1], 'second=value-2; Path=/; HttpOnly');
  });

  it('preserves a single Set-Cookie header without getSetCookie support', () => {
    const extraHeaders = withoutSetCookieAccessors(
      new Headers({
        'Set-Cookie': 'session=value-1; Expires=Wed, 09 Jun 2027 10:18:14 GMT; Path=/; HttpOnly',
      }),
    );

    const response = htmlResponse('<html></html>', 'nonce', extraHeaders);
    const cookies = response.headers.getSetCookie();

    assert.deepEqual(cookies, [
      'session=value-1; Expires=Wed, 09 Jun 2027 10:18:14 GMT; Path=/; HttpOnly',
    ]);
  });

  it('throws when multiple Set-Cookie headers cannot be represented safely', () => {
    const extraHeaders = withoutSetCookieAccessors(new Headers());
    extraHeaders.append('Set-Cookie', 'first=value-1; Path=/; HttpOnly');
    extraHeaders.append('Set-Cookie', 'second=value-2; Path=/; HttpOnly');

    assert.throws(
      () => htmlResponse('<html></html>', 'nonce', extraHeaders),
      /requires a runtime with Headers\.getSetCookie\(\) or another raw Set-Cookie accessor/,
    );
  });

  it('preserves redirect location and security headers', () => {
    const response = redirectResponse('https://example.com/app', 302);

    assert.equal(response.headers.get('location'), 'https://example.com/app');
    assert.equal(
      response.headers.get('strict-transport-security'),
      'max-age=31536000; includeSubDomains; preload',
    );
  });

  it('applies CORS and security headers when wrapping responses', () => {
    const response = withCors(
      new Response('ok', { status: 200 }),
      'https://auth.courtlistenermcp.blakeoxford.com',
      ['https://auth.courtlistenermcp.blakeoxford.com'],
    );

    assert.equal(
      response.headers.get('access-control-allow-origin'),
      'https://auth.courtlistenermcp.blakeoxford.com',
    );
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  });

  it('builds SPA asset responses with cache metadata', async () => {
    const asset = new Response('body{}', { status: 200 });
    const response = spaAssetResponse(asset, 'text/css; charset=utf-8', 'build-7');

    assert.equal(await response.text(), 'body{}');
    assert.equal(response.headers.get('etag'), '"build-7"');
    assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  });

  it('does not cache missing SPA assets', () => {
    const response = spaAssetResponse(
      new Response('missing', { status: 404 }),
      'text/css; charset=utf-8',
      'build-7',
    );

    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('etag'), null);
  });

  it('builds MCP CORS headers through the shared transport helper', () => {
    const headers = buildCorsHeaders('https://chatgpt.com', ['https://chatgpt.com']);
    assert.equal(headers.get('access-control-allow-origin'), 'https://chatgpt.com');
  });
});
