import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  workers: 1,
  use: {
    browserName: 'chromium',
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
});
