import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src/__tests__',
  testMatch: 'visual-regression.spec.ts',
  snapshotDir: './src/__snapshots__',
  outputDir: './visual-regression-results',

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'html' : 'list',

  expect: {
    toMatchSnapshot: {
      maxDiffPixelRatio: 0.03,
    },
  },

  use: {
    baseURL: process.env.STORYBOOK_URL || 'http://localhost:6006',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: process.env.CI
    ? undefined
    : {
        command: 'pnpm storybook --ci --port 6006',
        port: 6006,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
});
