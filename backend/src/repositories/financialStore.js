const pool = require('../config/database');
const ApiError = require('../utils/apiError');

const metadata = "CASE WHEN JSON_VALID(t.metadata) THEN t.metadata ELSE JSON_OBJECT() END";
const gatewayPayment = `(g.id IS NOT NULL OR COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${metadata},'$.payment_method')),'')='direct_gateway'
  OR COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${metadata},'$.source')),'')='direct_gateway')`;
const settled = `(t.status='success' AND (NOT ${gatewayPayment} OR (g.state='success' AND g.bank_verified_at IS NOT NULL)))`;
const revenue = `(t.type='seller_package_purchase' AND ${settled})`;
const joins = `FROM transactions t JOIN users buyer ON buyer.id=t.user_id
  LEFT JOIN gateway_payments g ON g.transaction_id=t.id`;

function number(value) {
  const parsed = Number(value || 0);
  if (!Number.isSafeInteger(parsed)) throw new ApiError(503, 'دریافت مبلغ دقیق گزارش مالی امکان‌پذیر نیست.');
  return parsed;
}

function reportRange(query = {}) {
  if (query.start_date || query.end_date) {
    const date = (value) => {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError(400, 'تاریخ گزارش معتبر نیست.');
      const parsed = new Date(`${value}T00:00:00Z`);
      if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
          || parsed.getUTCFullYear() < 1000 || parsed.getUTCFullYear() > 9998) throw new ApiError(400, 'تاریخ گزارش معتبر نیست.');
      return parsed;
    };
    const start = date(query.start_date);
    const end = date(query.end_date);
    if (start > end) throw new ApiError(400, 'بازه تاریخ گزارش معتبر نیست.');
    end.setUTCDate(end.getUTCDate() + 1);
    return { range: 'custom', sql: 't.created_at>=? AND t.created_at<?', params: [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)] };
  }
  const range = query.range || 'all';
  const days = { '1d': 1, '7d': 7, '30d': 30 };
  if (range !== 'all' && !Object.hasOwn(days, range)) throw new ApiError(400, 'بازه گزارش معتبر نیست.');
  return { range, sql: range === 'all' ? '' : `t.created_at>=DATE_SUB(NOW(),INTERVAL ${days[range]} DAY)`, params: [] };
}

function scopeFor(segment) {
  if (segment === 'company') return revenue;
  if (segment === 'sellers') return `(t.type='seller_package_purchase' OR
    (t.type='wallet_charge' AND (buyer.role='Seller' OR EXISTS(SELECT 1 FROM stores s WHERE s.seller_id=t.user_id))))`;
  // Retain the historical administrator API; customer payments are absent from the current UI and routes.
  if (segment === 'users') return "t.type='wallet_charge' AND buyer.role='User'";
  throw new ApiError(400, 'نوع گزارش مالی معتبر نیست.');
}

async function companyOverview() {
  const [[totals], [charts]] = await Promise.all([
    pool.query(`SELECT COALESCE(SUM(t.amount),0) AS income, COUNT(*) AS payments ${joins} WHERE ${revenue}`),
    pool.query(`SELECT DATE_FORMAT(t.created_at,'%Y-%m') AS name, SUM(t.amount) AS sales, COUNT(*) AS orders
      ${joins} WHERE ${revenue} GROUP BY DATE_FORMAT(t.created_at,'%Y-%m') ORDER BY name DESC LIMIT 12`),
  ]);
  return { company_income: number(totals[0].income), settled_payments: number(totals[0].payments),
    charts: charts.reverse().map((row) => ({ ...row, sales: number(row.sales), orders: number(row.orders) })) };
}

async function report(segment, query = {}, { exportAll = false } = {}) {
  const range = reportRange(query);
  const where = `${scopeFor(segment)}${range.sql ? ` AND ${range.sql}` : ''}`;
  const [[summary]] = await pool.query(
    `SELECT COUNT(*) AS total_rows,
      COALESCE(SUM(CASE WHEN ${settled} THEN t.amount ELSE 0 END),0) AS total,
      COALESCE(SUM(CASE WHEN ${revenue} THEN t.amount ELSE 0 END),0) AS revenue_total,
      COALESCE(SUM(CASE WHEN t.type='wallet_charge' AND ${settled} THEN t.amount ELSE 0 END),0) AS wallet_deposits_total,
      SUM(CASE WHEN ${settled} THEN 1 ELSE 0 END) AS settled_count
     ${joins} WHERE ${where}`, range.params,
  );
  const totalRows = number(summary.total_rows);
  if (exportAll && totalRows > 20000) throw new ApiError(413, 'برای خروجی Excel بازه تاریخ کوچک‌تری انتخاب کنید.');
  const limit = Math.min(100, Math.max(1, Math.trunc(Number(query.limit) || 25)));
  const totalPages = Math.max(1, Math.ceil(totalRows / limit));
  const page = Math.min(totalPages, Math.max(1, Math.trunc(Number(query.page) || 1)));
  const [rows] = await pool.query(
    `SELECT t.id,t.user_id,t.seller_id,t.package_id,t.type,t.amount,t.status,t.description,t.metadata,t.created_at,
      buyer.fullname AS user_name,buyer.email AS user_email,buyer.role AS user_role,
      g.bank_reference,g.bank_verified_at,g.state AS gateway_state,${settled} AS is_settled
     ${joins} WHERE ${where} ORDER BY t.id DESC LIMIT ? OFFSET ?`,
    [...range.params, exportAll ? 20000 : limit, exportAll ? 0 : (page - 1) * limit],
  );
  return {
    segment, range: range.range, total: number(summary.total), revenue_total: number(summary.revenue_total),
    wallet_deposits_total: number(summary.wallet_deposits_total), settled_count: number(summary.settled_count),
    pagination: { page, pageSize: limit, total: totalRows, totalPages },
    rows: rows.map((row) => {
      let parsed = row.metadata || {};
      if (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed); } catch { parsed = {}; }
      }
      const isSettled = Number(row.is_settled) === 1;
      return { ...row, amount: number(row.amount), metadata: parsed, is_settled: isSettled,
        settlement_status: row.status === 'success' && !isSettled ? 'unverified' : row.status };
    }),
  };
}

module.exports = { companyOverview, report, reportRange };
