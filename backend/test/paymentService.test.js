const assert = require('node:assert/strict');
const test = require('node:test');
const service = require('../src/services/paymentService');
const provider = require('../src/integrations/omidpay');
const store = require('../src/repositories/paymentStore');
const db = require('../src/repositories/dbStore');
const pool = require('../src/config/database');

const id = 'a'.repeat(32);

function fixture(t, overrides = {}) {
  const state = {
    id, order_id: '123456', transaction_id: 17, user_id: 3, role: 'Seller',
    amount: 25000, amount_rial: 250000, state: 'pending', token: 'bank-token', ...overrides,
  };
  let fulfillments = 0;
  let verifications = 0;
  t.mock.method(store, 'get', async (_id, userId = null) => {
    if (userId !== null && userId !== state.user_id) throw Object.assign(new Error('not found'), { status: 404 });
    return { ...state };
  });
  t.mock.method(store, 'claim', async () => {
    if (state.state !== 'pending') return null;
    state.state = 'verifying';
    return 'test-lock';
  });
  t.mock.method(store, 'recordVerification', async (_id, _lock, reference) => {
    state.state = 'verified';
    state.bank_reference = reference;
  });
  t.mock.method(store, 'releaseClaim', async () => { state.state = 'pending'; });
  t.mock.method(store, 'finalize', async () => {
    if (state.state === 'verified') {
      fulfillments += 1;
      state.state = 'success';
    }
  });
  t.mock.method(provider, 'verify', async () => {
    verifications += 1;
    return { reference: '1234', amountRial: 250000 };
  });
  t.mock.method(console, 'warn', () => undefined);
  return { state, fulfillments: () => fulfillments, verifications: () => verifications };
}

test('fulfills only after verification and handles callback replay without repeating bank calls', async (t) => {
  const f = fixture(t);
  const first = await service.reconcile(id, 'bank-token');
  const second = await service.reconcile(id, 'bank-token');
  assert.equal(first.status, 'success');
  assert.deepEqual(second, first);
  assert.equal(f.fulfillments(), 1);
  assert.equal(f.verifications(), 1);
  assert.equal(first.reference, '1234');
});

test('serializes concurrent callback and owner retry for the same payment', async (t) => {
  const f = fixture(t);
  const results = await Promise.all([
    service.reconcile(id, 'bank-token'), service.reconcile(id, null, 3), service.reconcile(id, 'bank-token'),
  ]);
  assert.ok(results.some((result) => result.status === 'success'));
  assert.equal(f.fulfillments(), 1);
  assert.equal(f.verifications(), 1);
});

test('rejects a substituted callback token before any verification or fulfillment', async (t) => {
  const f = fixture(t);
  await assert.rejects(service.reconcile(id, 'other-token'), { status: 400 });
  assert.equal(f.verifications(), 0);
  assert.equal(f.fulfillments(), 0);
});

test('only the transaction owner can read status or trigger a retry', async (t) => {
  const f = fixture(t);
  await assert.rejects(service.status(id, 4), { status: 404 });
  await assert.rejects(service.reconcile(id, null, 4), { status: 404 });
  assert.equal(f.verifications(), 0);
  const result = await service.status(id, 3);
  assert.equal(result.status, 'pending');
  for (const key of ['token', 'order_id', 'metadata', 'amount_rial', 'password']) assert.equal(key in result, false);
});

test('leaves the transaction retryable without fulfillment after a bank timeout', async (t) => {
  const f = fixture(t);
  t.mock.method(provider, 'verify', async () => { throw Object.assign(new Error('timeout'), { status: 502 }); });
  await assert.rejects(service.reconcile(id, 'bank-token'), { status: 502 });
  assert.equal(f.state.state, 'pending');
  assert.equal(f.fulfillments(), 0);
});

test('recovers a durable bank verification after a database finalization failure', async (t) => {
  const f = fixture(t);
  const finalize = store.finalize;
  t.mock.method(store, 'finalize', async () => { throw new Error('database temporarily unavailable'); });
  await assert.rejects(service.reconcile(id, 'bank-token'), /database temporarily unavailable/);
  assert.equal(f.state.state, 'verified');
  t.mock.method(store, 'finalize', finalize);
  assert.equal((await service.reconcile(id, 'bank-token')).status, 'success');
  assert.equal(f.verifications(), 1);
  assert.equal(f.fulfillments(), 1);
});

