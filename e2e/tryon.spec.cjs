const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
if (!process.env.E2E_METADATA) throw new Error('E2E_METADATA must point to a disposable test fixture, never production.');
let fixture;
test.beforeAll(async () => { fixture = JSON.parse(await fs.readFile(process.env.E2E_METADATA, 'utf8')); });

async function prepare(page) {
  await page.goto(fixture.publicPath, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('فایل تصویر شخص').setInputFiles({ name: 'qa-person.png', mimeType: 'image/png', buffer: Buffer.from(fixture.input, 'base64') });
  await page.getByText('با پردازش عکس برای پرو و نگهداری خصوصی سوابق موافقم.', { exact: false }).click();
  await expect(page.getByRole('button', { name: 'ساخت خروجی پرو', exact: true })).toBeEnabled();
}
async function make(page, testInfo) {
  await page.request.post('/_fixture/hold', { maxRetries: 2 });
  const before = await page.request.get('/_fixture/state', { maxRetries: 2 }).then((r) => r.json());
  const slot = page.getByTestId('tryon-action-slot');
  const box = await slot.boundingBox();
  await page.getByRole('button', { name: 'ساخت خروجی پرو', exact: true }).dblclick();
  await expect(page.getByRole('progressbar')).toBeVisible();
  await expect(page.getByRole('button', { name: 'ساخت خروجی پرو', exact: true })).toHaveCount(0);
  await expect(page.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow', '100');
  await expect.poll(async () => page.getByRole('progressbar').getAttribute('aria-valuenow')).toBe(null);
  expect(Math.abs((await slot.boundingBox()).height - box.height)).toBeLessThan(2);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  if (testInfo) await page.getByTestId('tryon-action-slot').screenshot({ path: testInfo.outputPath('tryon-progress-' + Date.now() + '.png') });
  await page.request.post('/_fixture/release', { maxRetries: 2 });
  await expect(page.getByText('خروجی با موفقیت ذخیره شد.', { exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  const after = await page.request.get('/_fixture/state', { maxRetries: 2 }).then((r) => r.json());
  expect(after.calls - before.calls).toBe(1);
  await expect(page.getByAltText('آخرین خروجی موفق پرو آنلاین')).toBeVisible();
}
async function download(page, button, testInfo, label) {
  const event = page.waitForEvent('download');
  await button.click();
  const file = await event;
  expect(file.suggestedFilename()).toMatch(/^rookhposh-tryon-.*\.webp$/);
  const target = testInfo.outputPath(label + '.webp');
  await file.saveAs(target);
  const bytes = await fs.readFile(target);
  expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
  expect(bytes.subarray(8, 12).toString()).toBe('WEBP');
  expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(crypto.createHash('sha256').update(Buffer.from(fixture.output, 'base64')).digest('hex'));
  return target;
}
test('real UI progress, latest output, private history and current/old downloads', async ({ page, context }, testInfo) => {
  if (testInfo.project.name.startsWith('mobile')) await page.emulateMedia({ reducedMotion: 'reduce' });
  await prepare(page); await make(page, testInfo);
  await download(page, page.getByRole('button', { name: 'دانلود خروجی', exact: true }), testInfo, 'current');
  await page.screenshot({ path: testInfo.outputPath('tryon-completed.png'), fullPage: true });
  await page.reload();
  await expect(page.getByAltText('آخرین خروجی موفق پرو آنلاین')).toBeVisible();
  await expect(page.getByRole('button', { name: /موارد قبلی/ })).toHaveAttribute('aria-expanded', 'false');
  await prepare(page); await make(page, testInfo);
  const accordion = page.getByRole('button', { name: /موارد قبلی/ });
  await accordion.click(); await expect(accordion).toHaveAttribute('aria-expanded', 'true');
  const history = page.getByRole('region', { name: 'موارد قبلی پرو' });
  await expect(history.getByRole('button', { name: 'دانلود', exact: true }).first()).toBeVisible();
  await download(page, history.getByRole('button', { name: 'دانلود', exact: true }).first(), testInfo, 'previous');
  const preview = history.getByRole('button', { name: 'مشاهده', exact: true }).first();
  await preview.click();
  await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape');
  await expect(preview).toBeFocused();
  await accordion.click(); await expect(accordion).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const second = await context.browser().newContext({ baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:18731' });
  const historyBody = await second.request.get('/api/tryon/history').then((r) => r.json());
  expect(historyBody.data.latest).toBe(null); expect(historyBody.data.items).toHaveLength(0);
  await second.close();
});

test('recoverable AI failure offers controlled retry and preserves last output', async ({ page }) => {
  await prepare(page); await make(page);
  const previousOutput = await page.getByAltText('آخرین خروجی موفق پرو آنلاین').getAttribute('src');
  await page.getByRole('button', { name: 'پرو جدید', exact: true }).click();
  await page.request.post('/_fixture/mode', { maxRetries: 2, data: { mode: 'failure' } });
  try {
    await page.getByRole('button', { name: 'ساخت خروجی پرو', exact: true }).click();
    await expect(page.getByRole('button', { name: 'تلاش مجدد', exact: true })).toBeVisible();
    await expect(page.getByAltText('آخرین خروجی موفق پرو آنلاین')).toHaveAttribute('src', previousOutput);
    await page.request.post('/_fixture/mode', { maxRetries: 2, data: { mode: 'success' } });
    await page.getByRole('button', { name: 'تلاش مجدد', exact: true }).click();
    await expect(page.getByText('خروجی با موفقیت ذخیره شد.', { exact: true })).toBeVisible();
  } finally { await page.request.post('/_fixture/mode', { maxRetries: 2, data: { mode: 'success' } }); }
});

test('admin logs, protected image details and masked provider settings render real database records', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith('mobile'), 'Desktop admin review covered separately; mobile try-on/download is above.');
  await page.goto('/admin/login', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('admin@example.com').fill(fixture.admin.username);
  await page.getByPlaceholder('رمز عبور', { exact: true }).fill(fixture.admin.password);
  await page.getByRole('button', { name: 'ورود به پنل مدیریت', exact: true }).click();
  await page.getByRole('link', { name: 'پرو آنلاین', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'پرو آنلاین', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'جزئیات', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('تصاویر واقعی عملیات', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('admin-tryon.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await page.goto('/admin/settings/tryon', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'تنظیمات هوش مصنوعی پرو مجازی', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ذخیره سرویس', exact: true })).toHaveCount(3);
  await expect(page.getByLabel('کلید جایگزین API').first()).toHaveValue('');
});

test('product approval requires details; rejection is shown to seller and corrected product is resubmitted', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chrome', 'One mutation suite; transaction races and authorization run in database integration tests.');
  await page.addInitScript((token) => localStorage.setItem('marketplace_token', token), fixture.admin.token);
  await page.goto('/admin/products', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'تایید لباس', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'رد + علت', exact: true })).toHaveCount(0);
  const row = page.getByRole('row').filter({ hasText: fixture.pendingProduct.title });
  await row.getByRole('button', { name: 'جزئیات', exact: true }).click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByText('تمام تصاویر محصول', { exact: true })).toBeVisible();
  await modal.getByRole('button', { name: 'رد محصول', exact: true }).click();
  await modal.getByLabel('دلیل رد محصول').selectOption({ label: 'سایر موارد' });
  await expect(modal.getByRole('button', { name: 'ثبت رد محصول', exact: true })).toBeDisabled();
  await modal.getByLabel(/توضیحات تکمیلی/).fill('QA نیاز به تصویر واضح‌تر');
  await modal.getByRole('button', { name: 'ثبت رد محصول', exact: true }).click();
  await expect(modal.getByText(/با ثبت دلیل رد شد/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('product-review.png'), fullPage: true });
  const seller = await page.context().browser().newContext({ baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:18731' });
  await seller.addInitScript((token) => localStorage.setItem('marketplace_token', token), fixture.seller.token);
  const sellerPage = await seller.newPage(); await sellerPage.goto('/seller/products', { waitUntil: 'domcontentloaded' });
  const response = await seller.request.get('/api/seller/products', { headers: { authorization: 'Bearer ' + fixture.seller.token } });
  const product = (await response.json()).data.find((p) => p.id === fixture.pendingProduct.id);
  expect(product.reject_comment).toBe('QA نیاز به تصویر واضح‌تر');
  const updated = await seller.request.patch('/api/seller/products/' + product.id, { headers: { authorization: 'Bearer ' + fixture.seller.token }, data: { title: 'QA corrected', description: 'QA correction', images: product.images, features: product.features } });
  expect(updated.status()).toBe(200);
  expect((await updated.json()).data.status).toBe('pending');
  await seller.close();
  await page.keyboard.press('Escape'); await page.reload();
  await page.getByRole('row').filter({ hasText: 'QA corrected' }).getByRole('button', { name: 'جزئیات', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'تأیید محصول', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'تأیید نهایی محصول', exact: true });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'ثبت تأیید نهایی', exact: true }).click();
  await expect(page.getByText('محصول تأیید شد و به فروشنده اطلاع داده شد.', { exact: true })).toBeVisible();
});
