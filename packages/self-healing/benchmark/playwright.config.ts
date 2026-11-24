/**
 * Self-healing benchmark: 14 cases where the app's DOM is changed the way a developer would
 * (rename a data-test, drop it, change the label, delete the element). Ground truth is the
 * annotation "expected-heal": heal | refuse. Run `npm run heal:bench`. Not part of `npm test`.
 */
import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './cases',
  outputDir: '../../../test-results-heal',
  fullyParallel: true,
  retries: 0,
  // One worker: with a local CPU model, parallel heals queue up and time out (benchmark run 1).
  workers: 1,
  // Healing may call a local LLM on CPU (~40 s), so allow for it.
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['json', { outputFile: '../../../test-results-heal/results.json' }]],
  use: {
    baseURL: process.env.BASE_URL ?? 'https://practicesoftwaretesting.com',
    testIdAttribute: 'data-test',
    // Refusal cases fail on purpose; don't make each one wait the default action timeout.
    actionTimeout: 15_000,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
