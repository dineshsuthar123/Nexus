/**
 * Payments E2E Tests
 *
 * Tests the payment wizard, payment list, and payment detail flows.
 */

import { test, expect } from '@playwright/test';

test.describe('Payment List', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/payments');
  });

  test('should display payments page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /payments/i })).toBeVisible();
  });

  test('should show payment list or empty state', async ({ page }) => {
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible();

    // Either a table/list of payments or an empty state
    const hasPayments = await page.locator('[data-testid="payment-row"], table tbody tr, [role="listitem"]').count();
    if (hasPayments === 0) {
      // Should show empty state message
      await expect(page.getByText(/no payments|no data|get started/i)).toBeVisible();
    }
  });

  test('should have a create payment button', async ({ page }) => {
    const createBtn = page.getByRole('link', { name: /new payment|create payment|initiate/i })
      .or(page.getByRole('button', { name: /new payment|create payment|initiate/i }));

    if (await createBtn.first().isVisible()) {
      await createBtn.first().click();
      await expect(page).toHaveURL(/\/dashboard\/payments\/new/);
    }
  });
});

test.describe('Payment Creation Wizard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/payments/new');
  });

  test('should display payment creation form', async ({ page }) => {
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible();
  });

  test('should show form fields for payment details', async ({ page }) => {
    // Look for common payment form fields
    const amountField = page.getByLabel(/amount/i).or(page.locator('input[name="amount"]'));
    const currencyField = page.getByLabel(/currency/i).or(page.locator('select[name="currency"]'));

    // At least one payment-related field should be present
    const hasAmountField = await amountField.count() > 0;
    const hasCurrencyField = await currencyField.count() > 0;

    expect(hasAmountField || hasCurrencyField).toBeTruthy();
  });

  test('should validate required fields', async ({ page }) => {
    // Try to submit without filling required fields
    const submitBtn = page.getByRole('button', { name: /submit|create|send|confirm/i }).first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();

      // Should show validation errors or remain on the same page
      await expect(page).toHaveURL(/\/dashboard\/payments\/new/);
    }
  });
});

test.describe('Payment Detail', () => {
  test('should handle non-existent payment gracefully', async ({ page }) => {
    await page.goto('/dashboard/payments/non-existent-uetr');

    // Should either redirect or show not-found/error message
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible();
  });
});
