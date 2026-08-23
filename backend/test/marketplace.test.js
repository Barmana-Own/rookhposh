const assert = require('node:assert/strict');
const test = require('node:test');

const authService = require('../src/services/authService');
const db = require('../src/repositories/dbStore');
const { normalizeDigits, toNumber } = require('../src/utils/number');
const { isLegacyStoreSlug, slugifyStoreName } = require('../src/utils/storeSlug');

test('normalizes Persian, Arabic, international and formatted mobile numbers consistently', () => {
  assert.equal(authService.normalizeMobile('۰۹۱۲-۰۰۰-۰۰۰۲'), '09120000002');
  assert.equal(authService.normalizeMobile('+989120000002'), '09120000002');
  assert.equal(authService.normalizeMobile('00989120000002'), '09120000002');
  assert.equal(authService.roleValue('seller'), 'Seller');
});

test('accepts Persian and Arabic digits in numeric payloads', () => {
  assert.equal(normalizeDigits('۱۲۳٬۴۵۶'), '123٬456');
  assert.equal(toNumber('۱۲۳٬۴۵۶'), 123456);
  assert.equal(toNumber('١٢٫٥'), 12.5);
});

test('creates a readable store-name slug and recognizes legacy mobile slugs', () => {
  assert.equal(slugifyStoreName('بوتیک بهار'), 'بوتیک-بهار');
  assert.equal(slugifyStoreName('My Fashion Store'), 'my-fashion-store');
  assert.equal(isLegacyStoreSlug('09024799853-seller'), true);
  assert.equal(isLegacyStoreSlug('بوتیک-بهار'), false);
});

test('keeps every product model when image payload is normalized', () => {
  const images = db.normalizeImages(JSON.stringify([' model-a ', 'model-b', ['model-c']]));
  assert.deepEqual(images, ['model-a', 'model-b', 'model-c']);
});

test('normalizes product features into unique Persian tags', () => {
  const features = db.normalizeProductFeatures('نخی، آستین کوتاه\nنخی|مناسب تابستان');
  assert.deepEqual(features, ['نخی', 'آستین کوتاه', 'مناسب تابستان']);
});

test('clamps admin pagination to safe bounds and reports total pages', () => {
  assert.deepEqual(db.normalizePagination('0', '500'), { page: 1, limit: 100, offset: 0 });
  assert.deepEqual(db.normalizePagination('3', '25'), { page: 3, limit: 25, offset: 50 });
  assert.deepEqual(db.normalizePagination('۳', '۲۵'), { page: 3, limit: 25, offset: 50 });
  assert.deepEqual(db.paginationMeta(3, 25, 51), { page: 3, pageSize: 25, total: 51, totalPages: 3 });
});

test('recognizes an existing seller account without requiring new identity data', async () => {
  const originalLookup = db.findUserByMobileAndRole;
  const originalCreate = db.createUser;
  let createCalled = false;
  db.findUserByMobileAndRole = async () => ({
    id: 42,
    role: 'Seller',
    status: 'active',
    seller_verification_status: 'approved',
  });
  db.createUser = async () => {
    createCalled = true;
    throw new Error('existing sellers must not be recreated');
  };

  try {
    const requested = await authService.requestOtp({ mobile: '+989120000002', role: 'Seller' });
    assert.equal(requested.existing_account, true);
    assert.equal(requested.requires_identity, false);

    const verified = await authService.verifyOtp({ mobile: requested.mobile, code: requested.dev_code, role: 'Seller' });
    assert.equal(verified.user.id, 42);
    assert.equal(verified.user.seller_verification_status, 'approved');
    assert.equal(createCalled, false);
  } finally {
    db.findUserByMobileAndRole = originalLookup;
    db.createUser = originalCreate;
  }
});

test('creates one notification row for every active admin in a bulk insert', async () => {
  const calls = [];
  const connection = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT id, fullname')) {
        return [[{ id: 7, fullname: 'ادمین اول' }, { id: 8, fullname: 'ادمین دوم' }], []];
      }
      return [{ insertId: 100 }, []];
    },
  };

  const ids = await db.notifyAdmins('درخواست جدید', 'جزئیات', 'product_review', 25, connection);
  const insertCall = calls.find((call) => call.sql.startsWith('INSERT INTO notifications'));
  assert.deepEqual(ids, [100, 101]);
  assert.equal(insertCall.params.length, 10);
  assert.match(insertCall.sql, /VALUES\(\?,\?,\?,\?,\?,0\),\(\?,\?,\?,\?,\?,0\)/);
});
