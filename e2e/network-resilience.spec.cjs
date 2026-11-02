const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
let fixture;
const metadataRequest = url => url.pathname.startsWith('/api/stores/') && !url.pathname.includes('/media/') && !url.pathname.includes('/pro/');
const generationRequest = url => url.pathname.endsWith('/pro/jobs');

test.beforeAll(() => {
  const url = new URL(process.env.NETWORK_BASE_URL);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port) throw Error('Isolated loopback fixture required');
  fixture = JSON.parse(fs.readFileSync(process.env.NETWORK_METADATA, 'utf8'));
  expect(fixture.kind).toBe('public-ui-isolated');
});
test.beforeEach(async ({ context, request }) => {
  expect((await request.get('/_fixture/state').then(r => r.json())).fixture).toBe('public-ui-isolated');
  await context.route(url => ['cdn.kavenegar.com', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname), route => route.fulfill({ status: 200, body: '' }));
  const watch = page => { page._errors = []; page.on('pageerror', error => page._errors.push(error.message)); };
  context.pages().forEach(watch); context.on('page', watch);
});
test.afterEach(async ({ context, request }) => {
  await request.post('/_fixture/release', { maxRetries: 2 });
  await request.post('/_fixture/mode', { maxRetries: 2, data: { mode: 'success' } });
  for (const page of context.pages()) expect(page._errors || []).toEqual([]);
});
async function open(page) {
  await page.goto(fixture.productPath, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'پرو آنلاین محصول', exact: true })).toBeVisible();
}
async function upload(page) {
  await page.getByLabel('فایل تصویر شخص').setInputFiles({ name: 'person.' + (fixture.inputMime === 'image/jpeg' ? 'jpg' : 'png'), mimeType: fixture.inputMime, buffer: Buffer.from(fixture.input, 'base64') });
  await expect(page.getByRole('button', { name: 'ساخت خروجی پرو', exact: true })).toBeEnabled();
}
async function generate(page) {
  const accepted = page.waitForResponse(response => generationRequest(new URL(response.url())) && response.status() === 202);
  await page.getByRole('button', { name: 'ساخت خروجی پرو', exact: true }).click();
  const terms = page.getByRole('dialog', { name: 'قوانین استفاده از پرو آنلاین', exact: true });
  await expect(terms).toBeVisible();
  await terms.getByRole('button', { name: 'پذیرش قوانین و ساخت خروجی', exact: true }).click();
  return (await (await accepted).json()).data;
}

test('transient reads retry twice behind a stable skeleton and recover without a reload', async ({ page }) => {
  let reads = 0;
  await page.route(metadataRequest, route => ++reads <= 2
    ? route.fulfill({ status: 503, json: { success: false, message: 'اختلال موقت' } }) : route.continue());
  await page.goto(fixture.productPath, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('heading', { name: 'پرو آنلاین محصول', exact: true })).toBeVisible();
  expect(reads).toBe(3);
});

test('exhausted reads stop and repeated retry clicks dispatch only one recovery read', async ({ page }) => {
  let reads = 0;
  await page.route(metadataRequest, route => ++reads <= 3
    ? route.fulfill({ status: 503, json: { message: 'اختلال موقت' } }) : route.continue());
  await page.goto(fixture.productPath);
  const recovery = page.getByTestId('public-recovery'); await expect(recovery).toContainText('سرویس موقتاً در دسترس نیست');
  expect(reads).toBe(3);
  await recovery.getByRole('button', { name: 'تلاش مجدد', exact: true }).evaluate(button => { button.click(); button.click(); button.click(); });
  await expect(page.getByRole('heading', { name: 'پرو آنلاین محصول', exact: true })).toBeVisible();
  expect(reads).toBe(4);
});

