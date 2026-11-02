const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
let fixture;
test.beforeAll(async () => {
  if (!process.env.RCA_E2E_METADATA) throw new Error('Disposable fixture metadata required.');
  fixture = JSON.parse(await fs.readFile(process.env.RCA_E2E_METADATA, 'utf8'));
});
test.beforeEach(async ({ context }) => {
  await context.route('https://cdn.kavenegar.com/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});
test.afterEach(async ({ request }) => { await request.post('/_fixture/auth', { data: { status: 0 } }); });

async function manualRetryReady(page) {
  const button = page.getByRole('button', { name: 'تلاش مجدد', exact: true });
  await expect.poll(() => button.evaluate(element => !element.disabled && !element.closest('section').textContent.includes('بررسی خودکار دوباره انجام می‌شود.')), { timeout: 20000 }).toBe(true);
}

test('QA-06 approval page retains a pending seller through auth 503 and recovers without login', async ({ page }) => {
  await page.addInitScript(token => localStorage.setItem('marketplace_token', token), fixture.pendingSeller.token);
  await page.request.post('/_fixture/auth', { data: { status: 503, count: 100 } });
  await page.goto('/seller/status', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'تلاش مجدد', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/seller\/status$/);
  expect(await page.evaluate(() => localStorage.getItem('marketplace_token'))).toBe(fixture.pendingSeller.token);
  await expect(page.getByRole('heading', { name: 'حساب فروشگاه شما در حال بررسی است', exact: true })).not.toBeVisible();
  await manualRetryReady(page);
  await page.request.post('/_fixture/auth', { data: { status: 0 } });
  await page.getByRole('button', { name: 'تلاش مجدد', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'حساب فروشگاه شما در حال بررسی است', exact: true })).toBeVisible();
});

test('QA-06 payment-result page hides account data during auth 503 and offers recovery', async ({ page }) => {
  await page.addInitScript(token => localStorage.setItem('marketplace_token', token), fixture.seller.token);
  await page.request.post('/_fixture/auth', { data: { status: 503, count: 100 } });
  await page.goto('/payments/result/' + 'a'.repeat(32), { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'تلاش مجدد', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'بررسی وضعیت پرداخت', exact: true })).not.toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('marketplace_token'))).toBe(fixture.seller.token);
  await manualRetryReady(page);
  await page.request.post('/_fixture/auth', { data: { status: 0 } });
  await page.getByRole('button', { name: 'تلاش مجدد', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'بررسی وضعیت پرداخت', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'بازگشت به حساب', exact: true })).toBeVisible();
});

test('regression: synthetic browser camera capture works and stops tracks without dispatching AI', async ({ page, context }) => {
  test.setTimeout(90000);
  await context.grantPermissions(['camera']);
  const before = await page.request.get('/_fixture/state').then(response => response.json());
  await page.goto(fixture.productPath, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /گرفتن عکس دریافت مجوز/ }).click();
  const dialog = page.getByRole('dialog', { name: 'گرفتن عکس با دوربین', exact: true });
  await expect(dialog).toBeVisible();
  const capture = dialog.getByRole('button', { name: 'ثبت عکس', exact: true });
  await expect(capture).toBeEnabled();
  await page.evaluate(() => { window.__qaCameraTracks = document.querySelector('video').srcObject.getTracks(); });
  await capture.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByAltText('تصویر انتخاب‌شده کاربر')).toBeVisible();
  expect(await page.getByAltText('تصویر انتخاب‌شده کاربر').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__qaCameraTracks.every(track => track.readyState === 'ended'))).toBe(true);
  expect((await page.request.get('/_fixture/state').then(response => response.json())).calls).toBe(before.calls);
});
