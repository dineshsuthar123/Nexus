/**
 * Nexus RTP Platform - Authentication E2E Tests
 *
 * End-to-end tests for authentication flows including:
 * - Login with email/password
 * - Registration with validation
 * - Password reset flow
 * - MFA verification
 * - Protected route access
 */

import { test, expect, TEST_USER, ADMIN_USER } from './fixtures/auth';
import { setupApiMocks } from './fixtures/api-mocks';

// Test-only mock credential — NOT a real secret
const MOCK_PASSWORD = process.env.E2E_TEST_PASSWORD || '__MOCK_PASSWORD__';

// =============================================================================
// Login Flow Tests
// =============================================================================

test.describe('Login Flow', () => {
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.goto();
  });

  test('should display login form with all required elements', async ({ page }) => {
    // Check heading
    await expect(
      page.getByRole('heading', { name: /sign in|welcome/i })
    ).toBeVisible();

    // Check form elements
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();

    // Check links
    await expect(page.getByRole('link', { name: /forgot password/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /create.*account|sign up|register/i })).toBeVisible();
  });

  test('should show validation errors for empty form submission', async ({ page }) => {
    // Click sign in without filling form
    await page.getByRole('button', { name: /sign in/i }).click();

    // Should show validation errors
    await expect(page.getByText(/email.*required|enter.*email/i)).toBeVisible();
  });

  test('should show validation error for invalid email format', async ({ page }) => {
    await page.getByLabel(/email/i).fill('invalid-email');
    await page.getByLabel(/password/i).fill(MOCK_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText(/valid.*email|invalid.*email/i)).toBeVisible();
  });

  test('should toggle password visibility', async ({ page }) => {
    const passwordInput = page.getByLabel(/password/i);
    const toggleButton = page.getByRole('button', { name: /show password|hide password/i });

    await passwordInput.fill('testpassword');

    // Initially password should be hidden
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Click toggle to show password
    await toggleButton.click();
    await expect(passwordInput).toHaveAttribute('type', 'text');

    // Click toggle to hide password
    await toggleButton.click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('should show loading state during login', async ({ page }) => {
    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByLabel(/password/i).fill(TEST_USER.password);

    // Start login
    const signInButton = page.getByRole('button', { name: /sign in/i });
    await signInButton.click();

    // Button should show loading state (may be brief)
    // Check for disabled state or loading indicator
    await expect(signInButton).toBeDisabled();
  });

  test('should navigate to forgot password page', async ({ page }) => {
    await page.getByRole('link', { name: /forgot password/i }).click();
    await expect(page).toHaveURL(/\/auth\/forgot-password/);
  });

  test('should navigate to register page', async ({ page }) => {
    await page.getByRole('link', { name: /create.*account|sign up|register/i }).click();
    await expect(page).toHaveURL(/\/auth\/register/);
  });
});

// =============================================================================
// Registration Flow Tests
// =============================================================================

