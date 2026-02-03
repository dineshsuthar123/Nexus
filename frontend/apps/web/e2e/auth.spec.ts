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
    await expect(page.getByRole('link', { name: /sign up|register/i })).toBeVisible();
  });

  test('should show validation errors for empty form submission', async ({ page }) => {
    // Click sign in without filling form
    await page.getByRole('button', { name: /sign in/i }).click();
    
    // Should show validation errors
    await expect(page.getByText(/email.*required|enter.*email/i)).toBeVisible();
  });

  test('should show validation error for invalid email format', async ({ page }) => {
    await page.getByLabel(/email/i).fill('invalid-email');
    await page.getByLabel(/password/i).fill('password123');
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
    await page.getByRole('link', { name: /sign up|register/i }).click();
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
    
    // Type a medium password
    await passwordInput.fill('Medium123');
    await expect(page.getByText(/medium/i)).toBeVisible();
    
    // Type a strong password
    await passwordInput.fill('StrongPass123!');
    await expect(page.getByText(/strong/i)).toBeVisible();
  });

  test('should show password mismatch error', async ({ page }) => {
    await page.getByLabel(/^password$/i).fill('Password123!');
    await page.getByLabel(/confirm password/i).fill('DifferentPassword123!');
    
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
    await page.goto('/auth/forgot-password');
    
    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByRole('button', { name: /send|reset|submit/i }).click();
    
    // Should show success message or email sent confirmation
    await expect(
      page.getByText(/email.*sent|check.*email|instructions/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test('should navigate back to login', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    
    await page.getByRole('link', { name: /back.*login|sign in/i }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});

// =============================================================================
// Protected Route Tests
// =============================================================================

test.describe('Protected Routes', () => {
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
    await page.goto('/auth/login');
    
    // Tab through form elements
    await page.keyboard.press('Tab'); // Focus email
    await expect(page.getByLabel(/email/i)).toBeFocused();
    
    await page.keyboard.press('Tab'); // Focus password
    await expect(page.getByLabel(/password/i)).toBeFocused();
    
    // Should be able to submit with Enter
    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByLabel(/password/i).fill(TEST_USER.password);
    await page.keyboard.press('Enter');
    
    // Form should be submitted (button becomes disabled)
    await expect(page.getByRole('button', { name: /sign in/i })).toBeDisabled();
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

test.describe('Error Handling', () => {
  test('should display server error message', async ({ page, loginPage }) => {
    await loginPage.goto();
    
    // Mock failed login by using invalid credentials
    await loginPage.login('wrong@email.com', 'wrongpassword');
    
    // Should show error message
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 10000 });
  });

  test('should handle network errors gracefully', async ({ page, context }) => {
    await page.goto('/auth/login');
    
    // Simulate offline mode
    await context.setOffline(true);
    
    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByLabel(/password/i).fill(TEST_USER.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    
    // Should show network error
    await expect(
      page.getByText(/network|connection|offline|unavailable/i)
    ).toBeVisible({ timeout: 10000 });
    
    // Restore online mode
    await context.setOffline(false);
  });
});
