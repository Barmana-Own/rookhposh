const pool = require('../config/database');
const db = require('../repositories/dbStore');
const ApiError = require('../utils/apiError');
const store = require('./jobStore');
const images = require('./images');
const devices = require('./device');
const { digest, positiveId } = require('./identity');
const { audit } = require('./providers');

async function publicProduct(slug, productId) {
  const shop = await db.getStoreBySlug(slug);
  const product = await db.getProduct(positiveId(productId));
  if (!shop || !product || Number(product.seller_id) !== Number(shop.seller_id)
      || product.status !== 'active' || product.publish_status !== 'active') throw new ApiError(404, 'محصول عمومی پیدا نشد.');
  const [[seller]] = await pool.query('SELECT role,status,seller_verification_status FROM users WHERE id=?', [product.seller_id]);
  if (!seller || seller.role !== 'Seller' || seller.status !== 'active' || seller.seller_verification_status !== 'approved') throw new ApiError(403, 'این فروشگاه در حال حاضر اجازه ارائه پرو آنلاین ندارد.');
  return { product, shop };
}

async function start(req, { personBytes, legacyUpload, legacyEndpoint } = {}) {
  const { product, shop } = await publicProduct(req.params.slug, req.params.productId);
  const payload = req.body || {};
  if (!legacyUpload && payload.processing_consent !== true) throw new ApiError(400, 'برای پردازش و نگهداری خصوصی عکس، رضایت خود را ثبت کنید.');
  const key = store.requestKey(legacyUpload ? 'legacy-upload-' + String(legacyUpload.id).padStart(16, '0') : payload.request_key);
  const input = personBytes || images.fromDataUrl(payload.image);
  await images.inspect(input);
  const index = Number(payload.image_index ?? 0);
  if (!Number.isInteger(index) || index < 0 || index >= (product.images || []).length) throw new ApiError(400, 'مدل لباس انتخاب‌شده معتبر نیست.');
  const source = product.images[index];
  const allowedHosts = /^https?:\/\//.test(source) ? [new URL(source).hostname] : [];
  const garment = await images.loadSource(source, { allowedHosts });
  const id = store.uuid();
  const inputAsset = await images.store(input);
  let productAsset, committed = false;
  try {
    productAsset = await images.store(garment);
    const result = await store.create({
      id, owner: req.tryonOwner, product, store: shop, inputAsset, productAsset, imageIndex: index, key,
      telemetry: devices.collect(req, legacyUpload ? {} : payload, id),
      legacyUploadId: legacyUpload?.id || null, legacyEndpoint,
    });
    committed = !result.reused;
    return result.job;
  } finally {
    if (!committed) { await images.remove(inputAsset); if (productAsset) await images.remove(productAsset); }
  }
}

async function legacyFiles(job, kinds = ['input', 'product', 'output']) {
  if (!job.legacy_usage_id || job.deleted_at) return;
  const existing = await store.assets(job.id);
  const [[old]] = await pool.query('SELECT input_image,product_image,output_image FROM pro_usages WHERE id=?', [job.legacy_usage_id]);
  if (!old) return;
  for (const kind of kinds) {
    if (existing.some((file) => file.kind === kind) || !old[kind + '_image']) continue;
    let asset;
    try {
      asset = await images.store(await images.loadSource(old[kind + '_image']));
      if (!await store.addAsset(pool, job.id, kind, asset)) await images.remove(asset);
    } catch {
      if (asset) await images.remove(asset);
      // Preserve the old database record even when its external file is no longer available.
    }
  }
}

async function readJob(id, owner, adminId = null) {
  const job = adminId ? await store.raw(id) : await store.owned(id, owner);
  if (!job) throw new ApiError(404, 'عملیات پیدا نشد.');
  if (adminId) await audit(adminId, 'job.details_viewed', id);
  return store.dto(job, { admin: Boolean(adminId) });
}

async function history(owner, query) {
  return store.history(owner, query);
}