test('access, missing, rate limit, upstream and gateway failures remain distinct', async ({ page }) => {
  for (const [status, title, attempts] of [
    [400, 'آدرس درخواست معتبر نیست', 1],
    [401, 'دسترسی به این بخش مجاز نیست', 1], [403, 'دسترسی به این بخش مجاز نیست', 1], [404, 'محصول موردنظر یافت نشد', 1],
    [429, 'تعداد درخواست‌ها بیش از حد مجاز است', 1], [500, 'سرویس موقتاً در دسترس نیست', 3],
    [502, 'سرویس موقتاً در دسترس نیست', 3], [503, 'سرویس موقتاً در دسترس نیست', 3], [504, 'مهلت پاسخ درگاه سرور تمام شد', 3],
  ]) {
    let reads = 0;
    const handler = route => { reads++; return route.fulfill({ status, headers: status === 429 ? { 'retry-after': '30' } : {}, json: { message: 'آزمون وضعیت' } }); };
    await page.route(metadataRequest, handler); await page.goto(fixture.productPath);
    await expect(page.getByTestId('public-recovery')).toContainText(title); expect(reads).toBe(attempts);
    if (status === 429) await expect(page.getByRole('button', { name: 'تلاش مجدد', exact: true })).toBeDisabled();
    await page.unroute(metadataRequest, handler);
  }
});

test('an initial offline read restores itself on reconnect with no retry storm', async ({ page, context }) => {
  let reads = 0;
  await page.route(metadataRequest, async route => {
    if (++reads === 1) { await context.setOffline(true); await route.abort('internetdisconnected'); }
    else await route.continue();
  });
  await page.goto(fixture.productPath, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('public-recovery')).toContainText('اتصال اینترنت قطع است');
  expect(reads).toBe(1); await context.setOffline(false);
  await expect(page.getByRole('heading', { name: 'پرو آنلاین محصول', exact: true })).toBeVisible(); expect(reads).toBe(2);
});

test('loaded product and selected photo survive an outage, and a confirmed 404 clears invalid content', async ({ page, context }) => {
  await open(page); await upload(page);
  const photo = await page.getByAltText('تصویر انتخاب‌شده کاربر').getAttribute('src');
  await context.setOffline(true);
  await expect(page.getByTestId('public-recovery')).toContainText('اتصال اینترنت قطع است');
  await expect(page.getByAltText('تصویر انتخاب‌شده کاربر')).toHaveAttribute('src', photo);
  let status = 503, reads = 0;
  await page.route(metadataRequest, route => { reads++; return route.fulfill({ status, json: { message: 'آزمون بازیابی' } }); });
  await context.setOffline(false); await expect(page.getByTestId('public-recovery')).toContainText('سرویس موقتاً در دسترس نیست');
  expect(reads).toBe(3); await expect(page.getByRole('heading', { name: 'پرو آنلاین محصول', exact: true })).toBeVisible();
  await expect(page.getByAltText('تصویر انتخاب‌شده کاربر')).toHaveAttribute('src', photo);
  status = 404; await page.evaluate(() => dispatchEvent(new Event('online')));
  await expect(page.getByTestId('public-recovery')).toContainText('محصول موردنظر یافت نشد');
  await expect(page.getByAltText('تصویر انتخاب‌شده کاربر')).toHaveCount(0); expect(reads).toBe(4);
});

test('a failed garment image has an independent retry and leaves the form usable', async ({ page }) => {
  const images = url => url.pathname.includes('/media/products/');
  const handler = route => route.abort('failed');
  await page.route(images, handler); await open(page);
  const panel = page.getByRole('complementary', { name: 'محصول انتخاب‌شده برای پرو' });
  await expect(panel.getByRole('button', { name: 'تلاش مجدد دریافت تصویر', exact: true })).toBeVisible();
  await page.unroute(images, handler);
  await panel.getByRole('button', { name: 'تلاش مجدد دریافت تصویر', exact: true }).click();
  await expect(panel.getByAltText('پیراهن مشکی', { exact: true })).toBeVisible(); await upload(page);
});

