const { test, expect } = require('@playwright/test');
const crypto = require('node:crypto');
const { setup, data, consent, noOverflow, download } = require('./publicUi.helpers.cjs');
setup(test);

test('long private history paginates on the server, downloads old originals and remains isolated at the same IP', async ({ page, browser }, info) => {
  const f = data(); await page.goto(f.productPath, { waitUntil: 'domcontentloaded' }); await consent(page);
  const ids = [];
  for (let i = 0; i < 10; i++) {
    const response = await page.request.post('/api/stores/' + f.publicPath.split('/').pop() + '/products/' + f.productId + '/pro/jobs', {
      data: { image: 'data:' + f.inputMime + ';base64,' + f.input, image_index: 0, request_key: crypto.randomUUID() },
    });
    expect(response.status()).toBe(202); const id = (await response.json()).data.id; ids.push(id);
    await expect.poll(async () => (await page.request.get('/api/tryon/jobs/' + id).then(r => r.json())).data.status, { intervals: [500], timeout: 15000 }).toBe('completed');
  }
  await page.reload(); await expect(page.getByAltText('آخرین خروجی موفق پرو آنلاین')).toBeVisible();
  await page.getByRole('button', { name: /موارد قبلی/ }).click();
  const history = page.getByRole('region', { name: 'موارد قبلی پرو' });
  await expect(history.locator('.public-history-card')).toHaveCount(8);
  const next = page.waitForResponse(response => response.url().includes('/api/tryon/history?page=2'));
  await history.getByRole('button', { name: 'بعدی', exact: true }).click();
  const response = await next; const result = (await response.json()).data;
  expect(result.items[0].id).toBe(ids[0]); await expect(history.locator('.public-history-card')).toHaveCount(1);
  await download(page, history.getByRole('button', { name: 'دانلود', exact: true }), info, 'oldest-history-original');
  const other = await browser.newContext({ baseURL: process.env.UIUX_BASE_URL, extraHTTPHeaders: info.project.use.extraHTTPHeaders });
  try {
    const privateHistory = await other.request.get('/api/tryon/history').then(r => r.json());
    expect(privateHistory.data.latest).toBeNull(); expect(privateHistory.data.items).toHaveLength(0);
    for (const kind of ['input', 'product', 'output']) expect((await other.request.get('/api/tryon/jobs/' + ids[0] + '/images/' + kind + '?download=1')).status()).toBe(404);
  } finally { await other.close(); }
  await noOverflow(page);
});

test('loading public CSS in the same app does not restyle the administration panel', async ({ page }) => {
  await page.addInitScript(token => localStorage.setItem('marketplace_token', token), data().admin.token);
  await page.goto('/admin/products', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'مدیریت محصولات', exact: true })).toBeVisible();
  const styles = () => page.locator('.btn-primary').first().evaluate(el => {
    const css = getComputedStyle(el); return { color: css.color, background: css.backgroundColor, borderRadius: css.borderRadius, fontFamily: css.fontFamily };
  });
  const before = await styles();
  await page.evaluate(url => { history.pushState({}, '', url); dispatchEvent(new PopStateEvent('popstate')); }, data().publicPath);
  await expect(page.getByRole('heading', { name: 'محصولات فروشگاه', exact: true })).toBeVisible();
  await page.evaluate(() => { history.pushState({}, '', '/admin/products'); dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.getByRole('heading', { name: 'مدیریت محصولات', exact: true })).toBeVisible();
  expect(await styles()).toEqual(before);
});
