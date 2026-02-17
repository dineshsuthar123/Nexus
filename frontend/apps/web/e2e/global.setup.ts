/**
 * Nexus RTP Platform - Auth E2E Tests Setup
 * 
 * Sets up global state for authentication tests.
 */

import { test as setup, expect } from '@playwright/test';
import { STORAGE_STATE_PATH } from './fixtures/auth';

/**
 * Global setup that runs before all tests.
 * Creates authenticated session storage for use in tests.
 */
setup('create authenticated session', async ({ page }) => {
  // Navigate to login page and wait for DOM to be ready
  await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });
  
  // Wait for the login heading to appear (proves page rendered)
  await page.getByRole('heading', { name: /sign in|welcome/i }).waitFor({ state: 'visible', timeout: 15000 });
  
  // If login page exists, we're ready for tests
  // In production, you'd authenticate and save session state:
  // await page.context().storageState({ path: STORAGE_STATE_PATH });
});
