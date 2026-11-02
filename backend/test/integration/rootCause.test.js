const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { pool, fixture, appServer, browser, waitJob, resetProviders, ensureRuntimeSchema } = require('../helpers/tryonFixture');
const { createWorker } = require('../../src/tryon/worker');
const { ProviderFailure } = require('../../src/tryon/providerClient');
const { COOKIE, verifySession } = require('../../src/tryon/identity');
const revocations = require('../../src/tryon/sessionRevocations');
let app, worker;
before(async () => { await ensureRuntimeSchema(); app = await appServer(); });
beforeEach(resetProviders);
after(async () => { worker?.stop(); await app?.close(); await pool.end(); });
const startPath = f => '/api/stores/' + f.slug + '/products/' + f.productId + '/pro/jobs';
const runWorker = generate => { worker?.stop(); worker = createWorker({ providerClient: { generate } }); worker.start(); };
const recipient = { bank_name: 'QA disposable only', account_holder: 'Test recipient', card_number: '4111111111111111', iban: '' };
const adminOf = f => browser(app.base, f.token(f.admin));
const sellerOf = f => browser(app.base, f.token(f.seller));
function signed(nonce, expires) {
  const value = nonce + '.' + expires;
  return value + '.' + crypto.createHmac('sha256', process.env.JWT_SECRET).update('tryon-session:' + value).digest('hex');
}
async function completed(f, client = null, key = crypto.randomUUID()) {
  const owner = client || await browser(app.base).ready(); runWorker(async () => ({ bytes: f.output }));
  const result = await owner.json(startPath(f), { method: 'POST', body: f.payload(key) });
  assert.equal(result.status, 202, JSON.stringify(result)); const job = await waitJob(owner, result.data.id); assert.equal(job.status, 'completed');
  return { owner, job };
}

test('QA-01 valid return, renewal, expiry and cookie tampering enforce ownership without IP attribution', async () => {
  const f = await fixture(); const { owner, job } = await completed(f);
  const raw = owner.cookie.slice(COOKIE.length + 1); const nonce = raw.split('.')[0];
  const returning = browser(app.base, null, '198.18.1.1');
  assert.equal((await returning.json('/api/tryon/history', { headers: { cookie: owner.cookie } })).data.latest.id, job.id);
  const nearExpiry = signed(nonce, Math.floor(Date.now() / 1000) + 10 * 86400);
  const renewed = await returning.request('/api/tryon/history', { headers: { cookie: COOKIE + '=' + nearExpiry } });
  assert.equal((await renewed.json()).data.latest.id, job.id); assert.match(renewed.headers.get('set-cookie'), /HttpOnly/); assert.match(renewed.headers.get('set-cookie'), /SameSite=Lax/);
  assert.equal(verifySession(returning.cookie.slice(COOKIE.length + 1)).nonce, nonce);
  for (const bad of [signed(nonce, Math.floor(Date.now() / 1000) - 1), raw.slice(0, -1) + (raw.endsWith('0') ? '1' : '0'), 'forged']) {
    const response = await browser(app.base).json('/api/tryon/history', { headers: { cookie: COOKIE + '=' + bad } });
    assert.equal(response.status, 200); assert.equal(response.data.latest, null);
  }
});

