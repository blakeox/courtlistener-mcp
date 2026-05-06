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

    await page.goto('/app/control-center');

    await expect(
      page.getByRole('heading', { name: 'Sign in to continue', level: 2 }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' }).first()).toHaveAttribute(
      'href',
      '/auth/start?return_to=%2Fapp%2Faccount',
    );
    await expect(page.getByText('No operator session')).toBeVisible();
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

    await page.goto('/app/control-center');

    const recoveryBanner = page.getByRole('status').filter({
      hasText: 'Session recovery:',
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
      },
      runtime: {
        sessionId: 'mcp-session-e2e',
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

    await expect(page.getByRole('heading', { name: 'Session Control', level: 1 })).toBeVisible();
    await expect(page.getByText('operator-1').first()).toBeVisible();
    await expect(page.getByText('yes (server)')).toBeVisible();
    await expect(page.getByText('2 tools · 1 resources · 1 prompts')).toBeVisible();
    await expect(page.getByText('Protocol session active: mcp-session-e2e')).toBeVisible();
    await expect(page.getByText('/mcp — 11')).toBeVisible();

    await page.getByRole('button', { name: 'Log out' }).click();

    await expect(page).toHaveURL(/\/app\/control-center$/);
    await expect(
      page.getByRole('heading', { name: 'Sign in to continue', level: 2 }),
    ).toBeVisible();
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
