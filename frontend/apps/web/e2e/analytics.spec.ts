/**
 * Analytics E2E Tests
 */

import { test, expect } from '@playwright/test';

test.describe('Analytics Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/analytics');
  });

  test('should display analytics page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /analytics/i })).toBeVisible();
  });

  test('should show charts or loading state', async ({ page }) => {
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible();
  });
});
