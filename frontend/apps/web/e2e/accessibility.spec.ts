/**
 * Accessibility (a11y) E2E Tests
 *
 * Runs axe-core accessibility checks on all critical pages.
 * Targets WCAG 2.1 AA compliance with zero critical/serious violations.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const criticalPages = [
  { name: 'Login', url: '/auth/login' },
  { name: 'Register', url: '/auth/register' },
  { name: 'Dashboard', url: '/dashboard' },
  { name: 'Payments', url: '/dashboard/payments' },
  { name: 'New Payment', url: '/dashboard/payments/new' },
  { name: 'Accounts', url: '/dashboard/accounts' },
  { name: 'New Account', url: '/dashboard/accounts/new' },
  { name: 'Reconciliation', url: '/dashboard/reconciliation' },
  { name: 'Analytics', url: '/dashboard/analytics' },
  { name: 'Audit', url: '/dashboard/audit' },
  { name: 'Settings', url: '/dashboard/settings' },
];

test.describe('Accessibility - WCAG AA Compliance', () => {
  for (const page of criticalPages) {
    test(`${page.name} page should have no critical a11y violations`, async ({ page: pw }) => {
      await pw.goto(page.url);

      // Wait for content to load
      await pw.waitForLoadState('networkidle');

      const results = await new AxeBuilder({ page: pw })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      // Filter for critical and serious violations only
      const criticalViolations = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious'
      );

      if (criticalViolations.length > 0) {
        const summary = criticalViolations.map(
          (v) => `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} instances)`
        ).join('\n');

        console.error(`A11y violations on ${page.name}:\n${summary}`);
      }

      expect(criticalViolations).toHaveLength(0);
    });
  }
});

test.describe('Accessibility - Keyboard Navigation', () => {
  test('should be able to navigate login form with keyboard only', async ({ page }) => {
    await page.goto('/auth/login');

    // Tab through the form
    await page.keyboard.press('Tab');

    // Check that focus is visible
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('should support keyboard navigation in dashboard sidebar', async ({ page }) => {
    await page.goto('/dashboard');

    // Tab to sidebar navigation
    await page.keyboard.press('Tab');

    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });
});

test.describe('Accessibility - Color Contrast', () => {
  test('should meet WCAG AA color contrast ratios on login page', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withRules(['color-contrast'])
      .analyze();

    const contrastViolations = results.violations.filter(
      (v) => v.id === 'color-contrast' && (v.impact === 'critical' || v.impact === 'serious')
    );

    expect(contrastViolations).toHaveLength(0);
  });
});

test.describe('Accessibility - ARIA Attributes', () => {
  test('should have proper ARIA landmarks on dashboard', async ({ page }) => {
    await page.goto('/dashboard');

    // Should have main landmark
    const main = page.getByRole('main');
    await expect(main).toBeVisible();

    // Should have navigation landmark
    const nav = page.getByRole('navigation').first();
    await expect(nav).toBeVisible();
  });
});
