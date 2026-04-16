import { defineConfig, devices } from '@playwright/test';

const localBase = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3501';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: localBase,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.CI
    ? {
        command: 'npm run start',
        url: localBase,
        timeout: 120_000,
        reuseExistingServer: false,
      }
    : {
        command: 'npm run dev',
        url: localBase,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
