const assert = require('node:assert/strict');
const test = require('node:test');
const jwt = require('jsonwebtoken');
const auth = require('../src/services/authService');
const db = require('../src/repositories/dbStore');
const { jwtSecret } = require('../src/config/env');
const { authenticate, authorizeApprovedSeller } = require('../src/middlewares/authMiddleware');

function replace(t, object, key, value) {
  const original = object[key];
  object[key] = value;
  t.after(() => { object[key] = original; });
}

test('public OTP defaults to Seller and never resolves legacy customer accounts', async (t) => {
  const lookups = [];
  replace(t, db, 'findUserByMobileAndRole', async (mobile, role) => {
    lookups.push({ mobile, role });
    return { id: 72, role: 'Seller', status: 'active', seller_verification_status: 'approved' };
  });
  const issued = await auth.requestOtp({ mobile: '00000000001' });
  const session = await auth.verifyOtp({ mobile: issued.mobile, code: issued.dev_code });
  assert.equal(session.user.role, 'Seller');
  assert.ok(lookups.length >= 2);
  assert.ok(lookups.every(({ role }) => role === 'Seller'));
});

test('public OTP rejects customer and administrator role requests before querying accounts', async (t) => {
  replace(t, db, 'findUserByMobileAndRole', async () => { throw new Error('must not query disabled roles'); });
  for (const role of ['User', 'Admin', 'unknown', null]) {
    await assert.rejects(auth.requestOtp({ mobile: '00000000002', role }), { status: 403 });
    await assert.rejects(auth.verifyOtp({ mobile: '00000000002', code: '123456', role }), { status: 403 });
  }
});

test('seller onboarding preserves a legacy customer and creates a separate pending seller', async (t) => {
  const customer = { id: 15, role: 'User', username: '00000000003', wallet_balance: 125000 };
  let created;
  replace(t, db, 'findUserByMobileAndRole', async () => null);
  replace(t, db, 'findUserByUsername', async () => customer);
  replace(t, db, 'createUser', async (payload) => {
    created = payload;
    return { id: 73, ...payload, status: 'active', seller_verification_status: 'pending' };
  });
  const issued = await auth.requestOtp({ mobile: customer.username });
  const session = await auth.verifyOtp({ mobile: issued.mobile, code: issued.dev_code, fullname: 'Test Seller' });
  assert.equal(created.username, customer.username + '-seller');
  assert.equal(created.role, 'Seller');
  assert.notEqual(created.password, 'otp-' + customer.username);
  assert.equal(created.seller_verification_status, undefined);
  assert.equal(created.wallet_balance, undefined);
  assert.equal(session.user.seller_verification_status, 'pending');
  assert.deepEqual(customer, { id: 15, role: 'User', username: '00000000003', wallet_balance: 125000 });
});

test('public registration cannot choose a customer or admin role or assign seller privileges', async (t) => {
  let created;
  replace(t, db, 'findUserByUsername', async () => null);
  replace(t, db, 'createUser', async (payload) => {
    created = payload;
    return { id: 74, ...payload, status: 'active', seller_verification_status: 'pending' };
  });
  await assert.rejects(auth.register({ role: 'User' }), { status: 403 });
  await assert.rejects(auth.register({ role: 'Admin' }), { status: 403 });
  const session = await auth.register({ role: 'Seller', username: 'test-seller', fullname: 'Test Seller', password: 'TestPassword9!', seller_verification_status: 'approved', wallet_balance: 5000000, status: 'active', pro_unlimited: 1 });
  assert.equal(session.user.role, 'Seller');
  for (const key of ['seller_verification_status', 'wallet_balance', 'status', 'pro_unlimited']) assert.equal(created[key], undefined);
});

test('password sign-in rejects legacy customers and phone-derived OTP passwords', async (t) => {
  let account = { id: 15, role: 'User', status: 'active', password: 'hashed' };
  replace(t, db, 'findUserByUsername', async () => account);
  replace(t, db.bcrypt, 'compare', async () => true);
  await assert.rejects(auth.login({ username: 'legacy', password: 'valid-password' }), { status: 403 });
  account = { id: 75, role: 'Seller', status: 'active', mobile: '00000000004', password: 'hashed', seller_verification_status: 'approved' };
  await assert.rejects(auth.login({ username: 'seller', password: 'otp-00000000004' }), { status: 403 });
});

test('a valid old customer JWT cannot authenticate while admin and seller JWTs remain valid', () => {
  for (const role of ['User', 'Admin', 'Seller']) {
    const request = { headers: { authorization: 'Bearer ' + jwt.sign({ id: 55, role }, jwtSecret) } };
    let result;
    authenticate(request, {}, (error) => { result = error; });
    if (role === 'User') assert.equal(result.status, 403);
    else assert.equal(result, undefined);
  }
});

test('stale seller JWTs do not bypass a blocked or changed database role', async (t) => {
  let account = { id: 75, role: 'Seller', status: 'blocked', seller_verification_status: 'approved' };
  replace(t, db, 'findUserById', async () => account);
  for (const nextAccount of [account, { ...account, role: 'User', status: 'active' }]) {
    account = nextAccount;
    let result;
    await authorizeApprovedSeller({ user: { id: 75, role: 'Seller' } }, {}, (error) => { result = error; });
    assert.equal(result.status, 403);
  }
});

test('HTTP user-panel endpoints are absent and customer tokens cannot enter protected panels', async (t) => {
  const app = require('../src/app');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const token = jwt.sign({ id: 15, role: 'User' }, jwtSecret);
  for (const [method, path, expected] of [
    ['GET', '/api/user/dashboard', 404], ['GET', '/api/user/profile', 404],
    ['POST', '/api/user/wallet/charge', 404], ['GET', '/api/user/services', 404],
    ['GET', '/api/auth/me', 403], ['GET', '/api/admin/dashboard', 403], ['GET', '/api/seller/dashboard', 403],
  ]) {
    const response = await fetch(origin + path, { method, headers: { Authorization: 'Bearer ' + token } });
    assert.equal(response.status, expected, method + ' ' + path);
    await response.arrayBuffer();
  }
});
