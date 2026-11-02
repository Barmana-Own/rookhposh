const test = require('node:test');
const assert = require('node:assert/strict');
const { cardValid, ibanValid, bankInfoStatus, validateBankInfo, publicBankInfo, requireBankInfo } = require('../src/services/bankInfo');
const { validateReceipt } = require('../src/services/paymentReceipt');
// Standard card test number and checksum-valid IBAN fixture; never operational recipient settings.
const valid = { bank_name: 'QA only', account_holder: 'Disposable test recipient', card_number: '4111111111111111', iban: 'IR820540102680020817909002' };
test('empty, malformed and placeholder recipient settings never expose a usable transfer method', () => {
  for (const value of [null, '{}', 'bad-json', {}, { card_number: '0000000000000000', account_holder: 'test' }, { iban: 'IR000000000000000000000000', account_holder: 'test' }]) {
    assert.equal(bankInfoStatus(value).bank_transfer_available, false); assert.equal(publicBankInfo(value).card_number, undefined); assert.throws(() => requireBankInfo(value), error => error.status === 409);
  }
});
test('bank card and Iranian IBAN use actual checksums and reject corruption', () => {
  assert.equal(cardValid(valid.card_number), true); assert.equal(ibanValid(valid.iban), true);
  assert.equal(cardValid('4111111111111112'), false); assert.equal(ibanValid(valid.iban.slice(0, -1) + '3'), false);
  assert.equal(ibanValid('GB820540102680020817909002'), false); assert.equal(cardValid('1111111111111111'), false);
});
test('valid card or IBAN and named holder enable transfers; Persian digits normalize', () => {
  assert.equal(bankInfoStatus({ ...valid, iban: '' }).bank_transfer_available, true);
  assert.equal(bankInfoStatus({ ...valid, card_number: '' }).bank_transfer_available, true);
  assert.equal(validateBankInfo({ ...valid, card_number: '۴۱۱۱ ۱۱۱۱ ۱۱۱۱ ۱۱۱۱', iban: ' ir82 0540102680020817909002 ' }).card_number, valid.card_number);
  assert.equal(publicBankInfo(JSON.stringify(valid)).iban, valid.iban);
});
test('admin may clear all bank settings but cannot save partial or invalid recipient data', () => {
  assert.deepEqual(validateBankInfo({}), { bank_name: '', card_number: '', iban: '', account_holder: '' });
  for (const value of [{ bank_name: 'Bank' }, { ...valid, account_holder: '' }, { ...valid, iban: 'IR00' }, { ...valid, card_number: {} }, { ...valid, bank_name: 'x'.repeat(161) }]) assert.throws(() => validateBankInfo(value), error => error.status === 400);
});
test('receipt validation rejects absent, fake, executable, oversized and MIME-mismatched uploads', () => {
  for (const value of [null, {}, { dataUrl: 'data:image/png;base64,YWJj' }, { dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }, { dataUrl: 'data:application/pdf;base64,' + 'A'.repeat(8 * 1024 * 1024) }]) assert.throws(() => validateReceipt(value), error => error.status === 400);
  const dataUrl = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.7\nQA receipt\n%%EOF').toString('base64');
  const receipt = validateReceipt({ name: 'test.pdf', dataUrl, size: 999999 }); assert.equal(receipt.size, 25); assert.equal(receipt.type, 'application/pdf');
  const gif = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  assert.equal(validateReceipt({ dataUrl: gif, name: 'legacy-compatible.gif' }).type, 'image/gif');
});
