import assert from 'node:assert/strict';
import test from 'node:test';
import { accountHome, postLoginPath } from '../src/utils/authNavigation.js';

const approvedSeller = { role: 'Seller', seller_verification_status: 'approved' };

test('sends guests and legacy customer sessions to seller sign-in', () => {
  for (const account of [null, undefined, {}, { role: 'User' }, { role: 'User', seller_verification_status: 'approved' }]) {
    assert.equal(accountHome(account), '/seller');
    assert.equal(postLoginPath(account, '/user/wallet'), '/seller');
  }
});

test('opens the seller dashboard only after approval and preserves admin access', () => {
  assert.equal(accountHome(approvedSeller), '/seller/dashboard');
  assert.equal(accountHome({ role: 'Seller', seller_verification_status: 'APPROVED' }), '/seller/dashboard');
  assert.equal(accountHome({ role: 'Admin' }), '/admin');
  for (const status of ['pending', 'rejected', '', undefined]) {
    const account = { role: 'Seller', seller_verification_status: status };
    assert.equal(postLoginPath(account, '/seller/products'), '/seller/status');
  }
});

test('retains approved sellers intended destination within the seller panel', () => {
  assert.equal(postLoginPath(approvedSeller, '/seller/products?q=coat#new'), '/seller/products?q=coat#new');
  assert.equal(postLoginPath(approvedSeller, null), '/seller/dashboard');
  assert.equal(postLoginPath({ role: 'Admin' }, '/seller/products'), '/admin');
});

test('rejects user, administrator, external and malformed login destinations', () => {
  for (const path of [
    '/user', '/user/wallet', '/admin', '/seller', '/seller/', '/seller-other/products',
    '/seller/../user', '/seller/%2e%2e/admin', '/stores/coat',
    'https://attacker.test/seller/products', '//attacker.test/seller/products',
    'javascript:alert(1)', '/seller/\\attacker.test', '/seller/products\n', {},
  ]) {
    assert.equal(postLoginPath(approvedSeller, path), '/seller/dashboard');
  }
});