test('history failure never hides the product, and a successful history retry unlocks a safe start', async ({ page }) => {
  const history = url => url.pathname === '/api/tryon/history';
  const handler = route => route.fulfill({ status: 503, json: { message: 'دریافت سوابق انجام نشد.' } });
  await page.route(history, handler); await open(page);
  await page.getByLabel('فایل تصویر شخص').setInputFiles({ name: 'person.png', mimeType: fixture.inputMime, buffer: Buffer.from(fixture.input, 'base64') });
  await expect(page.getByRole('button', { name: 'ساخت خروجی پرو', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'تلاش مجدد دریافت سوابق', exact: true })).toBeVisible();
  await page.unroute(history, handler); await page.getByRole('button', { name: 'تلاش مجدد دریافت سوابق', exact: true }).click();
  await expect(page.getByRole('button', { name: 'ساخت خروجی پرو', exact: true })).toBeEnabled();
});

test('a durable job completes while offline and reconnecting never repeats generation or credit', async ({ page, context, request }) => {
  const before = await request.get('/_fixture/state').then(r => r.json()); let posts = 0;
  page.on('request', r => { if (generationRequest(new URL(r.url())) && r.method() === 'POST') posts++; });
  await request.post('/_fixture/hold'); await open(page); await upload(page); const job = await generate(page);
  await expect.poll(() => page.getByRole('progressbar').getAttribute('aria-valuenow')).toBeNull();
  await context.setOffline(true); await expect(page.getByText('در انتظار اتصال مجدد؛ همان عملیات در سرور پیگیری می‌شود.', { exact: true })).toBeVisible();
  await request.post('/_fixture/release');
  await expect.poll(async () => (await request.get('/_fixture/state').then(r => r.json())).uses).toBe(before.uses + 1);
  await context.setOffline(false); await expect(page.getByText('خروجی با موفقیت ذخیره شد.', { exact: true })).toBeVisible();
  await expect(page.getByAltText('آخرین خروجی موفق پرو آنلاین')).toBeVisible();
  const after = await request.get('/_fixture/state').then(r => r.json());
  expect(posts).toBe(1); expect(after.calls - before.calls).toBe(1); expect(after.customer_amount - before.customer_amount).toBe(0);
  expect(after.providerEvents.some(event => event.id === job.id)).toBe(true);
});

test('losing an accepted POST response recovers the original key without a second POST', async ({ page, context, request }) => {
  const before = await request.get('/_fixture/state').then(r => r.json()); let posts = 0, acceptedId;
  await request.post('/_fixture/hold');
  await page.route(generationRequest, async route => {
    posts++; const response = await route.fetch(); acceptedId = (await response.json()).data.id;
    await context.setOffline(true); await route.abort('internetdisconnected');
  });
  await open(page); await upload(page); await page.getByRole('button', { name: 'ساخت خروجی پرو', exact: true }).click();
  await page.getByRole('button', { name: 'پذیرش قوانین و ساخت خروجی', exact: true }).click();
  await expect(page.getByText('وضعیت دریافت درخواست هنوز مشخص نیست؛ همان شناسه پیگیری می‌شود.', { exact: true })).toBeVisible();
  await context.setOffline(false); await request.post('/_fixture/release');
  await expect(page.getByText('خروجی با موفقیت ذخیره شد.', { exact: true })).toBeVisible();
  const after = await request.get('/_fixture/state').then(r => r.json());
  expect(posts).toBe(1); expect(after.calls - before.calls).toBe(1); expect(after.uses - before.uses).toBe(1);
  expect(after.providerEvents.some(event => event.id === acceptedId)).toBe(true);
});

