import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { handleWorkerUiShellRoutes } from '../../src/server/worker-ui-shell-routes.js';

function createDeps() {
  return {
    spaBuildId: 'build-1',
    jsonError: (message: string, status: number, errorCode: string) =>
      Response.json({ error: message, error_code: errorCode }, { status }),
    fetchSpaAsset: async (request: Request, _env: Record<string, never>) => {
      const path = new URL(request.url).pathname;
      if (path.endsWith('spa.js')) {
        return new Response('console.log("ok")', { status: 200 });
      }
      if (path.endsWith('spa.css')) {
        return new Response('body{}', { status: 200 });
      }
      return new Response('not found', { status: 404 });
    },
    spaAssetResponse: (assetResponse: Response, contentType?: string) =>
      new Response(assetResponse.body, {
        status: assetResponse.status,
        ...(contentType ? { headers: { 'content-type': contentType } } : {}),
      }),
    generateCspNonce: () => 'nonce',
    getOrCreateCsrfCookieHeader: () => 'csrf=1',
    htmlResponse: (html: string, _nonce?: string, extraHeaders?: HeadersInit) => {
      const headers = new Headers(extraHeaders);
      return new Response(html, { status: 200, headers });
    },
    renderSpaShellHtml: (buildId?: string) =>
      buildId ? `<html><body>landing ${buildId}</body></html>` : '<html></html>',
    redirectResponse: (location: string, status?: number, extraHeaders?: HeadersInit) => {
      const headers = new Headers(extraHeaders);
      headers.set('Location', location);
      return new Response(null, { status, headers });
    },
  };
}

describe('handleWorkerUiShellRoutes', () => {
  it('serves bundled SPA assets', async () => {
    const response = await handleWorkerUiShellRoutes({
      request: new Request('https://example.com/app/assets/spa.js', { method: 'GET' }),
      url: new URL('https://example.com/app/assets/spa.js'),
      env: {},
      deps: {
        ...createDeps(),
        getOrCreateCsrfCookieHeader: () => null,
        htmlResponse: (html: string) => new Response(html, { status: 200 }),
      },
    });

    assert.equal(response?.status, 200);
    assert.equal(await response?.text(), 'console.log("ok")');
  });

  it('serves the SPA shell for the public landing page route', async () => {
    const response = await handleWorkerUiShellRoutes({
      request: new Request('https://example.com/', { method: 'GET' }),
      url: new URL('https://example.com/'),
      env: {},
      deps: createDeps(),
    });

    assert.equal(response?.status, 200);
    assert.equal(await response?.text(), '<html><body>landing build-1</body></html>');
    assert.match(response?.headers.get('Set-Cookie') ?? '', /csrf=1/);
  });

  it('redirects legacy UI paths to /app routes', async () => {
    const response = await handleWorkerUiShellRoutes({
      request: new Request('https://example.com/login', { method: 'GET' }),
      url: new URL('https://example.com/login'),
      env: {},
      deps: {
        ...createDeps(),
        htmlResponse: (html: string) => new Response(html, { status: 200 }),
        renderSpaShellHtml: () => '<html></html>',
      },
    });

    assert.equal(response?.status, 302);
    assert.equal(response?.headers.get('Location'), 'https://example.com/app/login');
    assert.match(response?.headers.get('Set-Cookie') ?? '', /csrf=1/);
  });

  for (const alias of ['/oidc', '/oidc/', '/signin', '/sign-in']) {
    it(`redirects ${alias} to the hosted auth start flow`, async () => {
      const response = await handleWorkerUiShellRoutes({
        request: new Request(`https://example.com${alias}`, { method: 'GET' }),
        url: new URL(`https://example.com${alias}`),
        env: {},
        deps: {
          ...createDeps(),
          htmlResponse: (html: string) => new Response(html, { status: 200 }),
          renderSpaShellHtml: () => '<html></html>',
        },
      });

      assert.equal(response?.status, 302);
      assert.equal(
        response?.headers.get('Location'),
        'https://example.com/auth/start?return_to=%2Fapp%2Faccount',
      );
      assert.match(response?.headers.get('Set-Cookie') ?? '', /csrf=1/);
    });
  }
});
