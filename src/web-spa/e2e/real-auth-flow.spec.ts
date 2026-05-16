import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test, type Page } from 'playwright/test';
import { startLocalAuthFlowServer } from './support/local-auth-flow-server';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

test.describe('SPA real auth flow', () => {
  let server: Awaited<ReturnType<typeof startLocalAuthFlowServer>>;
  let externalCallbackServer: Awaited<ReturnType<typeof startExternalCallbackServer>>;

  test.beforeAll(async () => {
    server = await startLocalAuthFlowServer();
    externalCallbackServer = await startExternalCallbackServer();
  });

  test.afterAll(async () => {
    await server.close();
    await externalCallbackServer.close();
  });

  async function startExternalCallbackServer(): Promise<{
    baseUrl: string;
    close: () => Promise<void>;
  }> {
    const callbackServer = http.createServer((request, response) => {
      const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
      const code = escapeHtml(requestUrl.searchParams.get('code') || '');
      const state = escapeHtml(requestUrl.searchParams.get('state') || '');
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(
        `<html><body><h1>External authorization completed</h1><p>code=${code}</p><p>state=${state}</p></body></html>`,
      );
    });

    await new Promise<void>((resolve, reject) => {
      callbackServer.once('error', reject);
      callbackServer.listen(0, '127.0.0.1', () => {
        callbackServer.off('error', reject);
        resolve();
      });
    });

    const address = callbackServer.address() as AddressInfo;
    return {
      baseUrl: `http://127.0.0.1:${address.port}`,
      close: async () => {
        await new Promise<void>((resolve, reject) => {
          callbackServer.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });
      },
    };
  }

  async function bootstrapSession(page: Page): Promise<void> {
    await page.goto(`${server.baseUrl}/app/control-center`);

    const bootstrapResult = await page.evaluate(async () => {
      const response = await fetch('/api/session/bootstrap', {
        method: 'POST',
        headers: {
          authorization: 'Bearer header.payload.signature',
          'cf-turnstile-response': 'test-turnstile-token',
        },
        credentials: 'same-origin',
      });
      return {
        status: response.status,
        body: await response.json(),
      };
    });

    expect(bootstrapResult).toEqual({
      status: 200,
      body: {
        ok: true,
        userId: 'operator-real',
        expiresInSeconds: 43200,
      },
    });
  }

  test('redirects /app/login into the real /auth/start handoff route', async ({ page }) => {
    await page.goto(`${server.baseUrl}/app/login`);

    await expect.poll(() => new URL(page.url()).pathname).toBe('/auth/start');
  });

  test('bootstraps a real UI session and logs out through the worker route', async ({ page }) => {
    await bootstrapSession(page);

    await page.goto(`${server.baseUrl}/app/account`);

    await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Account access', level: 2 })).toBeVisible();
    await expect(page.getByText('operator-real').first()).toBeVisible();
    await expect(page.getByText('Signed in', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();

    await expect(page).toHaveURL(/\/app\/account$/);
    await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible();
    await expect(page.getByText('Sign in required')).toBeVisible();
    await expect(page.getByText('Signed out', { exact: true })).toBeVisible();

    const sessionSnapshot = await page.evaluate(async () => {
      const response = await fetch('/api/session', { credentials: 'same-origin' });
      return response.json();
    });
    expect(sessionSnapshot).toMatchObject({
      authenticated: false,
      user: null,
    });

    const cookies = await page.context().cookies(server.baseUrl);
    expect(cookies.some((cookie) => cookie.name === 'clmcp_ui')).toBe(false);
    expect(cookies.some((cookie) => cookie.name === 'clmcp_ui_present')).toBe(false);
    expect(cookies.some((cookie) => cookie.name === 'clmcp_csrf')).toBe(false);
  });

  test('requires explicit approval before completing OAuth for a signed-in browser session', async ({
    page,
  }) => {
    await bootstrapSession(page);

    const authorizeUrl = new URL('/oauth/authorize', server.baseUrl);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', 'client-1');
    authorizeUrl.searchParams.set('redirect_uri', `${server.baseUrl}/client/callback`);
    authorizeUrl.searchParams.set('state', 'state-1');
    authorizeUrl.searchParams.set('scope', 'legal:read legal:search');
    authorizeUrl.searchParams.set('code_challenge', 'challenge');
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');

    await page.goto(authorizeUrl.toString());

    await expect(page.getByRole('heading', { name: 'Approve OAuth access' })).toBeVisible();
    await expect(page.getByText('client-1')).toBeVisible();
    await expect(page.getByText('legal:read')).toBeVisible();
    await expect(page.getByText('legal:search')).toBeVisible();

    await page.getByRole('button', { name: 'Approve and continue' }).click();

    await page.waitForURL(/\/client\/callback\?/);
    await expect(page.getByRole('heading', { name: 'Authorization completed' })).toBeVisible();

    const callbackUrl = new URL(page.url());
    expect(callbackUrl.pathname).toBe('/client/callback');
    expect(callbackUrl.searchParams.get('code')).toBe('local-auth-code');
    expect(callbackUrl.searchParams.get('state')).toBe('state-1');
  });

  test('allows approval to complete against a loopback callback origin', async ({ page }) => {
    await bootstrapSession(page);

    const authorizeUrl = new URL('/oauth/authorize', server.baseUrl);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', 'client-loopback');
    authorizeUrl.searchParams.set('redirect_uri', `${externalCallbackServer.baseUrl}/callback`);
    authorizeUrl.searchParams.set('state', 'state-loopback');
    authorizeUrl.searchParams.set('scope', 'legal:read legal:search');
    authorizeUrl.searchParams.set('code_challenge', 'challenge');
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');

    await page.goto(authorizeUrl.toString());

    await expect(page.getByRole('heading', { name: 'Approve OAuth access' })).toBeVisible();
    await page.getByRole('button', { name: 'Approve and continue' }).click();

    await page.waitForURL(
      new RegExp(
        `${externalCallbackServer.baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/callback\\?`,
      ),
    );
    await expect(
      page.getByRole('heading', { name: 'External authorization completed' }),
    ).toBeVisible();

    const callbackUrl = new URL(page.url());
    expect(callbackUrl.origin).toBe(externalCallbackServer.baseUrl);
    expect(callbackUrl.pathname).toBe('/callback');
    expect(callbackUrl.searchParams.get('code')).toBe('local-auth-code');
    expect(callbackUrl.searchParams.get('state')).toBe('state-loopback');
  });
});