test('a request that never reached the server is replayed only explicitly with identical bytes and key', async ({ page, context, request }) => {
  const before = await request.get('/_fixture/state').then(r => r.json()); const payloads = [];
  await page.route(generationRequest, async route => {
    payloads.push(JSON.parse(route.request().postData()));
    if (payloads.length === 1) { await context.setOffline(true); await route.abort('internetdisconnected'); }
    else await route.continue();
  });
  await open(page); await upload(page); await page.getByRole('button', { name: 'ساخت خروجی پرو', exact: true }).click();
  await page.getByRole('button', { name: 'پذیرش قوانین و ساخت خروجی', exact: true }).click();
  const retry = page.getByRole('button', { name: 'پیگیری و تلاش مجدد همین درخواست', exact: true });
  await expect(retry).toBeVisible(); await context.setOffline(false);
  await expect.poll(async () => (await request.get('/_fixture/state').then(r => r.json())).calls).toBe(before.calls);
  expect(payloads.length).toBe(1); await retry.click();
  await expect(page.getByText('خروجی با موفقیت ذخیره شد.', { exact: true })).toBeVisible();
  expect(payloads.length).toBe(2); expect(payloads[1]).toEqual(payloads[0]);
  const after = await request.get('/_fixture/state').then(r => r.json()); expect(after.calls - before.calls).toBe(1); expect(after.uses - before.uses).toBe(1);
});

