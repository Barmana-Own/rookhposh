const { defineConfig, devices } = require('@playwright/test');
const path = require('node:path');
const projects = [1440, 1280, 1024, 768, 390, 360].map((width, index) => ({
  name: String(width), testMatch: width === 1440 ? /public-redesign.*\.spec\.cjs/ : /public-redesign\.spec\.cjs/,
  use: { ...(width < 768 ? devices['Pixel 7'] : devices['Desktop Chrome']), viewport: { width, height: width < 768 ? 844 : 1000 },
    extraHTTPHeaders: { 'X-Forwarded-For': '198.18.20.' + (index + 1) },
    launchOptions: { executablePath: process.env.E2E_CHROME_PATH, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } },
}));
module.exports = defineConfig({
  testDir: './e2e', testMatch: /public-redesign.*\.spec\.cjs/, workers: 1, timeout: 100000,
  expect: { timeout: 15000 }, outputDir: process.env.UIUX_ARTIFACTS || 'test-results/public-ui',
  reporter: [['list'], ['json', { outputFile: path.join(process.env.UIUX_ARTIFACTS || 'test-results/public-ui', 'results.json') }]],
  use: { baseURL: process.env.UIUX_BASE_URL || 'http://127.0.0.1:18742', screenshot: 'only-on-failure', trace: 'off', acceptDownloads: true }, projects,
});
