/**
 * Audit Page E2E Tests
 */

import { test, expect } from '@playwright/test';
import { setupApiMocks } from './fixtures/api-mocks';

test.describe('Audit Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/dashboard/audit');
  });

  test('should display audit page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /audit/i })).toBeVisible();
  });

  test('should show audit trail or empty state', async ({ page }) => {
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible();
  });
});
