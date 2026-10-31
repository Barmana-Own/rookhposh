import assert from 'node:assert/strict';
import test from 'node:test';
import { otpCountdown, otpDeadline } from '../src/utils/otpCountdown.js';

test('starts at two minutes without exposing the resend action', () => {
  const now = 1000000;
  assert.deepEqual(otpCountdown(otpDeadline(120, 120, now), now), { remaining: 120, label: '02:00', canResend: false });
});

test('keeps resend hidden through the last partial second', () => {
  assert.deepEqual(otpCountdown(1120000, 1119999), { remaining: 1, label: '00:01', canResend: false });
});

test('reveals resend exactly at expiration', () => {
  assert.deepEqual(otpCountdown(1120000, 1120000), { remaining: 0, label: '00:00', canResend: true });
});

test('accounts for elapsed time when returning from a suspended tab', () => {
  const deadline = otpDeadline(120, 120, 1000000);
  assert.deepEqual(otpCountdown(deadline, 1047000), { remaining: 73, label: '01:13', canResend: false });
  assert.deepEqual(otpCountdown(deadline, 1500000), { remaining: 0, label: '00:00', canResend: true });
});

test('a successful resend starts a fresh countdown', () => {
  const deadline = otpDeadline(120, 120, 1200000);
  assert.deepEqual(otpCountdown(deadline, 1200000), { remaining: 120, label: '02:00', canResend: false });
});

test('does not show resend before a code was sent and rejects invalid timing responses', () => {
  for (const deadline of [null, undefined, NaN, Infinity, 0]) assert.equal(otpCountdown(deadline).canResend, false);
  for (const [expiry, resend] of [[undefined, 120], [120, NaN], [Infinity, 120], [-1, -1], [120, -1], [-1, 120], [0, 0], [99999999, 120]]) {
    assert.throws(() => otpDeadline(expiry, resend, 1000000));
  }
  assert.equal(otpDeadline(120, 125, 1000000), 1125000);
});
