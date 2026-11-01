const pool = require('../config/database');
const ApiError = require('../utils/apiError');
const { seal, unseal } = require('./config');
const network = require('./network');

const adapters = ['rookhposh_multipart', 'multipart', 'json_images', 'openai_edit'];
const parse = (value, fallback = {}) => {
  try { return typeof value === 'string' ? JSON.parse(value) : value || fallback; } catch { return fallback; }
};
const cleanText = (value, max = 160) => typeof value === 'string' && value.trim().length <= max
  && !Array.from(value).some((c) => c.charCodeAt(0) < 32) ? value.trim() : '';

async function audit(actorId, action, targetId, details = {}, connection = pool) {
  await connection.query('INSERT INTO virtual_tryon_audit(actor_id,action,target_id,details_json) VALUES(?,?,?,?)',
    [actorId, action, targetId == null ? null : String(targetId), JSON.stringify(details)]);
}

function publicProvider(row) {
  return {
    id: row.id, name: row.name, adapter: row.adapter, endpoint: row.endpoint, model: row.model || '',
    enabled: Boolean(row.enabled), priority: row.priority, timeout_seconds: row.timeout_seconds,
    retry_limit: row.retry_limit, options: parse(row.options_json), has_api_key: Boolean(row.secret_ciphertext),
    api_key_mask: row.secret_ciphertext ? '••••••••' : '', cooldown_until: row.cooldown_until,
    last_error_code: row.last_error_code, updated_at: row.updated_at,
  };
}

async function list() {
  const [rows] = await pool.query('SELECT * FROM virtual_tryon_providers ORDER BY priority,id');
  return rows.map(publicProvider);
}

async function active() {
  const [rows] = await pool.query('SELECT * FROM virtual_tryon_providers WHERE enabled=1 AND (cooldown_until IS NULL OR cooldown_until<=NOW()) ORDER BY priority,id');
  const result = [];
  for (const row of rows) {
    const options = parse(row.options_json);
    try { result.push({ ...row, options, apiKey: unseal(row.secret_ciphertext, 'provider:' + row.id) }); }
    catch {
      await failed(row.id, 'PROVIDER_SECRET', 600);
      if (options.allow_auth_failover === false) throw new ApiError(503, 'تنظیمات سرویس پرو نیاز به بررسی مدیریت دارد.');
    }
  }
  return result;
}

function optionsOf(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'تنظیمات فرمت درخواست معتبر نیست.');
  const allowed = new Set(['person_field', 'cloth_field', 'output_hosts', 'prompt', 'allow_auth_failover']);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new ApiError(400, 'گزینه تنظیمات پشتیبانی نمی‌شود.');
  const output = {};
  for (const name of ['person_field', 'cloth_field']) {
    if (value[name] != null) {
      if (typeof value[name] !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(value[name])) throw new ApiError(400, 'نام فیلد تصویر معتبر نیست.');
      output[name] = value[name];
    }
  }
  if (value.output_hosts != null) {
    if (!Array.isArray(value.output_hosts) || value.output_hosts.length > 10) throw new ApiError(400, 'فهرست منابع خروجی معتبر نیست.');
    output.output_hosts = [...new Set(value.output_hosts.map((host) => {
      if (typeof host !== 'string' || !/^[A-Za-z0-9.-]{1,253}$/.test(host)) throw new ApiError(400, 'نام میزبان تصویر معتبر نیست.');
      network.parseEndpoint('https://' + host);
      return host.toLowerCase();
    }))];
  }
  if (value.prompt != null) {
    output.prompt = cleanText(value.prompt, 1000);
    if (!output.prompt) throw new ApiError(400, 'راهنمای مدل معتبر نیست.');
  }
  if (value.allow_auth_failover != null) {
    if (typeof value.allow_auth_failover !== 'boolean') throw new ApiError(400, 'تنظیم Failover معتبر نیست.');
    output.allow_auth_failover = value.allow_auth_failover;
  }
  return output;
}

