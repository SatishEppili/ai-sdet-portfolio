/**
 * Seeded-failure benchmark: 20 tests that fail ON PURPOSE, 5 per category, each tagged with
 * its ground truth (annotation "expected-category"). Run with `npm run triage:seed`, then
 * score the bot with `npm run triage:bench`. Not part of the normal suite.
 */
import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './seeded',
  outputDir: '../../../test-results-seeded',
  fullyParallel: true,
  retries: 1, // needed so flaky cases can fail first and pass on retry
  workers: 4,
  timeout: 25_000,
  expect: { timeout: 5_000 },
  reporter: [['list'], ['json', { outputFile: '../../../test-results-seeded/results.json' }]],
  use: {
    baseURL: process.env.BASE_URL ?? 'https://practicesoftwaretesting.com',
    testIdAttribute: 'data-test',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
