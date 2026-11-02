const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
let fixture;
test.beforeAll(async () => {
  if (!process.env.RCA_E2E_METADATA) throw new Error('Disposable fixture required.');
  fixture = JSON.parse(await fs.readFile(process.env.RCA_E2E_METADATA, 'utf8'));
});
test.beforeEach(async ({ context }) => {
  await context.route('https://cdn.kavenegar.com/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});
async function prepare(page) {
  await page.goto(fixture.productPath, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('فایل تصویر شخص').setInputFiles({ name: 'qa-person.png', mimeType: 'image/png', buffer: Buffer.from(fixture.input, 'base64') });
  await expect(page.getByRole('button', { name: 'ساخت خروجی پرو', exact: true })).toBeEnabled();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByText('اختیاری: برای رفع اشکال', { exact: false })).toHaveCount(0);
  await expect(page.getByText('می‌توانم عکس‌های هر مورد را از سوابق خود حذف کنم.', { exact: false })).toHaveCount(0);
}
const dialog = page => page.getByRole('dialog', { name: 'قوانین استفاده از پرو آنلاین', exact: true });
const done = page => expect(page.getByText('خروجی با موفقیت ذخیره شد.', { exact: true })).toBeVisible();
async function download(page, button, info, name) {
  const pending = page.waitForEvent('download'); await button.click(); const file = await pending;
  expect(file.suggestedFilename()).toMatch(/\.webp$/);
  const target = info.outputPath(name + '.webp'); await file.saveAs(target);
  const bytes = await fs.readFile(target);
  expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(crypto.createHash('sha256').update(Buffer.from(fixture.output, 'base64')).digest('hex'));
}

test('guest accepts once; cancelling has no job; history remains private and both downloads work without delete controls', async ({ page, browser }, info) => {
  test.setTimeout(100000);
  await prepare(page);
  const start = page.getByRole('button', { name: 'ساخت خروجی پرو', exact: true });
  await start.click(); await expect(dialog(page)).toBeVisible();
  await page.screenshot({ path: info.outputPath('first-use-terms.png'), fullPage: true });
  expect((await page.request.get('/api/tryon/history').then(r => r.json())).data.active_job).toBeNull();
  await dialog(page).getByRole('button', { name: 'انصراف', exact: true }).click();
  await expect(start).toBeFocused();
  const before = await page.request.get('/_fixture/state').then(r => r.json());
  await page.request.post('/_fixture/hold');
  try {
    await start.dblclick(); await expect(dialog(page)).toBeVisible();
    await dialog(page).getByRole('button', { name: 'پذیرش قوانین و ساخت خروجی', exact: true }).click();
    await expect(page.getByRole('progressbar')).toBeVisible(); await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => page.getByRole('progressbar').getAttribute('aria-valuenow')).toBeNull();
    await page.screenshot({ path: info.outputPath('first-use-processing.png'), fullPage: true });
  } finally { await page.request.post('/_fixture/release'); }
  await done(page);
  expect((await page.request.get('/_fixture/state').then(r => r.json())).calls - before.calls).toBe(1);
  const first = (await page.request.get('/api/tryon/history').then(r => r.json())).data.latest;
  const detail = await page.request.get('/api/admin/tryon/jobs/' + first.id, { headers: { authorization: 'Bearer ' + fixture.admin.token } }).then(r => r.json());
  expect(detail.data.diagnostics_consent).toBe(false); expect(detail.data.device).toBeNull(); expect(detail.data.network).toBeNull();
  await download(page, page.getByRole('button', { name: 'دانلود خروجی', exact: true }), info, 'latest-first');
  await page.reload(); await expect(page.getByAltText('آخرین خروجی موفق پرو آنلاین')).toBeVisible();
  expect((await page.request.get('/api/tryon/terms').then(r => r.json())).data.required).toBe(false);
  await prepare(page);
  await page.request.post('/_fixture/hold');
  try {
    await start.click(); await expect(page.getByRole('progressbar')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } finally { await page.request.post('/_fixture/release'); }
  await done(page);
  await page.getByRole('button', { name: /موارد قبلی/ }).click();
  const history = page.getByRole('region', { name: 'موارد قبلی پرو' });
  await expect(history.getByRole('button', { name: 'مشاهده', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /حذف/ })).toHaveCount(0);
  await download(page, history.getByRole('button', { name: 'دانلود', exact: true }).first(), info, 'history-original');
  await page.screenshot({ path: info.outputPath('history-without-delete.png'), fullPage: true });
  const other = await browser.newContext({ baseURL: process.env.RCA_BASE_URL });
  try {
    expect((await other.request.get('/api/tryon/terms').then(r => r.json())).data.required).toBe(true);
    expect((await other.request.get('/api/tryon/jobs/' + first.id + '/images/output')).status()).toBe(404);
  } finally { await other.close(); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('registered seller uses registration policy without another consent dialog', async ({ page }) => {
  await page.addInitScript(token => localStorage.setItem('marketplace_token', token), fixture.seller.token);
  await prepare(page); await page.getByRole('button', { name: 'ساخت خروجی پرو', exact: true }).click();
  await done(page); await expect(dialog(page)).toHaveCount(0);
  const terms = await page.request.get('/api/tryon/terms', { headers: { authorization: 'Bearer ' + fixture.seller.token } }).then(r => r.json());
  expect(terms.data.required).toBe(false);
});

test('failed acceptance keeps terms open and retries without creating an unapproved job', async ({ page }) => {
  await prepare(page); await page.getByRole('button', { name: 'ساخت خروجی پرو', exact: true }).click();
  await expect(dialog(page)).toBeVisible();
  await page.route('**/api/tryon/terms', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'ثبت تأیید انجام نشد؛ دوباره امتحان کنید.' }) }) : route.continue());
  await dialog(page).getByRole('button', { name: 'پذیرش قوانین و ساخت خروجی', exact: true }).click();
  await expect(dialog(page).getByRole('alert')).toBeVisible();
  expect((await page.request.get('/api/tryon/history').then(r => r.json())).data.active_job).toBeNull();
  await page.unroute('**/api/tryon/terms');
  await dialog(page).getByRole('button', { name: 'پذیرش قوانین و ساخت خروجی', exact: true }).click();
  await done(page);
});

test('slow terms verification locks the chosen inputs and cancellation restores them', async ({ page }) => {
  await prepare(page);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/tryon/terms', async route => { await gate; await route.continue(); });
  try {
    await page.getByRole('button', { name: 'ساخت خروجی پرو', exact: true }).click();
    await expect(page.getByRole('button', { name: 'در حال بررسی...', exact: true })).toBeDisabled();
    await expect(page.getByLabel('فایل تصویر شخص')).toBeDisabled();
    await expect(page.getByRole('button', { name: /آپلود عکس/ })).toBeDisabled();
    release(); await expect(dialog(page)).toBeVisible();
    await dialog(page).getByRole('button', { name: 'انصراف', exact: true }).click();
    await expect(page.getByLabel('فایل تصویر شخص')).toBeEnabled();
  } finally { release(); await page.unroute('**/api/tryon/terms'); }
});
