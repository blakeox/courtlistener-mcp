import { expect, test, type Page } from 'playwright/test';
import { startLocalAuthFlowServer } from './support/local-auth-flow-server';

test.describe('SPA real auth flow', () => {
  let server: Awaited<ReturnType<typeof startLocalAuthFlowServer>>;

  test.beforeAll(async () => {
    server = await startLocalAuthFlowServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  async function bootstrapSession(page: Page): Promise<void> {
    await page.goto(`${server.baseUrl}/app/control-center`);

    const bootstrapResult = await page.evaluate(async () => {
      const response = await fetch('/api/session/bootstrap', {
        method: 'POST',
        headers: {
          authorization: 'Bearer header.payload.signature',
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

    await expect(page.getByRole('heading', { name: 'Operator Session', level: 2 })).toBeVisible();
    await expect(page.getByText('operator-real').first()).toBeVisible();
    await expect(page.getByText('yes (server)')).toBeVisible();

    await page.getByRole('button', { name: 'Log out' }).click();

    await expect(page).toHaveURL(/\/app\/control-center$/);
    await expect(
      page.getByRole('heading', { name: 'Sign in to continue', level: 2 }),
    ).toBeVisible();

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

    const authorizeUrl = new URL('/authorize', server.baseUrl);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', 'client-1');
    authorizeUrl.searchParams.set('redirect_uri', `${server.baseUrl}/client/callback`);
    authorizeUrl.searchParams.set('state', 'state-1');
    authorizeUrl.searchParams.set('scope', 'legal:read legal:search');
    authorizeUrl.searchParams.set('code_challenge', 'challenge');
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');

    await page.goto(authorizeUrl.toString());

    await page.waitForURL(/\/auth\/approve\?/);
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
});
