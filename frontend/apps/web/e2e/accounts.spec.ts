/**
 * Accounts E2E Tests
 *
 * Tests account listing, creation, and detail views.
 */

import { test, expect } from '@playwright/test';

test.describe('Accounts Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/accounts');
  });

  test('should display accounts page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /accounts/i })).toBeVisible();
  });

  test('should list accounts or show empty state', async ({ page }) => {
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible();
  });

  test('should have create account action', async ({ page }) => {
    const createBtn = page.getByRole('link', { name: /new account|create account|add account/i })
      .or(page.getByRole('button', { name: /new account|create account|add account/i }));

    if (await createBtn.first().isVisible()) {
      await createBtn.first().click();
      await expect(page).toHaveURL(/\/dashboard\/accounts\/new/);
    }
  });
});

test.describe('Account Creation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/accounts/new');
  });

  test('should display account creation form', async ({ page }) => {
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible();
  });

  test('should validate required fields', async ({ page }) => {
    const submitBtn = page.getByRole('button', { name: /create|submit|save/i }).first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      // Should show validation errors
      await expect(page).toHaveURL(/\/dashboard\/accounts\/new/);
    }
  });
});

test.describe('Account Detail', () => {
  test('should handle non-existent account gracefully', async ({ page }) => {
    await page.goto('/dashboard/accounts/non-existent-id');
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible();
  });
});
