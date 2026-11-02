const { test, expect } = require('@playwright/test');
const { setup, data, upload, consent, noOverflow, shot, download } = require('./publicUi.helpers.cjs');
setup(test);

test('store uses real identity, responsive grid, working new-tab links and honest image/empty fallbacks', async ({ page }, info) => {
  const f = data(), width = Number(info.project.name);
  await page.goto(f.publicPath, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'محصولات فروشگاه', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'بنر فروشگاه رخ‌پوش', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'نشان فروشگاه رخ‌پوش', exact: true })).toBeVisible();
  const cards = page.locator('.public-product-card'); await expect(cards).toHaveCount(f.productCount);
  const columns = await page.locator('.public-product-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(width >= 1200 ? 4 : width >= 768 ? 2 : 1);
  await expect(page.getByRole('link', { name: /ورود|ثبت‌نام/ })).toHaveCount(0);
  await expect(cards.filter({ hasText: 'پوشاک بدون تصویر' }).getByText('تصویر در دسترس نیست', { exact: true })).toBeVisible();
  const broken = cards.filter({ hasText: 'پوشاک منتخب' }); await broken.scrollIntoViewIfNeeded();
  await expect(broken.getByText('تصویر در دسترس نیست', { exact: true })).toBeVisible();
  const heights = await cards.evaluateAll(items => items.map(el => el.getBoundingClientRect().height));
  if (columns > 1) {
    expect(Math.max(...heights.slice(0, columns)) - Math.min(...heights.slice(0, columns))).toBeLessThan(2);
    const buttons = await cards.evaluateAll(items => items.map(el => el.querySelector('.public-button').getBoundingClientRect().bottom));
    expect(Math.max(...buttons.slice(0, columns)) - Math.min(...buttons.slice(0, columns))).toBeLessThan(2);
  }
  await noOverflow(page); await shot(page, info, 'store');
  const mainCard = cards.filter({ has: page.getByRole('heading', { name: 'پیراهن مشکی', exact: true }) });
  const [product] = await Promise.all([page.waitForEvent('popup'), mainCard.click()]);
  await expect(product).toHaveURL(new RegExp('/products/' + f.productId + '$'));
  await expect(product.getByRole('heading', { name: 'پرو آنلاین محصول', exact: true })).toBeVisible();
  await shot(product, info, 'idle'); await noOverflow(product);
  if (info.project.name === '360') { await upload(product); await shot(product, info, 'selected'); }
  await product.close();
  await page.goto(f.singlePath, { waitUntil: 'domcontentloaded' }); await expect(page.locator('.public-product-card')).toHaveCount(1);
  await page.goto(f.emptyPath, { waitUntil: 'domcontentloaded' }); await expect(page.locator('.public-product-card')).toHaveCount(0);
  await expect(page.getByText('محصول فعالی برای این فروشگاه ثبت نشده است.', { exact: true })).toBeVisible();
  await noOverflow(page);
});