async function sendImage(req, res, { adminId = null } = {}) {
  const job = adminId ? await store.raw(req.params.id) : await store.owned(req.params.id, req.tryonOwner);
  if (!job || job.deleted_at) throw new ApiError(404, 'تصویر پیدا نشد.');
  const kind = req.params.kind;
  if (!['input', 'product', 'output'].includes(kind)) throw new ApiError(404, 'تصویر پیدا نشد.');
  if (!adminId && kind === 'output' && job.status !== 'completed') throw new ApiError(409, 'خروجی هنوز با ثبت مصرف نهایی نشده است.');
  if (adminId) await audit(adminId, req.query.download === '1' ? 'image.downloaded' : 'image.viewed', job.id, { kind });
  await legacyFiles(job, [kind]);
  const asset = (await store.assets(job.id)).find((file) => file.kind === kind);
  if (!asset) throw new ApiError(410, 'این فایل در سوابق قدیمی موجود نیست یا هنوز ساخته نشده است.');
  const bytes = await images.read(asset);
  const date = new Date(job.completed_at || job.created_at).toISOString().slice(0, 10);
  const filename = 'rookhposh-tryon-' + date + '-' + job.id + '-' + kind + '.' + asset.extension;
  res.set({
    'Content-Type': asset.mime, 'Content-Length': String(bytes.length), 'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': (req.query.download === '1' ? 'attachment' : 'inline') + '; filename="' + filename + '"',
    'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'Vary': 'Authorization, Cookie',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  res.end(bytes);
}

async function erase(id, owner) {
  await store.erase(id, owner);
  await require('./cleanup').purgeOne(id);
  return { deleted: true };
}

async function legacyUpload(req) {
  const { product } = await publicProduct(req.params.slug, req.params.productId);
  const bytes = images.fromDataUrl(req.body?.image);
  const info = await images.inspect(bytes);
  const [result] = await pool.query(
    'INSERT INTO pro_uploads(product_id,visitor_hash,file_name,image,status) VALUES(?,?,?,?,?)',
    [product.id, req.tryonOwner.hash, 'person.' + info.extension, req.body.image, 'uploaded'],
  );
  return { id: result.insertId };
}

async function legacyGenerate(req, res) {
  const contentType = String(req.headers['content-type'] || '');
  if (!contentType.startsWith('multipart/form-data;')) throw new ApiError(400, 'فرمت تصاویر ارسالی معتبر نیست.');
  let form;
  try { form = await new Request('http://localhost/try-on', { method: 'POST', body: req.body, headers: { 'content-type': contentType } }).formData(); }
  catch { throw new ApiError(400, 'فایل‌های ورودی معتبر نیستند.'); }
  const person = form.get('person'), cloth = form.get('cloth');
  if (!person?.arrayBuffer || !cloth?.arrayBuffer) throw new ApiError(400, 'تصویر شخص و لباس لازم است.');
  const [[upload]] = await pool.query(
    "SELECT * FROM pro_uploads WHERE visitor_hash=? AND status='uploaded' AND created_at>DATE_SUB(NOW(),INTERVAL 15 MINUTE) ORDER BY id DESC LIMIT 1", [req.tryonOwner.hash],
  );
  if (!upload) throw new ApiError(409, 'ابتدا تصویر خود را در صفحه محصول بارگذاری کنید.');
  let job = upload.tryon_job_id ? await store.owned(upload.tryon_job_id, req.tryonOwner) : null;
  if (!job) {
    const product = await db.getProduct(upload.product_id), shop = product ? await db.getStoreBySeller(product.seller_id) : null;
    if (!shop) throw new ApiError(404, 'محصول پیدا نشد.');
    const clothBytes = Buffer.from(await cloth.arrayBuffer());
    let index = -1;
    for (const [i, source] of product.images.entries()) {
      if (digest(await images.loadSource(source)) === digest(clothBytes)) { index = i; break; }
    }
    if (index < 0) throw new ApiError(400, 'لباس با محصول بارگذاری‌شده مطابقت ندارد.');
    req.params = { ...req.params, slug: shop.slug, productId: String(upload.product_id) };
    req.body = { image_index: index };
    job = await start(req, { personBytes: Buffer.from(await person.arrayBuffer()), legacyUpload: upload, legacyEndpoint: req.path.slice(1) });
  }
  require('./worker').worker.wake();
  const deadline = Date.now() + 300000;
  while (['validating', 'processing', 'saving'].includes(job.status) && Date.now() < deadline && !res.destroyed) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    job = await store.raw(job.id);
  }
  if (res.destroyed) return;
  res.setHeader('X-Tryon-Operation-ID', job.id);
  if (job.status !== 'completed') throw new ApiError(502, job.error_message || 'عملیات هنوز تکمیل نشده است؛ وضعیت همان درخواست را پیگیری کنید.');
  req.params = { id: job.id, kind: 'output' };
  await sendImage(req, res);
}

async function legacyUse(req) {
  await publicProduct(req.params.slug, req.params.productId);
  const uploadId = positiveId(req.body?.upload_id);
  const [[job]] = await pool.query('SELECT j.* FROM virtual_tryon_jobs j JOIN pro_uploads p ON p.tryon_job_id=j.id WHERE p.id=? AND p.visitor_hash=? AND j.product_id=? AND j.deleted_at IS NULL',
    [uploadId, req.tryonOwner.hash, positiveId(req.params.productId)]);
  if (!job || job.status !== 'completed') throw new ApiError(409, 'خروجی تأییدشده این عملیات هنوز آماده نیست.');
  return { ...(await db.getPublicProQuota(null, job.seller_id)), id: job.usage_id, job_id: job.id,
    output_image: '/api/tryon/jobs/' + job.id + '/images/output', description: 'پرو آنلاین برای ' + job.product_title };
}

module.exports = { start, publicProduct, history, readJob, sendImage, erase, legacyFiles, legacyUpload, legacyGenerate, legacyUse };