test('a lost accepted retry response follows the same job without another reservation or stale failure', async ({ page, context, request }) => {
  const before = await request.get('/_fixture/state').then(r => r.json()); let retries = 0;
  await request.post('/_fixture/mode', { data: { mode: 'failure' } });
  await open(page); await upload(page); await generate(page);
  await expect(page.getByRole('button', { name: 'تلاش مجدد', exact: true })).toBeVisible();
  await request.post('/_fixture/mode', { data: { mode: 'success' } }); await request.post('/_fixture/hold');
  await page.route(url => url.pathname.endsWith('/retry'), async route => {
    retries++; const response = await route.fetch(); expect(response.status()).toBe(202);
    await context.setOffline(true); await route.abort('internetdisconnected');
  });
  await page.getByRole('button', { name: 'تلاش مجدد', exact: true }).click();
  await expect(page.getByText('در انتظار اتصال مجدد؛ همان عملیات در سرور پیگیری می‌شود.', { exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
  await expect(page.locator('.public-operation-error')).toHaveCount(0);
  await request.post('/_fixture/release'); await context.setOffline(false);
  await expect(page.getByText('خروجی با موفقیت ذخیره شد.', { exact: true })).toBeVisible();
  const after = await request.get('/_fixture/state').then(r => r.json());
  expect(retries).toBe(1); expect(after.calls - before.calls).toBe(2); expect(after.uses - before.uses).toBe(1);
  expect(after.customer_amount - before.customer_amount).toBe(0);
});

test('an uncertain retry retains its key even when a terminal GET predates acceptance', async ({ page, request }) => {
  const before = await request.get('/_fixture/state').then(r => r.json()); const payloads = [];
  await request.post('/_fixture/mode', { data: { mode: 'failure' } });
  await open(page); await upload(page); await generate(page);
  const retry = page.getByRole('button', { name: 'تلاش مجدد', exact: true }); await expect(retry).toBeVisible();
  await page.route(url => url.pathname.endsWith('/retry'), async route => {
    payloads.push(JSON.parse(route.request().postData()));
    if (payloads.length === 1) await route.abort('connectionreset'); else await route.continue();
  });
  await retry.click();
  // The read still returns the original failed job; explicit replay must keep the uncertain key.
  await expect(retry).toBeVisible(); await request.post('/_fixture/mode', { data: { mode: 'success' } });
  await retry.click(); await expect(page.getByText('خروجی با موفقیت ذخیره شد.', { exact: true })).toBeVisible();
  expect(payloads.length).toBe(2); expect(payloads[1]).toEqual(payloads[0]);
  const after = await request.get('/_fixture/state').then(r => r.json());
  expect(after.calls - before.calls).toBe(2); expect(after.uses - before.uses).toBe(1);
});

test('changing account while preflight is pending cannot submit the previous owner photo', async ({ page }) => {
  await open(page); await upload(page); let posts = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  page.on('request', r => { if (generationRequest(new URL(r.url())) && r.method() === 'POST') posts++; });
  await page.route(url => url.pathname === '/api/tryon/terms' && url.search === '', async route => {
    if (route.request().method() !== 'GET') return route.continue();
    await gate; await route.fulfill({ status: 200, json: { success: true, data: { required: false } } });
  });
  try {
    const preflight = page.waitForRequest(r => new URL(r.url()).pathname === '/api/tryon/terms');
    await page.getByRole('button', { name: 'ساخت خروجی پرو', exact: true }).click(); await preflight;
    const authenticated = page.waitForResponse(r => new URL(r.url()).pathname === '/api/auth/me' && r.status() === 200);
    await page.evaluate(token => {
      localStorage.setItem('marketplace_token', token);
      dispatchEvent(new StorageEvent('storage', { key: 'marketplace_token', newValue: token }));
    }, fixture.seller.token);
    await authenticated;
    const oldResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/tryon/terms');
    release(); await oldResponse;
    // The existing account boundary intentionally clears the prior owner's selected photo.
    await expect(page.getByAltText('تصویر انتخاب‌شده کاربر')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'ساخت خروجی پرو', exact: true })).toBeDisabled();
    await upload(page);
    expect(posts).toBe(0); await expect(page.getByRole('progressbar')).toHaveCount(0);
  } finally { release(); }
});

test('a forbidden job read stops automatic polling and manual recovery never repeats generation', async ({ page, request }) => {
  const before = await request.get('/_fixture/state').then(r => r.json()); let reads = 0;
  await request.post('/_fixture/hold'); await open(page); await upload(page);
  const jobRead = url => /^\/api\/tryon\/jobs\/[a-f0-9]{32}$/.test(url.pathname);
  const forbidden = route => { reads++; return route.fulfill({ status: 403, json: { message: 'دسترسی به وضعیت عملیات مجاز نیست.' } }); };
  await page.route(jobRead, forbidden); await generate(page);
  const retry = page.getByRole('button', { name: 'تلاش مجدد پیگیری عملیات', exact: true }); await expect(retry).toBeVisible();
  await page.waitForTimeout(1600); expect(reads).toBe(1);
  await page.unroute(jobRead, forbidden); await request.post('/_fixture/release'); await retry.click();
  await expect(page.getByText('خروجی با موفقیت ذخیره شد.', { exact: true })).toBeVisible();
  const after = await request.get('/_fixture/state').then(r => r.json());
  expect(after.calls - before.calls).toBe(1); expect(after.uses - before.uses).toBe(1);
});

test('a response delayed beyond the read deadline recovers on the next bounded GET', async ({ page }) => {
  let reads = 0;
  await page.route(metadataRequest, async route => {
    if (++reads === 1) await new Promise(resolve => setTimeout(resolve, 14000));
    try { await route.continue(); } catch (error) { if (!route.request().failure() && !page.isClosed()) throw error; }
  });
  await page.goto(fixture.productPath, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('heading', { name: 'پرو آنلاین محصول', exact: true })).toBeVisible(); expect(reads).toBe(2);
});

test('Slow 3G renders a usable product and responsive form without waiting for all pictures', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page); await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 50_000, uploadThroughput: 25_000 });
  await open(page); await expect(page.getByRole('button', { name: /آپلود عکس/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('complementary', { name: 'محصول انتخاب‌شده برای پرو' })).toBeVisible();
});

test('private output transfer recovers after reconnect while the completed job stays unchanged', async ({ page, context, request }) => {
  let images = 0, posts = 0;
  const output = url => url.pathname.includes('/images/output');
  page.on('request', r => { if (generationRequest(new URL(r.url())) && r.method() === 'POST') posts++; });
  await page.route(output, async route => {
    if (++images === 1) { await context.setOffline(true); await route.abort('internetdisconnected'); }
    else await route.continue();
  });
  const before = await request.get('/_fixture/state').then(r => r.json());
  await open(page); await upload(page); await generate(page);
  await expect(page.getByRole('button', { name: 'تلاش مجدد دریافت تصویر', exact: true })).toBeVisible();
  await context.setOffline(false); await expect(page.getByAltText('آخرین خروجی موفق پرو آنلاین')).toBeVisible();
  expect(posts).toBe(1); expect(images).toBe(2);
  const after = await request.get('/_fixture/state').then(r => r.json()); expect(after.uses - before.uses).toBe(1);
});

