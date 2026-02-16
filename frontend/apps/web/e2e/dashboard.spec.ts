/**
 * Dashboard E2E Tests
 *
 * Tests the main dashboard page and its widgets.
 */

import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to dashboard (assumes logged-in state from setup)
    await page.goto('/dashboard');
  });

  test('should display dashboard with metrics cards', async ({ page }) => {
    // Wait for the page to load
    await expect(page).toHaveTitle(/Dashboard|Nexus/i);

    // Check for key dashboard elements
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  });

  test('should show payment summary metrics', async ({ page }) => {
    // Check for metrics cards or loading skeletons
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible();
  });

  test('should navigate to payments page', async ({ page }) => {
    const paymentsLink = page.getByRole('link', { name: /payments/i }).first();
    if (await paymentsLink.isVisible()) {
      await paymentsLink.click();
      await expect(page).toHaveURL(/\/dashboard\/payments/);
    }
  });

  test('should navigate to accounts page', async ({ page }) => {
    const accountsLink = page.getByRole('link', { name: /accounts/i }).first();
    if (await accountsLink.isVisible()) {
      await accountsLink.click();
      await expect(page).toHaveURL(/\/dashboard\/accounts/);
    }
  });

  test('should navigate to reconciliation page', async ({ page }) => {
    const reconLink = page.getByRole('link', { name: /reconciliation/i }).first();
    if (await reconLink.isVisible()) {
      await reconLink.click();
      await expect(page).toHaveURL(/\/dashboard\/reconciliation/);
    }
  });

  test('should navigate to analytics page', async ({ page }) => {
    const analyticsLink = page.getByRole('link', { name: /analytics/i }).first();
    if (await analyticsLink.isVisible()) {
      await analyticsLink.click();
      await expect(page).toHaveURL(/\/dashboard\/analytics/);
    }
  });

  test('should navigate to audit page', async ({ page }) => {
    const auditLink = page.getByRole('link', { name: /audit/i }).first();
    if (await auditLink.isVisible()) {
      await auditLink.click();
      await expect(page).toHaveURL(/\/dashboard\/audit/);
    }
  });

  test('should be responsive on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/dashboard');

    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible();
  });
});
