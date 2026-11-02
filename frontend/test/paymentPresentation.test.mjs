import { test } from 'node:test';
import assert from 'node:assert/strict';
import { financialTypeLabel, paymentMethodLabel, paymentMethodOf } from '../src/utils/financialReport.js';

test('financial type is independent of verified gateway, transfer or wallet payment method', () => {
  for (const [method, label] of [['direct_gateway', 'درگاه اینترنتی'], ['bank_transfer', 'واریز بانکی'], ['wallet', 'اعتبار کیف پول']]) {
    const row = { type: 'seller_package_purchase', metadata: { payment_method: method } };
    assert.equal(paymentMethodLabel(row), label); assert.equal(financialTypeLabel(row), 'خرید اشتراک فروشگاه');
  }
});
test('failed, reversed and legacy records never infer method from transaction type or success', () => {
  for (const row of [{ type: 'seller_package_purchase' }, { type: 'wallet_charge', status: 'failed' }, { type: 'refund', status: 'success' }, { metadata: { source: 'seller_package_purchase' } }]) {
    assert.equal(paymentMethodOf(row), null); assert.equal(paymentMethodLabel(row), 'روش نامشخص');
  }
  assert.equal(paymentMethodLabel({ status: 'failed', metadata: { payment_method: 'direct_gateway' } }), 'درگاه اینترنتی');
  assert.equal(paymentMethodLabel({ type: 'refund', metadata: { source: 'wallet' } }), 'اعتبار کیف پول');
});
test('only known metadata source values are accepted and explicit payment method takes precedence', () => {
  assert.equal(paymentMethodOf({ metadata: { source: 'bank_transfer' } }), 'bank_transfer');
  assert.equal(paymentMethodOf({ metadata: { source: 'bank_transfer', payment_method: 'direct_gateway' } }), 'direct_gateway');
  for (const value of ['__proto__', 'constructor', 'toString', null]) assert.equal(paymentMethodOf({ metadata: { payment_method: value } }), null);
});
