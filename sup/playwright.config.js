import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  reporter: 'list',
  outputDir: './test-results',
  use: {
    baseURL: process.env.SUP_BASE_URL || 'http://zuffie.test:8766/sup/',
    browserName: 'chromium',
    viewport: { width: 1440, height: 1000 },
    locale: 'pl-PL',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: process.env.SUP_CHROMIUM || '/run/current-system/sw/bin/chromium',
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    }
  }
});
