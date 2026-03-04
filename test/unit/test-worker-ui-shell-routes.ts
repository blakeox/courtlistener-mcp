import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { handleWorkerUiShellRoutes } from '../../src/server/worker-ui-shell-routes.js';

describe('handleWorkerUiShellRoutes', () => {
  it('serves bundled SPA assets', async () => {
    const response = await handleWorkerUiShellRoutes({
      request: new Request('https://example.com/app/assets/spa.js', { method: 'GET' }),
      url: new URL('https://example.com/app/assets/spa.js'),
      env: {},
      deps: {
        spaJs: 'console.log("ok")',
        spaCss: 'body{}',
        spaBuildId: 'build-1',
        jsonError: (message, status, errorCode) =>
          Response.json({ error: message, error_code: errorCode }, { status }),
        spaAssetResponse: (content, contentType) => new Response(content, { status: 200, headers: { 'content-type': contentType } }),
        generateCspNonce: () => 'nonce',
        getOrCreateCsrfCookieHeader: () => null,
        htmlResponse: (html) => new Response(html, { status: 200 }),
        renderSpaShellHtml: () => '<html></html>',
        redirectResponse: (location, status, extraHeaders) =>
          new Response(null, { status, headers: { Location: location, ...(extraHeaders as Record<string, string>) } }),
      },
    });

    assert.equal(response?.status, 200);
    assert.equal(await response?.text(), 'console.log("ok")');
  });

  it('redirects legacy UI paths to /app routes', async () => {
    const response = await handleWorkerUiShellRoutes({
      request: new Request('https://example.com/login', { method: 'GET' }),
      url: new URL('https://example.com/login'),
      env: {},
      deps: {
        spaJs: '',
        spaCss: '',
        spaBuildId: 'build-1',
        jsonError: (message, status, errorCode) =>
          Response.json({ error: message, error_code: errorCode }, { status }),
        spaAssetResponse: (content) => new Response(content, { status: 200 }),
        generateCspNonce: () => 'nonce',
        getOrCreateCsrfCookieHeader: () => 'csrf=1',
        htmlResponse: (html) => new Response(html, { status: 200 }),
        renderSpaShellHtml: () => '<html></html>',
        redirectResponse: (location, status, extraHeaders) => {
          const headers = new Headers(extraHeaders);
          headers.set('Location', location);
          return new Response(null, { status, headers });
        },
      },
    });

    assert.equal(response?.status, 302);
    assert.equal(response?.headers.get('Location'), 'https://example.com/app/login');
    assert.match(response?.headers.get('Set-Cookie') ?? '', /csrf=1/);
  });
});
