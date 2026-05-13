import { expect, test } from 'playwright/test';
import { installSpaMocks, seedBrowserToken } from './support/mock-backend';

test.describe('SPA auth routing and recovery', () => {
  test('redirects legacy auth routes into hosted auth', async ({ page }) => {
    await installSpaMocks(page, {
      session: {
        authenticated: false,
        user: null,
        turnstile_site_key: '',
      },
    });
    await page.route('**/auth/start?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><body>Hosted auth stub</body></html>',
      });
    });

    await page.goto('/app/login');

    await expect
      .poll(() => {
        const url = new URL(page.url());
        return `${url.pathname}|${url.searchParams.get('return_to') ?? ''}`;
      })
      .toBe('/auth/start|/app/account');
    await expect(page).toHaveURL(/\/auth\/start\?return_to=%2Fapp%2Faccount$/);
  });

  test('sends authenticated unknown routes to the operator session page', async ({ page }) => {
    await installSpaMocks(page, {
      session: {
        authenticated: true,
        user: { id: 'operator-2' },
        turnstile_site_key: '',
      },
    });

    await page.goto('/app/unknown-route');

    await expect(page).toHaveURL(/\/app\/account$/);
    await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Account access', level: 2 })).toBeVisible();
    await expect(page.getByText('operator-2').first()).toBeVisible();
  });

  test('sends token-backed unknown routes to the playground', async ({ page }) => {
    await seedBrowserToken(page, 'session-token-e2e');
    await installSpaMocks(page, {
      session: {
        authenticated: false,
        user: null,
        turnstile_site_key: '',
      },
    });

    await page.goto('/app/unknown-route');

    await expect(page).toHaveURL(/\/app\/playground$/);
    await expect(page.getByRole('heading', { name: 'Playground', level: 1 })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Account recovery:' })).toBeVisible();
  });

  test('shows protocol mismatch recovery on the control center', async ({ page }) => {
    await seedBrowserToken(page, 'session-token-e2e');
    await installSpaMocks(page, {
      session: {
        authenticated: true,
        user: { id: 'operator-3' },
        turnstile_site_key: '',
      },
      runtime: {
        sessionId: 'mismatch-session',
        protocolVersion: '2024-11-05',
        tools: [
          {
            name: 'search_cases',
            description: 'Search legal cases',
            inputSchema: {
              type: 'object',
              required: ['query'],
              properties: {
                query: { type: 'string' },
              },
            },
            metadata: { category: 'search' },
          },
        ],
        categories: ['search'],
      },
    });

    await page.goto('/app/control-center');

    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
    await expect(page.getByText('Legacy overview route.')).toBeVisible();
    await expect(page.getByText('Browser credential loaded')).toBeVisible();
    await expect(page.locator('strong').filter({ hasText: 'Runtime ready' })).toBeVisible();
  });

  test('shows protocol mismatch recovery on the operator session page', async ({ page }) => {
    await seedBrowserToken(page, 'persisted-token-e2e', true);
    await installSpaMocks(page, {
      session: {
        authenticated: true,
        user: { id: 'operator-4' },
        turnstile_site_key: '',
      },
      runtime: {
        sessionId: 'mismatch-session',
        protocolVersion: '2024-11-05',
        tools: [
          {
            name: 'search_cases',
            description: 'Search legal cases',
            inputSchema: {
              type: 'object',
              required: ['query'],
              properties: {
                query: { type: 'string' },
              },
            },
            metadata: { category: 'search' },
          },
        ],
        categories: ['search'],
      },
    });

    await page.goto('/app/account');

    await expect(
      page.getByText('Protocol mismatch: server advertised 2024-11-05, expected 2025-06-18.'),
    ).toBeVisible();
    await expect(page.getByText('Saved on this device')).toBeVisible();
    await expect(page.getByText('⚠ Protocol mismatch (2024-11-05)')).toBeVisible();
    await expect(page.getByText('Protocol mismatch needs review')).toBeVisible();
  });
});