test('selected inputs, first-use terms, real job states, refresh, private history and both image downloads remain functional', async ({ page }, info) => {
  const f = data();
  await page.goto(f.productPath, { waitUntil: 'domcontentloaded' });
  const start = page.getByRole('button', { name: 'ساخت خروجی پرو', exact: true });
  await expect(start).toBeDisabled(); await expect(page.getByText('هنوز عکسی انتخاب نکرده‌اید', { exact: true })).toBeVisible();
  await expect(page.getByText('هنوز خروجی موفقی ندارید', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /موارد قبلی/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('complementary', { name: 'محصول انتخاب‌شده برای پرو' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'پرو آنلاین محصول', exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const [productBox, formBox] = await page.locator('.public-tryon-layout').evaluate(layout =>
    ['.public-selected-product', '.public-tryon-form'].map(selector => {
      const { x, y, height } = layout.querySelector(selector).getBoundingClientRect();
      return { x, y, height };
    }));
  if (Number(info.project.name) >= 980) {
    expect(productBox.x).toBeGreaterThan(formBox.x); expect(Math.abs(productBox.y - formBox.y)).toBeLessThan(2);
    expect(productBox.height).toBeLessThan(formBox.height);
  } else expect(productBox.y + productBox.height).toBeLessThanOrEqual(formBox.y);
  await noOverflow(page); await shot(page, info, 'idle');
  await upload(page); const input = await page.getByAltText('تصویر انتخاب‌شده کاربر').getAttribute('src');
  await page.getByRole('button', { name: 'انتخاب مدل ۲', exact: true }).click();
  await expect(page.getByAltText('تصویر انتخاب‌شده کاربر')).toHaveAttribute('src', input);
  await expect(page.getByRole('button', { name: 'انتخاب مدل ۲', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await shot(page, info, 'selected');
  const before = await page.request.get('/_fixture/state', { maxRetries: 2 }).then(r => r.json());
  const action = page.getByTestId('tryon-action-slot'); const initialHeight = (await action.boundingBox()).height;
  await page.request.post('/_fixture/hold', { maxRetries: 2 });
  try {
    await start.dblclick(); const terms = page.getByRole('dialog', { name: 'قوانین استفاده از پرو آنلاین', exact: true });
    await expect(terms).toBeVisible(); await terms.getByRole('button', { name: 'پذیرش قوانین و ساخت خروجی', exact: true }).click();
    await expect(page.getByRole('progressbar')).toBeVisible();
    await expect.poll(() => page.getByRole('progressbar').getAttribute('aria-valuenow')).toBeNull();
    expect(Math.abs((await action.boundingBox()).height - initialHeight)).toBeLessThan(2);
    await expect(start).toHaveCount(0); await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByAltText('تصویر انتخاب‌شده کاربر')).toHaveAttribute('src', input);
    await expect(page.getByRole('button', { name: 'انتخاب مدل ۲', exact: true })).toBeDisabled();
    await shot(page, info, 'processing'); await noOverflow(page);
    await page.reload(); await expect(page.getByAltText('تصویر ورودی عملیات در حال پردازش')).toBeVisible();
    await expect(page.getByRole('button', { name: 'انتخاب مدل ۲', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow', '100');
  } finally { await page.request.post('/_fixture/release', { maxRetries: 2 }); }
  await expect(page.getByText('خروجی با موفقیت ذخیره شد.', { exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  await expect(page.getByAltText('آخرین خروجی موفق پرو آنلاین')).toBeVisible();
  await expect(page.getByRole('button', { name: 'انتخاب مدل ۲', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByAltText('تصویر ورودی این پرو')).toBeVisible();
  const after = await page.request.get('/_fixture/state', { maxRetries: 2 }).then(r => r.json());
  expect(after.calls - before.calls).toBe(1); expect(after.uses - before.uses).toBe(1); expect(after.customer_amount).toBe(0);
  await shot(page, info, 'success');
  await download(page, page.getByRole('button', { name: 'دانلود خروجی', exact: true }), info, 'new-output');
  await page.getByRole('button', { name: 'پرو جدید', exact: true }).click();
  await expect(page.getByAltText('آخرین خروجی موفق پرو آنلاین')).toBeVisible(); await expect(start).toBeDisabled();
  await upload(page); await start.click();
  await expect(page.getByText('خروجی با موفقیت ذخیره شد.', { exact: true })).toBeVisible();
  const accordion = page.getByRole('button', { name: /موارد قبلی/ });
  await accordion.click(); await expect(accordion).toHaveAttribute('aria-expanded', 'true');
  const history = page.getByRole('region', { name: 'موارد قبلی پرو' });
  await expect(history.getByRole('button', { name: 'مشاهده', exact: true }).first()).toBeVisible();
  await download(page, history.getByRole('button', { name: 'دانلود', exact: true }).first(), info, 'old-output');
  const view = history.getByRole('button', { name: 'مشاهده', exact: true }).first();
  await view.click(); await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape'); await expect(view).toBeFocused();
  await expect(page.getByRole('button', { name: /حذف/ })).toHaveCount(0);
  await shot(page, info, 'history'); await accordion.click(); await expect(accordion).toHaveAttribute('aria-expanded', 'false');
  await noOverflow(page);
});

test('recoverable failure preserves selected photo/latest output and a controlled retry succeeds', async ({ page }, info) => {
  await page.goto(data().productPath, { waitUntil: 'domcontentloaded' }); await consent(page); await upload(page);
  await page.getByRole('button', { name: 'ساخت خروجی پرو', exact: true }).click();
  await expect(page.getByText('خروجی با موفقیت ذخیره شد.', { exact: true })).toBeVisible();
  await expect(page.getByAltText('آخرین خروجی موفق پرو آنلاین')).toBeVisible();
  const latest = await page.getByAltText('آخرین خروجی موفق پرو آنلاین').getAttribute('src');
  await page.getByRole('button', { name: 'پرو جدید', exact: true }).click();
  const image = await page.getByAltText('تصویر انتخاب‌شده کاربر').getAttribute('src');
  await page.request.post('/_fixture/mode', { maxRetries: 2, data: { mode: 'failure' } });
  await page.getByRole('button', { name: 'ساخت خروجی پرو', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByRole('button', { name: 'تلاش مجدد', exact: true })).toBeVisible();
  await expect(page.getByAltText('تصویر انتخاب‌شده کاربر')).toHaveAttribute('src', image);
  await expect(page.getByAltText('آخرین خروجی موفق پرو آنلاین')).toHaveAttribute('src', latest);
  await shot(page, info, 'error'); await noOverflow(page);
  await page.request.post('/_fixture/mode', { maxRetries: 2, data: { mode: 'success' } });
  await page.getByRole('button', { name: 'تلاش مجدد', exact: true }).click();
  await expect(page.getByText('خروجی با موفقیت ذخیره شد.', { exact: true })).toBeVisible();
});

test('camera opens, switches, captures, closes and never dispatches generation automatically', async ({ page }, info) => {
  await page.goto(data().productPath, { waitUntil: 'domcontentloaded' });
  const before = await page.request.get('/_fixture/state', { maxRetries: 2 }).then(r => r.json());
  await page.getByRole('button', { name: /گرفتن عکس/ }).click();
  const camera = page.getByRole('dialog', { name: 'گرفتن عکس با دوربین', exact: true }); await expect(camera).toBeVisible();
  const capture = camera.getByRole('button', { name: 'ثبت عکس', exact: true }); await expect(capture).toBeEnabled();
  await expect(camera.getByRole('button', { name: 'بستن دوربین', exact: true })).toBeVisible();
  for (let i = 0; i < 7; i++) await page.keyboard.press('Tab');
  expect(await camera.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await camera.getByRole('button', { name: /استفاده از دوربین/ }).click(); await expect(capture).toBeEnabled();
  const tracks = await camera.locator('video').evaluateHandle(video => video.srcObject.getTracks());
  await shot(page, info, 'camera'); await capture.click();
  await expect(camera).toHaveCount(0); await expect(page.getByAltText('تصویر انتخاب‌شده کاربر')).toBeVisible();
  expect(await tracks.evaluate(items => items.every(track => track.readyState === 'ended'))).toBe(true); await tracks.dispose();
  const trigger = page.getByRole('button', { name: /گرفتن عکس/ }); await trigger.click();
  await expect(camera).toBeVisible(); await page.keyboard.press('Escape'); await expect(camera).toHaveCount(0); await expect(trigger).toBeFocused();
  expect((await page.request.get('/_fixture/state', { maxRetries: 2 }).then(r => r.json())).calls).toBe(before.calls);
  await expect(page.getByRole('button', { name: 'ساخت خروجی پرو', exact: true })).toBeEnabled(); await noOverflow(page);
});
