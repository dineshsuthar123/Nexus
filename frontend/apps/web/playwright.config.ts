/**
 * Nexus RTP Platform - Playwright Configuration
 *
 * E2E testing configuration for the Next.js web application.
 */

import { defineConfig, devices } from '@playwright/test';

/**
 * Set environment variables for E2E test mode.
 * These ensure the Next.js dev server starts without auth issues.
 */
process.env.NEXT_PUBLIC_MOCK_MODE = 'true';
process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'e2e-test-secret-not-a-real-secret-value-32chars';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'playwright-report/results.json' }],
    process.env.CI ? ['github'] : ['list'],
  ],

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Capture screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video recording */
    video: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    /* Setup project that runs before all tests */
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },

    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
      testIgnore: /(a11y|accessibility)\.spec\.ts/,
      dependencies: ['setup'],
    },

    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
      },
      testIgnore: /(a11y|accessibility)\.spec\.ts/,
      dependencies: ['setup'],
    },

    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
      },
      testIgnore: /(a11y|accessibility)\.spec\.ts/,
      dependencies: ['setup'],
    },

    /* Test against mobile viewports. */
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 5'],
      },
      testIgnore: /(a11y|accessibility)\.spec\.ts/,
      dependencies: ['setup'],
    },
    {
      name: 'Mobile Safari',
      use: {
        ...devices['iPhone 12'],
      },
      testIgnore: /(a11y|accessibility)\.spec\.ts/,
      dependencies: ['setup'],
    },

    /* Accessibility testing project */
    {
      name: 'a11y',
      use: {
        ...devices['Desktop Chrome'],
      },
      testMatch: /.*\.(a11y|accessibility)\.spec\.ts/,
      dependencies: ['setup'],
      retries: 0,
      timeout: 30 * 1000,
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: process.env.CI
      ? 'npx next start'
      : 'npx next build && npx next start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180 * 1000,
    env: {
      NODE_ENV: 'production',
      NEXT_PUBLIC_MOCK_MODE: 'true',
      NEXTAUTH_URL: 'http://localhost:3000',
      NEXTAUTH_SECRET: 'e2e-test-secret-not-a-real-secret-value-32chars',
    },
  },
});
