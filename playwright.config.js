import { defineConfig } from '@playwright/test';
export default defineConfig({
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node scripts/e2e-server.js',
    url: 'http://127.0.0.1:4173/health/ready',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
