const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pool, fixture, appServer, browser, ensureRuntimeSchema, sharp } = require('../helpers/tryonFixture');
const { createWorker } = require('../../src/tryon/worker');
test('existing provider produces a valid private raster from non-personal synthetic fixtures', { skip: process.env.RUN_LIVE_TRYON !== 'true', timeout: 360000 }, async (t) => {
  await ensureRuntimeSchema();
  const f = await fixture({ credits: 1 });
  const person = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="384" height="576"><rect width="384" height="576" fill="#e5e7eb"/><ellipse cx="192" cy="76" rx="34" ry="43" fill="#bb8e72"/><path d="M156 120 L228 120 L249 283 L135 283Z" fill="#dbeafe"/><path d="M157 130 L135 142 L85 290 L107 303 L171 156 M226 130 L249 142 L299 290 L277 303 L212 156" fill="#bb8e72"/><path d="M140 280 L244 280 L234 420 L251 533 L211 533 L190 361 L173 533 L133 533 L149 420Z" fill="#334155"/><path d="M130 529 L175 529 L177 554 L119 554 Z M210 529 L253 529 L267 554 L211 554Z" fill="#111827"/></svg>')).png().toBuffer();
  const cloth = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="384" height="512"><rect width="384" height="512" fill="white"/><path d="M130 70 L165 52 Q192 100 219 52 L254 70 L333 135 L291 197 L251 163 L260 430 L124 430 L133 163 L93 197 L51 135Z" fill="#7c3aed"/><path d="M165 52 Q192 100 219 52" fill="none" stroke="#5b21b6" stroke-width="8"/></svg>')).png().toBuffer();
  await pool.query('UPDATE products SET images=? WHERE id=?', [JSON.stringify([f.dataUrl(cloth)]), f.productId]);
  const app = await appServer();
  const worker = createWorker();
  t.after(async () => { await worker.stop(); await app.close(); await pool.end(); });
  worker.start();
  const customer = await browser(app.base).ready();
  const made = await customer.json('/api/stores/' + f.slug + '/products/' + f.productId + '/pro/jobs', { method: 'POST', body: { ...f.payload(), image: f.dataUrl(person) } });
  assert.equal(made.status, 202, JSON.stringify(made));
  let job = made.data;
  for (let n = 0; n < 170 && ['validating','processing','saving'].includes(job.status); n++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    job = (await customer.json('/api/tryon/jobs/' + job.id)).data;
  }
  console.log('LIVE_AI_RESULT=' + JSON.stringify({ status: job.status, code: job.error_code, attempts: job.attempts_count, duration_ms: job.duration_ms, provider: job.service_name }));
  assert.equal(job.status, 'completed', JSON.stringify({ status: job.status, code: job.error_code }));
  const file = await customer.request(job.images.output.url + '?download=1');
  const bytes = Buffer.from(await file.arrayBuffer());
  const metadata = await sharp(bytes).metadata();
  assert.ok(metadata.width && metadata.height && bytes.length > 100);
  assert.match(file.headers.get('content-disposition'), /^attachment;/);
  console.log('LIVE_IMAGE_RESULT=' + JSON.stringify({ bytes: bytes.length, format: metadata.format, width: metadata.width, height: metadata.height }));
});
