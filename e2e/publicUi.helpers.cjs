const { expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
let fixture;

function setup(test) {
  test.beforeAll(async () => {
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.UIUX_BASE_URL || '') || !process.env.UIUX_METADATA) throw new Error('Public UI tests require an isolated loopback fixture.');
    fixture = JSON.parse(await fs.readFile(process.env.UIUX_METADATA, 'utf8'));
    expect(fixture.kind).toBe('public-ui-isolated');
  });
  test.beforeEach(async ({ context, request }) => {
    const state = await request.get('/_fixture/state', { maxRetries: 2 }).then(r => r.json());
    expect(state.fixture).toBe('public-ui-isolated');
    await context.route('https://cdn.kavenegar.com/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    const watch = page => {
      page._uiuxErrors = [];
      page.on('pageerror', error => page._uiuxErrors.push(error.message));
      page.on('console', message => {
        const url = message.location().url || '';
        if (message.type() === 'error' && url.startsWith(process.env.UIUX_BASE_URL) && !url.includes('/uiux-missing-image.webp')) page._uiuxErrors.push(message.text());
      });
    };
    context.pages().forEach(watch); context.on('page', watch);
  });
  test.afterEach(async ({ context, request }) => {
    // Fixture controls are idempotent; retry only transport resets, never a new generation.
    await request.post('/_fixture/release', { maxRetries: 2 }); await request.post('/_fixture/mode', { maxRetries: 2, data: { mode: 'success' } });
    for (const page of context.pages()) expect(page._uiuxErrors || []).toEqual([]);
  });
}
const data = () => fixture;
async function upload(page) {
  await page.getByLabel('فایل تصویر شخص').setInputFiles({ name: 'uiux-person.' + (fixture.inputMime === 'image/jpeg' ? 'jpg' : 'png'), mimeType: fixture.inputMime, buffer: Buffer.from(fixture.input, 'base64') });
  await expect(page.getByRole('button', { name: 'ساخت خروجی پرو', exact: true })).toBeEnabled();
}
async function consent(page) {
  const response = await page.request.get('/api/tryon/terms').then(r => r.json());
  if (response.data.required) expect((await page.request.post('/api/tryon/terms', { data: { version: response.data.version, accepted: true } })).status()).toBe(200);
}
async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function shot(page, info, state) {
  const width = info.project.name;
  if (!(width === '1440' || ['store', 'idle'].includes(state) || width === '390' && ['success', 'camera'].includes(state) || width === '360' && state === 'selected')) return;
  const dir = process.env.UIUX_SCREENSHOT_DIR;
  if (!dir) throw new Error('Screenshot evidence directory required.');
  await fs.mkdir(dir, { recursive: true });
  if (state === 'store') for (const card of await page.locator('.public-product-card').all()) await card.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(dir, state + '-' + width + '.png'), fullPage: true, animations: 'disabled' });
}
async function download(page, button, info, name) {
  const pending = page.waitForEvent('download'); await button.click(); const file = await pending;
  expect(file.suggestedFilename()).toMatch(/^rookhposh-tryon-.*\.webp$/);
  const target = info.outputPath(name + '.webp'); await file.saveAs(target);
  const bytes = await fs.readFile(target);
  expect(bytes.subarray(0, 4).toString()).toBe('RIFF'); expect(bytes.subarray(8, 12).toString()).toBe('WEBP');
  expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(crypto.createHash('sha256').update(Buffer.from(fixture.output, 'base64')).digest('hex'));
}
module.exports = { setup, data, upload, consent, noOverflow, shot, download };
