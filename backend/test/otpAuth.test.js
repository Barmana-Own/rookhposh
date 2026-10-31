const assert = require('node:assert/strict');
const test = require('node:test');
const jwt = require('jsonwebtoken');
const auth = require('../src/services/authService');
const db = require('../src/repositories/dbStore');
const otp = require('../src/services/otpService');
const sms = require('../src/services/smsService');

test('OTP mobile validation normalizes Iranian and localized formats before delivery', async (t) => {
  const lookups = [];
  const delivered = [];
  t.mock.method(db, 'findUserByMobileAndRole', async (mobile) => { lookups.push(mobile); return null; });
  t.mock.method(otp, 'issue', async (mobile) => { delivered.push(mobile); return { delivery: 'sms' }; });
  for (const mobile of ['09123456789', '+989123456789', '00989123456789', '9123456789', '۰۹۱۲۳۴۵۶۷۸۹', '٠٩١٢٣٤٥٦٧٨٩', '0912 345 6789']) {
    const result = await auth.requestOtp({ mobile });
    assert.equal(result.mobile, '09123456789');
    assert.equal(result.requires_identity, true);
  }
  assert.ok(lookups.every((mobile) => mobile === '09123456789'));
  assert.deepEqual(delivered, lookups);
});

test('malformed mobile numbers never query the database or send messages', async (t) => {
  t.mock.method(db, 'findUserByMobileAndRole', async () => assert.fail('database lookup for invalid phone'));
  t.mock.method(otp, 'issue', async () => assert.fail('send for invalid phone'));
  for (const mobile of [undefined, null, {}, 9123456789, '00000000000', '0912345678', '091234567890', 'name09123456789', '+109123456789', '09'.repeat(100), '091234+56789']) {
    await assert.rejects(auth.requestOtp({ mobile }), { status: 400 });
  }
});

test('malformed OTP and oversized identity fields do not reach account operations', async (t) => {
  t.mock.method(otp, 'consume', () => assert.fail('consume for invalid input'));
  for (const body of [
    { code: undefined }, { code: 123456 }, { code: {} }, { code: '12345' }, { code: '1234567' },
    { code: '123456', fullname: 'x'.repeat(161) }, { code: '123456', store_name: {} },
    { code: '123456', national_code: 'x' }, { code: '123456', store_slug: 'x'.repeat(161) },
  ]) await assert.rejects(auth.verifyOtp({ mobile: '09000000031', ...body }), { status: 400 });
});

test('HTTP seller OTP never returns a code, preserves authorization, and rejects reuse', async (t) => {
  let sent;
  t.mock.method(sms, 'sendOtp', async (payload) => { sent = payload; });
  t.mock.method(db, 'findUserByMobileAndRole', async () => ({ id: 44, role: 'Seller', username: 'test-seller', status: 'active', seller_verification_status: 'approved' }));
  t.mock.method(db, 'createUser', async () => assert.fail('existing seller must not be recreated'));
  const app = require('../src/app');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const post = (path, body) => fetch(origin + '/api/auth/otp/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const mobile = '09000000032';
  const request = await post('request', { mobile });
  assert.equal(request.status, 200);
  assert.equal(request.headers.get('cache-control'), 'no-store');
  const issued = await request.json();
  assert.equal(issued.data.requires_identity, false);
  assert.equal(issued.data.delivery, 'sms');
  assert.equal(issued.data.expires_in, 120);
  assert.equal(issued.data.resend_after, 120);
  assert.equal(issued.data.dev_code, undefined);
  assert.equal(issued.data.code, undefined);
  assert.deepEqual(Object.keys(issued.data).sort(), ['delivery', 'existing_account', 'expires_in', 'mobile', 'requires_identity', 'resend_after', 'seller_verification_status'].sort());

  const duplicate = await post('request', { mobile });
  assert.equal(duplicate.status, 429);
  await duplicate.arrayBuffer();
  const verified = await post('verify', { mobile, code: sent.code });
  assert.equal(verified.status, 200);
  assert.equal(verified.headers.get('cache-control'), 'no-store');
  const session = (await verified.json()).data;
  assert.equal(session.user.role, 'Seller');
  assert.equal(session.user.id, 44);
  assert.equal(jwt.decode(session.token).role, 'Seller');
  const replay = await post('verify', { mobile, code: sent.code });
  assert.equal(replay.status, 401);
  await replay.arrayBuffer();
});

test('simultaneous verification creates at most one seller account', async (t) => {
  let sent;
  let entered;
  let finish;
  const creating = new Promise((resolve) => { entered = resolve; });
  const pending = new Promise((resolve) => { finish = resolve; });
  t.mock.method(sms, 'sendOtp', async (payload) => { sent = payload; });
  t.mock.method(db, 'findUserByMobileAndRole', async () => null);
  t.mock.method(db, 'findUserByUsername', async () => null);
  const create = t.mock.method(db, 'createUser', async (payload) => {
    entered();
    await pending;
    return { id: 45, ...payload, password: undefined, status: 'active', seller_verification_status: 'pending' };
  });
  const mobile = '09000000033';
  await auth.requestOtp({ mobile });
  const first = auth.verifyOtp({ mobile, code: sent.code });
  await creating;
  await assert.rejects(auth.verifyOtp({ mobile, code: sent.code }), { status: 401 });
  finish();
  const session = await first;
  assert.equal(session.user.role, 'Seller');
  assert.equal(session.user.seller_verification_status, 'pending');
  assert.equal(create.mock.callCount(), 1);
});
