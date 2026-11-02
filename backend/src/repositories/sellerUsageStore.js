const pool = require('../config/database');
const entitlements = require('./entitlementStore');
const ApiError = require('../utils/apiError');
const { normalizeDigits } = require('../utils/number');

function filters(query = {}) {
  const number = (value, fallback, max) => {
    if (value == null || value === '') return fallback;
    if (typeof value !== 'string' && typeof value !== 'number') throw new ApiError(400, 'صفحه‌بندی معتبر نیست.');
    const parsed = Number(normalizeDigits(String(value)));
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) throw new ApiError(400, 'صفحه‌بندی معتبر نیست.');
    return parsed;
  };
  const page = number(query.page, 1, 100000), limit = number(query.limit, 20, 100);
  const where = [], params = [];
  for (const key of ['from', 'to']) {
    if (query[key] == null || query[key] === '') continue;
    const value = query[key];
    const time = typeof value === 'string' ? Date.parse(value) : NaN;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) throw new ApiError(400, 'بازه تاریخ معتبر نیست.');
    where.push(key === 'to' ? 'created_at < DATE_ADD(?, INTERVAL 1 DAY)' : 'created_at >= ?'); params.push(value);
  }
  if (query.from && query.to && query.from > query.to) throw new ApiError(400, 'بازه تاریخ معتبر نیست.');
  if (query.status && query.status !== 'all') {
    if (!['validating', 'queued', 'processing', 'saving', 'completed', 'failed', 'timed_out', 'cancelled'].includes(query.status)) throw new ApiError(400, 'وضعیت معتبر نیست.');
    where.push('status=?'); params.push(query.status);
  }
  if (query.q != null && query.q !== '') {
    if (typeof query.q !== 'string' || query.q.length > 120) throw new ApiError(400, 'عبارت جستجو معتبر نیست.');
    const term = '%' + normalizeDigits(query.q.trim()).replace(/[!%_]/g, '!$&') + '%';
    where.push("(operation_id LIKE ? ESCAPE '!' OR product_title LIKE ? ESCAPE '!')"); params.push(term, term);
  }
  return { page, limit, offset: (page - 1) * limit, where: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

// Select accounting fields only: private images, owner identifiers and diagnostics never enter this DTO.
const usageSource = `SELECT COALESCE(j.id,CONCAT('usage-',pu.id)) AS operation_id, pu.id AS usage_id,
  pu.product_id,COALESCE(j.product_title,p.title) AS product_title,pu.created_at,
  COALESCE(pu.completed_at,j.completed_at) AS completed_at,
  CASE WHEN pu.status='success' THEN 'completed' ELSE 'failed' END AS status,
  pu.quota_source,
  CASE WHEN pu.is_free_trial=1 THEN 0 WHEN pu.quota_user_id IS NULL OR pu.quota_source='legacy' THEN NULL WHEN pu.status='success' THEN 1 ELSE 0 END AS tokens_consumed,
  CASE WHEN pu.is_free_trial=1 THEN 'not_charged' WHEN pu.quota_user_id IS NULL OR pu.quota_source='legacy' THEN 'unknown' WHEN pu.status='success' THEN 'consumed' ELSE 'released' END AS credit_status,
  0 AS tokens_reserved
  FROM pro_usages pu LEFT JOIN products p ON p.id=pu.product_id
  LEFT JOIN virtual_tryon_jobs j ON j.usage_id=pu.id`;
const source = usageSource + ' WHERE pu.quota_user_id=? UNION ALL '
  + usageSource + ' WHERE pu.quota_user_id IS NULL AND p.seller_id=? UNION ALL '
  + `  SELECT j.id,NULL,j.product_id,j.product_title,j.created_at,j.completed_at,j.status,j.quota_source,
  CASE WHEN j.status='completed' THEN NULL ELSE 0 END,
  CASE WHEN j.credit_reserved=1 THEN 'reserved' WHEN j.status IN ('failed','timed_out','cancelled') THEN 'released' WHEN j.status='completed' THEN 'unknown' ELSE 'not_charged' END,
  IF(j.credit_reserved=1,1,0)
  FROM virtual_tryon_jobs j WHERE j.seller_id=? AND j.usage_id IS NULL
  AND NOT EXISTS(SELECT 1 FROM pro_usages pu WHERE pu.tryon_job_id=j.id)`;

async function report(sellerId, query = {}) {
  const filter = filters(query);
  const args = [sellerId, sellerId, sellerId, ...filter.params];
  const [[rows], [[totals]], summary] = await Promise.all([
    pool.query('SELECT * FROM (' + source + ') ledger ' + filter.where + ' ORDER BY created_at DESC,operation_id DESC LIMIT ? OFFSET ?', [...args, filter.limit, filter.offset]),
    pool.query('SELECT COUNT(*) AS total,COALESCE(SUM(tokens_consumed),0) AS tokens_consumed,COALESCE(SUM(tokens_reserved),0) AS tokens_reserved FROM (' + source + ') ledger ' + filter.where, args),
    entitlements.getSummary(sellerId, pool, { requireSeller: true }),
  ]);
  return {
    items: rows.map(row => ({ ...row, id: row.operation_id, tokens_consumed: row.tokens_consumed == null ? null : Number(row.tokens_consumed), tokens_reserved: Number(row.tokens_reserved), balance_after: null })),
    pagination: { page: filter.page, pageSize: filter.limit, total: Number(totals.total), totalPages: Math.max(1, Math.ceil(Number(totals.total) / filter.limit)) },
    summary: { tokens_remaining: summary.tokens_remaining, tokens_available: summary.tokens_available,
      filtered_tokens_consumed: Number(totals.tokens_consumed), filtered_tokens_reserved: Number(totals.tokens_reserved) },
  };
}
module.exports = { report, filters };
