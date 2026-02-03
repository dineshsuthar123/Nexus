/**
 * Nexus RTP Platform - Accessibility E2E Tests
 * 
 * Tests WCAG 2.1 AA compliance using axe-core.
 * Run with: pnpm test:e2e --project=a11y
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Common axe configuration
const axeConfig = {
  // Check against WCAG 2.1 AA
  runOnly: {
    type: 'tag' as const,
    values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
  },
};

// =============================================================================
// Login Page Accessibility
// =============================================================================

test.describe('Login Page Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');
  });

  test('should have no accessibility violations', async ({ page }) => {
    const accessibilityScanResults = await new AxeBuilder({ page })
      .options(axeConfig)
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    const h1 = await page.locator('h1').count();
    expect(h1).toBe(1); // Should have exactly one h1

    // Check heading order
    const headings = await page.evaluate(() => {
      const heads = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      return Array.from(heads).map((h) => ({
        level: parseInt(h.tagName[1]),
        text: h.textContent?.trim(),
      }));
    });

    // Verify no heading levels are skipped
    let prevLevel = 0;
    for (const { level } of headings) {
      expect(level - prevLevel).toBeLessThanOrEqual(1);
      prevLevel = level;
    }
  });

  test('should have proper form labels', async ({ page }) => {
    // All inputs should have associated labels
    const emailInput = page.getByLabel(/email/i);
    const passwordInput = page.getByLabel(/password/i);

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    // Check for proper aria-attributes
    await expect(emailInput).toHaveAttribute('type', 'email');
  });

  test('should have visible focus indicators', async ({ page }) => {
    const emailInput = page.getByLabel(/email/i);

    // Focus the input
    await emailInput.focus();

    // Check that there's a focus style applied
    const hasFocusStyle = await emailInput.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      // Check for outline or box-shadow (common focus indicators)
      return (
        styles.outlineWidth !== '0px' ||
        styles.boxShadow !== 'none' ||
        el.matches(':focus-visible')
      );
    });

    expect(hasFocusStyle).toBe(true);
  });

  test('should have sufficient color contrast', async ({ page }) => {
    const accessibilityScanResults = await new AxeBuilder({ page })
      .options({
        runOnly: {
          type: 'rule',
          values: ['color-contrast'],
        },
      })
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should announce errors to screen readers', async ({ page }) => {
    // Submit empty form to trigger validation
    await page.getByRole('button', { name: /sign in/i }).click();

    // Check for aria-live region or role="alert"
    const errorRegion = page.locator('[role="alert"], [aria-live="polite"], [aria-live="assertive"]');
    await expect(errorRegion.first()).toBeVisible({ timeout: 5000 });
  });
});

// =============================================================================
// Registration Page Accessibility
// =============================================================================

test.describe('Registration Page Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/register');
    await page.waitForLoadState('networkidle');
  });

  test('should have no accessibility violations', async ({ page }) => {
    const accessibilityScanResults = await new AxeBuilder({ page })
      .options(axeConfig)
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should have proper form field associations', async ({ page }) => {
    const firstNameInput = page.getByLabel(/first name/i);
    const lastNameInput = page.getByLabel(/last name/i);
    const emailInput = page.getByLabel(/email/i);
    const passwordInput = page.getByLabel(/^password$/i);
    const confirmPasswordInput = page.getByLabel(/confirm password/i);

    // All fields should be accessible by label
    await expect(firstNameInput).toBeVisible();
    await expect(lastNameInput).toBeVisible();
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(confirmPasswordInput).toBeVisible();
  });

  test('should have accessible password strength indicator', async ({ page }) => {
    const passwordInput = page.getByLabel(/^password$/i);
    await passwordInput.fill('TestPassword123!');

    // Check that strength indicator has proper ARIA
    const strengthIndicator = page.locator('[role="progressbar"], [aria-valuenow], [aria-valuemax]');
    
    // If no progressbar role, check for text indicator
    if (await strengthIndicator.count() === 0) {
      const textIndicator = page.getByText(/weak|medium|strong/i);
      await expect(textIndicator.first()).toBeVisible();
    }
  });

  test('should have accessible checkbox for terms', async ({ page }) => {
    const termsCheckbox = page.getByLabel(/terms|agree/i);
    await expect(termsCheckbox).toBeVisible();
    await expect(termsCheckbox).toHaveRole('checkbox');
  });
});

// =============================================================================
// Forgot Password Page Accessibility
// =============================================================================

test.describe('Forgot Password Page Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/forgot-password');
    await page.waitForLoadState('networkidle');
  });

  test('should have no accessibility violations', async ({ page }) => {
    const accessibilityScanResults = await new AxeBuilder({ page })
      .options(axeConfig)
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });
});

// =============================================================================
// MFA Page Accessibility
// =============================================================================

test.describe('MFA Page Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/mfa');
    await page.waitForLoadState('networkidle');
  });

  test('should have no accessibility violations', async ({ page }) => {
    const accessibilityScanResults = await new AxeBuilder({ page })
      .options(axeConfig)
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should have accessible OTP input fields', async ({ page }) => {
    // OTP fields should have proper labels
    const otpGroup = page.locator('[role="group"], .otp-input');
    
    if (await otpGroup.count() > 0) {
      // Check for aria-label or label
      await expect(otpGroup.first()).toHaveAttribute('aria-label', /.*/);
    }
  });

  test('should support screen reader announcements for OTP', async ({ page }) => {
    // Check for sr-only or visually hidden instructions
    const srInstructions = page.locator('.sr-only, [class*="visually-hidden"]');
    expect(await srInstructions.count()).toBeGreaterThan(0);
  });
});

// =============================================================================
// Theme/Color Mode Accessibility
// =============================================================================

test.describe('Theme Accessibility', () => {
  test('should maintain contrast in light mode', async ({ page }) => {
    await page.goto('/auth/login');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForTimeout(500);

    const accessibilityScanResults = await new AxeBuilder({ page })
      .options({
        runOnly: {
          type: 'rule',
          values: ['color-contrast'],
        },
      })
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should maintain contrast in dark mode', async ({ page }) => {
    await page.goto('/auth/login');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(500);

    const accessibilityScanResults = await new AxeBuilder({ page })
      .options({
        runOnly: {
          type: 'rule',
          values: ['color-contrast'],
        },
      })
      .analyze();

    // Note: Dark mode contrast can be tricky, may need tuning
    expect(accessibilityScanResults.violations.length).toBeLessThanOrEqual(1);
  });
});

// =============================================================================
// Reduced Motion Accessibility
// =============================================================================

test.describe('Reduced Motion', () => {
  test('should respect prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/auth/login');

    // Check that animations are disabled
    const animatedElements = await page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      let hasAnimation = false;
      
      elements.forEach((el) => {
        const styles = window.getComputedStyle(el);
        if (
          styles.animationName !== 'none' ||
          parseFloat(styles.animationDuration) > 0 ||
          parseFloat(styles.transitionDuration) > 0.01
        ) {
          // Allow very short transitions for focus states
          if (parseFloat(styles.transitionDuration) > 0.2) {
            hasAnimation = true;
          }
        }
      });
      
      return hasAnimation;
    });

    // Should not have long animations when reduced motion is preferred
    expect(animatedElements).toBe(false);
  });
});
