import test from 'node:test';
import assert from 'node:assert/strict';
import { FILE_TIMEOUT_MS, READ_TIMEOUT_MS, isTransient, parseRetryAfter, pollDelay, readWithRetry, waitForRetry } from '../src/utils/requestPolicy.js';

test('read retries are bounded, use backoff and never retry access, missing or cancelled responses', async () => {
  const waits = []; let calls = 0;
  const value = await readWithRetry(async () => { if (++calls < 3) throw { status: 503 }; return 'ready'; }, { random: () => 0.5, sleep: async ms => waits.push(ms) });
  assert.equal(value, 'ready'); assert.equal(calls, 3); assert.deepEqual(waits, [400, 800]);
  for (const status of [400, 401, 403, 404, 409, 422]) {
    let attempts = 0;
    await assert.rejects(readWithRetry(async () => { attempts++; throw { status }; }), error => error.status === status);
    assert.equal(attempts, 1);
  }
  assert.equal(isTransient({ status: 0, code: 'ERR_CANCELED' }), false);
});

test('Retry-After dates and seconds are respected; long cooldowns do not keep an automatic retry alive', async () => {
  assert.equal(parseRetryAfter('2'), 2000);
  assert.equal(parseRetryAfter('Sun, 01 Nov 2026 00:00:03 GMT', Date.parse('2026-11-01T00:00:00Z')), 3000);
  assert.equal(parseRetryAfter('invalid'), 0);
  const waits = []; let calls = 0;
  await readWithRetry(async () => { if (++calls === 1) throw { status: 429, retryAfterMs: 2500 }; return true; }, { sleep: async ms => waits.push(ms) });
  assert.deepEqual(waits, [2500]);
  await assert.rejects(readWithRetry(async () => { throw { status: 429, retryAfterMs: 60_000 }; }, { sleep: async () => assert.fail('must not sleep') }), error => error.status === 429);
});

test('a permanent outage stops after three reads and cancellation interrupts backoff immediately', async () => {
  let calls = 0;
  await assert.rejects(readWithRetry(async () => { calls++; throw { status: 504 }; }, { sleep: async () => {} }), error => error.status === 504);
  assert.equal(calls, 3);
  const controller = new globalThis.AbortController();
  const pending = waitForRetry(60_000, controller.signal); controller.abort();
  await assert.rejects(pending, error => error.code === 'ERR_CANCELED');
  assert.equal(READ_TIMEOUT_MS, 12_000); assert.ok(FILE_TIMEOUT_MS > READ_TIMEOUT_MS);
});

test('status polling backs off, respects background tabs and never shortens server cooldowns', () => {
  assert.equal(pollDelay(), 500); assert.equal(pollDelay({ reads: 1 }), 1000); assert.equal(pollDelay({ reads: 100 }), 2000);
  assert.equal(pollDelay({ failures: 20 }), 30000);
  assert.equal(pollDelay({ failures: 1, hidden: true }), 8000);
  assert.equal(pollDelay({ retryAfterMs: 60000 }), 60000);
});
