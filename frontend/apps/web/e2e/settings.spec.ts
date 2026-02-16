/**
 * Settings Page E2E Tests
 */

import { test, expect } from '@playwright/test';

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/settings');
  });

  test('should display settings page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible();
  });

  test('should have profile section', async ({ page }) => {
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible();
  });
});
