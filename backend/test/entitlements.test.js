const assert = require('node:assert/strict');
const test = require('node:test');
const { summarize, activateSubscription } = require('../src/repositories/entitlementStore');

test('separates remaining package tokens from the monthly spendable allowance and purchased tokens', () => {
  const result = summarize([{ id: 1, pro_requests_count: 100, monthly_pro_request_limit: 20, used: 10, month_used: 17 }], '5', '2');
  assert.equal(result.tokens_remaining, 93);
  assert.equal(result.tokens_available, 6);
  assert.equal(result.purchased_tokens_remaining, 3);
  assert.equal(result.subscription.available_tokens, 3);
});

test('preserves unused tokens from multiple active purchases and treats zero monthly cap as no extra monthly restriction', () => {
  const result = summarize([
    { id: 1, pro_requests_count: 30, monthly_pro_request_limit: 0, used: 2, month_used: 2 },
    { id: 2, pro_requests_count: 10, monthly_pro_request_limit: 5, used: 0, month_used: 0 },
  ], 4, 1);
  assert.equal(result.tokens_remaining, 41);
  assert.equal(result.tokens_available, 36);
  assert.equal(result.subscription.id, 2);
  assert.equal(result.subscriptions.find((item) => item.available_tokens > 0).id, 1);
});

test('never returns a negative or invented balance after exhaustion or invalid counters', () => {
  assert.equal(summarize([{ pro_requests_count: 1, monthly_pro_request_limit: 1, used: 3, month_used: 3 }], 0, 2).tokens_remaining, 0);
  for (const value of [-1, 1.5, Infinity, 'broken', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => summarize([], value, 0), { status: 409 });
  }
});

test('activation reuses only an entitlement belonging to the same paid transaction owner and package', async () => {
  let existing = { id: 7, user_id: 3, package_id: 9 };
  const connection = { query: async (sql) => {
    if (sql.includes('FROM users')) return [[{ id: 3 }]];
    assert.match(sql, /FROM pro_subscriptions WHERE transaction_id=/);
    return [[existing]];
  } };
  assert.equal((await activateSubscription(connection, { userId: 3, packageId: 9, transactionId: 17 })).id, 7);
  existing = { ...existing, user_id: 4 };
  await assert.rejects(activateSubscription(connection, { userId: 3, packageId: 9, transactionId: 17 }), { status: 409 });
});
