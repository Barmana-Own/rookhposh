const {test,expect}=require('@playwright/test');const fs=require('node:fs/promises');const crypto=require('node:crypto');let f;
test.beforeAll(async()=>{if(!process.env.RCA_E2E_METADATA)throw Error('Disposable fixture required');f=JSON.parse(await fs.readFile(process.env.RCA_E2E_METADATA,'utf8'));});
test.beforeEach(async({context})=>{await context.route('https://cdn.kavenegar.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:''}));});
test.afterEach(async({request})=>{await request.post('/_fixture/auth',{data:{status:0},maxRetries:2});});
async function login(page,role='seller'){await page.addInitScript(t=>localStorage.setItem('marketplace_token',t),f[role].token);}
async function manualRetryReady(page){const button=page.getByRole('button',{name:'تلاش مجدد',exact:true});await expect.poll(()=>button.evaluate(element=>!element.disabled&&!element.closest('section').textContent.includes('بررسی خودکار دوباره انجام می‌شود.')),{timeout:20000}).toBe(true);}
async function shot(page,info,name){await page.screenshot({path:info.outputPath(name+'.png'),fullPage:true});}
test('QA-01 same-IP guests cannot read another visitor history or image',async({browser})=>{const a=await browser.newContext({baseURL:process.env.RCA_BASE_URL});const b=await browser.newContext({baseURL:process.env.RCA_BASE_URL});try{await a.request.get('/api/tryon/history');await b.request.get('/api/tryon/history');const started=await a.request.post('/api/stores/'+f.publicPath.split('/').pop()+'/products/'+f.productId+'/pro/jobs',{data:{image:'data:image/png;base64,'+f.input,image_index:0,request_key:crypto.randomUUID(),processing_consent:true}});expect(started.status()).toBe(202);const id=(await started.json()).data.id;await expect.poll(async()=>{const r=await a.request.get('/api/tryon/jobs/'+id);return(await r.json()).data.status;},{timeout:15000}).toBe('completed');const history=await b.request.get('/api/tryon/history').then(r=>r.json());expect(history.data.latest).toBeNull();for(const kind of ['input','product','output'])expect((await b.request.get('/api/tryon/jobs/'+id+'/images/'+kind+'?download=1')).status()).toBe(404);}finally{await a.close();await b.close();}});
test('QA-02 real store usage is visible independently of financial transactions',async({page},info)=>{await login(page);await page.goto('/seller/transactions',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'مصرف توکن پرو',exact:true}).click();await expect(page.getByText(f.seedJobId,{exact:true}).filter({visible:true})).toBeVisible();await expect(page.getByText('پیراهن آبی QA',{exact:true}).filter({visible:true}).first()).toBeVisible();await shot(page,info,'seller-usage');});
test('QA-03 public store exposes free products without misleading customer registration',async({page})=>{await page.goto(f.publicPath,{waitUntil:'domcontentloaded'});await expect(page.getByRole('heading',{name:'محصولات فروشگاه'})).toBeVisible();await expect(page.getByRole('link',{name:'ورود یا ثبت‌نام با این فروشگاه'})).toHaveCount(0);await page.goto(f.productPath,{waitUntil:'domcontentloaded'});await expect(page.getByLabel('فایل تصویر شخص')).toBeAttached();});
test('QA-04 unconfigured manual bank transfer is disabled without placeholder account numbers',async({page},info)=>{await login(page);await page.goto('/seller/packages',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'خرید / تمدید',exact:true}).first().click();await expect(page.getByRole('button',{name:'واریز حساب',exact:true})).toBeDisabled();await expect(page.getByText('0000-0000-0000-0000',{exact:false})).toHaveCount(0);await expect(page.getByRole('button',{name:'درگاه مستقیم',exact:true})).toBeEnabled();await shot(page,info,'bank-unavailable');});
test('QA-05 seller URL search excludes unrelated products and Back restores query',async({page},info)=>{await login(page);await page.goto('/seller/products',{waitUntil:'domcontentloaded'});await expect(page.getByText(f.title,{exact:true}).filter({visible:true}).first()).toBeVisible();const topbar=page.getByPlaceholder('جستجو و رفتن به بخش مرتبط...');const desktop=await topbar.isVisible();const search=desktop?topbar:page.getByPlaceholder('جستجو...');await search.fill('qa-no-such-product-20261101');if(desktop)await search.press('Enter');await expect(page).toHaveURL(/q=qa-no-such-product-20261101/);await expect(page.getByText(f.title,{exact:true})).toHaveCount(0);await expect(page.getByText('نتیجه‌ای یافت نشد',{exact:true})).toBeVisible();await page.goBack();await expect(page.getByText(f.title,{exact:true}).filter({visible:true}).first()).toBeVisible();await expect(desktop?topbar:page.getByPlaceholder('جستجو...')).toHaveValue('');await shot(page,info,'product-search');});
test('QA-06 a temporary auth 503 retains the token but does not reveal protected content',async({page},info)=>{await login(page,'admin');await page.request.post('/_fixture/auth',{data:{status:503,count:100}});await page.goto('/admin/products',{waitUntil:'domcontentloaded'});await expect.poll(()=>page.evaluate(()=>localStorage.getItem('marketplace_token'))).not.toBeNull();await expect(page.getByRole('heading',{name:'مدیریت محصولات',exact:true})).toHaveCount(0);await expect(page.getByRole('heading',{name:'ورود ادمین',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'تلاش مجدد',exact:true})).toBeVisible();await manualRetryReady(page);await shot(page,info,'auth-temporarily-unavailable');await page.request.post('/_fixture/auth',{data:{status:0}});await page.getByRole('button',{name:'تلاش مجدد',exact:true}).click();await expect(page.getByRole('heading',{name:'مدیریت محصولات',exact:true})).toBeVisible();await shot(page,info,'auth-recovered');});
test('QA-07 missing store returns 404 and stops loading with a useful empty state',async({page},info)=>{const r=await page.request.get('/api/stores/qa-missing-store-20261101');expect(r.status()).toBe(404);await page.goto('/stores/qa-missing-store-20261101',{waitUntil:'domcontentloaded'});await expect(page.getByText('فروشگاه موردنظر یافت نشد',{exact:true})).toBeVisible();await expect(page.getByText('در حال دریافت فروشگاه...',{exact:true})).toHaveCount(0);await shot(page,info,'store-not-found');});
test('QA-08 packages operate for sellers while legacy customer records remain outside purchase UI',async({page})=>{await login(page,'admin');await page.goto('/admin/packages',{waitUntil:'domcontentloaded'});await expect(page.getByText('QA legacy customer package',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'پکیج‌های کاربر',exact:true})).toHaveCount(0);await expect(page.getByText(/QA package/).first()).toBeVisible();const r=await page.request.get('/api/admin/packages',{headers:{authorization:'Bearer '+f.admin.token}});expect((await r.json()).data.some(p=>p.title==='QA legacy customer package')).toBe(true);});
test('QA-09 wallet shows the payment method rather than its internal transaction type',async({page},info)=>{await login(page);await page.goto('/seller/wallet',{waitUntil:'domcontentloaded'});await expect(page.getByText('seller_package_purchase',{exact:true})).toHaveCount(0);await expect(page.getByText('درگاه اینترنتی',{exact:true}).filter({visible:true})).toBeVisible();await shot(page,info,'wallet-method');});
test('QA-10 packages contain operational Persian text instead of development notes',async({page},info)=>{await login(page,'admin');await page.goto('/admin/packages',{waitUntil:'domcontentloaded'});await expect(page.getByText(/textarea|تک‌استفاده|پرامپت|دیزاین/)).toHaveCount(0);await expect(page.getByText('در این بخش می‌توانید پکیج‌های فروشندگان، سهمیه توکن‌ها و تعرفه‌های خدمات را مدیریت کنید.',{exact:true})).toBeVisible();await shot(page,info,'seller-packages');});

