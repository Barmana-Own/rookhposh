const assert = require('node:assert/strict');
const test = require('node:test');
const provider = require('../src/integrations/omidpay');
const { omidpay } = require('../src/config/env');

function configure(t) {
  const previous = { ...omidpay };
  Object.assign(omidpay, {
    enabled: true, userId: 'test-user', password: 'test-only-password', terminalId: '10000001', merchantId: '10000002',
  });
  t.after(() => Object.assign(omidpay, previous));
}

function responses(t, values) {
  const requests = [];
  t.mock.method(global, 'fetch', async (url, options) => {
    requests.push({ url: String(url), ...options, payload: JSON.parse(options.body) });
    const value = values.shift();
    if (value instanceof Error) throw value;
    return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
  });
  return requests;
}

test('converts integer toman amounts to rials and rejects unsafe or nonpositive amounts', () => {
  assert.equal(provider.amountInRials('25000'), 250000);
  assert.equal(provider.amountInRials(99999999999), 999999999990);
  for (const value of [-1, 0, 1.2, NaN, Infinity, '', '12abc', '1e4', null, true, [], {}, 100000000000]) {
    assert.throws(() => provider.amountInRials(value), { status: 400 });
  }
});

test('recognizes only the success variants documented by Omidpay', () => {
  assert.equal(provider.succeeded('erSucceed'), true);
  assert.equal(provider.succeeded('ER_SUCCEED'), true);
  for (const value of [0, true, {}, 'OK', 'success', null]) assert.equal(provider.succeeded(value), false);
});

test('sends credentials only to the fixed HTTPS token endpoint', async (t) => {
  configure(t);
  const requests = responses(t, [{ Result: 'erSucceed', Token: 'test_token-123' }]);
  const token = await provider.createToken({ orderId: '1234', amountRial: 250000, callbackUrl: 'https://shop.test/callback' });
  assert.equal(token, 'test_token-123');
  assert.equal(requests[0].url, 'https://ref.omidpayment.ir/ref-payment/RestServices/mts/generateTokenWithNoSign/');
  assert.deepEqual(requests[0].payload.WSContext, { UserId: 'test-user', Password: 'test-only-password' });
  assert.equal(requests[0].payload.Amount, '250000');
  assert.equal(requests[0].payload.ReserveNum, '1234');
  assert.equal(requests[0].payload.TerminalId, '10000001');
  assert.equal(requests[0].payload.MerchantId, '10000002');
  assert.equal(requests[0].redirect, 'error');
  assert.ok(requests[0].signal instanceof AbortSignal);
});

test('validates the bank amount and bank reference before and after verification', async (t) => {
  configure(t);
  const requests = responses(t, [
    { Result: 'ER_SUCCEED', ReferenceNum: '123456789012345678901234', Amount: 250000, ResponseCode: '00' },
    { Result: 'erSucceed', RefNum: '123456789012345678901234', Amount: 250000 },
  ]);
  assert.deepEqual(await provider.verify({ token: 'saved-token', amountRial: 250000 }), {
    reference: '123456789012345678901234', amountRial: 250000,
  });
  assert.deepEqual(requests[1].payload, {
    WSContext: { UserId: 'test-user', Password: 'test-only-password' }, Token: 'saved-token', RefNum: '123456789012345678901234',
  });
});

test('never confirms an underpayment, cancellation, missing response code or missing reference', async (t) => {
  configure(t);
  for (const change of [{ Amount: 249999 }, { Amount: [250000] }, { ResponseCode: '51' }, { ResponseCode: null },
    { ResponseCode: false }, { ResponseCode: '' }, { ReferenceNum: null }, { ReferenceNum: 1234 }]) {
    const requests = responses(t, [{ Result: 'erSucceed', ReferenceNum: '1234', Amount: 250000, ResponseCode: '00', ...change }]);
    await assert.rejects(provider.verify({ token: 'saved-token', amountRial: 250000 }), { status: 409 });
    assert.equal(requests.length, 1);
  }
});

test('rejects a mismatched amount or reference from the final confirmation', async (t) => {
  configure(t);
  for (const change of [{ Amount: 1 }, { RefNum: '999' }]) {
    responses(t, [
      { Result: 'erSucceed', ReferenceNum: '1234', Amount: 250000, ResponseCode: '00' },
      { Result: 'erSucceed', RefNum: '1234', Amount: 250000, ...change },
    ]);
    await assert.rejects(provider.verify({ token: 'saved-token', amountRial: 250000 }), { status: 409 });
  }
});

test('fails closed when disabled or missing credentials without contacting the bank', async (t) => {
  configure(t);
  omidpay.enabled = false;
  const requests = responses(t, []);
  await assert.rejects(provider.createToken({}), { status: 503 });
  assert.equal(requests.length, 0);
});

test('does not expose network errors, bank error payloads or credentials', async (t) => {
  configure(t);
  responses(t, [new Error('test-only-password secret upstream request')]);
  await assert.rejects(provider.createToken({}), (error) => {
    assert.equal(error.status, 502);
    assert.doesNotMatch(error.message, /test-only-password|secret upstream/);
    return true;
  });
  responses(t, [{ Result: 'erMts_InvalidUseridOrPass', detail: 'test-only-password' }]);
  await assert.rejects(provider.createToken({}), (error) => {
    assert.equal(error.gatewayCode, 'erMts_InvalidUseridOrPass');
    assert.doesNotMatch(error.message, /test-only-password/);
    return true;
  });
});

test('an HTTP 200 authentication rejection never becomes a checkout token', async (t) => {
  configure(t);
  responses(t, [{ Result: 'erAAS_InvalidUseridOrPass', Token: null }]);
  await assert.rejects(provider.createToken({ orderId: '1234', amountRial: 10000, callbackUrl: 'https://shop.test/callback' }), (error) => {
    assert.equal(error.status, 502);
    assert.equal(error.gatewayCode, 'erAAS_InvalidUseridOrPass');
    assert.doesNotMatch(error.message, /test-only-password/);
    return true;
  });
});

test('rejects malformed and excessively large upstream responses', async (t) => {
  configure(t);
  t.mock.method(global, 'fetch', async () => new Response('x'.repeat(70000)));
  await assert.rejects(provider.createToken({}), { status: 502 });
  responses(t, [{ Result: 'erSucceed', Token: '<script>bad</script>' }]);
  await assert.rejects(provider.createToken({}), { status: 502 });
});
