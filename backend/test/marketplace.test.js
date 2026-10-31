const assert = require('node:assert/strict');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const { Readable, Writable } = require('node:stream');
const test = require('node:test');
const ExcelJS = require('exceljs');

const authService = require('../src/services/authService');
const adminService = require('../src/services/adminService');
const db = require('../src/repositories/dbStore');
const { createProApiProxy } = require('../src/middleware/proApiProxy');
const { normalizeContactPhone, normalizeDigits, toNumber } = require('../src/utils/number');
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

test('normalizes and validates store contact phone numbers', () => {
  assert.equal(normalizeContactPhone('۰۲۱-۱۲۳۴۵۶۷۸'), '02112345678');
  assert.equal(normalizeContactPhone('+۹۸۹۱۲۱۲۳۴۵۶۷۸'), '091212345678');
  assert.equal(normalizeContactPhone(''), null);
  assert.throws(() => normalizeContactPhone('۱۲۳۴۵'), /شماره تلفن تماس معتبر نیست/);
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

test('grants unlimited pro access only to the configured normal user account', async () => {
  const pool = require('../src/config/database');
  const originalQuery = pool.query;
  let queryCount = 0;
  pool.query = async (sql) => {
    queryCount += 1;
    assert.match(sql, /SELECT role, pro_unlimited FROM users/);
    return [[{ role: 'User', pro_unlimited: 1 }], []];
  };

  try {
    assert.equal(db.isUnlimitedProMobile('۰۹۰۳۷۸۶۲۳۴۹'), true);
    assert.equal(db.hasUnlimitedProAccess({ role: 'Seller', pro_unlimited: 1 }), false);
    assert.deepEqual(await db.getProQuota(42, '127.0.0.1'), {
      free_limit: null,
      free_used: null,
      free_remaining: null,
      has_subscription: false,
      has_unlimited_access: true,
      subscription: null,
    });
    assert.equal(queryCount, 1);
  } finally {
    pool.query = originalQuery;
  }
});

test('clamps admin pagination to safe bounds and reports total pages', () => {
  assert.deepEqual(db.normalizePagination('0', '500'), { page: 1, limit: 100, offset: 0 });
  assert.deepEqual(db.normalizePagination('3', '25'), { page: 3, limit: 25, offset: 50 });
  assert.deepEqual(db.normalizePagination('۳', '۲۵'), { page: 3, limit: 25, offset: 50 });
  assert.deepEqual(db.paginationMeta(3, 25, 51), { page: 3, pageSize: 25, total: 51, totalPages: 3 });
});

test('recognizes an existing seller account without requiring new identity data', async (t) => {
  let sentCode;
  t.mock.method(require('../src/services/smsService'), 'sendOtp', async ({ code }) => { sentCode = code; });
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

    assert.equal(requested.dev_code, undefined);
    const verified = await authService.verifyOtp({ mobile: requested.mobile, code: sentCode, role: 'Seller' });
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

test('compacts admin product image payloads while preserving model counts', async () => {
  const pool = require('../src/config/database');
  const originalQuery = pool.query;
  const queries = [];
  pool.query = async (sql) => {
    queries.push(sql);
    if (sql.includes('COUNT(*) AS total')) return [[{ total: 1 }], []];
    return [[{
      id: 11,
      seller_id: 4,
      title: 'محصول قدیمی',
      description: 'توضیح',
      features: '[]',
      price: 100000,
      status: 'pending',
      publish_status: 'active',
      reject_reason: null,
      created_at: null,
      updated_at: null,
      price_toman: 100000,
      seller_name: 'فروشگاه',
      store_slug: 'store',
      store_name: 'فروشگاه',
      image_count: 6,
      pending_image_count: 5,
      pending_changes: JSON.stringify({ title: 'محصول جدید', features: ['نخی'], price: 120000 }),
      image_0: 'base-1',
      image_1: 'base-2',
      image_2: null,
      image_3: null,
      pending_image_0: 'pending-1',
      pending_image_1: 'pending-2',
      pending_image_2: null,
      pending_image_3: null,
      avg_rating: 0,
      review_count: 0,
    }], []];
  };

  try {
    const result = await db.listProducts({
      status: 'pending',
      page: 1,
      limit: 25,
      includeMeta: true,
      imageLimit: 4,
      compactImages: true,
      includeReviewStats: false,
    });
    assert.deepEqual(result.items[0].pending_changes.images, ['pending-1', 'pending-2']);
    assert.equal(result.items[0].pending_changes.image_count, 5);
    assert.equal(result.items[0].image_count, 6);
    assert.equal(result.items[0].image_0, undefined);
    assert.ok(queries.some((sql) => sql.includes('JSON_REMOVE')));
    assert.ok(queries.some((sql) => sql.includes('COUNT(*) AS total')));
  } finally {
    pool.query = originalQuery;
  }
});

test('exports admin users and sellers into two Persian Excel worksheets', async () => {
  const originalListUsers = db.listUsers;
  const calls = [];
  db.listUsers = async ({ role }) => {
    calls.push(role);
    if (role === 'User') {
      return [{
        id: 1,
        fullname: 'کاربر اول',
        username: 'user1',
        email: 'user@example.com',
        mobile: '09120000001',
        national_code: '0012345678',
        wallet_balance: 100000,
        status: 'active',
        created_at: '2026-08-23 10:00:00',
        updated_at: '2026-08-23 10:30:00',
      }];
    }
    return [{
      id: 2,
      fullname: 'فروشگاه اول',
      username: 'seller1',
      email: 'seller@example.com',
      mobile: '09120000002',
      national_code: '0012345679',
      wallet_balance: 200000,
      store_name: 'فروشگاه اول',
      seller_verification_status: 'approved',
      seller_reject_reason: null,
      status: 'active',
      created_at: '2026-08-23 11:00:00',
      updated_at: '2026-08-23 11:30:00',
    }];
  };

  try {
    const buffer = await adminService.exportUsers();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['کاربران', 'فروشگاه‌ها']);
    assert.equal(workbook.getWorksheet('کاربران').getCell('A2').value, 1);
    assert.equal(workbook.getWorksheet('کاربران').getCell('H2').value, 'فعال');
    assert.equal(workbook.getWorksheet('فروشگاه‌ها').getCell('H2').value, 'فروشگاه اول');
    assert.equal(workbook.getWorksheet('فروشگاه‌ها').getCell('I2').value, 'تایید شده');
    assert.deepEqual(calls.sort(), ['Seller', 'User']);
  } finally {
    db.listUsers = originalListUsers;
  }
});

test('forwards the try-on multipart body through the backend proxy without marketplace auth', async () => {
  const payload = Buffer.from('--boundary\r\ncontent-disposition: form-data; name="person"\r\n\r\nimage-bytes\r\n--boundary--\r\n');
  const originalRequest = http.request;
  const forwarded = { chunks: [], options: null };
  http.request = (target, options, callback) => {
    forwarded.options = { target, options };
    const request = new EventEmitter();
    request.setTimeout = () => {};
    request.write = (chunk) => forwarded.chunks.push(Buffer.from(chunk));
    request.end = () => {
      const response = Readable.from([Buffer.from(JSON.stringify({ success: true }))]);
      response.statusCode = 200;
      response.headers = { 'content-type': 'application/json' };
      process.nextTick(() => callback(response));
    };
    return request;
  };

  try {
    let finish;
    const finished = new Promise((resolve) => { finish = resolve; });
    const response = {
      statusCode: 0,
      headers: {},
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      setHeader(name, value) {
        this.headers[name] = value;
      },
      end(body) {
        this.body = body;
        finish();
      },
    };
    const middleware = createProApiProxy('http://provider.test:6000');
    await middleware({
      method: 'POST',
      url: '/try-on',
      headers: {
        accept: 'application/json',
        'content-type': 'multipart/form-data; boundary=boundary',
        'content-length': String(payload.length),
        authorization: 'Bearer marketplace-token',
        'user-agent': 'test',
      },
      body: payload,
    }, response, (error) => { throw error; });
    await finished;

    assert.equal(forwarded.options.target.href, 'http://provider.test:6000/try-on');
    assert.equal(forwarded.options.options.method, 'POST');
    assert.equal(forwarded.options.options.headers.authorization, undefined);
    assert.equal(forwarded.options.options.headers['content-length'], String(payload.length));
    assert.deepEqual(Buffer.concat(forwarded.chunks), payload);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body.toString('utf8')), { success: true });
  } finally {
    http.request = originalRequest;
  }
});

test('returns the live provider image_base64 response as correctly typed image bytes', async () => {
  const webpBytes = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
  ]);
  const originalRequest = http.request;
  http.request = (_target, _options, callback) => {
    const request = new EventEmitter();
    request.setTimeout = () => {};
    request.write = () => {};
    request.end = () => {
      const upstream = Readable.from([Buffer.from(JSON.stringify({
        success: true,
        image_base64: webpBytes.toString('base64'),
        content_type: 'image/png',
      }))]);
      upstream.statusCode = 200;
      upstream.headers = { 'content-type': 'application/json' };
      process.nextTick(() => callback(upstream));
    };
    return request;
  };

  try {
    let finish;
    const finished = new Promise((resolve) => { finish = resolve; });
    const response = {
      statusCode: 0,
      headers: {},
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      setHeader(name, value) {
        this.headers[name] = value;
      },
      end(body) {
        this.body = body;
        finish();
      },
    };

    await createProApiProxy('http://provider.test:6000')({
      method: 'POST',
      url: '/try-on',
      headers: { 'content-type': 'multipart/form-data; boundary=test' },
      body: Buffer.from('test'),
    }, response, (error) => { throw error; });
    await finished;

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['content-type'], 'image/webp');
    assert.deepEqual(response.body, webpBytes);
  } finally {
    http.request = originalRequest;
  }
});

