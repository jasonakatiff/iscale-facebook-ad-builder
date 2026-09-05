import { defineConfig, devices } from '@playwright/test';

// Support testing against production via BASE_URL env var
const baseURL = process.env.BASE_URL || 'http://localhost:5173';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 30000,
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Use fresh browser context (like Guest Profile) - no saved data
        storageState: undefined,
      },
    },
  ],
  // Only start local server if testing against localhost
  webServer: baseURL.includes('localhost') ? {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  } : undefined,
});
