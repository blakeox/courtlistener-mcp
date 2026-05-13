import { expect, test } from 'playwright/test';
import { installSpaMocks, seedBrowserToken } from './support/mock-backend';

test.describe('SPA session recovery failures', () => {
  test('surfaces session endpoint failures without redirecting away from control center', async ({
    page,
  }) => {
    await installSpaMocks(page, {
      sessionFailure: {
        status: 503,
        body: {
          error: 'session_unavailable',
          message: 'Session service temporarily unavailable.',
        },
      },
    });

    await page.goto('/app/control-center');

    await expect(page).toHaveURL(/\/app\/control-center$/);
    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
    await expect(page.getByText('Session service temporarily unavailable.')).toBeVisible();
    await expect(page.getByText('Session not loaded')).toBeVisible();
  });

  test('surfaces MCP runtime failures when a local credential is present', async ({ page }) => {
    await seedBrowserToken(page, 'session-token-e2e');
    await installSpaMocks(page, {
      session: {
        authenticated: true,
        user: { id: 'operator-5' },
        turnstile_site_key: '',
      },
      runtime: {
        sessionId: 'runtime-session',
      },
      runtimeFailures: {
        initialize: {
          status: 503,
          body: {
            error: 'runtime_down',
            message: 'MCP runtime temporarily unavailable.',
          },
        },
      },
    });

    await page.goto('/app/control-center');

    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
    await expect(page.locator('strong').filter({ hasText: 'Runtime check failed' })).toBeVisible();
    await expect(page.getByText('MCP runtime temporarily unavailable.')).toBeVisible();
  });

  test('preserves local credential and keeps the operator on the current page when topbar logout fails', async ({
    page,
  }) => {
    await seedBrowserToken(page, 'session-token-e2e');
    await installSpaMocks(page, {
      session: {
        authenticated: true,
        user: { id: 'operator-6' },
        turnstile_site_key: '',
      },
      logoutFailure: {
        status: 503,
        body: {
          error: 'logout_unavailable',
          message: 'Logout endpoint unavailable.',
        },
      },
    });

    await page.goto('/app/account');
    await page.getByRole('button', { name: 'Sign out' }).click();

    await expect(page).toHaveURL(/\/app\/account$/);
    await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Account access', level: 2 })).toBeVisible();
    await expect(page.getByText('Sign out failed — browser access is still active.')).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(() => ({
          local: window.localStorage.getItem('courtlistenerMcpApiToken'),
          session: window.sessionStorage.getItem('courtlistenerMcpApiTokenSession'),
        })),
      )
      .toEqual({ local: null, session: 'session-token-e2e' });
  });
});
