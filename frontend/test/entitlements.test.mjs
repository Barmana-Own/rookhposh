import assert from 'node:assert/strict';
import test from 'node:test';
import { sellerEntitlementStats } from '../src/utils/sellerEntitlements.js';
import { canUsePro, mergeProQuota, proQuotaMessage } from '../src/utils/proQuota.js';

test('shows the purchased subscription and the remaining token count in two dashboard cards', () => {
  const cards = sellerEntitlementStats({ subscription: { title: 'پایه', expires_at: '2030-12-01T12:00:00Z' }, tokens_remaining: 30, tokens_available: 30 });
  assert.equal(cards.length, 2);
  assert.equal(cards[0].label, 'نوع اشتراک');
  assert.equal(cards[0].value, 'پایه');
  assert.match(cards[0].delta, /اعتبار تا/);
  assert.equal(cards[1].label, 'توکن‌های باقی‌مانده');
  assert.equal(cards[1].value, '۳۰');
});

test('does not infer a subscription from an available plan or from a token-only purchase', () => {
  const cards = sellerEntitlementStats({ subscription: null, tokens_remaining: 7, tokens_available: 7 });
  assert.equal(cards[0].value, 'بدون اشتراک');
  assert.equal(cards[1].value, '۷');
  assert.equal(sellerEntitlementStats()[1].value, '۰');
});

test('shows a monthly restriction without discarding the remaining purchased allowance', () => {
  const cards = sellerEntitlementStats({ tokens_remaining: 100, tokens_available: 0 });
  assert.equal(cards[1].value, '۱۰۰');
  assert.match(cards[1].delta, /۰ قابل مصرف در این ماه/);
});

test('an active but exhausted subscription never bypasses an explicit server denial', () => {
  assert.equal(canUsePro({ has_subscription: true, has_tokens: true, can_use_pro: false, free_remaining: 0 }), false);
  assert.equal(canUsePro(null), false);
  assert.match(proQuotaMessage({ has_subscription: true, can_use_pro: false }), /پایان/);
});

test('allows paid store credit after the visitor trial is exhausted and preserves trial compatibility', () => {
  assert.equal(canUsePro({ has_subscription: false, has_tokens: true, can_use_pro: true, free_remaining: 0 }), true);
  assert.equal(canUsePro({ has_subscription: false, free_remaining: 2 }), true);
  assert.match(proQuotaMessage({ has_tokens: true, can_use_pro: true }), /اعتبار فروشگاه/);
});

test('clears expired subscription and spent credit state without retaining large image payloads', () => {
  const result = mergeProQuota({ subscription: { title: 'پایه' }, has_subscription: true, has_tokens: true, can_use_pro: true }, {
    subscription: null, has_subscription: false, has_tokens: false, can_use_pro: false, free_remaining: 0, output_image: 'image-bytes',
  });
  assert.equal(result.subscription, null);
  assert.equal(result.can_use_pro, false);
  assert.equal(result.free_remaining, 0);
  assert.equal(result.output_image, undefined);
});
