import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';

const requireFrontend = createRequire(new URL('../package.json', import.meta.url));
const { createElement } = requireFrontend('react');
const { renderToStaticMarkup } = requireFrontend('react-dom/server');
let server, cacheDir, Hero, Card, Panel, Empty;
before(async () => {
  const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
  cacheDir = await mkdtemp(path.join(tmpdir(), 'rookhposh-public-ui-'));
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), cacheDir, server: { middlewareMode: true, hmr: false }, logLevel: 'silent' });
  [Hero, Card, Panel, Empty] = await Promise.all([
    '/src/components/public/PublicStoreHero.jsx', '/src/components/public/StoreProductCard.jsx',
    '/src/components/public/SelectedProductPanel.jsx', '/src/components/tryon/TryonEmptyState.jsx',
  ].map(async file => (await server.ssrLoadModule(file)).default));
});
after(async () => {
  await server?.close();
  if (cacheDir && path.dirname(cacheDir) === path.resolve(tmpdir()) && path.basename(cacheDir).startsWith('rookhposh-public-ui-')) await rm(cacheDir, { recursive: true, force: true });
});
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props));

test('public hero reads real identity, banner and phone and escapes user-authored text', () => {
  const html = render(Hero, { store: { store_name: 'نام <script>unsafe</script>', description: 'شرح واقعی', banner: '/actual-banner.webp', logo: '/actual-logo.webp', contact_phone: '02100000000' } });
  assert.ok(html.includes('/actual-banner.webp') && html.includes('/actual-logo.webp'));
  assert.ok(html.includes('نام &lt;script&gt;unsafe&lt;/script&gt;') && !html.includes('<script>'));
  assert.ok(html.includes('شرح واقعی') && html.includes('tel:02100000000'));
  assert.ok(!html.includes('ARVANA') && !html.includes('ورود یا ثبت‌نام'));
});
test('product links retain actual store/product identity and opening a new tab is explicit', () => {
  const html = render(Card, { slug: 'فروشگاه', product: { id: 42, title: 'نام واقعی محصول', description: 'توضیح واقعی', images: ['/garment.webp'], avg_rating: 4.8 } });
  assert.ok(html.includes('/stores/%D9%81%D8%B1%D9%88%D8%B4%DA%AF%D8%A7%D9%87/products/42'));
  assert.ok(html.includes('target="_blank"') && html.includes('noopener noreferrer'));
  assert.ok(html.includes('نام واقعی محصول') && html.includes('توضیح واقعی') && html.includes('/garment.webp'));
  assert.ok(html.includes('۴٫۸') && !html.includes('favorite') && !html.includes('علاقه'));
});
test('missing images and ratings do not turn into sample clothes or invented badges', () => {
  const html = render(Card, { slug: 'store', product: { id: 1, title: 'محصول بدون عکس', images: [] } });
  assert.ok(html.includes('تصویر در دسترس نیست'));
  assert.ok(!html.includes('white-tshirt.png') && !html.includes('امتیاز'));
});
test('selected garment presents only actual features/images and exposes its selection and lock', () => {
  const html = render(Panel, { product: { title: 'پوشاک', avg_rating: 0 }, image: '/second.jpg', images: ['/first.jpg', '/second.jpg'], features: ['ویژگی واقعی'], disabled: true, onSelect() {} });
  assert.ok(html.includes('ویژگی واقعی') && !html.includes('خروجی باکیفیت'));
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
  assert.equal((html.match(/disabled=""/g) || []).length, 2);
  const noFeatures = render(Panel, { product: { title: 'پوشاک' }, images: [], features: [] });
  assert.ok(!noFeatures.includes('ویژگی‌های محصول') && !noFeatures.includes('انتخاب مدل لباس'));
});
test('empty states are semantic native artwork, never screenshot backgrounds or sample output', () => {
  const empty = render(Empty, {}), input = render(Empty, { input: true });
  assert.ok(empty.includes('هنوز خروجی موفقی ندارید') && empty.includes('اولین پرو شما اینجا نمایش داده می‌شود.'));
  assert.ok(empty.includes('<svg') && !empty.includes('<img'));
  assert.ok(input.includes('هنوز عکسی انتخاب نکرده‌اید') && !input.includes('حذف'));
});
