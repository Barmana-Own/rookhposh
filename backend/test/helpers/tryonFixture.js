const assert = require('node:assert/strict');
const crypto = require('node:crypto');
if (process.env.NODE_ENV !== 'test' || !/^rookhposh_payment_test_[a-f0-9]+$/.test(process.env.DB_NAME || '')) {
  throw new Error('Try-on integration tests require a disposable database.');
}
const pool = require('../../src/config/database');
const sharp = require('sharp');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { ensureRuntimeSchema } = require('../../src/database/runtimeSetup');

async function fixture({ credits = 30 } = {}) {
  const suffix = crypto.randomBytes(5).toString('hex');
  const password = 'qa-only-login-2026!';
  const passwordHash = await bcrypt.hash(password, 4);
  const users = {};
  for (const [key, role] of [['admin', 'Admin'], ['otherAdmin', 'Admin'], ['seller', 'Seller'], ['otherSeller', 'Seller'], ['customer', 'User'], ['otherCustomer', 'User']]) {
    const username = 'qa_' + key + '_' + suffix;
    const [result] = await pool.query(
      "INSERT INTO users(fullname,username,password,role,status,seller_verification_status) VALUES(?,?,?,?,'active',?)",
      ['QA ' + key, username, passwordHash, role, role === 'Seller' ? 'approved' : 'none'],
    );
    users[key] = { id: result.insertId, role, username };
  }
  const input = await sharp({ create: { width: 64, height: 96, channels: 3, background: '#c7d2fe' } }).png().toBuffer();
  const output = await sharp({ create: { width: 72, height: 108, channels: 3, background: '#635bff' } }).png().toBuffer();
  const cloth = await sharp({ create: { width: 48, height: 64, channels: 3, background: '#334155' } }).jpeg().toBuffer();
  const dataUrl = (bytes, type = 'image/png') => 'data:' + type + ';base64,' + bytes.toString('base64');
  const slug = 'qa-shop-' + suffix;
  await pool.query("INSERT INTO stores(seller_id,store_name,slug,status) VALUES(?,? ,?,'active')", [users.seller.id, 'QA shop ' + suffix, slug]);
  const [pack] = await pool.query(
    "INSERT INTO packages(title,price,role_type,pro_requests_count,monthly_pro_request_limit,duration_days,status) VALUES(?,5000,'seller',?,?,30,'active')",
    ['QA package ' + suffix, credits, credits],
  );
  await pool.query(
    "INSERT INTO pro_subscriptions(user_id,package_id,starts_at,expires_at,package_title,role_type,pro_requests_count,monthly_pro_request_limit) VALUES(?,?,NOW(),DATE_ADD(NOW(),INTERVAL 30 DAY),?,'seller',?,?)",
    [users.seller.id, pack.insertId, 'QA package ' + suffix, credits, credits],
  );
  const [product] = await pool.query("INSERT INTO products(seller_id,title,description,images,features,status) VALUES(?,?,?,?,'[]','active')",
    [users.seller.id, 'QA garment ' + suffix, 'QA description', JSON.stringify([dataUrl(cloth, 'image/jpeg'), dataUrl(output)])]);
  const token = (user) => jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET);
  return { ...users, password, productId: product.insertId, slug, input, output, cloth, dataUrl, token,
    payload: (key = crypto.randomUUID()) => ({ image: dataUrl(input), image_index: 0, request_key: key, processing_consent: true }) };
}

async function appServer() {
  const app = require('../../src/app');
  app.set('trust proxy', 'loopback');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  return { server, base, close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }) };
}

let clientSequence = 20;
function browser(base, token = null, clientIp = '198.18.0.' + clientSequence++) {
  let cookie = '';
  return {
    async request(path, options = {}) {
      const response = await fetch(base + path, {
        ...options, headers: { ...(options.body && !(options.body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
          'x-forwarded-for': clientIp, ...(cookie ? { cookie } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}), ...options.headers },
        body: options.body && typeof options.body !== 'string' && !(options.body instanceof FormData) ? JSON.stringify(options.body) : options.body,
      });
      const set = response.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      return response;
    },
    async json(path, options) {
      const response = await this.request(path, options);
      const body = await response.json();
      return { status: response.status, ...body };
    },
    async ready() { assert.equal((await this.json('/api/tryon/history')).status, 200); return this; },
    get cookie() { return cookie; },
  };
}

async function waitJob(client, id, statuses = ['completed', 'failed', 'timed_out']) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await client.json('/api/tryon/jobs/' + id);
    assert.equal(response.status, 200, JSON.stringify(response));
    if (statuses.includes(response.data.status)) return response.data;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Test job did not reach the expected state.');
}

async function resetProviders() {
  await pool.query('UPDATE virtual_tryon_providers SET enabled=(id=1),secret_ciphertext=NULL,cooldown_until=NULL,consecutive_failures=0,retry_limit=0,last_error_code=NULL');
}

module.exports = { pool, sharp, fixture, appServer, browser, waitJob, resetProviders, ensureRuntimeSchema };
