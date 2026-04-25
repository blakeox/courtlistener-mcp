import { defineConfig, devices } from 'playwright/test';

const port = 42317;

export default defineConfig({
  testDir: './src/web-spa/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `npx vite --config src/web-spa/vite.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/app/control-center`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
