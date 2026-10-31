const assert = require('node:assert/strict');
const test = require('node:test');
const { createOtpService } = require('../src/services/otpService');

function fixture(sendOtp) {
  let time = 1000000;
  const sent = [];
  const service = createOtpService({
    now: () => time,
    sendOtp: async (payload) => { sent.push(payload); if (sendOtp) await sendOtp(payload); },
  });
  return { service, sent, advance: (ms) => { time += ms; } };
}

test('OTP is sent only through the provider and never returned to the requester', async () => {
  const { service, sent } = fixture();
  const result = await service.issue('09000000010', { store_slug: 'test-store' });
  assert.match(sent[0].code, /^\d{6}$/u);
  assert.equal(sent[0].mobile, '09000000010');
  assert.deepEqual(result, { expires_in: 300, resend_after: 60, delivery: 'sms' });
  assert.equal(JSON.stringify(result).includes(sent[0].code), false);
  assert.deepEqual(service.consume('09000000010', sent[0].code), { store_slug: 'test-store' });
});

test('OTP cannot be consumed for a different number or replayed after successful verification', async () => {
  const { service, sent } = fixture();
  await service.issue('09000000011');
  assert.throws(() => service.consume('09000000012', sent[0].code), { status: 401 });
  service.consume('09000000011', sent[0].code);
  assert.throws(() => service.consume('09000000011', sent[0].code), { status: 401 });
});

test('OTP expires at the five-minute boundary', async () => {
  const { service, sent, advance } = fixture();
  await service.issue('09000000013');
  advance(300000);
  assert.throws(() => service.consume('09000000013', sent[0].code), { status: 401 });
});

test('five wrong guesses invalidate the challenge even if the next guess is correct', async () => {
  const { service, sent } = fixture();
  await service.issue('09000000014');
  const wrong = sent[0].code === '111111' ? '222222' : '111111';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.throws(() => service.consume('09000000014', wrong), { status: 401 });
  }
  assert.throws(() => service.consume('09000000014', sent[0].code), { status: 401 });
});

test('the correct code still works before the failed-attempt budget is exhausted', async () => {
  const { service, sent } = fixture();
  await service.issue('09000000015');
  const wrong = sent[0].code === '111111' ? '222222' : '111111';
  for (let attempt = 0; attempt < 4; attempt += 1) {
    assert.throws(() => service.consume('09000000015', wrong), { status: 401 });
  }
  service.consume('09000000015', sent[0].code);
});

test('concurrent requests reserve the send and cannot authenticate before delivery succeeds', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const { service, sent } = fixture(() => pending);
  const first = service.issue('09000000016');
  await assert.rejects(service.issue('09000000016'), { status: 429 });
  assert.throws(() => service.consume('09000000016', sent[0].code), { status: 401 });
  release();
  await first;
  service.consume('09000000016', sent[0].code);
  assert.equal(sent.length, 1);
});

test('failed or ambiguous delivery invalidates the code and retains resend protection', async () => {
  const failure = new Error('delivery failed');
  const { service, sent, advance } = fixture(() => { throw failure; });
  await assert.rejects(service.issue('09000000017'), failure);
  assert.throws(() => service.consume('09000000017', sent[0].code), { status: 401 });
  await assert.rejects(service.issue('09000000017'), { status: 429 });
  advance(60000);
  await assert.rejects(service.issue('09000000017'), failure);
  assert.equal(sent.length, 2);
});

test('a number has a one-minute cooldown and five sends per sliding hour', async () => {
  const { service, sent, advance } = fixture();
  await service.issue('09000000018');
  advance(59999);
  await assert.rejects(service.issue('09000000018'), { status: 429 });
  advance(1);
  for (let count = 1; count < 5; count += 1) {
    await service.issue('09000000018');
    advance(60000);
  }
  await assert.rejects(service.issue('09000000018'), { status: 429 });
  advance(3600000);
  await service.issue('09000000018');
  service.consume('09000000018', sent.at(-1).code);
  assert.equal(sent.length, 6);
});

test('a consumed code cannot bypass resend cooldown', async () => {
  const { service, sent } = fixture();
  await service.issue('09000000019');
  service.consume('09000000019', sent[0].code);
  await assert.rejects(service.issue('09000000019'), { status: 429 });
});

test('a global hourly budget bounds SMS spend and stale state is pruned', async () => {
  const { service, sent, advance } = fixture();
  for (let index = 0; index < 200; index += 1) await service.issue('090' + String(index).padStart(8, '0'));
  await assert.rejects(service.issue('09100000999'), { status: 429 });
  advance(3600000);
  await service.issue('09100000999');
  assert.equal(sent.length, 201);
});
