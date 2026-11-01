const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const test = require('node:test');

if (process.env.NODE_ENV !== 'test' || !/^rookhposh_payment_test_[a-z0-9_]{1,32}$/.test(process.env.DB_NAME || '')) {
  throw new Error('Entitlement integration tests require a disposable rookhposh_payment_test_* database.');
}

const jwt = require('jsonwebtoken');
const pool = require('../../src/config/database');
const db = require('../../src/repositories/dbStore');
const provider = require('../../src/integrations/omidpay');
const { jwtSecret, omidpay } = require('../../src/config/env');
const { ensureEntitlementSchema } = require('../../src/database/entitlementSchema');
const { ensureRuntimeSchema } = require('../../src/database/runtimeSetup');
const ApiError = require('../../src/utils/apiError');
const app = require('../../src/app');

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJ9sAAAAASUVORK5CYII=';

test('purchased seller entitlements are usable, visible and spent once in real MariaDB transactions', { timeout: 90000 }, async (t) => {
  await ensureRuntimeSchema();
  const previous = { ...omidpay };
  Object.assign(omidpay, { enabled: true, userId: 'test-user', password: 'test-only-password', terminalId: '10000001', merchantId: '10000002',
    callbackBaseUrl: 'https://shop.test/api/payments/omidpay/callback', frontendUrl: 'https://shop.test' });
  t.after(() => Object.assign(omidpay, previous));
  t.after(() => pool.end());
  t.mock.method(console, 'warn', () => undefined);
  app.set('trust proxy', 'loopback');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const nativeFetch = globalThis.fetch.bind(globalThis);
  t.mock.method(globalThis, 'fetch', (url, options) => {
    assert.equal(new URL(url).origin, origin, 'entitlement tests must not contact a provider');
    return nativeFetch(url, options);
  });
  const bank = new Map();
  t.mock.method(provider, 'createToken', async ({ amountRial }) => {
    const token = randomBytes(20).toString('hex');
    bank.set(token, { paid: false, amountRial, reference: String(BigInt(`0x${randomBytes(10).toString('hex')}`)) });
    return token;
  });
  t.mock.method(provider, 'verify', async ({ token, amountRial }) => {
    const payment = bank.get(token);
    if (!payment?.paid) throw new ApiError(409, 'Synthetic unpaid payment');
    assert.equal(payment.amountRial, amountRial);
    return { reference: payment.reference, amountRial };
  });
  let nextIp = 10;
  async function api(path, { method = 'GET', token, body, ip = '203.0.113.1', expected = 200, forwarded } = {}) {
    const headers = { Accept: 'application/json', 'X-Forwarded-For': forwarded || ip };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(origin + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    const raw = await response.text();
    assert.equal(response.status, expected, `${method} ${path}: ${raw.slice(0, 180)}`);
    return { response, data: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(raw).data : null };
  }
  async function fixture(scope, requests = 30, monthly = requests) {
    const suffix = randomBytes(8).toString('hex');
    const account = await db.createUser({ fullname: `Entitlement ${suffix}`, username: `entitlement-${suffix}`, password: randomBytes(24).toString('base64url'), role: 'Seller', seller_verification_status: 'approved', store_name: `Entitlement ${suffix}` });
    const [pack] = await pool.query("INSERT INTO packages(title,price,role_type,duration_days,pro_requests_count,monthly_pro_request_limit,status) VALUES(?,500,'seller',30,?,?,'active')", [`Purchased ${suffix}`, requests, monthly]);
    const [product] = await pool.query("INSERT INTO products(seller_id,title,description,price,images,status,publish_status) VALUES(?,?,'Fixture',1000,?,'active','active')", [account.id, `Product ${suffix}`, JSON.stringify([image])]);
    const store = await db.getStoreBySeller(account.id);
    scope.after(async () => {
      await pool.query('DELETE FROM pro_usages WHERE quota_user_id=? OR user_id=? OR product_id IN (SELECT id FROM products WHERE seller_id=?)', [account.id, account.id, account.id]);
      await pool.query('DELETE FROM pro_uploads WHERE product_id IN (SELECT id FROM products WHERE seller_id=?)', [account.id]);
      await pool.query('DELETE FROM pro_subscriptions WHERE user_id=?', [account.id]);
      await db.deleteUser(account.id);
      await pool.query('DELETE FROM packages WHERE id=?', [pack.insertId]);
    });
    return { ...account, token: jwt.sign({ id: account.id, role: 'Seller' }, jwtSecret, { expiresIn: '5m' }), packageId: pack.insertId, productId: product.insertId,
      path: `/api/stores/${encodeURIComponent(store.slug)}/products/${product.insertId}/pro`, ip: `203.0.113.${nextIp++}` };
  }
  async function dashboard(account) { return (await api('/api/seller/dashboard', { token: account.token })).data; }
  async function wallet(account, amount = 10000) { await pool.query('UPDATE users SET wallet_balance=? WHERE id=?', [amount, account.id]); }
  async function buyPackage(account, method = 'wallet') {
    return (await api(`/api/seller/packages/${account.packageId}/purchase`, { method: 'POST', token: account.token, body: { payment_method: method, request_id: randomUUID() } })).data;
  }
  async function callback(checkout) {
    const response = await fetch(`${origin}/api/payments/omidpay/callback/${checkout.id}`, { method: 'POST', body: new URLSearchParams({ token: checkout.gateway.fields.token, State: 'OK' }), redirect: 'manual' });
    assert.equal(response.status, 303);
    await response.arrayBuffer();
  }
  async function exhaustedTrial(account, ip = account.ip) {
    for (let n = 0; n < 3; n += 1) await pool.query("INSERT INTO pro_usages(product_id,ip_address,is_free_trial,status) VALUES(?,?,1,'success')", [account.productId, ip]);
  }
  async function upload(account, ip = account.ip, extra = {}) {
    return (await api(account.path + '/upload', { method: 'POST', ip, body: { image, file_name: 'fixture.png', ...extra } })).data.id;
  }
  async function use(account, uploadId, { expected = 200, ip = account.ip, ...extra } = {}) {
    return (await api(account.path + '/use', { method: 'POST', expected, ip, body: { upload_id: uploadId, output_image: image, ...extra } })).data;
  }

  await t.test('bank-confirmed package appears on the dashboard and unlocks store-funded guest usage', async (scope) => {
    const account = await fixture(scope);
    await exhaustedTrial(account);
    assert.equal((await api(account.path + '/quota', { ip: account.ip })).data.can_use_pro, false);
    const checkout = await buyPackage(account, 'direct_gateway');
    await callback(checkout);
    assert.equal((await dashboard(account)).tokens_remaining, 0);
    bank.get(checkout.gateway.fields.token).paid = true;
    await callback(checkout); await callback(checkout);
    const home = await dashboard(account);
    assert.equal(home.active_package.package_id, account.packageId);
    assert.equal(home.subscription.title.startsWith('Purchased '), true);
    assert.equal(home.tokens_remaining, 30);
    const quota = (await api(account.path + '/quota', { ip: account.ip })).data;
    assert.equal(quota.can_use_pro, true); assert.equal(quota.has_subscription, true);
    assert.equal(quota.tokens_remaining, undefined); assert.equal(quota.subscription.id, undefined);
    const uploaded = await upload(account, account.ip, { user_id: 999999, quota_user_id: 999999 });
    await use(account, uploaded, { amount: 999999, quota_user_id: 999999 });
    assert.equal((await dashboard(account)).tokens_remaining, 29);
    const [[usage]] = await pool.query('SELECT user_id,quota_user_id,amount,quota_source FROM pro_usages WHERE quota_user_id=?', [account.id]);
    assert.equal(usage.user_id, null); assert.equal(Number(usage.quota_user_id), account.id); assert.equal(Number(usage.amount), 0); assert.equal(usage.quota_source, 'subscription');
    await use(account, uploaded, { expected: 409 });
    assert.equal((await dashboard(account)).tokens_remaining, 29);
  });

  await t.test('wallet subscription activation and wallet debit roll back together on failure', async (scope) => {
    const account = await fixture(scope); await wallet(account);
    const getConnection = pool.getConnection.bind(pool); let fail = true;
    scope.mock.method(pool, 'getConnection', async () => {
      const connection = await getConnection(); const query = connection.query; const release = connection.release;
      connection.query = function (sql, ...args) { if (fail && sql.includes('INSERT INTO pro_subscriptions')) { fail = false; throw new Error('Synthetic activation failure'); } return query.call(this, sql, ...args); };
      connection.release = function () { this.query = query; this.release = release; return release.call(this); };
      return connection;
    });
    await api(`/api/seller/packages/${account.packageId}/purchase`, { method: 'POST', token: account.token, body: { payment_method: 'wallet' }, expected: 500 });
    assert.equal(Number((await db.findUserById(account.id)).wallet_balance), 10000);
    const [[count]] = await pool.query('SELECT COUNT(*) AS total FROM transactions WHERE user_id=?', [account.id]); assert.equal(count.total, 0);
    await buyPackage(account);
    assert.equal(Number((await db.findUserById(account.id)).wallet_balance), 9500);
    assert.equal((await dashboard(account)).tokens_remaining, 30);
  });

  await t.test('paid snapshots survive later plan edits and deactivation', async (scope) => {
    const account = await fixture(scope); await wallet(account); await buyPackage(account);
    const before = await dashboard(account);
    await pool.query("UPDATE packages SET title='Changed',pro_requests_count=0,monthly_pro_request_limit=0,duration_days=1,status='inactive' WHERE id=?", [account.packageId]);
    const after = await dashboard(account);
    assert.equal(after.subscription.title, before.subscription.title); assert.equal(after.tokens_remaining, 30); assert.equal(after.subscription.expires_at, before.subscription.expires_at);
  });

  await t.test('parallel requests with different IPs cannot spend the last store token twice', async (scope) => {
    const account = await fixture(scope, 1); await wallet(account); await buyPackage(account);
    const otherIp = `203.0.113.${nextIp++}`;
    const first = await upload(account); const second = await upload(account, otherIp);
    const responses = await Promise.all([account.ip, otherIp].map((ip, index) => fetch(origin + account.path + '/use', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ upload_id: index ? second : first, output_image: image }),
    })));
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 402]);
    await Promise.all(responses.map((response) => response.arrayBuffer()));
    assert.equal((await dashboard(account)).tokens_remaining, 0);
  });

  await t.test('token-only purchases credit the ledger after wallet, receipt approval or bank confirmation, once', async (scope) => {
    const account = await fixture(scope); await wallet(account); await exhaustedTrial(account);
    await pool.query("INSERT INTO app_settings(`key`,`value`) VALUES('token_price','10') ON DUPLICATE KEY UPDATE `value`='10'");
    await db.purchaseTokens(account.id, 'seller', { quantity: 4, payment_method: 'wallet' });
    assert.equal((await dashboard(account)).tokens_remaining, 4); assert.equal((await dashboard(account)).subscription, null);
    const pending = await db.purchaseTokens(account.id, 'seller', { quantity: 3, payment_method: 'bank_transfer' });
    assert.equal((await dashboard(account)).tokens_remaining, 4);
    await db.approvePendingPayment(pending.transaction_id);
    await assert.rejects(db.approvePendingPayment(pending.transaction_id), { status: 404 });
    assert.equal((await dashboard(account)).tokens_remaining, 7);
    const checkout = await db.purchaseTokens(account.id, 'seller', { quantity: 2, payment_method: 'direct_gateway', request_id: randomUUID() });
    assert.equal((await dashboard(account)).tokens_remaining, 7);
    bank.get(checkout.gateway.fields.token).paid = true; await callback(checkout); await callback(checkout);
    assert.equal((await dashboard(account)).tokens_remaining, 9);
    await use(account, await upload(account));
    assert.equal((await dashboard(account)).tokens_remaining, 8);
    assert.equal((await api(account.path + '/quota', { ip: account.ip })).data.has_tokens, true);
  });

  await t.test('monthly caps, calendar reset and expiration preserve accurate remaining balances', async (scope) => {
    const account = await fixture(scope, 5, 2); await wallet(account); await buyPackage(account); await exhaustedTrial(account);
    await use(account, await upload(account)); await use(account, await upload(account));
    const capped = await dashboard(account); assert.equal(capped.tokens_remaining, 3); assert.equal(capped.tokens_available, 0);
    await use(account, await upload(account), { expected: 402 });
    await pool.query("UPDATE pro_usages SET created_at=DATE_SUB(NOW(), INTERVAL 1 MONTH) WHERE quota_user_id=? AND quota_source='subscription'", [account.id]);
    assert.equal((await dashboard(account)).tokens_remaining, 3);
    assert.equal((await dashboard(account)).tokens_available, 2);
    await pool.query('UPDATE pro_subscriptions SET expires_at=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE user_id=?', [account.id]);
    assert.equal((await dashboard(account)).subscription, null); assert.equal((await dashboard(account)).tokens_remaining, 0);
    const denied = (await api(account.path + '/quota', { ip: account.ip })).data; assert.equal(denied.can_use_pro, false);
  });

  await t.test('a failed usage write restores the credit and the upload so a retry can succeed', async (scope) => {
    const account = await fixture(scope, 1); await wallet(account); await buyPackage(account); await exhaustedTrial(account); const uploaded = await upload(account);
    const getConnection = pool.getConnection.bind(pool); let fail = true;
    scope.mock.method(pool, 'getConnection', async () => {
      const connection = await getConnection(); const query = connection.query; const release = connection.release;
      connection.query = function (sql, ...args) { if (fail && sql.startsWith('INSERT INTO notifications')) { fail = false; throw new Error('Synthetic usage write failure'); } return query.call(this, sql, ...args); };
      connection.release = function () { this.query = query; this.release = release; return release.call(this); }; return connection;
    });
    await use(account, uploaded, { expected: 500 }); assert.equal((await dashboard(account)).tokens_remaining, 1);
    const [[row]] = await pool.query('SELECT status FROM pro_uploads WHERE id=?', [uploaded]); assert.equal(row.status, 'uploaded');
    await use(account, uploaded); assert.equal((await dashboard(account)).tokens_remaining, 0);
  });

  await t.test('legacy subscription migration is repeatable and never extends or duplicates a paid subscription', async (scope) => {
    const account = await fixture(scope); await wallet(account); await buyPackage(account);
    await pool.query('UPDATE pro_subscriptions SET package_title=NULL,role_type=NULL,pro_requests_count=NULL,monthly_pro_request_limit=NULL WHERE user_id=?', [account.id]);
    const [[before]] = await pool.query('SELECT id,expires_at FROM pro_subscriptions WHERE user_id=?', [account.id]);
    await ensureEntitlementSchema(pool); await ensureEntitlementSchema(pool);
    const [rows] = await pool.query('SELECT id,expires_at,pro_requests_count FROM pro_subscriptions WHERE user_id=?', [account.id]);
    assert.equal(rows.length, 1); assert.equal(rows[0].id, before.id); assert.equal(rows[0].expires_at.getTime(), before.expires_at.getTime()); assert.equal(rows[0].pro_requests_count, 30);
  });

  await t.test('uploads are bound to the store product and the nearest trusted client IP', async (scope) => {
    const account = await fixture(scope); const other = await fixture(scope); await wallet(account); await buyPackage(account);
    const wrong = await upload(other, account.ip);
    await use(account, wrong, { expected: 409 }); assert.equal((await dashboard(account)).tokens_remaining, 30);
    const own = await upload(account);
    await api(account.path + '/use', { method: 'POST', ip: account.ip, forwarded: `198.51.100.99, ${account.ip}`, body: { upload_id: own, output_image: image } });
    assert.equal((await dashboard(account)).tokens_remaining, 29);
    assert.equal((await dashboard(other)).tokens_remaining, 0);
  });

  await t.test('a blocked or unapproved seller cannot expose or spend purchased store credit', async (scope) => {
    const account = await fixture(scope); await wallet(account); await buyPackage(account);
    const uploaded = await upload(account);
    await pool.query("UPDATE users SET seller_verification_status='pending' WHERE id=?", [account.id]);
    await api(account.path + '/quota', { expected: 403, ip: account.ip });
    await use(account, uploaded, { expected: 403 });
    await api('/api/seller/dashboard', { expected: 403, token: account.token });
    await pool.query("UPDATE users SET seller_verification_status='approved',status='blocked' WHERE id=?", [account.id]);
    await api(account.path + '/quota', { expected: 403, ip: account.ip });
    await use(account, uploaded, { expected: 403 });
  });

  await t.test('one customer can try on more than three times for free while only that store pays tokens', async (scope) => {
    const account = await fixture(scope, 6); const other = await fixture(scope, 6);
    await wallet(account); await wallet(other); await buyPackage(account); await buyPackage(other);
    const originalWallet = Number((await db.findUserById(account.id)).wallet_balance);
    for (let index = 0; index < 6; index += 1) {
      const result = await use(account, await upload(account));
      assert.equal(result.customer_payment_required, false);
      assert.equal(result.customer_usage_limit, null);
      assert.equal(result.free_remaining, null);
      assert.equal(result.billing_source, 'store');
    }
    assert.equal((await dashboard(account)).tokens_remaining, 0);
    assert.equal((await dashboard(other)).tokens_remaining, 6);
    assert.equal(Number((await db.findUserById(account.id)).wallet_balance), originalWallet);
    const [[used]] = await pool.query("SELECT COUNT(*) AS total,SUM(is_free_trial) AS trials,SUM(amount) AS amount FROM pro_usages WHERE quota_user_id=?", [account.id]);
    assert.equal(used.total, 6); assert.equal(Number(used.trials), 0); assert.equal(Number(used.amount), 0);
    await use(account, await upload(account), { expected: 402 });
    assert.equal((await api(account.path + '/quota', { ip: `198.51.100.${nextIp++}` })).data.can_use_pro, false);
  });
});
