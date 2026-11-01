const crypto = require('node:crypto');
const pool = require('../config/database');
const entitlements = require('../repositories/entitlementStore');
const ApiError = require('../utils/apiError');
const { ACTIVE_STATES, seal, unseal } = require('./config');
const { assertId, digest } = require('./identity');
const { audit, parse } = require('./providers');

const uuid = () => crypto.randomBytes(16).toString('hex');
const requestKey = (value) => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(value)) throw new ApiError(400, 'شناسه یکتای درخواست معتبر نیست.');
  return value;
};
const pageOf = (query = {}) => {
  const page = Math.max(1, Math.min(100000, Math.trunc(Number(query.page) || 1)));
  const limit = Math.max(1, Math.min(50, Math.trunc(Number(query.limit) || 12)));
  return { page, limit, offset: (page - 1) * limit };
};

async function addAsset(connection, jobId, kind, asset) {
  const [result] = await connection.query(
    `INSERT IGNORE INTO virtual_tryon_files(id,job_id,kind,storage_key,mime,extension,byte_size,width,height,sha256) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    [asset.id, jobId, kind, asset.storage_key, asset.mime, asset.extension, asset.byte_size, asset.width, asset.height, asset.sha256],
  );
  return result.affectedRows === 1;
}

async function raw(id, connection = pool) {
  const [[job]] = await connection.query('SELECT * FROM virtual_tryon_jobs WHERE id=?', [assertId(id)]);
  return job || null;
}

async function owned(id, owner) {
  const [[job]] = await pool.query('SELECT * FROM virtual_tryon_jobs WHERE id=? AND owner_hash=? AND deleted_at IS NULL', [assertId(id), owner.hash]);
  if (!job) throw new ApiError(404, 'عملیات پیدا نشد.');
  return job;
}

async function assets(id, connection = pool) {
  const [rows] = await connection.query('SELECT * FROM virtual_tryon_files WHERE job_id=?', [id]);
  return rows;
}

function assetDto(asset, jobId, admin = false) {
  return {
    id: asset.id, kind: asset.kind, mime: asset.mime, extension: asset.extension,
    width: asset.width, height: asset.height, byte_size: asset.byte_size,
    url: (admin ? '/api/admin/tryon/jobs/' : '/api/tryon/jobs/') + jobId + '/images/' + asset.kind,
  };
}

async function dto(job, { admin = false, suppliedAssets, suppliedLegacy } = {}) {
  const files = suppliedAssets || await assets(job.id);
  if (job.legacy_usage_id && !job.deleted_at) {
    const [[legacy]] = suppliedLegacy ? [[suppliedLegacy]] : await pool.query(
      'SELECT id,(LENGTH(input_image)>0) AS has_input,(LENGTH(product_image)>0) AS has_product,(LENGTH(output_image)>0) AS has_output FROM pro_usages WHERE id=?', [job.legacy_usage_id],
    );
    for (const kind of ['input', 'product', 'output']) {
      if (legacy?.['has_' + kind] && !files.some((file) => file.kind === kind)) files.push({ kind, mime: null, extension: null, width: null, height: null, byte_size: null });
    }
  }
  const expires = job.diagnostics_expires_at && new Date(job.diagnostics_expires_at).getTime() > Date.now();
  const response = {
    id: job.id, product_id: job.product_id, product_title: job.product_title, product_slug: job.product_slug,
    image_index: job.image_index, variant_id: job.variant_id, status: job.status, stage: job.stage,
    progress: job.progress == null ? null : Number(job.progress),
    indeterminate: job.status === 'processing', created_at: job.created_at, started_at: job.started_at,
    completed_at: job.completed_at, attempts_count: job.attempts_count,
    retryable: Boolean(job.retryable) && !job.needs_reconciliation && job.retry_count < 3
      && (!job.retry_after || new Date(job.retry_after).getTime() <= Date.now()),
    retry_after: job.retry_after, needs_reconciliation: Boolean(job.needs_reconciliation),
    error_code: job.error_code, error_message: job.error_message,
    service_name: job.successful_provider_name, model: job.model, legacy: Boolean(job.legacy_usage_id),
    images: Object.fromEntries(files.filter((file) => admin || file.kind !== 'output' || job.status === 'completed').map((file) => [file.kind, assetDto(file, job.id, admin)])),
    duration_ms: job.started_at && job.completed_at ? Math.max(0, new Date(job.completed_at) - new Date(job.started_at)) : null,
  };
  if (admin) {
    response.user_id = job.user_id;
    response.owner_kind = job.owner_kind;
    response.seller_id = job.seller_id;
    response.device = expires && job.diagnostics_consent ? parse(job.device_json, null) : null;
    response.network = expires && job.diagnostics_consent && job.network_ciphertext ? parse(unseal(job.network_ciphertext, 'network:' + job.id), null) : null;
    response.diagnostics_consent = Boolean(job.diagnostics_consent);
    response.diagnostics_expires_at = job.diagnostics_expires_at;
    const [[user]] = job.user_id ? await pool.query('SELECT id,fullname,mobile,email FROM users WHERE id=?', [job.user_id]) : [[]];
    response.user = user || null;
    const [[count]] = await pool.query('SELECT COUNT(*) AS total FROM virtual_tryon_jobs WHERE owner_hash=? AND id<>?', [job.owner_hash, job.id]);
    response.previous_operations = job.owner_kind === 'legacy' ? null : Number(count.total);
    const [attempts] = await pool.query(
      'SELECT sequence_no,provider_id,provider_name,model,state,request_id,error_code,technical_message,recoverable,uncertain,retry_after_seconds,cost_amount,cost_currency,started_at,completed_at,duration_ms FROM virtual_tryon_attempts WHERE job_id=? ORDER BY sequence_no',
      [job.id],
    );
    response.attempts = attempts;
  }
  return response;
}

async function reserve(connection, sellerId) {
  const summary = await entitlements.getSummary(sellerId, connection, { lock: true, requireSeller: true });
  const subscription = summary.subscriptions.find((item) => item.available_tokens > 0);
  if (subscription) return { quota_source: 'subscription', subscription_id: subscription.id, package_id: subscription.package_id };
  if (summary.tokens_available > 0 && summary.purchased_tokens_remaining > 0) return { quota_source: 'purchased', subscription_id: null, package_id: null };
  throw new ApiError(402, 'اعتبار پرو آنلاین این فروشگاه تمام شده است؛ برای مشتری هزینه‌ای ثبت نمی‌شود.');
}

async function create({ id, owner, product, store, inputAsset, productAsset, imageIndex, key, telemetry, legacyUploadId = null, legacyEndpoint = null }) {
  requestKey(key);
  const hash = digest([product.id, imageIndex, inputAsset.sha256, productAsset.sha256].join(':'));
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // All reservation/finalization paths acquire the same payer lock before any job lock.
    const [[payer]] = await connection.query('SELECT id FROM users WHERE id=? FOR UPDATE', [product.seller_id]);
    if (!payer) throw new ApiError(404, 'فروشگاه پیدا نشد.');
    const [[existing]] = await connection.query('SELECT * FROM virtual_tryon_jobs WHERE owner_hash=? AND request_key=?', [owner.hash, key]);
    if (existing) {
      if (existing.deleted_at || existing.request_hash !== hash) throw new ApiError(409, 'این شناسه قبلاً استفاده شده است؛ درخواست تازه باید شناسه جدید داشته باشد.');
      await connection.commit();
      return { job: existing, reused: true };
    }
    const [[uncertain]] = await connection.query(
      'SELECT * FROM virtual_tryon_jobs WHERE owner_hash=? AND request_hash=? AND needs_reconciliation=1 ORDER BY created_at DESC LIMIT 1',
      [owner.hash, hash],
    );
    if (uncertain) {
      if (uncertain.deleted_at) throw new ApiError(409, 'پاسخ درخواست قبلی برای همین ورودی هنوز قطعی نشده است؛ پیش از ارسال دوباره با پشتیبانی و شناسه عملیات قبلی پیگیری کنید.');
      await connection.commit();
      return { job: uncertain, reused: true };
    }
    const [[active]] = await connection.query('SELECT id FROM virtual_tryon_jobs WHERE active_owner_key=?', [owner.hash]);
    if (active) {
      const error = new ApiError(409, 'یک عملیات شما هنوز در حال پردازش است.');
      error.code = 'TRYON_ALREADY_ACTIVE';
      error.jobId = active.id;
      throw error;
    }
    const quota = await reserve(connection, product.seller_id);
    await connection.query(
      `INSERT INTO virtual_tryon_jobs(id,owner_hash,owner_kind,user_id,seller_id,product_id,product_title,product_slug,image_index,
       request_key,request_hash,active_owner_key,status,stage,progress,credit_reserved,quota_source,subscription_id,package_id,
       device_json,network_ciphertext,diagnostics_consent,diagnostics_expires_at,legacy_upload_id,legacy_endpoint)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'validating',1,25,1,?,?,?,?,?,?,IF(?=1,DATE_ADD(NOW(),INTERVAL 7 DAY),NULL),?,?)`,
      [id, owner.hash, owner.kind, owner.userId, product.seller_id, product.id, product.title, store.slug, imageIndex,
        key, hash, owner.hash, quota.quota_source, quota.subscription_id, quota.package_id,
        telemetry.device ? JSON.stringify(telemetry.device) : null, telemetry.network, telemetry.consent ? 1 : 0, telemetry.consent ? 1 : 0,
        legacyUploadId, legacyEndpoint],
    );
    await connection.query("UPDATE virtual_tryon_jobs SET reserved_at=NOW(3),processing_consent_at=IF(?=1,NOW(3),NULL),privacy_version=IF(?=1,'tryon-2026-11-01',NULL) WHERE id=?", [legacyUploadId ? 0 : 1, legacyUploadId ? 0 : 1, id]);
    await addAsset(connection, id, 'input', inputAsset);
    await addAsset(connection, id, 'product', productAsset);
    if (legacyUploadId) {
      const [changed] = await connection.query(
        "UPDATE pro_uploads SET tryon_job_id=? WHERE id=? AND visitor_hash=? AND status='uploaded' AND tryon_job_id IS NULL",
        [id, legacyUploadId, owner.hash],
      );
      if (!changed.affectedRows) throw new ApiError(409, 'تصویر قبلاً در عملیات دیگری استفاده شده است.');
    }
    await connection.commit();
    return { job: await raw(id), reused: false };
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      const [[existing]] = await pool.query('SELECT * FROM virtual_tryon_jobs WHERE owner_hash=? AND request_key=?', [owner.hash, key]);
      if (existing && existing.request_hash === hash) return { job: existing, reused: true };
      const [[active]] = await pool.query('SELECT id FROM virtual_tryon_jobs WHERE active_owner_key=?', [owner.hash]);
      if (active) {
        const conflict = new ApiError(409, 'یک عملیات شما هنوز در حال پردازش است.');
        conflict.code = 'TRYON_ALREADY_ACTIVE'; conflict.jobId = active.id; throw conflict;
      }
      throw new ApiError(409, 'شناسه این درخواست قبلاً ثبت شده است.');
    }
    throw error;
  } finally { connection.release(); }
}

async function history(owner, query = {}) {
  const pagination = pageOf(query);
  const [[latest]] = await pool.query(
    "SELECT * FROM virtual_tryon_jobs WHERE owner_hash=? AND status='completed' AND deleted_at IS NULL ORDER BY completed_at DESC,id DESC LIMIT 1", [owner.hash],
  );
  const [[active]] = await pool.query('SELECT * FROM virtual_tryon_jobs WHERE active_owner_key=? AND deleted_at IS NULL', [owner.hash]);
  const except = [latest?.id || '', active?.id || ''];
  const [[total]] = await pool.query('SELECT COUNT(*) AS total FROM virtual_tryon_jobs WHERE owner_hash=? AND deleted_at IS NULL AND id NOT IN (?,?)', [owner.hash, ...except]);
  const [rows] = await pool.query(
    'SELECT * FROM virtual_tryon_jobs WHERE owner_hash=? AND deleted_at IS NULL AND id NOT IN (?,?) ORDER BY COALESCE(completed_at,created_at) DESC,id DESC LIMIT ? OFFSET ?',
    [owner.hash, ...except, pagination.limit, pagination.offset],
  );
  const all = [latest, active, ...rows].filter(Boolean);
  let fileRows = [];
  if (all.length) [fileRows] = await pool.query('SELECT * FROM virtual_tryon_files WHERE job_id IN (' + all.map(() => '?').join(',') + ')', all.map((job) => job.id));
  const legacyIds = all.filter((job) => job.legacy_usage_id).map((job) => job.legacy_usage_id);
  let legacyRows = [];
  if (legacyIds.length) [legacyRows] = await pool.query('SELECT id,(LENGTH(input_image)>0) AS has_input,(LENGTH(product_image)>0) AS has_product,(LENGTH(output_image)>0) AS has_output FROM pro_usages WHERE id IN (' + legacyIds.map(() => '?').join(',') + ')', legacyIds);
  const publicJob = (job) => dto(job, { suppliedAssets: fileRows.filter((file) => file.job_id === job.id), suppliedLegacy: legacyRows.find((row) => row.id === job.legacy_usage_id) });
  return {
    latest: latest ? await publicJob(latest) : null, active_job: active ? await publicJob(active) : null,
    items: await Promise.all(rows.map(publicJob)),
    pagination: { page: pagination.page, pageSize: pagination.limit, total: Number(total.total), totalPages: Math.max(1, Math.ceil(Number(total.total) / pagination.limit)) },
  };
}

function filters(query = {}) {
  const clauses = [], params = [];
  if (query.status) {
    if (![...ACTIVE_STATES, 'completed', 'failed', 'timed_out', 'cancelled'].includes(query.status)) throw new ApiError(400, 'وضعیت معتبر نیست.');
    clauses.push('j.status=?'); params.push(query.status);
  }
  if (query.provider) {
    if (!['1', '2', '3', 'legacy'].includes(String(query.provider))) throw new ApiError(400, 'سرویس معتبر نیست.');
    if (query.provider === 'legacy') clauses.push('j.legacy_usage_id IS NOT NULL');
    else { clauses.push('(j.successful_provider_id=? OR EXISTS(SELECT 1 FROM virtual_tryon_attempts a WHERE a.job_id=j.id AND a.provider_id=?))'); params.push(Number(query.provider), Number(query.provider)); }
  }
  if (query.q) {
    if (typeof query.q !== 'string' || query.q.length > 120) throw new ApiError(400, 'عبارت جستجو معتبر نیست.');
    const q = '%' + query.q.replace(/[\\%_]/g, '\\$&') + '%';
    clauses.push('(j.id LIKE ? OR u.fullname LIKE ? OR u.mobile LIKE ? OR u.email LIKE ? OR CAST(j.user_id AS CHAR)=?)');
    params.push(q, q, q, q, query.q);
  }
  for (const [field, operator] of [['from', '>='], ['to', '<']]) {
    if (!query[field]) continue;
    const value = query[field];
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError(400, 'تاریخ معتبر نیست.');
    const parsed = new Date(value + 'T00:00:00Z');
    if (!Number.isFinite(parsed.getTime()) || parsed.getUTCFullYear() < 1970 || parsed.getUTCFullYear() > 9998 || parsed.toISOString().slice(0, 10) !== value) throw new ApiError(400, 'تاریخ معتبر نیست.');
    if (field === 'to') parsed.setUTCDate(parsed.getUTCDate() + 1);
    clauses.push('j.created_at' + operator + '?'); params.push(parsed.toISOString().slice(0, 10));
  }
  if (query.from && query.to && query.from > query.to) throw new ApiError(400, 'بازه تاریخ معتبر نیست.');
  return { where: clauses.length ? ' WHERE ' + clauses.join(' AND ') : '', params };
}

async function adminList(query = {}) {
  const filter = filters(query), pagination = pageOf(query);
  const joins = ' FROM virtual_tryon_jobs j LEFT JOIN users u ON u.id=j.user_id';
  const [[totals]] = await pool.query(
    "SELECT COUNT(*) AS total,SUM(j.status='completed') AS successful,SUM(j.status IN ('failed','timed_out')) AS failed,SUM(j.status IN ('validating','processing','saving')) AS active" + joins + filter.where, filter.params,
  );
  const [rows] = await pool.query(
    'SELECT j.id,j.user_id,u.fullname AS user_name,j.product_id,j.product_title,j.status,j.stage,j.progress,j.attempts_count,j.successful_provider_name,j.legacy_usage_id,j.created_at,j.started_at,j.completed_at'
      + joins + filter.where + ' ORDER BY j.created_at DESC,j.id DESC LIMIT ? OFFSET ?', [...filter.params, pagination.limit, pagination.offset],
  );
  return {
    items: rows,
    totals: { total: Number(totals.total), successful: Number(totals.successful || 0), failed: Number(totals.failed || 0), active: Number(totals.active || 0) },
    pagination: { page: pagination.page, pageSize: pagination.limit, total: Number(totals.total), totalPages: Math.max(1, Math.ceil(Number(totals.total) / pagination.limit)) },
  };
}

async function claim() {
  const [rows] = await pool.query(
    "SELECT id FROM virtual_tryon_jobs WHERE deleted_at IS NULL AND status IN ('validating','saving') AND lock_token IS NULL AND credit_reserved=1 ORDER BY created_at LIMIT 8",
  );
  for (const row of rows) {
    const token = uuid();
    const [result] = await pool.query(
      "UPDATE virtual_tryon_jobs SET lock_token=?,lease_until=DATE_ADD(NOW(),INTERVAL 90 SECOND),started_at=COALESCE(started_at,NOW(3)) WHERE id=? AND deleted_at IS NULL AND lock_token IS NULL AND status IN ('validating','saving')",
      [token, row.id],
    );
    if (result.affectedRows) return raw(row.id);
  }
  return null;
}

async function heartbeat(job) {
  const [changed] = await pool.query('UPDATE virtual_tryon_jobs SET lease_until=DATE_ADD(NOW(),INTERVAL 90 SECOND) WHERE id=? AND lock_token=? AND deleted_at IS NULL', [job.id, job.lock_token]);
  if (!changed.affectedRows) throw new ApiError(409, 'اجازه پردازش این عملیات پایان یافته است.');
}

async function transition(job, status, stage, progress) {
  const [result] = await pool.query('UPDATE virtual_tryon_jobs SET status=?,stage=?,progress=? WHERE id=? AND lock_token=? AND deleted_at IS NULL',
    [status, stage, progress, job.id, job.lock_token]);
  if (!result.affectedRows) throw new ApiError(409, 'وضعیت عملیات تغییر کرده است.');
}

async function assertDispatch(job) {
  const [[row]] = await pool.query(
    'SELECT j.lock_token,j.deleted_at,u.role,u.status,u.seller_verification_status FROM virtual_tryon_jobs j LEFT JOIN users u ON u.id=j.seller_id WHERE j.id=?', [job.id],
  );
  if (!row || row.deleted_at || row.lock_token !== job.lock_token || row.role !== 'Seller' || row.status !== 'active' || row.seller_verification_status !== 'approved') {
    throw new ApiError(403, 'اجازه اجرای این عملیات معتبر نیست.');
  }
}

async function attemptStarted(job, provider) {
  const id = uuid();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[current]] = await connection.query('SELECT attempts_count,lock_token FROM virtual_tryon_jobs WHERE id=? FOR UPDATE', [job.id]);
    if (current?.lock_token !== job.lock_token) throw new ApiError(409, 'اجازه اجرای عملیات پایان یافته است.');
    const sequence = Number(current.attempts_count) + 1;
    await connection.query("INSERT INTO virtual_tryon_attempts(id,job_id,sequence_no,provider_id,provider_name,model,state) VALUES(?,?,?,?,?,?,'requesting')",
      [id, job.id, sequence, provider.id, provider.name, provider.model || null]);
    await connection.query('UPDATE virtual_tryon_jobs SET attempts_count=? WHERE id=?', [sequence, job.id]);
    await connection.commit();
    return id;
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}

async function attemptFinished(id, result) {
  await pool.query(
    'UPDATE virtual_tryon_attempts SET state=?,request_id=?,error_code=?,technical_message=?,recoverable=?,uncertain=?,retry_after_seconds=?,completed_at=NOW(3),duration_ms=TIMESTAMPDIFF(MICROSECOND,started_at,NOW(3)) DIV 1000 WHERE id=? AND completed_at IS NULL',
    [result.state || (result.success ? 'succeeded' : 'failed'), result.requestId || null, result.code || null,
      result.success ? null : String(result.code || 'PROVIDER_FAILURE').slice(0, 80),
      result.recoverable ? 1 : 0, result.uncertain ? 1 : 0, result.retryAfter || null, id],
  );
}

async function rememberOutput(job, provider, source = null) {
  if (source) {
    await pool.query('UPDATE virtual_tryon_jobs SET provider_output_ciphertext=? WHERE id=? AND lock_token=?',
      [seal(JSON.stringify({ source, provider: { id: provider.id, name: provider.name, model: provider.model || null, options: { output_hosts: provider.options?.output_hosts || [] }, endpoint: provider.endpoint } }), 'output:' + job.id), job.id, job.lock_token]);
    return;
  }
  await pool.query(
    'UPDATE virtual_tryon_jobs SET successful_provider_id=?,successful_provider_name=?,model=?,provider_output_ciphertext=? WHERE id=? AND lock_token=?',
    [provider.id, provider.name, provider.model || null, source ? seal(source, 'output:' + job.id) : null, job.id, job.lock_token],
  );
}

async function forgetOutput(job) {
  await pool.query('UPDATE virtual_tryon_jobs SET provider_output_ciphertext=NULL WHERE id=? AND lock_token=?', [job.id, job.lock_token]);
}

const messages = {
  SAFETY_REJECTED: 'سرویس، این تصویر را نپذیرفت. تصویر مناسب دیگری انتخاب کنید.',
  INPUT_REJECTED: 'تصویر برای سرویس قابل پردازش نیست. تصویر واضح دیگری انتخاب کنید.',
  STORE_CREDIT_REQUIRED: 'اعتبار این فروشگاه کافی نیست؛ هزینه‌ای از مشتری دریافت نشده است.',
  PROVIDER_TIMEOUT: 'مهلت پاسخ سرویس پایان یافت. برای جلوگیری از تولید تکراری، این عملیات نیاز به بررسی دارد.',
  OUTPUT_FETCH_FAILED: 'دریافت فایل خروجی کامل نشد. تلاش مجدد همان فایل را بازیابی می‌کند.',
  SAVE_FAILED: 'ذخیره خروجی کامل نشد؛ تلاش مجدد، تصویر ذخیره‌شده را بازیابی می‌کند.',
  OUTPUT_STORAGE_FAILED: 'پاسخ سرویس دریافت شد اما نگهداری فایل کامل نشد. برای جلوگیری از هزینه یا تولید تکراری، این عملیات باید توسط پشتیبانی بررسی شود.',
};

async function fail(job, error) {
  const code = /^[A-Z0-9_]{1,80}$/.test(error.code || '') ? error.code : 'TRYON_FAILED';
  await pool.query(
    `UPDATE virtual_tryon_jobs SET status=?,error_code=?,error_message=?,retryable=?,needs_reconciliation=?,
      retry_after=IF(? > 0,DATE_ADD(NOW(),INTERVAL ? SECOND),NULL),credit_reserved=0,active_owner_key=NULL,
      completed_at=NOW(3),lock_token=NULL,lease_until=NULL
      WHERE id=? AND lock_token=? AND status<>'completed'`,
    [code === 'PROVIDER_TIMEOUT' || error.uncertain ? 'timed_out' : 'failed', code,
      messages[code] || 'ساخت پرو کامل نشد. در صورت امکان، دوباره تلاش کنید.',
      error.recoverable && !error.uncertain ? 1 : 0, error.uncertain ? 1 : 0,
      error.retryAfter || 0, error.retryAfter || 0, job.id, job.lock_token],
  );
}

async function finalize(job) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[seller]] = await connection.query('SELECT id,status,role,seller_verification_status FROM users WHERE id=? FOR UPDATE', [job.seller_id]);
    const [[current]] = await connection.query('SELECT * FROM virtual_tryon_jobs WHERE id=? FOR UPDATE', [job.id]);
    if (current?.status === 'completed') { await connection.commit(); return current; }
    if (!current || current.lock_token !== job.lock_token || !current.credit_reserved || current.deleted_at) throw new ApiError(409, 'اجازه ثبت عملیات معتبر نیست.');
    if (!seller || seller.status !== 'active' || seller.role !== 'Seller' || seller.seller_verification_status !== 'approved') throw new ApiError(403, 'فروشگاه اجازه ثبت مصرف ندارد.');
    const files = await assets(job.id, connection);
    if (!files.some((file) => file.kind === 'output')) throw new ApiError(409, 'فایل خروجی هنوز ذخیره نشده است.');
    const [usage] = await connection.query(
      `INSERT INTO pro_usages(user_id,package_id,product_id,amount,status,description,input_image,product_image,output_image,
       is_free_trial,quota_user_id,subscription_id,quota_source,visitor_hash,tryon_job_id,created_at,completed_at)
       VALUES(?,?,?,0,'success',?,?,?,?,0,?,?,?,?,?,?,NOW(3))`,
      [current.user_id, current.package_id, current.product_id, 'پرو آنلاین برای محصول «' + current.product_title + '»',
        'tryon://' + current.id + '/input', 'tryon://' + current.id + '/product', 'tryon://' + current.id + '/output',
        current.seller_id, current.subscription_id, current.quota_source, current.owner_hash, current.id, current.reserved_at || current.created_at],
    );
    if (current.legacy_upload_id) await connection.query("UPDATE pro_uploads SET status='used',used_at=NOW() WHERE id=?", [current.legacy_upload_id]);
    await connection.query(
      "UPDATE virtual_tryon_attempts SET state='succeeded',request_id=COALESCE(request_id,?),error_code=NULL,technical_message=NULL,completed_at=COALESCE(completed_at,NOW(3)),duration_ms=COALESCE(duration_ms,TIMESTAMPDIFF(MICROSECOND,started_at,NOW(3)) DIV 1000) WHERE job_id=? AND state IN ('requesting','response_received')",
      [job.completionRequestId || null, current.id],
    );
    await connection.query(
      `UPDATE virtual_tryon_jobs SET status='completed',stage=4,progress=100,usage_id=?,credit_reserved=0,active_owner_key=NULL,
       completed_at=NOW(3),retryable=0,error_code=NULL,error_message=NULL,provider_output_ciphertext=NULL,lock_token=NULL,lease_until=NULL
       WHERE id=?`, [usage.insertId, current.id],
    );
    await connection.query('INSERT INTO notifications(user_id,title,body,type,related_id,is_read) VALUES(?,?,?,?,?,0)',
      [current.seller_id, 'درخواست پرو آنلاین جدید', 'برای محصول «' + current.product_title + '» یک پرو موفق ثبت شد.', 'pro_usage', usage.insertId]);
    await connection.commit();
    return raw(current.id);
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}

async function retry(id, owner, key) {
  requestKey(key);
  const initial = await owned(id, owner);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('SELECT id FROM users WHERE id=? FOR UPDATE', [initial.seller_id]);
    const [[job]] = await connection.query('SELECT * FROM virtual_tryon_jobs WHERE id=? AND owner_hash=? FOR UPDATE', [id, owner.hash]);
    if (job.last_retry_key === key || job.status === 'completed' || ACTIVE_STATES.includes(job.status)) { await connection.commit(); return job; }
    if (!job.retryable || job.needs_reconciliation || job.retry_count >= 3 || job.deleted_at) throw new ApiError(409, 'این عملیات امکان تلاش مجدد امن ندارد.');
    if (job.retry_after && new Date(job.retry_after).getTime() > Date.now()) throw new ApiError(429, 'زمان مجاز تلاش مجدد هنوز نرسیده است.');
    const quota = await reserve(connection, job.seller_id);
    const [[other]] = await connection.query('SELECT id FROM virtual_tryon_jobs WHERE active_owner_key=?', [owner.hash]);
    if (other) throw new ApiError(409, 'یک عملیات دیگر هنوز در حال اجرا است.');
    const outputFiles = await assets(job.id, connection);
    const saving = outputFiles.some((file) => file.kind === 'output') || Boolean(job.provider_output_ciphertext);
    await connection.query(
      `UPDATE virtual_tryon_jobs SET status=?,stage=?,progress=?,active_owner_key=?,credit_reserved=1,quota_source=?,subscription_id=?,package_id=?,
        retry_count=retry_count+1,last_retry_key=?,reserved_at=NOW(3),error_code=NULL,error_message=NULL,retryable=0,retry_after=NULL,completed_at=NULL,
        lock_token=NULL,lease_until=NULL WHERE id=?`,
      [saving ? 'saving' : 'validating', saving ? 3 : 1, saving ? 50 : 25, owner.hash,
        quota.quota_source, quota.subscription_id, quota.package_id, key, id],
    );
    await connection.commit();
    return raw(id);
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}

async function recoveryCandidates() {
  const [rows] = await pool.query("SELECT id FROM virtual_tryon_jobs WHERE status='processing' AND deleted_at IS NULL AND lease_until<NOW() ORDER BY lease_until LIMIT 50");
  return rows.map((row) => row.id);
}

async function recover(stagedIds = []) {
  await pool.query(
    "UPDATE virtual_tryon_jobs SET status='failed',error_code='ACCOUNT_REMOVED',error_message='حساب حذف شده است.',credit_reserved=0,active_owner_key=NULL,lock_token=NULL,lease_until=NULL,completed_at=NOW(3) WHERE deleted_at IS NOT NULL AND status IN ('validating','processing','saving') AND (lock_token IS NULL OR lease_until<NOW())",
  );
  if (stagedIds.length) {
    await pool.query(
      "UPDATE virtual_tryon_jobs SET status='saving',stage=3,progress=50,lock_token=NULL,lease_until=NULL WHERE id IN (" + stagedIds.map(() => '?').join(',') + ") AND deleted_at IS NULL AND lease_until<NOW() AND status='processing'",
      stagedIds,
    );
  }
  await pool.query(
    `UPDATE virtual_tryon_jobs j SET status='saving',stage=3,progress=50,lock_token=NULL,lease_until=NULL
     WHERE j.deleted_at IS NULL AND j.lease_until<NOW() AND j.status='processing' AND (j.provider_output_ciphertext IS NOT NULL
       OR EXISTS(SELECT 1 FROM virtual_tryon_files f WHERE f.job_id=j.id AND f.kind='output'))`,
  );
  await pool.query(
    `UPDATE virtual_tryon_jobs j SET status='validating',lock_token=NULL,lease_until=NULL
     WHERE j.lease_until<NOW() AND j.status='processing'
       AND NOT EXISTS(SELECT 1 FROM virtual_tryon_attempts a WHERE a.job_id=j.id)`,
  );
  // A process that died after dispatch cannot safely be replayed against a synchronous provider.
  await pool.query(
    `UPDATE virtual_tryon_jobs j SET status='timed_out',error_code='PROVIDER_TIMEOUT',
      error_message=?,needs_reconciliation=1,retryable=0,credit_reserved=0,active_owner_key=NULL,
      lock_token=NULL,lease_until=NULL,completed_at=NOW(3)
     WHERE j.lease_until<NOW() AND j.status='processing'`, [messages.PROVIDER_TIMEOUT],
  );
  await pool.query(
    "UPDATE virtual_tryon_attempts a JOIN virtual_tryon_jobs j ON j.id=a.job_id SET a.state='interrupted',a.uncertain=1,a.error_code='PROVIDER_TIMEOUT',a.completed_at=NOW(3),a.duration_ms=TIMESTAMPDIFF(MICROSECOND,a.started_at,NOW(3)) DIV 1000 WHERE j.needs_reconciliation=1 AND a.completed_at IS NULL",
  );
  await pool.query(
    "UPDATE virtual_tryon_jobs SET lock_token=NULL,lease_until=NULL WHERE lease_until<NOW() AND status IN ('validating','saving')",
  );
  await pool.query('UPDATE virtual_tryon_jobs SET device_json=NULL,network_ciphertext=NULL WHERE diagnostics_expires_at<NOW() AND (device_json IS NOT NULL OR network_ciphertext IS NOT NULL)');
}

async function erase(id, owner) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[job]] = await connection.query('SELECT * FROM virtual_tryon_jobs WHERE id=? AND owner_hash=? AND deleted_at IS NULL FOR UPDATE', [id, owner.hash]);
    if (!job) throw new ApiError(404, 'عملیات پیدا نشد.');
    if (ACTIVE_STATES.includes(job.status)) throw new ApiError(409, 'تا پایان عملیات، حذف تصاویر ممکن نیست.');
    await connection.query('UPDATE virtual_tryon_jobs SET deleted_at=NOW(3),device_json=NULL,network_ciphertext=NULL WHERE id=?', [id]);
    await connection.commit();
    return job;
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}

module.exports = {
  uuid, requestKey, pageOf, raw, owned, assets, addAsset, dto, create, history, filters, adminList, claim,
  heartbeat, transition, assertDispatch, attemptStarted, attemptFinished, rememberOutput, forgetOutput, fail, finalize, retry, recoveryCandidates, recover, erase, audit,
};
