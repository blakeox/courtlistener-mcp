import AxeBuilder from '@axe-core/playwright';
import { expect, test } from 'playwright/test';
import { installSpaMocks } from './support/mock-backend';

async function expectOpaqueForegroundText(
  page: import('@playwright/test').Page,
  selector: string,
): Promise<void> {
  const target = page.locator(selector).first();
  await expect(target, `Expected ${selector} to match at least one element`).toBeVisible();
  await expect(target, `Expected ${selector} to use portal foreground text`).toHaveCSS(
    'color',
    'rgb(17, 37, 63)',
  );
}

async function expectNoSeriousViolations(
  page: import('@playwright/test').Page,
  context: string,
): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'])
    .analyze();
  const serious = results.violations.filter((violation) =>
    ['serious', 'critical'].includes(violation.impact ?? ''),
  );
  expect(serious, `${context} axe violations:\n${JSON.stringify(serious, null, 2)}`).toEqual([]);
}

test.describe('Accessibility smoke', () => {
  test('landing page passes axe WCAG AA rules', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Connect AI to the Law. Responsibly.', level: 1 }),
    ).toBeVisible();
    await expectNoSeriousViolations(page, 'landing');
  });

  test('workspace control center passes axe WCAG AA rules', async ({ page }) => {
    await installSpaMocks(page, {
      session: {
        authenticated: false,
        user: null,
        turnstile_site_key: '',
      },
    });
    await page.goto('/app/control-center');
    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
    await expectOpaqueForegroundText(page, '.ui-card .text-foreground');
    await expectNoSeriousViolations(page, 'control-center');
  });

  test('playground passes axe WCAG AA rules', async ({ page }) => {
    await installSpaMocks(page, {
      session: {
        authenticated: false,
        user: null,
        turnstile_site_key: '',
      },
    });
    await page.goto('/app/playground');
    await expect(page.getByRole('heading', { name: 'Playground', level: 1 })).toBeVisible();
    await expectNoSeriousViolations(page, 'playground');
  });
});