test('creates a pending request without exposing a successful payment or fulfilling it', async (t) => {
  t.mock.method(provider, 'requireConfiguration', () => ({
    callbackBaseUrl: 'https://shop.test/api/payments/omidpay/callback', frontendUrl: 'https://shop.test',
  }));
  t.mock.method(store, 'create', async (userId, amountRial) => {
    assert.equal(userId, 3);
    assert.equal(amountRial, 250000);
    return { id, order_id: '1234', transaction_id: 17, amount_rial: amountRial };
  });
  t.mock.method(provider, 'createToken', async (input) => {
    assert.equal(input.callbackUrl, `https://shop.test/api/payments/omidpay/callback/${id}`);
    return 'bank-token';
  });
  const attach = t.mock.method(store, 'attachToken', async () => undefined);
  const result = await service.create(3, 25000, { type: 'wallet_charge' });
  assert.equal(result.status, 'redirect_required');
  assert.equal(result.amount, 25000);
  assert.equal(result.gateway.url, 'https://omid.shaparak.ir/_ipgw_/merchant/token');
  assert.equal(result.gateway.fields.token, 'bank-token');
  assert.equal(attach.mock.callCount(), 1);
});

test('marks an initialization failure without crediting the wallet', async (t) => {
  t.mock.method(provider, 'requireConfiguration', () => ({
    callbackBaseUrl: 'https://shop.test/api/payments/omidpay/callback', frontendUrl: 'https://shop.test',
  }));
  t.mock.method(store, 'create', async () => ({ id, order_id: '1234', transaction_id: 17 }));
  t.mock.method(provider, 'createToken', async () => { throw new Error('network unavailable'); });
  const fail = t.mock.method(store, 'failInitialization', async () => undefined);
  await assert.rejects(service.create(3, 25000, { type: 'wallet_charge' }), /network unavailable/);
  assert.deepEqual(fail.mock.calls[0].arguments, [id]);
});

test('reuses a pending checkout token on a duplicate request without requesting a second token', async (t) => {
  t.mock.method(provider, 'requireConfiguration', () => ({
    callbackBaseUrl: 'https://shop.test/api/payments/omidpay/callback', frontendUrl: 'https://shop.test',
  }));
  t.mock.method(store, 'create', async () => ({
    id, transaction_id: 17, existing: true, state: 'pending', amount_rial: 250000, token: 'original-token',
  }));
  const createToken = t.mock.method(provider, 'createToken', async () => { throw new Error('must not request'); });
  const result = await service.create(3, 25000, { type: 'wallet_charge' }, 'same-request-key');
  assert.equal(result.gateway.fields.token, 'original-token');
  assert.equal(result.amount, 25000);
  assert.equal(createToken.mock.callCount(), 0);
});

test('rejects invalid payment identifiers and unsafe callback configuration', async (t) => {
  await assert.rejects(service.status('../other', 3), { status: 400 });
  t.mock.method(provider, 'requireConfiguration', () => ({
    callbackBaseUrl: 'https://shop.test/wrong-path', frontendUrl: 'https://shop.test',
  }));
  const create = t.mock.method(store, 'create', async () => { throw new Error('must not create'); });
  await assert.rejects(service.create(3, 25000, {}), { status: 503 });
  assert.equal(create.mock.callCount(), 0);
});

test('rejects self-funded wallet charges and negative amounts before any database changes', async (t) => {
  const query = t.mock.method(pool, 'query', async () => { throw new Error('must not write'); });
  await assert.rejects(db.chargeWallet(3, 25000, 'charge', { payment_method: 'wallet' }), { status: 400 });
  await assert.rejects(db.chargeWallet(3, -25000, 'charge', { payment_method: 'direct_gateway' }), { status: 400 });
  await assert.rejects(db.chargeWallet(3, 25000, 'charge', { payment_method: 'unknown' }), { status: 400 });
  assert.equal(query.mock.callCount(), 0);
});

test('direct package checkout uses the server price and defers subscription activation', async (t) => {
  const queries = [];
  t.mock.method(pool, 'query', async (sql) => {
    queries.push(sql);
    assert.match(sql, /SELECT \* FROM packages/);
    return [[{ id: 9, title: 'Test package', price: '25000', duration_days: 30 }]];
  });
  t.mock.method(service, 'create', async (_userId, amount, transaction) => {
    assert.equal(amount, '25000');
    assert.equal(transaction.package_id, 9);
    return { status: 'redirect_required' };
  });
  const result = await db.purchasePackage(3, 9, 'seller', { payment_method: 'direct_gateway', amount: 1 });
  assert.equal(result.status, 'redirect_required');
  assert.equal(queries.length, 1);
});

test('an administrator cannot manually approve an unverified gateway payment', async (t) => {
  let rolledBack = false;
  const connection = {
    beginTransaction: async () => undefined,
    rollback: async () => { rolledBack = true; },
    release: () => undefined,
    query: async (sql) => {
      assert.match(sql, /^SELECT \* FROM transactions/);
      return [[{ id: 17, type: 'wallet_charge', metadata: { source: 'direct_gateway' } }]];
    },
  };
  t.mock.method(pool, 'getConnection', async () => connection);
  await assert.rejects(db.approvePendingPayment(17), { status: 409 });
  assert.equal(rolledBack, true);
});