test('fetches the final provider URL and never the mask URL from a multi-output response', async () => {
  const maskUrl = 'http://provider.test:6000/files/mask.webp';
  const finalUrl = 'http://provider.test:6000/files/final.webp';
  const finalBytes = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
  ]);
  const originalRequest = http.request;
  const requestedTargets = [];

  http.request = (target, _options, callback) => {
    requestedTargets.push(target.href);
    const request = new EventEmitter();
    request.setTimeout = () => {};
    request.write = () => {};
    request.end = () => {
      const upstream = target.href === finalUrl
        ? Readable.from([finalBytes])
        : Readable.from([Buffer.from(JSON.stringify({
          success: true,
          image_url: maskUrl,
          output_image: finalUrl,
        }))]);
      upstream.statusCode = 200;
      upstream.headers = {
        'content-type': target.href === finalUrl ? 'image/webp' : 'application/json',
      };
      process.nextTick(() => callback(upstream));
    };
    return request;
  };

  try {
    const chunks = [];
    const response = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      },
    });
    response.statusCode = 0;
    response.headers = {};
    response.status = function status(code) {
      this.statusCode = code;
      return this;
    };
    response.setHeader = function setHeader(name, value) {
      this.headers[name] = value;
    };
    const finished = new Promise((resolve, reject) => {
      response.once('finish', resolve);
      response.once('error', reject);
    });

    await createProApiProxy('http://provider.test:6000')({
      method: 'POST',
      url: '/try-on',
      headers: { 'content-type': 'multipart/form-data; boundary=test' },
      body: Buffer.from('test'),
    }, response, (error) => { throw error; });
    await finished;

    assert.deepEqual(requestedTargets, [
      'http://provider.test:6000/try-on',
      finalUrl,
    ]);
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['content-type'], 'image/webp');
    assert.deepEqual(Buffer.concat(chunks), finalBytes);
  } finally {
    http.request = originalRequest;
  }
});
