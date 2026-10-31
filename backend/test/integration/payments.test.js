const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const test = require('node:test');

// This suite creates synthetic settlements. Never allow it to open the production schema.
if (process.env.NODE_ENV !== 'test' || !/^rookhposh_payment_test_[a-z0-9_]{1,32}$/u.test(process.env.DB_NAME || '')) {
  throw new Error('Use NODE_ENV=test and a disposable rookhposh_payment_test_* database.');
}

const jwt = require('jsonwebtoken');
const pool = require('../../src/config/database');
const db = require('../../src/repositories/dbStore');
const provider = require('../../src/integrations/omidpay');
const { jwtSecret, omidpay } = require('../../src/config/env');
const ApiError = require('../../src/utils/apiError');
const app = require('../../src/app');

test('seller payments settle safely in an isolated MariaDB database', { timeout: 60000 }, async (t) => {
  const previous = { ...omidpay };
  Object.assign(omidpay, {
    enabled: true, userId: 'test-user', password: 'test-only-password',
    terminalId: '10000001', merchantId: '10000002',
    callbackBaseUrl: 'https://shop.test/api/payments/omidpay/callback', frontendUrl: 'https://shop.test',
  });
  t.after(() => Object.assign(omidpay, previous));
  t.after(() => pool.end());
  t.mock.method(console, 'warn', () => undefined);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const nativeFetch = globalThis.fetch.bind(globalThis);
  t.mock.method(globalThis, 'fetch', (url, options) => {
    assert.equal(new URL(url).origin, origin, 'integration tests must not contact a real bank');
    return nativeFetch(url, options);
  });

  const bank = new Map();
  let tokenRequests = 0;
  let verificationRequests = 0;
  t.mock.method(provider, 'createToken', async ({ orderId, amountRial, callbackUrl }) => {
    assert.match(orderId, /^\d+$/u);
    assert.match(callbackUrl, /^https:\/\/shop\.test\/api\/payments\/omidpay\/callback\/[a-f0-9]{32}$/u);
    const token = `test_${randomBytes(18).toString('hex')}`;
    const reference = String(BigInt(`0x${randomBytes(10).toString('hex')}`));
    bank.set(token, { amountRial, reference, paid: false });
    tokenRequests += 1;
    return token;
  });
  t.mock.method(provider, 'verify', async ({ token, amountRial }) => {
    verificationRequests += 1;
    const entry = bank.get(token);
    assert.ok(entry, 'only a saved bank token may be verified');
    assert.equal(amountRial, entry.amountRial);
    if (!entry.paid) throw new ApiError(409, 'Payment is not confirmed by the synthetic bank.');
    return { reference: entry.reference, amountRial: entry.amountRial };
  });

  async function api(path, { method = 'GET', body, token, expected = 200 } = {}) {
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(origin + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual',
    });
    assert.equal(response.status, expected, `${method} ${path}`);
    const raw = await response.text();
    return { response, data: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(raw).data : null };
  }

  async function seller(scope, status = 'approved') {
    const suffix = randomBytes(8).toString('hex');
    const user = await db.createUser({
      fullname: `Integration ${suffix}`, username: `integration-${suffix}`, password: randomBytes(24).toString('base64url'),
      role: 'Seller', seller_verification_status: status, store_name: `Integration ${suffix}`,
    });
    const packages = [];
    scope.after(async () => {
      await pool.query('DELETE FROM pro_subscriptions WHERE user_id=?', [user.id]);
      await db.deleteUser(user.id);
      for (const id of packages) await pool.query('DELETE FROM packages WHERE id=?', [id]);
    });
    return { ...user, packages, token: jwt.sign({ id: user.id, role: 'Seller' }, jwtSecret, { expiresIn: '5m' }) };
  }

  async function charge(account, amount = 5000, requestId = randomUUID(), expected = 200) {
    return (await api('/api/seller/wallet/charge', {
      method: 'POST', token: account.token, expected,
      body: { amount, payment_method: 'direct_gateway', request_id: requestId },
    })).data;
  }

  async function balance(account) {
    const [[row]] = await pool.query('SELECT wallet_balance FROM users WHERE id=?', [account.id]);
    return Number(row.wallet_balance);
  }

  async function payment(id) {
    const [[row]] = await pool.query(
      'SELECT g.*,t.status AS transaction_status,t.amount,t.metadata FROM gateway_payments g JOIN transactions t ON t.id=g.transaction_id WHERE g.id=?', [id],
    );
    return row;
  }

  async function callback(checkout, extra = {}) {
    const response = await fetch(`${origin}/api/payments/omidpay/callback/${checkout.id}`, {
      method: 'POST', redirect: 'manual',
      body: new URLSearchParams({ token: checkout.gateway.fields.token, ...extra }),
    });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), `https://shop.test/payments/result/${checkout.id}`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    await response.arrayBuffer();
  }

  await t.test('unpaid or forged callbacks never credit funds; approved owners and idempotency are enforced', async (scope) => {
    const account = await seller(scope);
    const other = await seller(scope);
    const pending = await seller(scope, 'pending');
    await api('/api/seller/wallet/charge', { method: 'POST', body: { amount: 5000 }, expected: 401 });
    await charge(pending, 5000, randomUUID(), 403);
    const initialRequests = tokenRequests;
    const requestId = randomUUID();
    const checkout = await charge(account, 5000, requestId);
    assert.equal(checkout.status, 'redirect_required');
    assert.equal(bank.get(checkout.gateway.fields.token).amountRial, 50000);
    assert.equal((await charge(account, 5000, requestId)).id, checkout.id);
    assert.equal(tokenRequests - initialRequests, 1);
    await charge(account, 5001, requestId, 409);
    await api(`/api/payments/${checkout.id}`, { token: other.token, expected: 404 });
    await api(`/api/payments/${checkout.id}/verify`, { method: 'POST', body: {}, token: other.token, expected: 404 });
    await callback(checkout, { State: 'OK', Amount: '999999999', RefNum: 'forged', RedirectURL: 'https://attacker.test' });
    assert.equal(await balance(account), 0);
    assert.equal((await payment(checkout.id)).state, 'pending');
    await assert.rejects(db.approvePendingPayment(checkout.transaction_id), { status: 409 });
    const result = (await api(`/api/payments/${checkout.id}`, { token: account.token })).data;
    assert.equal(result.status, 'pending');
    assert.equal(result.token, undefined);
    assert.equal(result.gateway, undefined);
  });

  await t.test('concurrent and repeated callbacks credit a wallet once', async (scope) => {
    const account = await seller(scope);
    const checkout = await charge(account);
    bank.get(checkout.gateway.fields.token).paid = true;
    const initialVerifications = verificationRequests;
    await Promise.all([callback(checkout), callback(checkout)]);
    await callback(checkout);
    await api(`/api/payments/${checkout.id}/verify`, { method: 'POST', body: {}, token: account.token });
    assert.equal(verificationRequests - initialVerifications, 1);
    assert.equal(await balance(account), 5000);
    assert.equal((await payment(checkout.id)).transaction_status, 'success');
    const [[notifications]] = await pool.query("SELECT COUNT(*) AS total FROM notifications WHERE user_id=? AND type='payment_approved'", [account.id]);
    assert.equal(notifications.total, 1);
  });

  await t.test('package checkout uses the server price and preserves the purchased duration', async (scope) => {
    const account = await seller(scope);
    const [created] = await pool.query(
      "INSERT INTO packages(title,price,role_type,duration_days,pro_requests_count,monthly_pro_request_limit,status) VALUES(?,?,'seller',7,80,30,'active')",
      [`Integration package ${randomUUID()}`, 12345],
    );
    account.packages.push(created.insertId);
    const checkout = (await api(`/api/seller/packages/${created.insertId}/purchase`, {
      method: 'POST', token: account.token, body: { amount: 1, price: 1, payment_method: 'direct_gateway', request_id: randomUUID() },
    })).data;
    assert.equal(bank.get(checkout.gateway.fields.token).amountRial, 123450);
    const [[before]] = await pool.query('SELECT COUNT(*) AS total FROM pro_subscriptions WHERE user_id=?', [account.id]);
    assert.equal(before.total, 0);
    await pool.query('UPDATE packages SET price=99999,duration_days=99 WHERE id=?', [created.insertId]);
    bank.get(checkout.gateway.fields.token).paid = true;
    await callback(checkout);
    await callback(checkout);
    const [subscriptions] = await pool.query('SELECT TIMESTAMPDIFF(DAY,starts_at,expires_at) AS days FROM pro_subscriptions WHERE user_id=?', [account.id]);
    assert.equal(subscriptions.length, 1);
    assert.equal(subscriptions[0].days, 7);
    assert.equal(Number((await payment(checkout.id)).amount), 12345);
    assert.equal(await balance(account), 0);
  });

  await t.test('token purchases use the database unit price and settle only once', async (scope) => {
    const account = await seller(scope);
    await pool.query("INSERT INTO app_settings(`key`,`value`) VALUES('token_price','500') ON DUPLICATE KEY UPDATE `value`='500'");
    const checkout = (await api('/api/seller/tokens/purchase', {
      method: 'POST', token: account.token,
      body: { quantity: 4, amount: 1, token_price: 1, payment_method: 'direct_gateway', request_id: randomUUID() },
    })).data;
    assert.equal(bank.get(checkout.gateway.fields.token).amountRial, 20000);
    assert.equal((await payment(checkout.id)).transaction_status, 'pending');
    bank.get(checkout.gateway.fields.token).paid = true;
    await callback(checkout);
    await callback(checkout);
    const row = await payment(checkout.id);
    const metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
    assert.equal(row.transaction_status, 'success');
    assert.equal(metadata.token_quantity, 4);
    assert.equal(metadata.token_unit_price, 500);
    assert.equal(Number(row.amount), 2000);
    assert.equal(await balance(account), 0);
    const initialRequests = tokenRequests;
    for (const quantity of [-1, [], '100001']) await api('/api/seller/tokens/purchase', {
      method: 'POST', token: account.token, expected: 400,
      body: { quantity, payment_method: 'direct_gateway', request_id: randomUUID() },
    });
    assert.equal(tokenRequests, initialRequests);
  });

  await t.test('bank authentication failures leave a failed attempt without credit', async (scope) => {
    const account = await seller(scope);
    scope.mock.method(provider, 'createToken', async () => {
      throw Object.assign(new ApiError(502, 'Bank rejected the request.'), { gatewayCode: 'erAAS_InvalidUseridOrPass' });
    });
    await charge(account, 5000, randomUUID(), 502);
    const [rows] = await pool.query('SELECT g.state,t.status FROM gateway_payments g JOIN transactions t ON t.id=g.transaction_id WHERE g.user_id=?', [account.id]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].state, 'failed');
    assert.equal(rows[0].status, 'failed');
    assert.equal(await balance(account), 0);
  });

  await t.test('a failed fulfillment rolls back funds and resumes from durable bank confirmation', async (scope) => {
    const account = await seller(scope);
    const checkout = await charge(account, 3000);
    bank.get(checkout.gateway.fields.token).paid = true;
    let failOnce = true;
    const getConnection = pool.getConnection.bind(pool);
    scope.mock.method(pool, 'getConnection', async () => {
      const connection = await getConnection();
      const originalQuery = connection.query;
      const originalRelease = connection.release;
      connection.query = function (sql, ...args) {
        if (failOnce && sql.startsWith('INSERT INTO notifications')) {
          failOnce = false;
          throw new Error('Synthetic fulfillment failure');
        }
        return originalQuery.call(this, sql, ...args);
      };
      connection.release = function () {
        this.query = originalQuery;
        this.release = originalRelease;
        return originalRelease.call(this);
      };
      return connection;
    });
    const initialVerifications = verificationRequests;
    await callback(checkout);
    assert.equal(failOnce, false);
    assert.equal(await balance(account), 0);
    const interrupted = await payment(checkout.id);
    assert.equal(interrupted.state, 'verified');
    assert.equal(interrupted.transaction_status, 'pending');
    await api(`/api/payments/${checkout.id}/verify`, { method: 'POST', body: {}, token: account.token });
    await callback(checkout);
    assert.equal(await balance(account), 3000);
    assert.equal((await payment(checkout.id)).state, 'success');
    assert.equal(verificationRequests - initialVerifications, 1);
  });

  await t.test('one bank reference cannot settle two separate orders', async (scope) => {
    const account = await seller(scope);
    const first = await charge(account, 1000);
    const second = await charge(account, 1000);
    const firstBank = bank.get(first.gateway.fields.token);
    const secondBank = bank.get(second.gateway.fields.token);
    firstBank.paid = true;
    secondBank.paid = true;
    secondBank.reference = firstBank.reference;
    await callback(first);
    await callback(second);
    assert.equal(await balance(account), 1000);
    assert.equal((await payment(first.id)).state, 'success');
    assert.equal((await payment(second.id)).transaction_status, 'pending');
  });
});
