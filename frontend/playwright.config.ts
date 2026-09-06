import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 12_000 },
  outputDir: '../artifacts/demo/test-results',
  reporter: [
    ['line'],
    ['html', { outputFolder: '../artifacts/demo/playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    video: 'on',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