test('navigation aborts an old store read and never replaces the new store with its late response', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const oldPath = fixture.productPath.split('/products/')[0].replace('/stores/', '/api/stores/');
  let held = false;
  await page.route(url => url.pathname === oldPath, async route => { held = true; await gate; try { await route.continue(); } catch (error) { if (!route.request().failure() && !page.isClosed()) throw error; } });
  await page.goto(fixture.productPath, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => held).toBe(true);
  await page.goto(fixture.singlePath, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.public-product-card')).toHaveCount(1); release();
  await expect(page).toHaveURL(new RegExp(fixture.singlePath + '$'));
  await expect(page.getByTestId('public-recovery')).toHaveCount(0);
});

test('a slow private file transfer outlives the metadata deadline and downloads exact original bytes', async ({ page }, info) => {
  const output = url => url.pathname.includes('/images/output');
  await page.route(output, async route => { await new Promise(resolve => setTimeout(resolve, 14000)); await route.continue(); });
  await open(page); await upload(page); await generate(page);
  await expect(page.getByAltText('آخرین خروجی موفق پرو آنلاین')).toBeVisible();
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'دانلود خروجی', exact: true }).click();
  const file = await pending; expect(file.suggestedFilename()).toMatch(/\.webp$/);
  const target = info.outputPath('slow-private-output.webp'); await file.saveAs(target);
  expect(fs.readFileSync(target).equals(Buffer.from(fixture.output, 'base64'))).toBe(true);
});

test('the HTML shell stays readable if the main bundle fails and public pages do not load the private layout', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const entry = url => url.pathname.startsWith('/assets/index-') && url.pathname.endsWith('.js');
  const handler = async route => { await gate; await route.abort('failed'); };
  await page.route(entry, handler);
  const startup = page.waitForResponse(response => new URL(response.url()).pathname === '/startup.js');
  await page.goto(fixture.productPath, { waitUntil: 'commit' });
  await expect(page.locator('#rookhposh-boot')).toContainText('رخ‌پوش');
  await expect(page.locator('#rookhposh-boot a')).toHaveAttribute('href', '');
  await startup; await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  release(); await expect(page.locator('#rookhposh-boot')).toHaveAttribute('role', 'alert');
  await page.unroute(entry, handler);
  const scripts = []; page.on('request', request => { if (request.resourceType() === 'script') scripts.push(request.url()); });
  await open(page); expect(scripts.some(url => new URL(url).pathname.includes('/AppLayout-'))).toBe(false);
});

test('a large valid photo uploads over Slow 3G, completes once and downloads the original output', async ({ page, context, request }, info) => {
  test.setTimeout(180000); page.setDefaultTimeout(90000);
  await open(page); await page.waitForLoadState('networkidle');
  const source = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 2000;
    const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(canvas.width, canvas.height);
    let seed = 31;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels.data[i] = seed & 255; pixels.data[i + 1] = (seed >>> 8) & 255; pixels.data[i + 2] = (seed >>> 16) & 255; pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0); return canvas.toDataURL('image/jpeg', 0.88).split(',')[1];
  });
  const image = Buffer.from(source, 'base64'); expect(image.length).toBeGreaterThan(1_000_000);
  await page.getByLabel('فایل تصویر شخص').setInputFiles({ name: 'large-valid.jpg', mimeType: 'image/jpeg', buffer: image });
  await expect(page.getByRole('button', { name: 'ساخت خروجی پرو', exact: true })).toBeEnabled();
  const cdp = await context.newCDPSession(page); await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 50_000, uploadThroughput: 25_000 });
  let posts = 0, submittedBytes = 0;
  page.on('request', r => { if (r.method() === 'POST' && generationRequest(new URL(r.url()))) { posts++; submittedBytes = r.postDataBuffer().length; } });
  const before = await request.get('/_fixture/state').then(r => r.json());
  await generate(page); await expect(page.getByText('خروجی با موفقیت ذخیره شد.', { exact: true })).toBeVisible();
  await expect.poll(() => page.getByAltText('آخرین خروجی موفق پرو آنلاین').evaluate(i => i.complete && i.naturalWidth > 0)).toBe(true);
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'دانلود خروجی', exact: true }).click();
  const download = await pending, target = info.outputPath('slow-network-original.webp'); await download.saveAs(target);
  expect(fs.readFileSync(target).equals(Buffer.from(fixture.output, 'base64'))).toBe(true);
  const after = await request.get('/_fixture/state').then(r => r.json());
  expect(posts).toBe(1); expect(submittedBytes).toBeGreaterThan(100_000);
  expect(after.calls - before.calls).toBe(1); expect(after.uses - before.uses).toBe(1); expect(after.customer_amount - before.customer_amount).toBe(0);
  await info.attach('transfer-sizes', { body: JSON.stringify({ selectedBytes: image.length, submittedBytes, outputBytes: Buffer.from(fixture.output, 'base64').length }), contentType: 'application/json' });
});