test('QA-05 admin search supports direct links, clearing, Back and Forward', async ({ page }) => {
  await login(page, 'admin');
  await page.goto('/admin/products?q=qa-no-such-product-20261101', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('نتیجه‌ای یافت نشد', { exact: true })).toBeVisible();
  const search = page.getByPlaceholder('جستجوی محصولات', { exact: true });
  await expect(search).toHaveValue('qa-no-such-product-20261101');
  await search.fill('');
  await page.getByRole('button', { name: 'همه محصولات', exact: true }).click();
  await expect(page.getByText(f.title, { exact: true }).filter({ visible: true })).toBeVisible();
  await search.fill('qa-no-such-product-20261101');
  await expect(page.getByText('نتیجه‌ای یافت نشد', { exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByText(f.title, { exact: true }).filter({ visible: true })).toBeVisible();
  await page.goForward();
  await expect(search).toHaveValue('qa-no-such-product-20261101');
  await expect(page.getByText('نتیجه‌ای یافت نشد', { exact: true })).toBeVisible();
});

test('QA-06 forbidden preserves the session and a real 401 clears it safely', async ({ page }) => {
  await login(page, 'admin');
  await page.request.post('/_fixture/auth', { data: { status: 403, count: 100 } });
  await page.goto('/admin/products', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'تلاش مجدد', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('marketplace_token'))).toBe(f.admin.token);
  await expect(page.getByRole('heading', { name: 'مدیریت محصولات', exact: true })).toHaveCount(0);
  await page.request.post('/_fixture/auth', { data: { status: 401, count: 100 } });
  await page.getByRole('button', { name: 'تلاش مجدد', exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('marketplace_token'))).toBeNull();
  await expect(page).toHaveURL(/admin\/v2\/login/);
});

test('QA-07 null, server and transport failures finish loading and offer recovery', async ({ page }) => {
  let fault = 'null';
  await page.route('**/api/stores/qa-fault-store', route => {
    if (fault === 'network') return route.abort('failed');
    return route.fulfill({ status: fault === 'server' ? 500 : 200, contentType: 'application/json', body: JSON.stringify({ success: fault !== 'server', data: null }) });
  });
  await page.goto('/stores/qa-fault-store', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('فروشگاه موردنظر یافت نشد', { exact: true })).toBeVisible();
  fault = 'server'; await page.reload();
  await expect(page.getByRole('button', { name: 'تلاش مجدد', exact: true })).toBeVisible();
  fault = 'network'; await page.getByRole('button', { name: 'تلاش مجدد', exact: true }).click();
  await expect(page.getByText(/ارتباط.*سرور/).filter({ visible: true })).toBeVisible();
  fault = 'null'; await page.getByRole('button', { name: 'تلاش مجدد', exact: true }).click();
  await expect(page.getByText('فروشگاه موردنظر یافت نشد', { exact: true })).toBeVisible();
});

test('QA-04 valid admin settings propagate to checkout without placeholder recipients', async ({ page, browser }) => {
  await login(page, 'admin');
  await page.goto('/admin/financial', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('اطلاعات حساب بانکی تکمیل نشده است', { exact: true })).toBeVisible();
  const sellerContext = await browser.newContext({ baseURL: process.env.RCA_BASE_URL });
  await sellerContext.addInitScript(token => localStorage.setItem('marketplace_token', token), f.seller.token);
  const seller = await sellerContext.newPage();
  try {
    await page.getByLabel('نام بانک', { exact: true }).fill('بانک آزمایش در پایگاه موقت');
    await page.getByLabel('شماره کارت', { exact: true }).fill('4111111111111111');
    await page.getByLabel('نام صاحب حساب', { exact: true }).fill('گیرنده آزمایشی');
    await page.getByRole('button', { name: 'ذخیره مشخصات حساب', exact: true }).click();
    await expect(page.getByText('مشخصات حساب بانکی ذخیره شد.', { exact: true })).toBeVisible();
    await seller.goto('/seller/packages', { waitUntil: 'domcontentloaded' });
    await seller.getByRole('button', { name: 'خرید / تمدید', exact: true }).first().click();
    await seller.getByRole('button', { name: 'واریز حساب', exact: true }).click();
    await expect(seller.getByText('4111111111111111', { exact: true })).toBeVisible();
    await expect(seller.getByText('به نام: گیرنده آزمایشی', { exact: true })).toBeVisible();
    await expect(seller.locator('input[type="file"]')).toHaveAttribute('accept', /image\/gif/);
    await expect(seller.getByText('0000-0000-0000-0000', { exact: false })).toHaveCount(0);
    expect(await seller.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    await page.request.patch('/api/admin/settings/bank', { headers: { authorization: 'Bearer ' + f.admin.token }, data: {} });
    await sellerContext.close();
  }
});

async function prepareTryon(page) {
  await page.goto(f.productPath, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('فایل تصویر شخص').setInputFiles({ name: 'qa-person.png', mimeType: 'image/png', buffer: Buffer.from(f.input, 'base64') });
  await page.getByText('با پردازش عکس برای پرو و نگهداری خصوصی سوابق موافقم.', { exact: false }).click();
  await expect(page.getByRole('button', { name: 'ساخت خروجی پرو', exact: true })).toBeEnabled();
}
async function makeTryon(page, info) {
  await page.request.post('/_fixture/hold');
  const before = await page.request.get('/_fixture/state').then(r => r.json());
  const slot = page.getByTestId('tryon-action-slot'); const size = await slot.boundingBox();
  try {
    await page.getByRole('button', { name: 'ساخت خروجی پرو', exact: true }).dblclick();
    await expect(page.getByRole('progressbar')).toBeVisible();
    await expect(page.getByRole('button', { name: 'ساخت خروجی پرو', exact: true })).toHaveCount(0);
    await expect.poll(() => page.getByRole('progressbar').getAttribute('aria-valuenow')).toBe(null);
    expect(Math.abs((await slot.boundingBox()).height - size.height)).toBeLessThan(2);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    if (info) await slot.screenshot({ path: info.outputPath('real-progress.png') });
  } finally { await page.request.post('/_fixture/release'); }
  await expect(page.getByText('خروجی با موفقیت ذخیره شد.', { exact: true })).toBeVisible();
  expect((await page.request.get('/_fixture/state').then(r => r.json())).calls - before.calls).toBe(1);
  await expect(page.getByAltText('آخرین خروجی موفق پرو آنلاین')).toBeVisible();
}
async function downloadTryon(page, button, info, name) {
  const pending = page.waitForEvent('download'); await button.click(); const download = await pending;
  expect(download.suggestedFilename()).toMatch(/^rookhposh-tryon-.*\.webp$/);
  const target = info.outputPath(name + '.webp'); await download.saveAs(target); const bytes = await fs.readFile(target);
  expect(bytes.subarray(0, 4).toString()).toBe('RIFF'); expect(bytes.subarray(8, 12).toString()).toBe('WEBP');
  expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(crypto.createHash('sha256').update(Buffer.from(f.output, 'base64')).digest('hex'));
}
test('regression: real try-on UI, indeterminate progress, latest/history and original downloads', async ({ page }, info) => {
  test.setTimeout(150000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await prepareTryon(page); await makeTryon(page, info);
  await downloadTryon(page, page.getByRole('button', { name: 'دانلود خروجی', exact: true }), info, 'current-output');
  await page.reload(); await expect(page.getByAltText('آخرین خروجی موفق پرو آنلاین')).toBeVisible();
  await expect(page.getByRole('button', { name: /موارد قبلی/ })).toHaveAttribute('aria-expanded', 'false');
  await prepareTryon(page); await makeTryon(page);
  const accordion = page.getByRole('button', { name: /موارد قبلی/ }); await accordion.click();
  const history = page.getByRole('region', { name: 'موارد قبلی پرو' });
  await downloadTryon(page, history.getByRole('button', { name: 'دانلود', exact: true }).first(), info, 'previous-output');
  await accordion.click(); await expect(accordion).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await shot(page, info, 'tryon-completed');
});

test('regression: AI failure releases credit and a controlled retry preserves the last output', async ({ page }) => {
  test.setTimeout(120000);
  await prepareTryon(page); await makeTryon(page);
  const previous = await page.getByAltText('آخرین خروجی موفق پرو آنلاین').getAttribute('src');
  await page.getByRole('button', { name: 'پرو جدید', exact: true }).click();
  await page.request.post('/_fixture/mode', { data: { mode: 'failure' } });
  try {
    await page.getByRole('button', { name: 'ساخت خروجی پرو', exact: true }).click();
    await expect(page.getByRole('button', { name: 'تلاش مجدد', exact: true })).toBeVisible();
    await expect(page.getByAltText('آخرین خروجی موفق پرو آنلاین')).toHaveAttribute('src', previous);
    await page.request.post('/_fixture/mode', { data: { mode: 'success' } });
    await page.getByRole('button', { name: 'تلاش مجدد', exact: true }).click();
    await expect(page.getByText('خروجی با موفقیت ذخیره شد.', { exact: true })).toBeVisible();
  } finally { await page.request.post('/_fixture/mode', { data: { mode: 'success' } }); }
});

test('regression: admin sees real operation records and provider keys stay masked', async ({ page }, info) => {
  await login(page, 'admin'); await page.goto('/admin/tryon', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'پرو آنلاین', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'جزئیات', exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByText('تصاویر واقعی عملیات', { exact: true })).toBeVisible();
  await shot(page, info, 'admin-tryon-details'); await page.keyboard.press('Escape');
  await page.goto('/admin/settings/tryon', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'ذخیره سرویس', exact: true })).toHaveCount(3);
  await expect(page.getByLabel('کلید جایگزین API').first()).toHaveValue('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
