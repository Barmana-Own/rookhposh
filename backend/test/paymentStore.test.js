const assert = require('node:assert/strict');
const test = require('node:test');
const pool = require('../src/config/database');
const store = require('../src/repositories/paymentStore');

const paymentId = 'a'.repeat(32);

test('creates the pending transaction and its recovery ID atomically without changing the balance', async (t) => {
  let metadata;
  let committed = false;
  const connection = {
    beginTransaction: async () => undefined, rollback: async () => undefined, release: () => undefined,
    commit: async () => { committed = true; },
    query: async (sql, values) => {
      if (sql.includes('FROM users')) return [[{ id: 3, role: 'Seller', status: 'active', seller_verification_status: 'approved' }]];
      if (sql.includes('SELECT * FROM gateway_payments')) return [[]];
      if (sql.includes('INSERT INTO transactions')) {
        assert.match(sql, /'pending'/);
        assert.equal(values[4], 25000);
        metadata = JSON.parse(values[6]);
        return [{ insertId: 17 }];
      }
      assert.match(sql, /INSERT INTO gateway_payments/);
      assert.equal(values[0], metadata.gateway_payment_id);
      assert.deepEqual(values.slice(1, 5), [17, 3, 'test-request-key', 'test-hash']);
      assert.equal(values[6], 250000);
      return [{ affectedRows: 1 }];
    },
  };
  t.mock.method(pool, 'getConnection', async () => connection);
  const result = await store.create(3, 250000, { type: 'wallet_charge', description: 'Test charge' }, 'test-request-key', 'test-hash');
  assert.equal(result.transaction_id, 17);
  assert.match(result.id, /^[a-f0-9]{32}$/);
  assert.equal(metadata.source, 'direct_gateway');
  assert.equal(committed, true);
});

function database(t, overrides = {}, failNotification = false) {
  const state = {
    state: 'verified', transaction_status: 'pending', transaction_id: 17,
    user_id: 3, type: 'wallet_charge', amount: 25000, metadata: {},
    balance: 100, subscriptions: 0, notifications: 0, commits: 0, rollbacks: 0, ...overrides,
  };
  let snapshot;
  const queries = [];
  const connection = {
    beginTransaction: async () => { snapshot = { ...state }; },
    commit: async () => { state.commits += 1; },
    rollback: async () => { Object.assign(state, snapshot, { rollbacks: state.rollbacks + 1 }); },
    release: () => undefined,
    query: async (sql, values) => {
      queries.push({ sql, values });
      if (/SELECT g.state/.test(sql)) {
        assert.match(sql, /FOR UPDATE/);
        return [[{ ...state }]];
      }
      if (/UPDATE users SET wallet_balance/.test(sql)) {
        state.balance += Number(values[0]);
      } else if (/INSERT INTO pro_subscriptions/.test(sql)) {
        state.subscriptions += 1;
      } else if (/UPDATE transactions SET status='success'/.test(sql)) {
        assert.equal(state.transaction_status, 'pending');
        state.transaction_status = 'success';
      } else if (/UPDATE gateway_payments SET state='success'/.test(sql)) {
        state.state = 'success';
      } else if (/INSERT INTO notifications/.test(sql)) {
        if (failNotification) throw new Error('notification write failed');
        state.notifications += 1;
      } else {
        throw new Error(`Unexpected statement: ${sql}`);
      }
      return [{ affectedRows: 1 }];
    },
  };
  t.mock.method(pool, 'getConnection', async () => connection);
  return { state, queries };
}

test('credits a verified wallet payment and records completion atomically, once', async (t) => {
  const { state } = database(t);
  await store.finalize(paymentId);
  await store.finalize(paymentId);
  assert.equal(state.balance, 25100);
  assert.equal(state.state, 'success');
  assert.equal(state.transaction_status, 'success');
  assert.equal(state.notifications, 1);
});

test('does not credit or activate a payment without durable bank confirmation', async (t) => {
  const { state } = database(t, { state: 'pending' });
  await assert.rejects(store.finalize(paymentId), { status: 409 });
  assert.equal(state.balance, 100);
  assert.equal(state.transaction_status, 'pending');
  assert.equal(state.subscriptions, 0);
});

test('rolls back balance, transaction and payment state if any finalization write fails', async (t) => {
  const { state } = database(t, {}, true);
  await assert.rejects(store.finalize(paymentId), /notification write failed/);
  assert.equal(state.balance, 100);
  assert.equal(state.transaction_status, 'pending');
  assert.equal(state.state, 'verified');
  assert.equal(state.rollbacks, 1);
  assert.equal(state.commits, 0);
});

test('uses the purchased package duration and activates a subscription once', async (t) => {
  const { state, queries } = database(t, {
    type: 'seller_package_purchase', package_id: 9, metadata: JSON.stringify({ duration_days: 30 }),
  });
  await store.finalize(paymentId);
  await store.finalize(paymentId);
  assert.equal(state.balance, 100);
  assert.equal(state.subscriptions, 1);
  const activation = queries.find(({ sql }) => sql.includes('INSERT INTO pro_subscriptions'));
  assert.deepEqual(activation.values, [3, 9, 17, 30]);
});

test('rejects an invalid package snapshot or inconsistent transaction state', async (t) => {
  const { state } = database(t, { type: 'seller_package_purchase', package_id: 9, metadata: { duration_days: -1 } });
  await assert.rejects(store.finalize(paymentId), { status: 409 });
  assert.equal(state.subscriptions, 0);
  state.state = 'verified';
  state.transaction_status = 'success';
  await assert.rejects(store.finalize(paymentId), { status: 409 });
  assert.equal(state.balance, 100);
});

test('reuses a request key for its owner and rejects changing the purchase under that key', async (t) => {
  let existingHash = 'same-hash';
  const connection = {
    beginTransaction: async () => undefined, commit: async () => undefined,
    rollback: async () => undefined, release: () => undefined,
    query: async (sql, values) => {
      if (sql.includes('FROM users')) return [[{ id: 3, role: 'Seller', status: 'active', seller_verification_status: 'approved' }]];
      assert.match(sql, /user_id=\? AND request_key=\? FOR UPDATE/);
      assert.deepEqual(values, [3, 'same-request-key']);
      return [[{ id: paymentId, request_hash: existingHash, state: 'pending', token: 'saved-token' }]];
    },
  };
  t.mock.method(pool, 'getConnection', async () => connection);
  assert.equal((await store.create(3, 250000, {}, 'same-request-key', 'same-hash')).existing, true);
  existingHash = 'other-hash';
  await assert.rejects(store.create(3, 250000, {}, 'same-request-key', 'same-hash'), { status: 409 });
});

test('a lease releases only its own verification and can recover an abandoned worker', async (t) => {
  const calls = [];
  t.mock.method(pool, 'query', async (sql, values) => {
    calls.push({ sql, values });
    return [{ affectedRows: 1 }];
  });
  const lockId = await store.claim(paymentId);
  assert.match(lockId, /^[a-f0-9]{32}$/);
  assert.match(calls[0].sql, /INTERVAL 1 MINUTE/);
  await store.releaseClaim(paymentId, lockId);
  assert.match(calls[1].sql, /AND lock_id=\?/);
  assert.equal(calls[1].values[2], lockId);
});