test('closing a pending camera permission returns keyboard focus without reopening or generating', async ({ page }) => {
  await page.addInitScript(() => {
    window.__cameraRequests = 0;
    navigator.mediaDevices.getUserMedia = () => {
      window.__cameraRequests++;
      return new Promise((_resolve, reject) => setTimeout(() => reject(new DOMException('Controlled permission denial', 'NotAllowedError')), 4000));
    };
  });
  let posts = 0; page.on('request', r => { if (r.method() === 'POST' && generationRequest(new URL(r.url()))) posts++; });
  await open(page);
  const trigger = page.locator('.public-upload-option--camera'); await trigger.click();
  const camera = page.getByRole('dialog', { name: 'گرفتن عکس با دوربین', exact: true }); await expect(camera).toBeVisible();
  await page.keyboard.press('Escape'); await expect(camera).toHaveCount(0); await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-disabled', 'true');
  await trigger.evaluate(button => { button.click(); button.click(); });
  expect(await page.evaluate(() => window.__cameraRequests)).toBe(1);
  await expect(trigger).toHaveAttribute('aria-busy', 'false'); await expect(trigger).toBeFocused();
  expect(posts).toBe(0);
});

test('the lazy seller dashboard keeps its real data, styling and admin boundary after a public visit', async ({ page }) => {
  await page.addInitScript(token => localStorage.setItem('marketplace_token', token), fixture.seller.token);
  const dashboard = url => url.pathname === '/api/seller/dashboard';
  const response = page.waitForResponse(r => dashboard(new URL(r.url())) && r.status() === 200);
  await page.goto('/seller/dashboard', { waitUntil: 'domcontentloaded' });
  expect((await (await response).json()).success).toBe(true);
  await expect(page.getByRole('heading', { name: 'داشبورد فروشگاه', exact: true }).first()).toBeVisible();
  const style = () => page.locator('main').evaluate(main => {
    const css = getComputedStyle(main); return { color: css.color, font: css.fontFamily, direction: css.direction };
  });
  const before = await style();
  await page.evaluate(url => { history.pushState({}, '', url); dispatchEvent(new PopStateEvent('popstate')); }, fixture.publicPath);
  await expect(page.getByRole('heading', { name: 'محصولات فروشگاه', exact: true })).toBeVisible();
  await page.evaluate(() => { history.pushState({}, '', '/seller/dashboard'); dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.getByRole('heading', { name: 'داشبورد فروشگاه', exact: true }).first()).toBeVisible(); expect(await style()).toEqual(before);
  expect((await page.request.get('/api/admin/products', { headers: { Authorization: 'Bearer ' + fixture.seller.token } })).status()).toBe(403);
  await page.evaluate(() => { history.pushState({}, '', '/admin/products'); dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page).toHaveURL(/\/seller\/dashboard$/);
});