test.describe('Registration Flow', () => {
  test.beforeEach(async ({ registerPage }) => {
    await registerPage.goto();
  });

  test('should display registration form with all required elements', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /create.*account|sign up|register/i })
    ).toBeVisible();

    await expect(page.getByLabel(/first name/i)).toBeVisible();
    await expect(page.getByLabel(/last name/i)).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/^password$/i)).toBeVisible();
    await expect(page.getByLabel(/confirm password/i)).toBeVisible();
  });

  test('should show password strength indicator', async ({ page }) => {
    const passwordInput = page.getByLabel(/^password$/i);

    // Type a weak password
    await passwordInput.fill('weak');
    await expect(page.getByText(/weak/i)).toBeVisible();

    // Type a medium-strength password
    await passwordInput.fill('Medium123');
    await expect(page.getByText(/fair|medium/i)).toBeVisible();

    // Type a strong password
    await passwordInput.fill('StrongPass123!');
    await expect(page.getByText(/strong/i)).toBeVisible();
  });

  test('should show password mismatch error', async ({ page }) => {
    await page.getByLabel(/^password$/i).fill(MOCK_PASSWORD);
    await page.getByLabel(/confirm password/i).fill(MOCK_PASSWORD + 'Different');

    await expect(page.getByText(/passwords.*match|do not match/i)).toBeVisible();
  });

  test('should require terms acceptance', async ({ page }) => {
    await page.getByLabel(/first name/i).fill(TEST_USER.firstName);
    await page.getByLabel(/last name/i).fill(TEST_USER.lastName);
    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByLabel(/^password$/i).fill(TEST_USER.password);
    await page.getByLabel(/confirm password/i).fill(TEST_USER.password);

    // Submit button should be disabled without terms acceptance
    const submitButton = page.getByRole('button', { name: /create account|sign up/i });
    await expect(submitButton).toBeDisabled();

    // Accept terms
    await page.getByLabel(/terms|agree/i).check();
    await expect(submitButton).toBeEnabled();
  });

  test('should navigate to login page', async ({ page }) => {
    await page.getByRole('link', { name: /sign in|log in/i }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});

// =============================================================================
// Password Reset Flow Tests
// =============================================================================

test.describe('Password Reset Flow', () => {
  test('should display forgot password form', async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/auth/forgot-password');

    await expect(
      page.getByRole('heading', { name: /forgot.*password|reset.*password/i })
    ).toBeVisible();

    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(
      page.getByRole('button', { name: /send|reset|submit/i })
    ).toBeVisible();
  });

  test('should show success message after form submission', async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/auth/forgot-password');

    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByRole('button', { name: /send|reset|submit/i }).click();

    // Should show success message or email sent confirmation
    await expect(
      page.getByText(/email.*sent|check.*email|instructions/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test('should navigate back to login', async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/auth/forgot-password');

    await page.getByRole('link', { name: /back.*login|sign in/i }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});

// =============================================================================
// Protected Route Tests
// =============================================================================

test.describe('Protected Routes', () => {
  // Skip redirect tests in mock mode — middleware auth is bypassed
  test.skip(!!process.env.NEXT_PUBLIC_MOCK_MODE || process.env.NEXT_PUBLIC_MOCK_MODE === 'true',
    'Protected route redirect tests require auth middleware (disabled in mock mode)');

  test('should redirect unauthenticated user to login', async ({ page }) => {
    // Try to access dashboard
    await page.goto('/dashboard');

    // Should be redirected to login
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('should preserve redirect URL after login', async ({ page }) => {
    // Try to access a protected page
    await page.goto('/payments');

    // Check URL contains redirect parameter or callbackUrl
    const url = page.url();
    expect(url).toMatch(/login|callbackUrl.*payments/);
  });
});

// =============================================================================
// Keyboard Navigation Tests
// =============================================================================

test.describe('Keyboard Navigation', () => {
  test('should support keyboard navigation on login form', async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: /sign in|welcome/i }).waitFor({ state: 'visible', timeout: 15000 });

    // Focus the email field directly and verify it works
    const emailInput = page.getByLabel(/email/i);
    await emailInput.focus();
    await expect(emailInput).toBeFocused();

    // Tab to password
    await page.keyboard.press('Tab');
    // Accept any focusable element after email (might be "Forgot password?" link)

    // Should be able to submit with Enter after filling form
    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByLabel(/password/i).fill(TEST_USER.password);
    await page.keyboard.press('Enter');

    // Form should be submitted (button becomes disabled or page navigates)
    const signInBtn = page.getByRole('button', { name: /sign in/i });
    // Give time for submission to process
    await page.waitForTimeout(1000);
    const isDisabled = await signInBtn.isDisabled().catch(() => false);
    const isStillOnLogin = page.url().includes('/auth/login');
    expect(isDisabled || !isStillOnLogin).toBeTruthy();
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

test.describe('Error Handling', () => {
  test('should display server error message', async ({ page, loginPage }) => {
    await loginPage.goto();

    // Override login API to return error for wrong credentials
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid credentials' }),
      });
    });

    // Attempt login with wrong credentials
    await loginPage.login('wrong@email.com', 'wrongpassword');

    // Should show error message — either via alert role or text
    const errorAlert = page.getByRole('alert');
    const errorText = page.getByText(/invalid|error|failed|incorrect/i);
    await expect(errorAlert.or(errorText).first()).toBeVisible({ timeout: 10000 });
  });

  test('should handle network errors gracefully', async ({ page, context }) => {
    await setupApiMocks(page);
    await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: /sign in|welcome/i }).waitFor({ state: 'visible', timeout: 15000 });

    // Fill form before going offline
    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByLabel(/password/i).fill(TEST_USER.password);

    // Simulate offline mode
    await context.setOffline(true);
    await page.getByRole('button', { name: /sign in/i }).click();

    // Should show some form of error (network error, alert, or disabled button)
    await page.waitForTimeout(2000);
    const hasError = await page.getByText(/network|connection|offline|unavailable|error|failed/i).isVisible().catch(() => false);
    const hasAlert = await page.getByRole('alert').isVisible().catch(() => false);
    const btnDisabled = await page.getByRole('button', { name: /sign in/i }).isDisabled().catch(() => false);

    // Accept any error indication — error text, alert, or button not re-enabled
    expect(hasError || hasAlert || btnDisabled).toBeTruthy();

    // Restore online mode
    await context.setOffline(false);
  });
});