test('QA-01 selective revocation blocks old cookie replay across history, details and every image', async () => {
  const f = await fixture(); const key = crypto.randomUUID(); const { owner, job } = await completed(f, null, key); const oldCookie = owner.cookie;
  const revoke = await owner.request('/api/tryon/session/revoke', { method: 'POST', body: {} });
  assert.equal(revoke.status, 200); assert.match(revoke.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
  const replay = browser(app.base);
  assert.equal((await replay.json('/api/tryon/history', { headers: { cookie: oldCookie } })).data.latest, null);
  for (const suffix of ['', '/images/input', '/images/product', '/images/output?download=1']) assert.equal((await replay.request('/api/tryon/jobs/' + job.id + suffix, { headers: { cookie: oldCookie } })).status, 404);
  assert.equal((await replay.json('/api/tryon/by-request/' + key, { headers: { cookie: oldCookie } })).status, 404);
  const [[old]] = await pool.query('SELECT COUNT(*) AS total FROM pro_usages WHERE tryon_job_id=?', [job.id]); assert.equal(old.total, 1);
  await assert.rejects(require('../../src/database/sessionRevocationSchema').rollbackSessionRevocations(pool, { execute: true }), /Rollback refused/);
});

test('QA-01 foreign-origin and cross-site state changes fail before cookies or database mutations', async () => {
  const f = await fixture(); const owner = browser(app.base);
  for (const headers of [{ origin: 'https://attacker.example' }, { 'sec-fetch-site': 'cross-site' }]) {
    for (const endpoint of [startPath(f), '/api/tryon/session/revoke']) {
      const response = await owner.request(endpoint, { method: 'POST', body: f.payload(), headers });
      assert.equal(response.status, 403); assert.equal(response.headers.get('set-cookie'), null);
    }
  }
  const trusted = require('../../src/tryon/config').allowedOrigins.values().next().value;
  assert.equal((await owner.request('/api/tryon/session/revoke', { method: 'POST', body: {}, headers: { origin: trusted, 'sec-fetch-site': 'cross-site' } })).status, 200);
});

test('QA-01 revocation cleanup retains live tombstones and does not delete jobs or images', async () => {
  const old = 'a'.repeat(64), live = 'b'.repeat(64);
  await pool.query('INSERT INTO virtual_tryon_session_revocations(owner_hash,expires_at) VALUES(?,1),(?,?)', [old, live, Math.floor(Date.now() / 1000) + 3600]);
  await revocations.purgeExpired(); assert.equal(await revocations.isRevoked(old), false); assert.equal(await revocations.isRevoked(live), true);
  await pool.query('DELETE FROM virtual_tryon_session_revocations WHERE owner_hash=?', [live]);
});

test('QA-01 shared admin authorization rechecks account role and blocking; outages are not 401', async t => {
  const f = await fixture(); const admin = adminOf(f);
  assert.equal((await admin.json('/api/auth/me')).status, 200);
  await pool.query("UPDATE users SET role='Seller' WHERE id=?", [f.admin.id]); assert.equal((await admin.json('/api/admin/products')).status, 403);
  await pool.query("UPDATE users SET role='Admin',status='blocked' WHERE id=?", [f.admin.id]); assert.equal((await admin.json('/api/admin/products')).status, 403);
  await pool.query("UPDATE users SET status='active' WHERE id=?", [f.admin.id]);
  const mock = t.mock.method(require('../../src/repositories/dbStore'), 'findUserById', async () => { throw new Error('simulated database outage'); });
  assert.equal((await admin.json('/api/auth/me')).status, 500); mock.mock.restore(); assert.equal((await admin.json('/api/auth/me')).status, 200);
});

test('QA-06 pending/rejected sellers can check their account while protected operations stay denied', async () => {
  const f = await fixture(); const seller = sellerOf(f);
  for (const status of ['pending', 'rejected']) {
    await pool.query('UPDATE users SET seller_verification_status=? WHERE id=?', [status, f.seller.id]);
    assert.equal((await seller.json('/api/auth/me')).status, 200);
    assert.equal((await seller.json('/api/seller/dashboard')).status, 403);
  }
  await pool.query("UPDATE users SET role='Admin',seller_verification_status='approved' WHERE id=?", [f.seller.id]);
  assert.equal((await seller.json('/api/admin/products')).status, 403, 'an old seller token must not inherit a promotion');
  const deleted = browser(app.base, f.token(f.otherAdmin));
  await pool.query('DELETE FROM users WHERE id=?', [f.otherAdmin.id]);
  assert.equal((await deleted.json('/api/auth/me')).status, 401);
});

test('QA-02 completed and repeated requests create one debit and a privacy-safe seller report matching dashboard', async () => {
  const f = await fixture(); const owner = await browser(app.base).ready(); const key = crypto.randomUUID();
  const { job } = await completed(f, owner, key);
  assert.equal((await owner.json(startPath(f), { method: 'POST', body: f.payload(key) })).data.id, job.id);
  const seller = sellerOf(f), report = await seller.json('/api/seller/pro-usages');
  assert.equal(report.status, 200); assert.equal(report.data.pagination.total, 1);
  const row = report.data.items[0]; assert.equal(row.operation_id, job.id); assert.equal(row.tokens_consumed, 1); assert.equal(row.credit_status, 'consumed'); assert.equal(row.balance_after, null);
  assert.equal(report.data.summary.tokens_remaining, 29);
  const dashboard = await seller.json('/api/seller/dashboard'); assert.equal(dashboard.data.tokens_remaining, report.data.summary.tokens_remaining);
  for (const key of ['image', 'input_image', 'output_image', 'ip_address', 'device', 'owner_hash', 'visitor_hash', 'user_id']) assert.equal(Object.hasOwn(row, key), false);
  const other = browser(app.base, f.token(f.otherSeller)); assert.equal((await other.json('/api/seller/pro-usages?seller_id=' + f.seller.id)).data.pagination.total, 0);
  assert.equal((await browser(app.base).json('/api/seller/pro-usages')).status, 401);
});

test('QA-02 reserved, failed and retried jobs report no duplicate debit and release reservations', async () => {
  const f = await fixture(); const owner = await browser(app.base).ready(); const seller = sellerOf(f);
  let release; const gate = new Promise(resolve => { release = resolve; });
  runWorker(async () => { await gate; throw new ProviderFailure('PROVIDER_NETWORK', { recoverable: true }); });
  const start = await owner.json(startPath(f), { method: 'POST', body: f.payload() });
  try {
    await waitJob(owner, start.data.id, ['processing']);
    const active = (await seller.json('/api/seller/pro-usages')).data;
    assert.equal(active.items[0].credit_status, 'reserved'); assert.equal(active.items[0].tokens_consumed, 0); assert.equal(active.summary.tokens_available, 29);
  } finally { release(); }
  await waitJob(owner, start.data.id);
  const failed = (await seller.json('/api/seller/pro-usages')).data; assert.equal(failed.items[0].credit_status, 'released'); assert.equal(failed.summary.tokens_available, 30);
  runWorker(async () => ({ bytes: f.output }));
  assert.equal((await owner.json('/api/tryon/jobs/' + start.data.id + '/retry', { method: 'POST', body: { request_key: crypto.randomUUID() } })).status, 202);
  await waitJob(owner, start.data.id);
  const retried = (await seller.json('/api/seller/pro-usages')).data; assert.equal(retried.pagination.total, 1); assert.equal(retried.items[0].tokens_consumed, 1); assert.equal(retried.summary.tokens_remaining, 29);
});

test('QA-02 usage pagination, date validation and legacy unknown attribution remain honest', async () => {
  const f = await fixture(); await completed(f); await completed(f);
  const seller = sellerOf(f); const first = (await seller.json('/api/seller/pro-usages?limit=1')).data, second = (await seller.json('/api/seller/pro-usages?limit=1&page=2')).data;
  assert.equal(first.pagination.total, 2); assert.notEqual(first.items[0].id, second.items[0].id);
  assert.equal((await seller.json('/api/seller/pro-usages?from=2000-01-01&to=2000-01-01')).data.pagination.total, 0);
  for (const query of ['from=2026-02-30', 'from=bad', 'limit=100000', 'page=-1', 'status=anything', 'from=2026-12-01&to=2026-01-01']) assert.equal((await seller.json('/api/seller/pro-usages?' + query)).status, 400);
  await pool.query("INSERT INTO pro_usages(product_id,amount,status,description,quota_source) VALUES(?,0,'success','QA legacy','legacy')", [f.productId]); await ensureRuntimeSchema();
  const legacy = (await seller.json('/api/seller/pro-usages')).data.items.find(row => row.credit_status === 'unknown'); assert.ok(legacy); assert.equal(legacy.tokens_consumed, null);
});

test('QA-04 absent bank settings reject manual payments for every purchase path with no credit or transaction', async () => {
  const f = await fixture(); const seller = sellerOf(f); await adminOf(f).json('/api/admin/settings/bank', { method: 'PATCH', body: {} });
  const settings = (await seller.json('/api/seller/packages/settings')).data.bank_info; assert.equal(settings.bank_transfer_available, false); assert.equal(settings.card_number, undefined);
  const [[pack]] = await pool.query('SELECT package_id FROM pro_subscriptions WHERE user_id=?', [f.seller.id]);
  for (const endpoint of ['/api/seller/tokens/purchase', '/api/seller/packages/' + pack.package_id + '/purchase', '/api/seller/wallet/charge']) {
    assert.equal((await seller.json(endpoint, { method: 'POST', body: { payment_method: 'bank_transfer', quantity: 1, amount: 10000, receipt: { dataUrl: f.dataUrl(f.input) } } })).status, 409);
  }
  const [[count]] = await pool.query('SELECT COUNT(*) AS total FROM transactions WHERE user_id=?', [f.seller.id]); assert.equal(count.total, 0);
});

test('QA-04 admin bank validation, update propagation and receipt approval preserve financial ledger integrity', async () => {
  const f = await fixture(); const seller = sellerOf(f), admin = adminOf(f);
  for (const bad of [{ ...recipient, card_number: '0000000000000000' }, { ...recipient, iban: 'IR000000000000000000000000' }]) assert.equal((await admin.json('/api/admin/settings/bank', { method: 'PATCH', body: bad })).status, 400);
  assert.equal((await seller.json('/api/admin/settings/bank', { method: 'PATCH', body: recipient })).status, 403);
  assert.equal((await admin.json('/api/admin/settings/bank', { method: 'PATCH', body: recipient })).status, 200);
  assert.equal((await seller.json('/api/seller/packages/settings')).data.bank_info.account_holder, recipient.account_holder);
  assert.equal((await seller.json('/api/seller/wallet/charge', { method: 'POST', body: { amount: 10000, payment_method: 'bank_transfer', receipt: { dataUrl: 'data:image/png;base64,YWJj' } } })).status, 400);
  const pending = await seller.json('/api/seller/wallet/charge', { method: 'POST', body: { amount: 10000, payment_method: 'bank_transfer', receipt: { dataUrl: f.dataUrl(f.input), name: 'receipt.png' } } });
  assert.equal(pending.status, 200); assert.equal(pending.data.status, 'pending');
  assert.equal(Number((await seller.json('/api/seller/wallet')).data.balance_toman), 0);
  const [[transaction]] = await pool.query('SELECT metadata,status FROM transactions WHERE id=?', [pending.data.transaction_id]); assert.equal(transaction.status, 'pending'); assert.equal(JSON.parse(transaction.metadata).bank_recipient.card_number, recipient.card_number);
  assert.equal((await admin.json('/api/admin/payments/' + pending.data.transaction_id + '/approve', { method: 'PATCH' })).status, 200);
  assert.equal((await admin.json('/api/admin/payments/' + pending.data.transaction_id + '/approve', { method: 'PATCH' })).status, 404);
  assert.equal(Number((await seller.json('/api/seller/wallet')).data.balance_toman), 10000);
  const changed = { ...recipient, account_holder: 'Updated disposable recipient' };
  await admin.json('/api/admin/settings/bank', { method: 'PATCH', body: changed }); assert.equal((await seller.json('/api/seller/packages/settings')).data.bank_info.account_holder, changed.account_holder);
});

test('QA-05 server search covers Persian, English, exact ID and filters across pages without tenant leakage', async () => {
  const f = await fixture(); const seller = sellerOf(f), admin = adminOf(f);
  await pool.query("UPDATE products SET title='پیراهن آبی QA' WHERE id=?", [f.productId]);
  const [pending] = await pool.query("INSERT INTO products(seller_id,title,description,status) VALUES(?,'پیراهن جدید QA','pending QA','pending')", [f.seller.id]);
  await pool.query("INSERT INTO products(seller_id,title,description,status) VALUES(?,'پیراهن رقیب QA','QA','active')", [f.otherSeller.id]);
  for (const term of ['پيراهن', 'QA', String(f.productId)]) {
    const result = await seller.json('/api/seller/products?status=all&page=1&limit=1&q=' + encodeURIComponent(term)); assert.equal(result.status, 200); assert.ok(result.data.items.length > 0); assert.equal(Number(result.data.items[0].seller_id), f.seller.id);
  }
  assert.equal((await seller.json('/api/seller/products?page=1&status=all&q=qa-no-such-product-20261101')).data.pagination.total, 0);
  assert.equal((await admin.json('/api/admin/products?status=all&q=qa-no-such-product-20261101')).data.pagination.total, 0);
  const approved = (await seller.json('/api/seller/products?page=1&status=active&q=QA')).data; assert.equal(approved.pagination.total, 1);
  assert.equal((await seller.json('/api/seller/products?page=1&status=pending&q=' + pending.insertId)).data.items[0].id, pending.insertId);
  const one = (await seller.json('/api/seller/products?page=1&limit=1&status=all&q=QA')).data, two = (await seller.json('/api/seller/products?page=2&limit=1&status=all&q=QA')).data;
  assert.equal(one.pagination.total, 2); assert.notEqual(one.items[0].id, two.items[0].id);
  assert.equal((await seller.json('/api/seller/products?page=1&q=%25')).data.pagination.total, 0);
  assert.equal((await seller.json('/api/seller/products?q=a&q=b')).status, 400);
});

test('QA-07 missing and malformed store slugs return 404 while canonical and legacy QR links survive', async () => {
  const f = await fixture(); const publicClient = browser(app.base);
  for (const slug of ['does-not-exist-20261101', 'invalid slug']) {
    const response = await publicClient.json('/api/stores/' + encodeURIComponent(slug)); assert.equal(response.status, 404); assert.equal(response.success, false); assert.match(response.message, /فروشگاه.*یافت نشد/);
  }
  await pool.query('UPDATE stores SET legacy_slug=? WHERE seller_id=?', ['old-qr-' + f.productId, f.seller.id]);
  for (const slug of [f.slug, 'old-qr-' + f.productId]) assert.equal((await publicClient.json('/api/stores/' + slug)).data.products[0].id, f.productId);
});

test('QA-08 new packages are seller-only without deleting or reclassifying legacy customer packages', async () => {
  const f = await fixture(); const admin = adminOf(f);
  const [legacy] = await pool.query("INSERT INTO packages(title,price,role_type,pro_requests_count,duration_days,status) VALUES('QA legacy customer',5000,'user',10,30,'active')");
  assert.equal((await admin.json('/api/admin/packages', { method: 'POST', body: { title: 'QA no customer billing', role_type: 'user', price: 5000, duration_days: 30 } })).status, 400);
  const create = await admin.json('/api/admin/packages', { method: 'POST', body: { title: 'QA seller only', price: 5000, duration_days: 30, pro_requests_count: 10 } }); assert.equal(create.status, 200); assert.equal(create.data.role_type, 'seller');
  const [[old]] = await pool.query('SELECT role_type,title FROM packages WHERE id=?', [legacy.insertId]); assert.equal(old.role_type, 'user'); assert.equal(old.title, 'QA legacy customer');
});
