import { expect, test } from 'playwright/test';
import { installSpaMocks, seedBrowserToken } from './support/mock-backend';

test.describe('SPA operator console', () => {
  test('shows the hosted auth entrypoint when the operator is signed out', async ({ page }) => {
    await installSpaMocks(page, {
      session: {
        authenticated: false,
        user: null,
        turnstile_site_key: '',
      },
    });

    await page.goto('/app');

    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' }).first()).toHaveAttribute(
      'href',
      '/auth/start?return_to=%2Fapp',
    );
    await expect(page.getByText('Session not loaded')).toBeVisible();
    await expect(
      page.locator('strong').filter({ hasText: 'Browser credential not loaded' }),
    ).toBeVisible();
  });

  test('clears the session-recovery banner when the stored local credential is removed', async ({
    page,
  }) => {
    await seedBrowserToken(page, 'session-token-e2e');
    await installSpaMocks(page, {
      session: {
        authenticated: false,
        user: null,
        turnstile_site_key: '',
      },
    });

    await page.goto('/app');

    const recoveryBanner = page.getByRole('status').filter({
      hasText: 'Account recovery:',
    });
    await expect(recoveryBanner).toBeVisible();

    await recoveryBanner.getByRole('button', { name: 'Clear local credential' }).click();

    await expect(recoveryBanner).toHaveCount(0);
    await expect
      .poll(async () =>
        page.evaluate(() => ({
          local: window.localStorage.getItem('courtlistenerMcpApiToken'),
          session: window.sessionStorage.getItem('courtlistenerMcpApiTokenSession'),
        })),
      )
      .toEqual({ local: null, session: null });
  });

  test('renders runtime diagnostics for an authenticated operator and logs out cleanly', async ({
    page,
  }) => {
    await seedBrowserToken(page, 'session-token-e2e');
    await installSpaMocks(page, {
      session: {
        authenticated: true,
        user: { id: 'operator-1' },
        turnstile_site_key: '',
      },
      usage: {
        userId: 'operator-1',
        totalRequests: 17,
        dailyRequests: 4,
        currentDay: '2026-04-23',
        lastSeenAt: '2026-04-23T20:45:00.000Z',
        byRoute: {
          '/mcp': 11,
          '/api/session': 6,
        },
        browserBootstrap: {
          attempted: 2,
          succeeded: 1,
          failed: 1,
          turnstileRefreshed: 0,
          lastOutcome: 'success',
          lastEventAt: '2026-04-23T20:40:00.000Z',
        },
      },
      runtime: {
        tools: [
          {
            name: 'search_cases',
            description: 'Search legal cases',
            inputSchema: {
              type: 'object',
              required: ['query'],
              properties: {
                query: { type: 'string', minLength: 1 },
              },
            },
            metadata: { category: 'search' },
          },
          {
            name: 'get_docket',
            description: 'Fetch a docket by id',
            inputSchema: {
              type: 'object',
              required: ['docket_id'],
              properties: {
                docket_id: { type: 'string' },
              },
            },
            metadata: { category: 'dockets' },
          },
        ],
        categories: ['search', 'dockets'],
        resources: [
          {
            uri: 'courtlistener://status',
            name: 'status',
            description: 'Service status',
          },
        ],
        prompts: [
          {
            name: 'summarize_case',
            description: 'Summarize a case',
            arguments: [{ name: 'citation' }],
          },
        ],
      },
    });

    await page.goto('/app/account');

    await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Account access', level: 2 })).toBeVisible();
    await expect(page.getByText('operator-1').first()).toBeVisible();
    await expect(page.getByText('Signed in', { exact: true })).toBeVisible();
    await expect(page.getByText('Runtime ready')).toBeVisible();
    await expect(page.getByText('MCP transport')).toBeVisible();
    await expect(page.getByText('Stateless v2')).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();

    await expect(page).toHaveURL(/\/app\/account$/);
    await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible();
    await expect(page.getByText('Sign in required')).toBeVisible();
    await expect(page.getByText('Signed out', { exact: true })).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(() => ({
          local: window.localStorage.getItem('courtlistenerMcpApiToken'),
          session: window.sessionStorage.getItem('courtlistenerMcpApiTokenSession'),
        })),
      )
      .toEqual({ local: null, session: null });
  });
});
