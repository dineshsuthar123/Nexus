import type { TestRunnerConfig } from '@storybook/test-runner';
import { toMatchImageSnapshot } from 'jest-image-snapshot';
import { getStoryContext } from '@storybook/test-runner';

const customSnapshotsDir = `${process.cwd()}/src/__snapshots__`;

const config: TestRunnerConfig = {
  setup() {
    expect.extend({ toMatchImageSnapshot });
  },
  async postVisit(page, context) {
    // Wait for animations to settle
    await page.waitForTimeout(300);

    // Get story context for metadata
    const storyContext = await getStoryContext(page, context);
    const { parameters } = storyContext;

    // Skip visual tests for stories that opt out
    if (parameters?.snapshot?.disable) {
      return;
    }

    // Take screenshot of the Storybook canvas body
    const elementHandler = await page.$('#storybook-root');
    if (!elementHandler) return;

    const image = await elementHandler.screenshot();

    expect(image).toMatchImageSnapshot({
      customSnapshotsDir,
      customSnapshotIdentifier: `${context.id}`,
      failureThreshold: 0.03, // 3% threshold for subtle rendering differences
      failureThresholdType: 'percent',
    });
  },
};

export default config;
