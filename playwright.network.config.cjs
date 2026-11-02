const { defineConfig, devices } = require('@playwright/test');
const path = require('node:path');
const output = process.env.NETWORK_E2E_RESULTS || 'test-results/network';
module.exports = defineConfig({
  testDir: './e2e', testMatch: 'network-resilience.spec.cjs', workers: 1, timeout: 120000,
  expect: { timeout: 20000 }, outputDir: output,
  reporter: [['list'], ['json', { outputFile: path.join(output, 'results.json') }]],
  use: { baseURL: process.env.NETWORK_BASE_URL, acceptDownloads: true, screenshot: 'only-on-failure', trace: 'off',
    launchOptions: { executablePath: process.env.E2E_CHROME_PATH } },
  projects: [
    { name: '1440', use: { viewport: { width: 1440, height: 1000 } } },
    { name: '390', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
  ],
});
