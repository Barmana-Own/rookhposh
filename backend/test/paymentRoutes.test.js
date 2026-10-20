const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const jwt = require('jsonwebtoken');
const service = require('../src/services/paymentService');
const router = require('../src/routes/paymentRoutes');
const { errorHandler } = require('../src/middleware/errorHandler');
const { jwtSecret } = require('../src/config/env');

const id = 'a'.repeat(32);

async function application(t) {
  const app = express();
  app.use(express.json());
  app.use('/api/payments', router);
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}/api/payments`;
}

function headers(role = 'Seller') {
  return { Authorization: `Bearer ${jwt.sign({ id: 3, role }, jwtSecret)}`, 'Content-Type': 'application/json' };
}

test('payment status and reconciliation require authentication and an allowed role', async (t) => {
  const origin = await application(t);
  const status = t.mock.method(service, 'status', async () => { throw new Error('must not run'); });
  assert.equal((await fetch(`${origin}/${id}`)).status, 401);
  assert.equal((await fetch(`${origin}/${id}/verify`, { method: 'POST' })).status, 401);
  assert.equal((await fetch(`${origin}/${id}`, { headers: headers('Admin') })).status, 403);
  assert.equal(status.mock.callCount(), 0);
});

test('status and manual verification use the authenticated owner, never a submitted user ID', async (t) => {
  const origin = await application(t);
  const status = t.mock.method(service, 'status', async () => ({ id, status: 'pending' }));
  const verify = t.mock.method(service, 'reconcile', async () => ({ id, status: 'success' }));
  const response = await fetch(`${origin}/${id}?user_id=99`, { headers: headers() });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(status.mock.calls[0].arguments, [id, 3]);
  assert.equal((await fetch(`${origin}/${id}/verify`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ user_id: 99, State: 'OK', Amount: 1 }),
  })).status, 200);
  assert.deepEqual(verify.mock.calls[0].arguments, [id, null, 3]);
});

test('bank form callbacks ignore asserted success, amount, reference and redirect targets', async (t) => {
  const origin = await application(t);
  const verify = t.mock.method(service, 'reconcile', async () => ({ status: 'pending' }));
  t.mock.method(service, 'resultUrl', () => `https://shop.test/payments/result/${id}`);
  const response = await fetch(`${origin}/omidpay/callback/${id}`, {
    method: 'POST', redirect: 'manual',
    body: new URLSearchParams({ token: 'bank-token', State: 'OK', Amount: '1', RefNum: 'forged', RedirectURL: 'https://attacker.test' }),
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), `https://shop.test/payments/result/${id}`);
  assert.deepEqual(verify.mock.calls[0].arguments, [id, 'bank-token']);
});

test('bank failures return to a recoverable result page and invalid callbacks are rejected', async (t) => {
  const origin = await application(t);
  t.mock.method(console, 'warn', () => undefined);
  t.mock.method(service, 'resultUrl', () => `https://shop.test/payments/result/${id}`);
  t.mock.method(service, 'reconcile', async () => { throw Object.assign(new Error('bank unavailable'), { status: 502 }); });
  const response = await fetch(`${origin}/omidpay/callback/${id}`, { redirect: 'manual' });
  assert.equal(response.status, 303);
  t.mock.method(service, 'reconcile', async () => { throw Object.assign(new Error('invalid token'), { status: 400 }); });
  assert.equal((await fetch(`${origin}/omidpay/callback/${id}`, { redirect: 'manual' })).status, 400);
});

test('rejects oversized URL-encoded callback bodies before verification', async (t) => {
  const origin = await application(t);
  const verify = t.mock.method(service, 'reconcile', async () => { throw new Error('must not run'); });
  const response = await fetch(`${origin}/omidpay/callback/${id}`, {
    method: 'POST', body: new URLSearchParams({ token: 'x'.repeat(9000) }),
  });
  assert.equal(response.status, 413);
  assert.equal(verify.mock.callCount(), 0);
});
