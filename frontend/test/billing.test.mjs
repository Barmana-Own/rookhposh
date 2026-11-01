import assert from 'node:assert/strict';
import test from 'node:test';
import { financialStatusLabel, financialTypeLabel, receiptUrlOf } from '../src/utils/financialReport.js';
import { canUsePro, mergeProQuota, proQuotaMessage } from '../src/utils/proQuota.js';

test('explains that customers never pay and their try-ons use the store credit', () => {
  const quota = { billing_source: 'store', customer_payment_required: false, customer_usage_limit: null, can_use_pro: true, has_tokens: true, free_remaining: null };
  assert.equal(canUsePro(quota), true);
  assert.match(proQuotaMessage(quota), /برای شما رایگان/);
  assert.match(proQuotaMessage(quota), /همین فروشگاه/);
  assert.doesNotMatch(proQuotaMessage(quota), /تجربه رایگان|بار باقی|خرید اشتراک|ورود/);
  const updated = mergeProQuota({}, quota);
  assert.equal(updated.customer_usage_limit, null);
  assert.equal(updated.customer_payment_required, false);
});

test('never uses a customer trial or an unlimited-user flag to bypass empty store credit', () => {
  assert.equal(canUsePro({ free_remaining: 999, has_unlimited_access: true }), false);
  assert.equal(canUsePro({ billing_source: 'store', has_subscription: true, can_use_pro: false }), false);
  assert.doesNotMatch(proQuotaMessage({ can_use_pro: false }), /خرید|پرداخت|ثبت نام|ورود/);
});

test('labels bank-unverified success separately from a confirmed payment', () => {
  assert.equal(financialStatusLabel({ status: 'success', settlement_status: 'unverified' }), 'نیازمند تأیید بانک');
  assert.equal(financialStatusLabel({ status: 'success', settlement_status: 'success' }), 'تأیید شده');
  assert.equal(financialTypeLabel({ type: 'seller_package_purchase', metadata: { token_purchase: true } }), 'خرید توکن فروشگاه');
  assert.equal(financialTypeLabel({ type: 'wallet_charge' }), 'شارژ کیف پول');
});

test('only opens receipt images, PDF data, same-site paths or credential-free HTTPS URLs', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'data:image/svg+xml;base64,AAA=', '//attacker.test/file', '/\\attacker.test/file', 'https://user:password@example.test/file']) {
    assert.equal(receiptUrlOf({ metadata: { receipt: { url: value } } }), '');
  }
  assert.equal(receiptUrlOf({ metadata: { receipt: { dataUrl: 'data:application/pdf;base64,AAAA' } } }), 'data:application/pdf;base64,AAAA');
  assert.equal(receiptUrlOf({ metadata: { receipt: { url: '/uploads/receipt.png' } } }), '/uploads/receipt.png');
  assert.equal(receiptUrlOf({ metadata: { receipt: { url: 'https://example.test/receipt.png' } } }), 'https://example.test/receipt.png');
});
