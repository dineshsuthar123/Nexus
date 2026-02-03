/**
 * Nexus RTP Platform - Auth Test Fixtures
 * 
 * Shared fixtures and utilities for authentication E2E tests.
 */

import { test as base, expect, Page } from '@playwright/test';
import path from 'path';

// Storage state path for authenticated sessions
export const STORAGE_STATE_PATH = path.join(__dirname, '../.auth/user.json');

// Test user credentials
export const TEST_USER = {
  email: 'test@nexusrtp.com',
  password: 'TestPassword123!',
  firstName: 'Test',
  lastName: 'User',
};

export const ADMIN_USER = {
  email: 'admin@nexusrtp.com',
  password: 'AdminPassword123!',
  firstName: 'Admin',
  lastName: 'User',
};

// =============================================================================
// Extended Test Fixture with Auth Utilities
// =============================================================================

export interface AuthFixtures {
  loginPage: LoginPage;
  registerPage: RegisterPage;
}

class LoginPage {
  constructor(public readonly page: Page) {}

  async goto() {
    await this.page.goto('/auth/login');
    await this.page.waitForLoadState('networkidle');
  }

  async login(email: string, password: string) {
    await this.page.getByLabel(/email/i).fill(email);
    await this.page.getByLabel(/password/i).fill(password);
    await this.page.getByRole('button', { name: /sign in/i }).click();
  }

  async expectError(message: string | RegExp) {
    await expect(this.page.getByRole('alert')).toContainText(message);
  }

  async expectToBeOnDashboard() {
    await expect(this.page).toHaveURL(/\/dashboard/);
  }

  async expectToBeOnMfa() {
    await expect(this.page).toHaveURL(/\/auth\/mfa/);
  }
}

class RegisterPage {
  constructor(public readonly page: Page) {}

  async goto() {
    await this.page.goto('/auth/register');
    await this.page.waitForLoadState('networkidle');
  }

  async register(data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }) {
    await this.page.getByLabel(/first name/i).fill(data.firstName);
    await this.page.getByLabel(/last name/i).fill(data.lastName);
    await this.page.getByLabel(/email/i).fill(data.email);
    await this.page.getByLabel(/^password$/i).fill(data.password);
    await this.page.getByLabel(/confirm password/i).fill(data.password);
    await this.page.getByLabel(/terms|agree/i).check();
    await this.page.getByRole('button', { name: /create account|sign up/i }).click();
  }

  async expectError(message: string | RegExp) {
    await expect(this.page.getByRole('alert')).toContainText(message);
  }

  async expectSuccess() {
    await expect(
      this.page.getByText(/check your email|verification|success/i)
    ).toBeVisible();
  }
}

// Extend base test with auth fixtures
export const test = base.extend<AuthFixtures>({
  loginPage: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await use(loginPage);
  },
  registerPage: async ({ page }, use) => {
    const registerPage = new RegisterPage(page);
    await use(registerPage);
  },
});

export { expect };
