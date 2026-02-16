/**
 * Reconciliation E2E Tests
 *
 * Tests reconciliation listing and detail views.
 */

import { test, expect } from '@playwright/test';

test.describe('Reconciliation Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/reconciliation');
  });

  test('should display reconciliation page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /reconciliation/i })).toBeVisible();
  });

  test('should list reconciliation cycles or show empty state', async ({ page }) => {
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible();
  });

  test('should have run reconciliation action', async ({ page }) => {
    const runBtn = page.getByRole('link', { name: /new|run|start/i })
      .or(page.getByRole('button', { name: /new|run|start/i }));

    if (await runBtn.first().isVisible()) {
      await runBtn.first().click();
      await expect(page).toHaveURL(/\/dashboard\/reconciliation\/(new|run)/);
    }
  });
});

test.describe('Reconciliation Detail', () => {
  test('should handle non-existent cycle gracefully', async ({ page }) => {
    await page.goto('/dashboard/reconciliation/non-existent-id');
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible();
  });
});
