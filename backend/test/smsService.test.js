const assert = require('node:assert/strict');
const test = require('node:test');
const { createSmsSender } = require('../src/services/smsService');

const config = { apiKey: 'unit-test-key', template: 'unit-template' };
const recipient = { mobile: '09000000020', code: '123456' };
const accepted = { return: { status: 200 }, entries: [{ messageid: 123, status: 5 }] };

function logs(t) {
  const captured = [];
  t.mock.method(console, 'error', (...args) => { captured.push(args); });
  return captured;
}

test('Kavenegar receives a server-side HTTPS form POST with the approved template', async () => {
  let calls = 0;
  const send = createSmsSender({ config, fetchImpl: async (url, options) => {
    calls += 1;
    assert.equal(url, 'https://api.kavenegar.com/v1/unit-test-key/verify/lookup.json');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.headers['Content-Type'], 'application/x-www-form-urlencoded');
    assert.deepEqual(Object.fromEntries(options.body), { receptor: recipient.mobile, token: recipient.code, template: config.template, type: 'sms' });
    return Response.json(accepted);
  } });
  assert.deepEqual(await send(recipient), { messageId: 123 });
  assert.equal(calls, 1);
});

test('provider failures and rejected delivery never disclose provider payloads', async (t) => {
  const captured = logs(t);
  for (const payload of [
    { return: { status: 424, message: config.apiKey + recipient.mobile + recipient.code }, entries: null },
    { ...accepted, entries: [{ messageid: 123, status: 6 }] },
    { ...accepted, entries: [] },
    { ...accepted, entries: [{ status: 5 }] },
  ]) {
    const send = createSmsSender({ config, fetchImpl: async () => Response.json(payload) });
    await assert.rejects(send(recipient), (error) => {
      assert.equal(error.status, 503);
      for (const secret of Object.values(config).concat(Object.values(recipient))) assert.equal(error.message.includes(secret), false);
      return true;
    });
  }
  const serialized = JSON.stringify(captured);
  for (const secret of Object.values(config).concat(Object.values(recipient))) assert.equal(serialized.includes(secret), false);
});

test('timeouts or transport errors have no automatic retry and expose no secret URL', async (t) => {
  const captured = logs(t);
  let calls = 0;
  const send = createSmsSender({ config, fetchImpl: async () => {
    calls += 1;
    throw new Error('https://api.kavenegar.com/v1/' + config.apiKey + '/' + recipient.mobile + '/' + recipient.code);
  } });
  await assert.rejects(send(recipient), (error) => error.status === 503 && !error.message.includes(config.apiKey));
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(captured).includes(config.apiKey), false);
});

test('missing credentials fail closed before making a network request', async (t) => {
  logs(t);
  const send = createSmsSender({ config: { apiKey: '', template: '' }, fetchImpl: async () => assert.fail('network call without credentials') });
  await assert.rejects(send(recipient), { status: 503 });
});

test('non-JSON and HTTP-error responses are safely rejected', async (t) => {
  logs(t);
  for (const response of [new Response('upstream error ' + config.apiKey, { status: 502 }), Response.json(accepted, { status: 500 })]) {
    const send = createSmsSender({ config, fetchImpl: async () => response });
    await assert.rejects(send(recipient), { status: 503 });
  }
});