async function save(id, input, actorId) {
  if (![1, 2, 3].includes(Number(id))) throw new ApiError(400, 'حداکثر سه سرویس قابل تعریف است.');
  const name = cleanText(input.name, 120);
  const model = cleanText(input.model || '', 160);
  if (!name || !adapters.includes(input.adapter) || typeof input.enabled !== 'boolean') throw new ApiError(400, 'نام، نوع یا وضعیت سرویس معتبر نیست.');
  const endpoint = network.parseEndpoint(input.endpoint).href;
  const priority = Number(input.priority);
  const timeout = Number(input.timeout_seconds);
  const retries = Number(input.retry_limit);
  if (!Number.isInteger(priority) || priority < 1 || priority > 3 || !Number.isInteger(timeout) || timeout < 5 || timeout > 600
      || !Number.isInteger(retries) || retries < 0 || retries > 2 || (input.adapter === 'openai_edit' && !model)) {
    throw new ApiError(400, 'اولویت، مهلت پاسخ یا تعداد تلاش معتبر نیست.');
  }
  const options = optionsOf(input.options || {});
  if (input.api_key != null && (typeof input.api_key !== 'string' || input.api_key.length > 2048
      || (input.api_key && !cleanText(input.api_key, 2048)))) throw new ApiError(400, 'کلید سرویس معتبر نیست.');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[previous]] = await connection.query('SELECT secret_ciphertext FROM virtual_tryon_providers WHERE id=? FOR UPDATE', [id]);
    const ciphertext = input.clear_api_key === true ? null
      : input.api_key ? seal(input.api_key.trim(), 'provider:' + id) : previous?.secret_ciphertext || null;
    await connection.query(
      `INSERT INTO virtual_tryon_providers(id,name,adapter,endpoint,model,secret_ciphertext,enabled,priority,timeout_seconds,retry_limit,options_json,updated_by)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),adapter=VALUES(adapter),endpoint=VALUES(endpoint),
       model=VALUES(model),secret_ciphertext=VALUES(secret_ciphertext),enabled=VALUES(enabled),priority=VALUES(priority),
       timeout_seconds=VALUES(timeout_seconds),retry_limit=VALUES(retry_limit),options_json=VALUES(options_json),
       updated_by=VALUES(updated_by),cooldown_until=NULL,consecutive_failures=0,last_error_code=NULL`,
      [id, name, input.adapter, endpoint, model || null, ciphertext, input.enabled ? 1 : 0, priority, timeout, retries, JSON.stringify(options), actorId],
    );
    await audit(actorId, 'provider.updated', id, { secret_changed: Boolean(input.api_key || input.clear_api_key), adapter: input.adapter }, connection);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  return (await list()).find((item) => Number(item.id) === Number(id));
}

async function connectionTest(id, actorId) {
  const [[row]] = await pool.query('SELECT * FROM virtual_tryon_providers WHERE id=?', [id]);
  if (!row) throw new ApiError(404, 'سرویس تنظیم نشده است.');
  const endpoint = network.parseEndpoint(row.endpoint);
  const key = unseal(row.secret_ciphertext, 'provider:' + id);
  const legacy = row.adapter === 'rookhposh_multipart';
  const response = await network.request(legacy ? new URL('/openapi.json', endpoint).href : endpoint.href, {
    method: legacy ? 'GET' : 'HEAD', timeoutMs: 10000, maxBytes: 1024 * 1024,
    headers: key ? { authorization: 'Bearer ' + key } : {},
  });
  let contractVerified = false;
  if (legacy && response.status === 200) {
    try {
      const document = JSON.parse(response.body);
      contractVerified = Boolean(document.paths?.['/try-on']?.post);
    } catch { contractVerified = false; }
  }
  await audit(actorId, 'provider.connection_test', id, { http_status: response.status, contract_verified: contractVerified });
  return {
    reachable: response.status < 500, http_status: response.status, contract_verified: contractVerified,
    generation_tested: false,
    message: 'این بررسی فقط دسترسی شبکه و قرارداد قابل‌مشاهده را می‌سنجد؛ تصویر تولید نمی‌کند.',
  };
}

async function failed(id, code, cooldownSeconds = 0) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[previous]] = await connection.query('SELECT name,consecutive_failures,last_error_code FROM virtual_tryon_providers WHERE id=? FOR UPDATE', [id]);
    const failures = Number(previous?.consecutive_failures || 0) + 1;
    const cooldown = Math.max(cooldownSeconds, failures >= 3 ? 60 : 0);
    await connection.query(
      'UPDATE virtual_tryon_providers SET consecutive_failures=?,last_error_code=?,cooldown_until=IF(? > 0,DATE_ADD(NOW(),INTERVAL ? SECOND),cooldown_until) WHERE id=?',
      [failures, code, cooldown, cooldown, id],
    );
    if (['PROVIDER_AUTH', 'PROVIDER_SECRET'].includes(code) && previous?.last_error_code !== code) {
      await connection.query(
        "INSERT INTO notifications(user_id,title,body,type,related_id,is_read) SELECT id,?,?, 'tryon_provider',?,0 FROM users WHERE role='Admin' AND status='active'",
        ['نیاز به بررسی تنظیمات سرویس پرو', 'کلید یا احراز هویت سرویس «' + (previous?.name || id) + '» نیاز به بررسی دارد و موقتاً از اجرا خارج شده است.', id],
      );
    }
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}

async function succeeded(id) {
  await pool.query('UPDATE virtual_tryon_providers SET consecutive_failures=0,last_error_code=NULL,cooldown_until=NULL WHERE id=?', [id]);
}

module.exports = { list, active, save, connectionTest, failed, succeeded, audit, publicProvider, parse, optionsOf, adapters };
