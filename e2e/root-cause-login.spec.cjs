const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');

test('QA-06 actual password login and page reload preserve a verified admin session', async ({ page, context }) => {
  if (!process.env.RCA_E2E_METADATA) throw new Error('Disposable fixture metadata required.');
  const fixture = JSON.parse(await fs.readFile(process.env.RCA_E2E_METADATA, 'utf8'));
  await context.route('https://cdn.kavenegar.com/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await page.goto('/admin/v2/login', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('admin@example.com').fill(fixture.admin.username);
  await page.getByPlaceholder('رمز عبور', { exact: true }).fill(fixture.admin.password);
  await page.getByRole('button', { name: 'ورود به پنل مدیریت', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  const token = await page.evaluate(() => localStorage.getItem('marketplace_token'));
  expect(token).toBeTruthy();
  await page.goto('/admin/products', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'مدیریت محصولات', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'مدیریت محصولات', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('marketplace_token'))).toBe(token);
});
