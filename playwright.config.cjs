const { defineConfig, devices } = require('@playwright/test');
const path = require('node:path');
module.exports = defineConfig({
  testDir: './e2e',
  testIgnore: '**/root-cause*.spec.cjs',
  fullyParallel: false,
  workers: 1,
  timeout: 150000,
  expect: { timeout: 12000 },
  outputDir: process.env.E2E_ARTIFACTS || 'test-results',
  reporter: [['list'], ['json', { outputFile: path.join(process.env.E2E_ARTIFACTS || 'test-results', 'results.json') }]],
  use: { baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:18731', trace: 'retain-on-failure', screenshot: 'only-on-failure', acceptDownloads: true },
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'], launchOptions: process.env.E2E_CHROME_PATH ? { executablePath: process.env.E2E_CHROME_PATH } : {} } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], launchOptions: process.env.E2E_FIREFOX_PATH ? { executablePath: process.env.E2E_FIREFOX_PATH } : {} } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], launchOptions: process.env.E2E_WEBKIT_PATH ? { executablePath: process.env.E2E_WEBKIT_PATH } : {} } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'], launchOptions: process.env.E2E_CHROME_PATH ? { executablePath: process.env.E2E_CHROME_PATH } : {} } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'], launchOptions: process.env.E2E_WEBKIT_PATH ? { executablePath: process.env.E2E_WEBKIT_PATH } : {} } },
  ],
});
