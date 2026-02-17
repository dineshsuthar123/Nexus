/**
 * Visual Regression Tests for @nexus/ui Storybook
 *
 * These tests build Storybook, serve it, and take screenshots of each story
 * to detect unintended visual changes.
 *
 * Usage:
 *   pnpm --filter @nexus/ui test:visual
 *
 * Prerequisites:
 *   pnpm --filter @nexus/ui build-storybook
 */

import { test, expect } from '@playwright/test';

const STORYBOOK_URL = process.env.STORYBOOK_URL || 'http://localhost:6006';

/**
 * Critical stories that receive visual regression snapshots.
 * Format: [storyId, displayName]
 */
const VISUAL_STORIES: [string, string][] = [
  // Primitives
  ['components-alert--default', 'Alert Default'],
  ['components-alert--all-variants', 'Alert All Variants'],
  ['components-badge--default', 'Badge Default'],
  ['components-input--default', 'Input Default'],
  ['components-skeleton--default', 'Skeleton Default'],
  ['components-progress--default', 'Progress Default'],

  // Dialog & Modal
  ['components-dialog--open-by-default', 'Dialog Open'],
  ['components-dialog--destructive-action', 'Dialog Destructive'],
  ['components-modal--default', 'Modal Default'],

  // Data display
  ['components-table--default', 'Table Default'],
  ['components-table--sortable', 'Table Sortable'],
  ['components-table--with-pagination', 'Table Pagination'],
  ['fintech-datatable--default', 'DataTable Default'],
  ['fintech-datatable--loading', 'DataTable Loading'],
  ['fintech-datatable--empty', 'DataTable Empty'],
  ['fintech-datagrid--default', 'DataGrid Default'],
  ['fintech-datagrid--striped', 'DataGrid Striped'],
  ['fintech-datagrid--loading', 'DataGrid Loading'],

  // Select & Tabs
  ['components-select--default', 'Select Default'],
  ['components-select--sizes', 'Select Sizes'],
  ['components-tabs--default', 'Tabs Default'],
  ['components-tabs--underline', 'Tabs Underline'],
  ['components-tabs--pills', 'Tabs Pills'],
  ['components-tabs--cards', 'Tabs Cards'],
  ['components-tabs--with-icons', 'Tabs With Icons'],

  // Feedback
  ['components-toast--all-variants', 'Toast All Variants'],
  ['components-tooltip--default', 'Tooltip Default'],

  // Fintech domain components
  ['fintech-dashboardcard--dashboard-grid', 'Dashboard Grid'],
  ['fintech-dashboardcard--loading', 'Dashboard Loading'],
  ['fintech-transaction--transaction-list-view', 'Transaction List'],
  ['fintech-transaction--transaction-summary-view', 'Transaction Summary'],
  ['fintech-notificationcenter--default', 'Notification Center'],
  ['fintech-notificationcenter--empty', 'Notification Empty'],
  ['fintech-paymentwizard--default', 'Payment Wizard'],
];

test.describe('Visual Regression Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Disable animations for consistent screenshots
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
        }
      `,
    });
  });

  for (const [storyId, name] of VISUAL_STORIES) {
    test(`${name} matches snapshot`, async ({ page }) => {
      // Navigate to the isolated story iframe
      await page.goto(
        `${STORYBOOK_URL}/iframe.html?id=${storyId}&viewMode=story`,
        { waitUntil: 'networkidle' }
      );

      // Wait for content to render
      await page.waitForSelector('#storybook-root', { state: 'attached' });
      await page.waitForTimeout(500);

      // Take screenshot
      const screenshot = await page.screenshot({
        fullPage: true,
        animations: 'disabled',
      });

      expect(screenshot).toMatchSnapshot(`${storyId}.png`, {
        maxDiffPixelRatio: 0.03,
      });
    });
  }
});

test.describe('Component Accessibility Snapshots', () => {
  const A11Y_STORIES: [string, string][] = [
    ['components-dialog--open-by-default', 'Dialog a11y'],
    ['components-select--error-variant', 'Select Error a11y'],
    ['components-table--with-pagination', 'Table Pagination a11y'],
    ['fintech-datagrid--with-sorting', 'DataGrid Sort a11y'],
  ];

  for (const [storyId, name] of A11Y_STORIES) {
    test(`${name} — keyboard-navigable content renders`, async ({ page }) => {
      await page.goto(
        `${STORYBOOK_URL}/iframe.html?id=${storyId}&viewMode=story`,
        { waitUntil: 'networkidle' }
      );

      await page.waitForSelector('#storybook-root', { state: 'attached' });

      // Verify interactive elements are keyboard-focusable
      const focusableElements = await page.$$eval(
        '#storybook-root button, #storybook-root [role="button"], #storybook-root a[href], #storybook-root input, #storybook-root select, #storybook-root [tabindex="0"]',
        (els) => els.length
      );

      expect(focusableElements).toBeGreaterThan(0);
    });
  }
});

test.describe('Responsive Visual Tests', () => {
  const viewports = [
    { name: 'mobile', width: 375, height: 812 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1280, height: 800 },
  ];

  const RESPONSIVE_STORIES: [string, string][] = [
    ['fintech-dashboardcard--dashboard-grid', 'Dashboard Grid'],
    ['fintech-transaction--transaction-list-view', 'Transaction List'],
    ['components-table--with-pagination', 'Table'],
  ];

  for (const viewport of viewports) {
    for (const [storyId, name] of RESPONSIVE_STORIES) {
      test(`${name} at ${viewport.name} (${viewport.width}px)`, async ({ page }) => {
        await page.setViewportSize(viewport);

        await page.addStyleTag({
          content: '*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }',
        });

        await page.goto(
          `${STORYBOOK_URL}/iframe.html?id=${storyId}&viewMode=story`,
          { waitUntil: 'networkidle' }
        );

        await page.waitForSelector('#storybook-root', { state: 'attached' });
        await page.waitForTimeout(500);

        const screenshot = await page.screenshot({ fullPage: true, animations: 'disabled' });
        expect(screenshot).toMatchSnapshot(`${storyId}-${viewport.name}.png`, {
          maxDiffPixelRatio: 0.05,
        });
      });
    }
  }
});
