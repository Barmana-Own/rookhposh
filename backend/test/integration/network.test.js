const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { pool, sharp, fixture, appServer, browser, waitJob, resetProviders, ensureRuntimeSchema } = require('../helpers/tryonFixture');
const { createWorker } = require('../../src/tryon/worker');
let app, worker;
before(async () => { await ensureRuntimeSchema(); app = await appServer(); });
beforeEach(resetProviders);
after(async () => { await worker?.stop(); await app?.close(); await pool.end(); });

test('public page metadata excludes embedded images and pending changes while preserving the original generation sources', async () => {
  const f = await fixture();
  const banner = f.dataUrl(f.input);
  await pool.query('UPDATE stores SET banner=?,logo=? WHERE seller_id=?', [banner, banner, f.seller.id]);
  await pool.query('UPDATE products SET pending_changes=? WHERE id=?', [JSON.stringify({ title: 'UNAPPROVED_TITLE', images: ['UNAPPROVED_IMAGE'] }), f.productId]);
  const [[before]] = await pool.query('SELECT images,pending_changes FROM products WHERE id=?', [f.productId]);
  const client = browser(app.base), response = await client.request('/api/stores/' + f.slug + '?view=page&productId=' + f.productId);
  const body = await response.json(); assert.equal(response.status, 200);
  assert.equal(body.data.products.length, 1); assert.ok(!JSON.stringify(body).includes('data:image/'));
  assert.ok(!JSON.stringify(body).includes('UNAPPROVED_')); assert.match(response.headers.get('cache-control'), /no-store/);
  assert.match(response.headers.get('server-timing'), /public_read;dur=/);
  const url = body.data.products[0].images[0];
  const original = await client.request(url); assert.equal(original.status, 200); assert.deepEqual(Buffer.from(await original.arrayBuffer()), f.cloth);
  const derivative = await client.request(url + '&w=160', { headers: { accept: 'image/webp' } });
  assert.equal(derivative.status, 200); assert.equal((await sharp(Buffer.from(await derivative.arrayBuffer())).metadata()).format, 'webp');
  const fallback = await client.request(url + '&w=160', { headers: { accept: 'image/webp;q=0,image/jpeg' } });
  assert.equal(fallback.headers.get('content-type'), 'image/jpeg'); assert.deepEqual(Buffer.from(await fallback.arrayBuffer()), f.cloth);
  const [[after]] = await pool.query('SELECT images,pending_changes FROM products WHERE id=?', [f.productId]);
  assert.deepEqual(after, before);
  const legacy = await client.json('/api/stores/' + f.slug); assert.equal(legacy.data.products[0].images[0], f.dataUrl(f.cloth, 'image/jpeg'));
});

test('public image validators and ETags never bypass publication, store ownership or current image versions', async () => {
  const f = await fixture(), other = await fixture(), client = browser(app.base);
  const page = await client.json('/api/stores/' + f.slug + '?view=page');
  const url = page.data.products[0].images[0];
  const image = await client.request(url), etag = image.headers.get('etag');
  assert.match(image.headers.get('vary'), /Origin/); assert.match(image.headers.get('vary'), /Accept/);
  // Node fetch otherwise forces Cache-Control: no-cache for a conditional request.
  assert.equal((await client.request(url, { headers: { 'if-none-match': etag, 'cache-control': 'max-age=0' } })).status, 304);
  assert.equal((await client.request('/api/stores/' + other.slug + '?view=page&productId=' + f.productId)).status, 404);
  assert.equal((await client.request(url.replace('/media/products/' + f.productId, '/media/products/' + other.productId))).status, 404);
  for (const width of ['999999', '0160', '../', '320&w=640']) assert.equal((await client.request(url + '&w=' + width)).status, 400);
  assert.equal((await client.request('/api/stores/' + f.slug + '?view=page&productId=abc')).status, 400);
  await pool.query('UPDATE products SET images=? WHERE id=?', [JSON.stringify([f.dataUrl(f.output)]), f.productId]);
  assert.equal((await client.request(url, { headers: { 'if-none-match': etag } })).status, 404);
  const fresh = (await client.json('/api/stores/' + f.slug + '?view=page')).data.products[0].images[0];
  await pool.query("UPDATE products SET publish_status='inactive' WHERE id=?", [f.productId]);
  assert.equal((await client.request(fresh)).status, 404);
  assert.equal((await client.request('/api/stores/' + f.slug + '?view=page&productId=' + f.productId)).status, 404);
});

test('acceptance and accounting remain live with only one free pool connection', async () => {
  const f = await fixture(), client = await browser(app.base).ready(), held = [];
  let response, timer;
  try {
    for (let i = 0; i < 9; i++) held.push(await pool.getConnection());
    response = await Promise.race([
      client.json('/api/stores/' + f.slug + '/products/' + f.productId + '/pro/jobs', { method: 'POST', body: f.payload() }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('POOL_STARVATION_REGRESSION')), 3000); }),
    ]);
    assert.equal(response.status, 202);
  } finally { clearTimeout(timer); for (const connection of held) connection.release(); }
  let calls = 0;
  worker = createWorker({ providerClient: { generate: async () => { calls++; return { bytes: f.output }; } } }); worker.start();
  const job = await waitJob(client, response.data.id); assert.equal(job.status, 'completed'); assert.equal(calls, 1);
  const [[usage]] = await pool.query('SELECT COUNT(*) AS total,SUM(amount) AS amount FROM pro_usages WHERE tryon_job_id=?', [job.id]);
  assert.equal(usage.total, 1); assert.equal(Number(usage.amount), 0);
});
