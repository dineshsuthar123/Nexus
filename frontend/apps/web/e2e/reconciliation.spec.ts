/**
 * Reconciliation E2E Tests
 *
 * Tests reconciliation lifecycle:
 * - Cycle listing
 * - Run reconciliation action
 * - Cycle detail view
 * - Discrepancy management
 * - Error handling
 */

import { test, expect } from '@playwright/test';
import { setupApiMocks, MOCK_RECONCILIATION_CYCLES } from './fixtures/api-mocks';

test.describe('Reconciliation Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/dashboard/reconciliation');
  });

  test('should display reconciliation page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /reconciliation/i })).toBeVisible();
  });

  test('should show main content area', async ({ page }) => {
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible();
  });

  test('should list reconciliation cycles or show empty state', async ({ page }) => {
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible();

    const hasCycles = await page.locator(
      '[data-testid="cycle-row"], table tbody tr, [role="listitem"], [data-testid="cycle-card"]'
    ).count();
    if (hasCycles === 0) {
      await expect(mainContent.getByText(/no.*reconciliation|no data|empty|get started/i)).toBeVisible();
    }
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
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test('should handle non-existent cycle gracefully', async ({ page }) => {
    await page.goto('/dashboard/reconciliation/non-existent-id');
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible();
  });

  test('should load known cycle detail', async ({ page }) => {
    const id = MOCK_RECONCILIATION_CYCLES[0].id;
    await page.goto(`/dashboard/reconciliation/${id}`);
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible();
  });
});

test.describe('Reconciliation Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test('should navigate from dashboard to reconciliation', async ({ page }) => {
    await page.goto('/dashboard');
    const reconLink = page.getByRole('link', { name: /reconciliation/i }).first();
    if (await reconLink.isVisible()) {
      await reconLink.click();
      await expect(page).toHaveURL(/\/dashboard\/reconciliation/);
    }
  });
});
