import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  timeout: 30_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: [
      'SETUP_NON_INTERACTIVE=1',
      'SETUP_ADMIN_LOGIN=\'KL\\\\Kuznetsov_il\'',
      './setup.sh --dev-full --mock-oidc',
    ].join(' '),
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 600_000,
  },
});
