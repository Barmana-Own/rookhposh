// Isolated performance fixture. Public assets are deliberately original-sized to reproduce production payloads.
const { pool, fixture, ensureRuntimeSchema, sharp } = require('./tryonFixture');
const express = require('express');
const path = require('node:path');
const fs = require('node:fs/promises');
const { createWorker } = require('../../src/tryon/worker');
const { ProviderFailure } = require('../../src/tryon/providerClient');

async function main() {
  await ensureRuntimeSchema();
  const f = await fixture({ credits: 500 }), single = await fixture(), empty = await fixture();
  const publicAssets = process.env.E2E_PUBLIC_ASSETS ? JSON.parse(await fs.readFile(process.env.E2E_PUBLIC_ASSETS, 'utf8')) : {};
  const decode = value => typeof value === 'string' && /^data:image\/(?:png|jpeg|webp);base64,/.test(value)
    ? Buffer.from(value.slice(value.indexOf(',') + 1), 'base64') : null;
  const imageUrl = bytes => 'data:image/webp;base64,' + bytes.toString('base64');
  const fallback = await fs.readFile(path.resolve(__dirname, '../../../frontend/public/images/products/white-tshirt.png'));
  const garments = [];
  for (const value of publicAssets.images || []) {
    const bytes = decode(value);
    if (bytes) garments.push(imageUrl(await sharp(bytes).resize({ width: 640, height: 700, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toBuffer()));
  }
  if (!garments.length) garments.push(imageUrl(await sharp(fallback).resize({ width: 540 }).webp({ quality: 88 }).toBuffer()));
  while (garments.length < 4) garments.push(imageUrl(await sharp(fallback).resize({ width: 540 }).tint(['#bbc9da', '#b69778', '#424953'][garments.length - 1]).webp({ quality: 88 }).toBuffer()));
  let banner = publicAssets.banner || null;
  if (!banner) {
    const pixels = Buffer.alloc(1600 * 600 * 3); let seed = 7;
    for (let i = 0; i < pixels.length; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; pixels[i] = seed & 255; }
    const png = await sharp(pixels, { raw: { width: 1600, height: 600, channels: 3 } }).png().toBuffer();
    banner = 'data:image/png;base64,' + png.toString('base64');
  }
  const logo = publicAssets.logo || null;
  const person = decode(publicAssets.images?.[3]) || f.input;
  const output = await sharp(person).webp({ quality: 90 }).toBuffer();
  await pool.query('UPDATE stores SET store_name=?,description=?,banner=?,logo=? WHERE seller_id=?', ['فروشگاه رخ‌پوش', 'پوشاک فروشگاه را انتخاب کنید و پرو آنلاین انجام دهید.', banner, logo, f.seller.id]);
  const titles = ['پیراهن مشکی', 'پیراهن آبی روشن', 'پیراهن کاراملی', 'پیراهن روشن', 'پوشاک بدون تصویر', 'مدل جدید فروشگاه', 'پیراهن با توضیحات بلند برای بررسی چیدمان در نمایشگر کوچک', 'پوشاک منتخب'];
  await pool.query("UPDATE products SET title=?,description=?,images=?,features=? WHERE id=?", [titles[0], 'پیراهن کوتاه ساده و شیک', JSON.stringify(garments), JSON.stringify(['یقه برگردان', 'آستین کوتاه', 'پارچه نخی', 'فرم آزاد']), f.productId]);
  for (let i = 1; i < titles.length; i++) await pool.query("INSERT INTO products(seller_id,title,description,images,features,status) VALUES(?,?,?,?,'[]','active')",
    [f.seller.id, titles[i], i === 6 ? 'توضیحات طولانی محصول برای اطمینان از حفظ ابعاد کارت و دسترسی به دکمه در داده‌های واقعی با طول متفاوت.'.repeat(3) : 'پوشاک مناسب برای پرو آنلاین', JSON.stringify(i === 4 ? [] : i === 7 ? ['/uiux-missing-image.webp'] : [garments[i % garments.length]])]);
  await pool.query("UPDATE products SET publish_status='inactive' WHERE id=?", [empty.productId]);

  let gate = null, release = null, calls = 0, mode = 'success';
  const providerEvents = [];
  const workerTimings = [], stageTimes = new Map();
  const epoch = () => Math.round(performance.timeOrigin + performance.now());
  const repository = require('../../src/tryon/jobStore'), imageStore = require('../../src/tryon/images');
  let activeJob;
  const measure = async (id, stage, action) => {
    const began = performance.now();
    try { return await action(); }
    finally { if (id) { const values = stageTimes.get(id) || {}; values[stage] = (values[stage] || 0) + performance.now() - began; stageTimes.set(id, values); } }
  };
  const trackedRepository = { ...repository, claim: async () => { const job = await repository.claim(); activeJob = job?.id; return job; } };
  for (const name of ['assets', 'attemptStarted', 'attemptFinished', 'finalize']) trackedRepository[name] = (...args) => measure(activeJob, 'db_' + name, () => repository[name](...args));
  const trackedImages = { ...imageStore,
    read: asset => measure(activeJob, 'read_' + (asset?.kind || 'output_integrity'), () => imageStore.read(asset)),
    stage: (...args) => measure(activeJob, 'output_validation_storage', () => imageStore.stage(...args)),
  };
  const worker = createWorker({ repository: trackedRepository, imageStore: trackedImages, onTiming: value => workerTimings.push(value), providerClient: { generate: async (_provider, job) => {
    calls++;
    if (gate) await gate;
    const started = epoch();
    if (mode === 'failure') throw new ProviderFailure('PROVIDER_NETWORK', { recoverable: true });
    await new Promise(resolve => setTimeout(resolve, 200));
    providerEvents.push({ id: job.id, started, ended: epoch() });
    return { bytes: output, requestId: 'network-controlled-output' };
  } } });
  // Production routes wake the exported worker; point that signal at this isolated injected worker.
  require('../../src/tryon/worker').worker.wake = () => worker.wake();
  const app = express();
  app.use('/_fixture', express.json());
  app.post('/_fixture/hold', (_req, res) => { if (!gate) gate = new Promise(resolve => { release = resolve; }); res.json({ held: true }); });
  app.post('/_fixture/release', (_req, res) => { release?.(); gate = null; release = null; res.json({ released: true }); });
  app.post('/_fixture/mode', (req, res) => { mode = req.body.mode === 'failure' ? 'failure' : 'success'; res.json({ mode }); });
  app.get('/_fixture/state', async (_req, res, next) => {
    try {
      const [[row]] = await pool.query('SELECT COUNT(*) AS uses,COALESCE(SUM(amount),0) AS amount FROM pro_usages WHERE quota_user_id=?', [f.seller.id]);
      res.json({ fixture: 'public-ui-isolated', serverEpoch: epoch(), providerEvents, workerTimings, stageTimes: Object.fromEntries(stageTimes), cpu: process.cpuUsage(), memory: process.memoryUsage(), calls, uses: Number(row.uses), customer_amount: Number(row.amount) });
    } catch (error) { next(error); }
  });
  const backend = require('../../src/app');
  backend.set('trust proxy', 'loopback'); // Synthetic client addresses are confined to this test server.
  app.use((req, res, next) => {
    if (req.method === 'POST' && req.path.endsWith('/pro/jobs')) {
      const started = performance.now(), json = res.json;
      res.json = function (payload) {
        if (payload.success && payload.data?.id) {
          const values = stageTimes.get(payload.data.id) || {};
          values.api_response = performance.now() - started; stageTimes.set(payload.data.id, values);
        }
        return json.call(this, payload);
      };
    }
    next();
  });
  app.use((req, res, next) => ['api', 'pro-api', 'health'].includes(req.path.split('/')[1]) ? backend(req, res, next) : next());
  const frontend = path.resolve(__dirname, '../../../frontend/dist');
  app.use(express.static(frontend)); app.get(/.*/, (_req, res) => res.sendFile(path.join(frontend, 'index.html')));
  const server = app.listen(Number(process.env.E2E_PORT || 18741), '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve)); worker.start();
  await fs.writeFile(process.env.E2E_METADATA, JSON.stringify({
    kind: 'public-ui-isolated', publicPath: '/stores/' + f.slug, productPath: '/stores/' + f.slug + '/products/' + f.productId, productId: f.productId,
    singlePath: '/stores/' + single.slug, emptyPath: '/stores/' + empty.slug, productCount: titles.length,
    admin: { token: f.token(f.admin) }, seller: { token: f.token(f.seller) },
    input: person.toString('base64'), inputMime: decode(publicAssets.images?.[3]) ? publicAssets.images[3].match(/^data:([^;]+);/)[1] : 'image/png', output: output.toString('base64'),
  }), { mode: 0o600 });
  console.log('NETWORK_E2E_READY');
  let closing = false;
  const close = async () => {
    if (closing) return; closing = true; release?.(); await worker.stop();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await pool.end();
  };
  process.once('SIGTERM', () => void close()); process.once('SIGINT', () => void close());
}
main().catch(error => { console.error(error.code || 'PUBLIC_UI_FIXTURE_FAILED'); process.exit(1); });
