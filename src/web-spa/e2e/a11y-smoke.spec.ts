import AxeBuilder from '@axe-core/playwright';
import { expect, test } from 'playwright/test';
import { installSpaMocks } from './support/mock-backend';

async function expectOpaqueForegroundText(
  page: import('@playwright/test').Page,
  selector: string,
): Promise<void> {
  const target = page.locator(selector).first();
  await expect(target, `Expected ${selector} to match at least one element`).toBeVisible();
  const resolvedColor = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.color = 'var(--text-primary)';
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  await expect(target, `Expected ${selector} to use portal foreground text`).toHaveCSS(
    'color',
    resolvedColor,
  );
}

async function expectResolvedCssVariable(
  page: import('@playwright/test').Page,
  selector: string,
  cssProperty: string,
  variableName: string,
): Promise<void> {
  const target = page.locator(selector).first();
  await expect(target, `Expected ${selector} to match at least one element`).toBeVisible();
  const resolvedValue = await page.evaluate(
    ({ cssProperty, variableName }) => {
      const probe = document.createElement('div');
      probe.style.setProperty(cssProperty, `var(${variableName})`);
      document.body.appendChild(probe);
      const value = getComputedStyle(probe).getPropertyValue(cssProperty);
      probe.remove();
      return value;
    },
    { cssProperty, variableName },
  );
  await expect(target).toHaveCSS(cssProperty, resolvedValue);
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

async function expectBackgroundImage(
  page: import('@playwright/test').Page,
  selector: string,
): Promise<void> {
  const target = page.locator(selector).first();
  await expect(target, `Expected ${selector} to match at least one element`).toBeVisible();
  const backgroundImage = await target.evaluate((node) => getComputedStyle(node).backgroundImage);
  expect(backgroundImage).not.toBe('none');
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

  test('account page passes axe WCAG AA rules', async ({ page }) => {
    await installSpaMocks(page, {
      session: {
        authenticated: false,
        user: null,
        turnstile_site_key: '',
      },
    });
    await page.goto('/app/account');
    await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible();
    await expectNoSeriousViolations(page, 'account');
  });

  test('usage page passes axe WCAG AA rules', async ({ page }) => {
    await installSpaMocks(page, {
      session: {
        authenticated: false,
        user: null,
        turnstile_site_key: '',
      },
    });
    await page.goto('/app/usage');
    await expect(page.getByRole('heading', { name: 'Usage & History', level: 1 })).toBeVisible();
    await expectNoSeriousViolations(page, 'usage');
  });

  test('workspace dark mode keeps navigation readable and gradient-backed', async ({ page }) => {
    await installSpaMocks(page, {
      session: {
        authenticated: false,
        user: null,
        turnstile_site_key: '',
      },
    });
    await page.goto('/app/control-center');
    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: /switch to dark mode/i }).click();

    await expectBackgroundImage(page, '.workspace-sidebar');
    await expectResolvedCssVariable(
      page,
      '.workspace-sidebar',
      'background-color',
      '--body-bg-dark-end',
    );
    await expect(page.locator('.sidebar-secondary-link').first()).toBeVisible();
    await expectNoSeriousViolations(page, 'control-center-dark');
  });

  test('mobile navigation drawer owns the viewport and keeps keyboard focus visible', async ({
    page,
  }) => {
    await installSpaMocks(page, {
      session: {
        authenticated: false,
        user: null,
        turnstile_site_key: '',
      },
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/app/control-center');
    await page.getByRole('button', { name: /toggle navigation menu/i }).click();

    const sidebar = page.locator('.workspace-sidebar');
    const closeButton = page.locator('.mobile-sidebar-close');
    await expect(sidebar).toBeVisible();
    await expectResolvedCssVariable(
      page,
      '.workspace-sidebar',
      'background-color',
      '--shell-sidebar-mobile-bg',
    );
    await expect(closeButton).toBeVisible();

    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const focusState = await page.evaluate(() => {
      const sidebar = document.querySelector('.workspace-sidebar');
      const activeElement = document.activeElement as HTMLElement | null;
      if (!sidebar || !activeElement) {
        return { insideSidebar: false, outlineStyle: 'none' };
      }
      return {
        insideSidebar: sidebar.contains(activeElement),
        outlineStyle: getComputedStyle(activeElement).outlineStyle,
      };
    });
    expect(focusState.insideSidebar).toBe(true);
    expect(focusState.outlineStyle).not.toBe('none');
  });
});
