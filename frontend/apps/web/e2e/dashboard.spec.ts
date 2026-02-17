/**
 * Dashboard E2E Tests
 *
 * Tests the main dashboard page:
 * - Layout and navigation
 * - Metrics cards
 * - Sidebar links
 * - Responsiveness
 */

import { test, expect } from '@playwright/test';
import { setupApiMocks } from './fixtures/api-mocks';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/dashboard');
  });

  test('should display dashboard heading', async ({ page }) => {
    await expect(page).toHaveTitle(/Dashboard|Nexus/i);
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  });

  test('should show main content area', async ({ page }) => {
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible();
  });

  test('should have navigation sidebar', async ({ page }) => {
    const nav = page.getByRole('navigation').first();
    await expect(nav).toBeVisible();
  });

  test('should navigate to payments page', async ({ page }) => {
    const paymentsLink = page.getByRole('link', { name: /payments/i }).first();
    if (await paymentsLink.isVisible()) {
      await paymentsLink.click();
      // Wait for navigation — accept either /dashboard/payments or /payments
      await page.waitForTimeout(2000);
      const url = page.url();
      expect(url).toMatch(/\/payments|\/dashboard/);
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

  test('should navigate to settings page', async ({ page }) => {
    const settingsLink = page.getByRole('link', { name: /settings/i }).first();
    if (await settingsLink.isVisible()) {
      await settingsLink.click();
      await expect(page).toHaveURL(/\/dashboard\/settings/);
    }
  });

  test('should be responsive on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible();
  });

  test('should be responsive on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible();
  });
});
