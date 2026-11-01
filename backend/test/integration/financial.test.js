const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const test = require('node:test');

if (process.env.NODE_ENV !== 'test' || !/^rookhposh_payment_test_[a-z0-9_]{1,32}$/.test(process.env.DB_NAME || '')) {
  throw new Error('Financial integration tests require a disposable rookhposh_payment_test_* database.');
}

const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');
const pool = require('../../src/config/database');
const db = require('../../src/repositories/dbStore');
const financial = require('../../src/repositories/financialStore');
const adminService = require('../../src/services/adminService');
const { jwtSecret } = require('../../src/config/env');
const { ensureRuntimeSchema } = require('../../src/database/runtimeSetup');
const app = require('../../src/app');

test('admin income reports actual settled seller purchases without counting attempts or wallet funding twice', { timeout: 60000 }, async (t) => {
  await ensureRuntimeSchema();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const accounts = [];
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    try {
      for (const account of accounts) {
        await db.deleteUser(account.id);
        if (account.role === 'Admin') await pool.query("DELETE FROM users WHERE id=? AND role='Admin'", [account.id]);
      }
    } finally {
      await pool.end();
    }
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const nativeFetch = globalThis.fetch.bind(globalThis);
  t.mock.method(globalThis, 'fetch', (url, options) => {
    assert.equal(new URL(url).origin, origin, 'financial tests must not contact a real bank');
    return nativeFetch(url, options);
  });
  const createAccount = async (role) => {
    const account = await db.createUser({ fullname: 'Financial fixture', username: `financial-${randomBytes(8).toString('hex')}`, password: randomBytes(24).toString('base64url'), role, seller_verification_status: 'approved', store_name: 'Financial fixture' });
    accounts.push(account);
    return account;
  };
  const seller = await createAccount('Seller');
  const customer = await createAccount('User');
  const admin = await createAccount('Admin');
  const token = (account) => jwt.sign({ id: account.id, role: account.role }, jwtSecret, { expiresIn: '5m' });
  async function api(path, account = admin, expected = 200) {
    const response = await fetch(origin + path, { headers: account ? { Authorization: `Bearer ${token(account)}` } : {}, redirect: 'manual' });
    const body = await response.json();
    assert.equal(response.status, expected, `${path}: ${body.message || ''}`);
    return { data: body.data, response };
  }
  async function transaction({ user = seller, type = 'seller_package_purchase', status = 'success', amount, gateway = false, verified = true, createdAt } = {}) {
    const [row] = await pool.query('INSERT INTO transactions(user_id,seller_id,type,amount,status,description,metadata,created_at) VALUES(?,?,?,?,?,?,?,COALESCE(?,NOW()))',
      [user.id, user.role === 'Seller' ? user.id : null, type, amount, status, 'Financial fixture', JSON.stringify({ payment_method: gateway ? 'direct_gateway' : 'wallet' }), createdAt || null]);
    if (gateway) await pool.query('INSERT INTO gateway_payments(id,transaction_id,user_id,request_key,request_hash,order_id,amount_rial,token,state,bank_reference,bank_verified_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      [randomBytes(16).toString('hex'), row.insertId, user.id, randomUUID(), randomBytes(32).toString('hex'), String(BigInt(`0x${randomBytes(10).toString('hex')}`)), amount * 10, randomBytes(24).toString('hex'), verified && status === 'success' ? 'success' : status === 'failed' ? 'failed' : 'pending', verified && status === 'success' ? String(row.insertId) : null, verified && status === 'success' ? new Date() : null]);
    return row.insertId;
  }
  const walletPurchase = await transaction({ amount: 500 });
  const bankPurchase = await transaction({ amount: 700, gateway: true });
  await transaction({ amount: 900, status: 'pending', gateway: true });
  await transaction({ amount: 1100, status: 'failed', gateway: true });
  const unverified = await transaction({ amount: 1300, gateway: true, verified: false });
  await transaction({ amount: 2000, type: 'wallet_charge', gateway: true });
  await transaction({ user: customer, amount: 1700, type: 'package_purchase' });
  await transaction({ amount: 1900, type: 'company_income' });
  await t.test('income card, chart and company report agree on settled seller sales', async () => {
    const overview = await financial.companyOverview();
    assert.equal(overview.company_income, 1200); assert.equal(overview.settled_payments, 2);
    assert.equal(overview.charts.reduce((sum, row) => sum + row.sales, 0), 1200);
    const dashboard = (await api('/api/admin/dashboard')).data; assert.equal(dashboard.company_income, 1200);
    const company = (await api('/api/admin/reports/financial/company?range=all')).data;
    assert.equal(company.total, 1200); assert.equal(company.revenue_total, 1200); assert.equal(company.wallet_deposits_total, 0);
    assert.deepEqual(company.rows.map((row) => row.id).sort((a, b) => a - b), [walletPurchase, bankPurchase]);
    assert.equal(company.rows.some((row) => Object.hasOwn(row, 'token')), false);
  });

  await t.test('seller report includes attempts and wallet funding but never mislabels them as revenue', async () => {
    const report = (await api('/api/admin/reports/financial/sellers?range=all')).data;
    assert.equal(report.pagination.total, 6); assert.equal(report.revenue_total, 1200); assert.equal(report.wallet_deposits_total, 2000);
    assert.equal(report.total, 3200); assert.equal(report.rows.find((row) => row.id === unverified).settlement_status, 'unverified');
    assert.equal(report.rows.find((row) => row.id === bankPurchase).bank_reference, String(bankPurchase));
  });

  await t.test('pagination does not change totals and Excel includes all filtered pages and bank references', async () => {
    const first = await financial.report('company', { range: 'all', page: 1, limit: 1 });
    const second = await financial.report('company', { range: 'all', page: 2, limit: 1 });
    assert.equal(first.total, 1200); assert.equal(second.total, 1200); assert.notEqual(first.rows[0].id, second.rows[0].id);
    const bytes = await adminService.exportFinancial('company', { range: 'all', page: 2, limit: 1 });
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes);
    const sheet = workbook.worksheets[0]; assert.equal(sheet.rowCount, 3);
    assert.equal(sheet.getCell(1, 7).value, 'کد پیگیری بانک');
    assert.equal(sheet.getCell(2, 6).value, 'تأیید شده');
  });

  await t.test('date filters include the entire final day and exclude older revenue from shorter ranges', async (scope) => {
    const [[dates]] = await pool.query("SELECT DATE_FORMAT(DATE_SUB(CURDATE(),INTERVAL 1 DAY),'%Y-%m-%d') AS yesterday,DATE_FORMAT(DATE_SUB(CURDATE(),INTERVAL 40 DAY),'%Y-%m-%d') AS old_date");
    const ids = [await transaction({ amount: 50, createdAt: `${dates.yesterday} 00:00:01` }), await transaction({ amount: 80, createdAt: `${dates.yesterday} 23:59:59` }), await transaction({ amount: 300, createdAt: `${dates.old_date} 12:00:00` })];
    scope.after(async () => { for (const id of ids) await pool.query('DELETE FROM transactions WHERE id=?', [id]); });
    const yesterday = await financial.report('company', { start_date: dates.yesterday, end_date: dates.yesterday });
    assert.equal(yesterday.total, 130); assert.equal(yesterday.rows.length, 2);
    assert.equal((await financial.report('company', { range: '30d' })).total, 1330);
    assert.equal((await financial.report('company', { range: 'all' })).total, 1630);
  });

  await t.test('admin-only reporting and exported amounts cannot be read by customers or sellers', async () => {
    await api('/api/admin/reports/financial/company', null, 401);
    await api('/api/admin/reports/financial/company', seller, 403);
    await api('/api/admin/reports/financial/company', customer, 403);
    const response = await api('/api/admin/reports/financial/company');
    assert.match(response.response.headers.get('cache-control'), /no-store/);
  });

  await t.test('blocking the seller does not erase previously earned company income', async (scope) => {
    await pool.query("UPDATE users SET status='blocked' WHERE id=?", [seller.id]);
    scope.after(async () => pool.query("UPDATE users SET status='active' WHERE id=?", [seller.id]));
    assert.equal((await financial.companyOverview()).company_income, 1200);
  });
});
