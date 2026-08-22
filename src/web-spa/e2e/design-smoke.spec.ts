import { expect, test } from 'playwright/test';
import { installSpaMocks } from './support/mock-backend';

test.describe('Design system smoke', () => {
  test('Tailwind v4 base styles are active', async ({ page }) => {
    await page.goto('/');

    const fontFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(fontFamily.toLowerCase()).toContain('inter');
  });

  test('landing page loads with shared accent tokens', async ({ page }) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: 'Connect AI to the Law. Responsibly.', level: 1 }),
    ).toBeVisible();
    const primaryButton = page.locator('a.landing-button-primary', { hasText: 'Get Started' });
    await expect(primaryButton).toBeVisible();

    const accentText = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent-text').trim(),
    );
    expect(accentText.length).toBeGreaterThan(0);
    await expect(primaryButton).toHaveClass(/landing-button-primary/);
  });

  test('workspace shell toggles light and dark theme', async ({ page }) => {
    await installSpaMocks(page, {
      session: {
        authenticated: false,
        user: null,
        turnstile_site_key: '',
      },
    });

    await page.goto('/app');
    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();

    const themeToggle = page.getByRole('button', {
      name: /Switch to (light|dark) mode/,
    });
    const initialTheme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'),
    );

    await themeToggle.click();

    await expect
      .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
      .not.toBe(initialTheme);

    await themeToggle.click();

    await expect
      .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
      .toBe(initialTheme);
  });

  test('workspace primary buttons use shell gradient tokens', async ({ page }) => {
    await installSpaMocks(page, {
      session: {
        authenticated: false,
        user: null,
        turnstile_site_key: '',
      },
    });

    await page.goto('/app');
    const primaryLink = page.getByRole('link', { name: 'Open playground' }).first();
    await expect(primaryLink).toHaveClass(/primary/);

    const primaryBg = await primaryLink.evaluate((node) => getComputedStyle(node).backgroundImage);
    expect(primaryBg).toContain('gradient');
  });

  test('skip link is focusable on the landing page', async ({ page }) => {
    await page.goto('/');

    const skipLink = page.getByRole('link', { name: /skip to/i });
    await expect(skipLink).toHaveClass(/skip-link/);
    await expect(skipLink).toHaveClass(/skip-link-landing/);
    await skipLink.focus();
    await expect(skipLink).toBeFocused();
  });

  test('landing feature grid uses Tailwind layout classes', async ({ page }) => {
    await page.goto('/#features');

    const grid = page.locator('.landing-feature-grid');
    await expect(grid).toBeVisible();
    await expect(grid.locator('article')).toHaveCount(4);
  });

  test('playground AI chat exposes chat stream layout class', async ({ page }) => {
    await installSpaMocks(page, {
      session: {
        authenticated: false,
        user: null,
        turnstile_site_key: '',
      },
    });

    await page.goto('/app/playground');
    await expect(page.getByRole('heading', { name: 'Playground', level: 1 })).toBeVisible();
    await expect(page.locator('.chat-stream')).toBeVisible();
  });

  test('playground raw MCP tab exposes transcript panel class', async ({ page }) => {
    await installSpaMocks(page, {
      session: {
        authenticated: false,
        user: null,
        turnstile_site_key: '',
      },
    });

    await page.goto('/app/playground');
    await page.getByRole('tab', { name: /raw mcp console/i }).click();
    await expect(page.locator('.transcript')).toBeVisible();
  });

  test('workspace shell exposes layout hook classes', async ({ page }) => {
    await installSpaMocks(page, {
      session: {
        authenticated: false,
        user: null,
        turnstile_site_key: '',
      },
    });

    await page.goto('/app');
    await expect(page.locator('.workspace-shell')).toBeVisible();
    await expect(page.locator('.workspace-topbar')).toBeVisible();
  });

  test('workspace dashboard uses stack layout class', async ({ page }) => {
    await installSpaMocks(page, {
      session: {
        authenticated: false,
        user: null,
        turnstile_site_key: '',
      },
    });

    await page.goto('/app');
    await expect(page.locator('.stack').first()).toBeVisible();
    await expect(page.locator('.two-col').first()).toBeVisible();
  });

  test('landing setup tabs use landing tab hook classes', async ({ page }) => {
    await page.goto('/#setup');

    const tabs = page.getByRole('tablist', { name: 'Supported MCP clients' });
    await expect(tabs).toBeVisible();
    await expect(tabs.getByRole('tab', { name: 'Claude Desktop' })).toHaveClass(/landing-tab/);
    await expect(tabs.getByRole('tab', { name: 'Claude Desktop' })).toHaveClass(/active/);
  });

  test('workspace account page uses stack layout class', async ({ page }) => {
    await installSpaMocks(page, {
      session: {
        authenticated: true,
        user: { id: 'user-1', email: 'operator@example.com' },
        turnstile_site_key: '',
      },
    });

    await page.goto('/app/account');
    await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible();
    await expect(page.locator('.stack').first()).toBeVisible();
  });

  test('workspace usage page uses stack and table layout classes', async ({ page }) => {
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
    });

    await page.goto('/app/usage');
    await expect(page.getByRole('heading', { name: 'Usage & History', level: 1 })).toBeVisible();
    await expect(page.locator('.stack').first()).toBeVisible();
    await expect(page.locator('.table-scroll')).toBeVisible();
    await expect(page.locator('.table')).toBeVisible();
  });

  test('workspace observability page uses stack layout and worker health tokens', async ({
    page,
  }) => {
    await installSpaMocks(page, {
      session: {
        authenticated: true,
        user: { id: 'operator-1' },
        turnstile_site_key: '',
      },
    });

    await page.goto('/app/observability');
    await expect(
      page.getByRole('heading', { name: 'Agent Observability', level: 1 }),
    ).toBeVisible();
    await expect(page.locator('.stack').first()).toBeVisible();
    await expect(page.locator('.two-up-grid')).toBeVisible();
    await expect(page.locator('.two-col')).toBeVisible();
    await expect(page.locator('ul.ordered').first()).toBeVisible();
  });

  test('playground exposes eyebrow label typography class', async ({ page }) => {
    await installSpaMocks(page, {
      session: {
        authenticated: false,
        user: null,
        turnstile_site_key: '',
      },
    });

    await page.goto('/app/playground');
    await expect(page.getByRole('heading', { name: 'Playground', level: 1 })).toBeVisible();

    const eyebrow = page.locator('.eyebrow-label').first();
    await expect(eyebrow).toBeVisible();
    await expect(eyebrow).toHaveCSS('text-transform', 'uppercase');
  });
});
