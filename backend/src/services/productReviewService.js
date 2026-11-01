const crypto = require('node:crypto');
const pool = require('../config/database');
const db = require('../repositories/dbStore');
const ApiError = require('../utils/apiError');
const images = require('../tryon/images');
const { positiveId, assertId } = require('../tryon/identity');
const { parse, audit } = require('../tryon/providers');

async function productRow(id, connection = pool, lock = false) {
  const [[product]] = await connection.query('SELECT * FROM products WHERE id=?' + (lock ? ' FOR UPDATE' : ''), [positiveId(id)]);
  if (!product) throw new ApiError(404, 'محصول پیدا نشد.');
  return product;
}

function content(row, proposal = true) {
  const pending = parse(row.pending_changes, null);
  const value = proposal && pending ? { ...row, ...pending } : row;
  return {
    id: row.id, title: value.title, description: value.description, price: value.price,
    features: parse(value.features, []), images: parse(value.images, []),
    category: value.category || null, stock: value.stock ?? null, variants: parse(value.variants, []),
  };
}

const reviewable = (product) => product.status === 'pending' || (product.status === 'active' && Boolean(product.pending_changes));

async function reasons(includeInactive = false) {
  const [items] = await pool.query('SELECT id,code,title,description,active,requires_comment,sort_order FROM product_rejection_reasons'
    + (includeInactive ? '' : ' WHERE active=1') + ' ORDER BY sort_order,id');
  return items.map((item) => ({ ...item, active: Boolean(item.active), requires_comment: Boolean(item.requires_comment) }));
}

async function history(id, query = {}, sellerId = null) {
  const product = await productRow(id);
  if (sellerId != null && Number(product.seller_id) !== Number(sellerId)) throw new ApiError(404, 'محصول پیدا نشد.');
  const limit = Math.max(1, Math.min(50, Math.trunc(Number(query.limit) || 20)));
  const page = Math.max(1, Math.min(100000, Math.trunc(Number(query.page) || 1)));
  const [[total]] = await pool.query('SELECT COUNT(*) AS total FROM product_review_decisions WHERE product_id=?', [id]);
  const [items] = await pool.query(
    'SELECT id,actor_id,actor_name,action,reason_id,reason_title,comment,previous_status,next_status,reviewed_revision,created_at FROM product_review_decisions WHERE product_id=? ORDER BY id DESC LIMIT ? OFFSET ?',
    [id, limit, (page - 1) * limit],
  );
  return { items, pagination: { page, pageSize: limit, total: Number(total.total), totalPages: Math.max(1, Math.ceil(Number(total.total) / limit)) } };
}

function previewContent(row, proposal = true) {
  const result = content(row, proposal);
  const version = proposal ? 'proposal' : 'current';
  result.images = (Array.isArray(result.images) ? result.images : []).map((_source, index) => ({
    index, url: '/api/admin/products/' + row.id + '/images/' + index + '?version=' + version + '&revision=' + row.review_revision,
  }));
  return result;
}

async function detail(id, actorId) {
  await pool.query('DELETE FROM product_review_views WHERE expires_at<DATE_SUB(NOW(),INTERVAL 1 DAY) AND decision_id IS NULL');
  const row = await productRow(id);
  const [[seller]] = await pool.query(
    'SELECT u.id,u.fullname,s.store_name FROM users u LEFT JOIN stores s ON s.seller_id=u.id WHERE u.id=? LIMIT 1', [row.seller_id],
  );
  let token = null;
  if (reviewable(row)) {
    token = crypto.randomBytes(16).toString('hex');
    await pool.query('INSERT INTO product_review_views(id,product_id,actor_id,revision,expires_at) VALUES(?,?,?,?,DATE_ADD(NOW(),INTERVAL 20 MINUTE))',
      [token, row.id, actorId, row.review_revision]);
  }
  await audit(actorId, 'product.review_opened', row.id, { revision: row.review_revision });
  return {
    product: previewContent(row), current_product: row.pending_changes ? previewContent(row, false) : null,
    seller: seller || null, status: row.status, review_status: row.review_status || row.status,
    publish_status: row.publish_status, reviewable: reviewable(row), review_token: token, revision: row.review_revision,
    created_at: row.created_at, updated_at: row.updated_at, reviewed_at: row.reviewed_at,
    reject_reason: row.reject_reason, reasons: await reasons(), history: await history(id),
  };
}

async function decide(id, actorId, action, input = {}) {
  if (!['approved', 'rejected'].includes(action)) throw new ApiError(400, 'تصمیم معتبر نیست.');
  if (typeof input.review_token !== 'string') throw new ApiError(409, 'ابتدا جزئیات همین محصول را باز کنید.');
  const token = assertId(input.review_token);
  const comment = typeof input.comment === 'string' ? input.comment.trim() : '';
  if (comment.length > 2000) throw new ApiError(400, 'توضیح بیش از حد طولانی است.');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[actor]] = await connection.query('SELECT id,role,status,fullname FROM users WHERE id=? LOCK IN SHARE MODE', [actorId]);
    if (!actor || actor.role !== 'Admin' || actor.status !== 'active') throw new ApiError(403, 'مجوز مدیریت معتبر نیست.');
    const row = await productRow(id, connection, true);
    const [[view]] = await connection.query('SELECT * FROM product_review_views WHERE id=? AND product_id=? AND actor_id=? FOR UPDATE', [token, id, actorId]);
    if (!view) throw new ApiError(409, 'ابتدا جزئیات همین محصول را باز کنید.');
    const requestedReasonId = action === 'rejected' ? positiveId(input.reason_id) : null;
    if (view.decision_id) {
      const [[previous]] = await connection.query('SELECT * FROM product_review_decisions WHERE id=?', [view.decision_id]);
      if (previous.action !== action || Number(previous.reason_id || 0) !== Number(requestedReasonId || 0) || (previous.comment || '') !== comment) {
        throw new ApiError(409, 'برای این بررسی قبلاً تصمیم دیگری ثبت شده است.');
      }
      await connection.commit();
      return { decision_id: previous.id, replayed: true, product_id: row.id };
    }
    let reason = null;
    if (action === 'rejected') {
      const [[selected]] = await connection.query('SELECT * FROM product_rejection_reasons WHERE id=? AND active=1 LOCK IN SHARE MODE', [requestedReasonId]);
      if (!selected || (selected.requires_comment && !comment)) throw new ApiError(400, 'دلیل معتبر و توضیح الزامی را وارد کنید.');
      reason = selected;
    }
    if (new Date(view.expires_at).getTime() < Date.now() || Number(view.revision) !== Number(row.review_revision)
        || Number(input.revision) !== Number(row.review_revision) || !reviewable(row)) throw new ApiError(409, 'محصول تغییر کرده است؛ جزئیات را دوباره دریافت کنید.');
    const selectedContent = content(row);
    const reasonText = reason ? reason.title + (comment ? ' — ' + comment : '') : null;
    const nextStatus = action === 'approved' ? 'active' : row.status === 'active' ? 'active' : 'rejected';
    if (action === 'approved') {
      await connection.query(
        `UPDATE products SET title=?,description=?,features=?,price=?,images=?,status='active',review_status='approved',
         pending_changes=NULL,reject_reason=NULL,reject_reason_id=NULL,reject_comment=NULL,reviewed_by=?,reviewed_at=NOW(3),
         review_revision=review_revision+1,qr_code=NULL WHERE id=?`,
        [selectedContent.title, selectedContent.description, JSON.stringify(selectedContent.features), selectedContent.price,
          JSON.stringify(selectedContent.images), actorId, id],
      );
    } else {
      await connection.query(
        `UPDATE products SET status=?,review_status='rejected',pending_changes=NULL,reject_reason=?,reject_reason_id=?,reject_comment=?,
         reviewed_by=?,reviewed_at=NOW(3),review_revision=review_revision+1 WHERE id=?`,
        [nextStatus, reasonText, reason.id, comment || null, actorId, id],
      );
    }
    const [decision] = await connection.query(
      `INSERT INTO product_review_decisions(product_id,actor_id,actor_name,action,reason_id,reason_title,comment,snapshot_json,previous_status,next_status,reviewed_revision)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      [id, actorId, actor.fullname, action, reason?.id || null, reason?.title || null, comment || null,
        JSON.stringify(selectedContent), row.status, nextStatus, row.review_revision],
    );
    await connection.query('UPDATE product_review_views SET decision_id=? WHERE id=?', [decision.insertId, token]);
    await db.createNotification(row.seller_id, action === 'approved' ? 'محصول شما تأیید شد' : 'محصول یا ویرایش شما رد شد',
      'محصول «' + selectedContent.title + '»: ' + (action === 'approved' ? 'تأیید شد.' : reasonText), 'product_review', id, connection);
    await audit(actorId, 'product.' + action, id, { decision_id: decision.insertId, reason_id: reason?.id || null, revision: row.review_revision }, connection);
    await connection.commit();
    return { decision_id: decision.insertId, product_id: Number(id), status: nextStatus, review_status: action };
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}

async function saveReason(id, input, actorId) {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  const sort = Number(input.sort_order || 0);
  if (!title || title.length > 180 || description.length > 500 || !Number.isInteger(sort) || sort < 0 || sort > 9999
      || typeof input.active !== 'boolean' || typeof input.requires_comment !== 'boolean') throw new ApiError(400, 'اطلاعات دلیل رد معتبر نیست.');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
  if (id) {
    const [[existing]] = await connection.query('SELECT code FROM product_rejection_reasons WHERE id=? FOR UPDATE', [positiveId(id)]);
    if (!existing) throw new ApiError(404, 'دلیل رد پیدا نشد.');
    if (existing.code === 'other' && !input.requires_comment) throw new ApiError(400, 'توضیح سایر موارد باید الزامی بماند.');
    await connection.query('UPDATE product_rejection_reasons SET title=?,description=?,active=?,requires_comment=?,sort_order=? WHERE id=?',
      [title, description, input.active ? 1 : 0, input.requires_comment ? 1 : 0, sort, id]);
  } else {
    const code = 'reason_' + crypto.randomBytes(8).toString('hex');
    const [result] = await connection.query('INSERT INTO product_rejection_reasons(code,title,description,active,requires_comment,sort_order) VALUES(?,?,?,?,?,?)',
      [code, title, description, input.active ? 1 : 0, input.requires_comment ? 1 : 0, sort]);
    id = result.insertId;
  }
  await audit(actorId, 'product.reason_updated', id, {}, connection);
  await connection.commit();
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  return (await reasons(true)).find((row) => Number(row.id) === Number(id));
}

async function sendImage(req, res) {
  const row = await productRow(req.params.id);
  if (req.query.revision && Number(req.query.revision) !== Number(row.review_revision)) throw new ApiError(409, 'تصویر محصول تغییر کرده است؛ جزئیات را تازه کنید.');
  const proposed = req.query.version !== 'current';
  const values = content(row, proposed).images;
  const index = Number(req.params.index);
  if (!Number.isInteger(index) || index < 0 || index >= values.length) throw new ApiError(404, 'تصویر پیدا نشد.');
  const source = values[index];
  const host = source.startsWith('data:') ? [] : [new URL(source, process.env.FRONTEND_URL || 'http://localhost:5173').hostname];
  const bytes = await images.loadSource(source, { allowedHosts: host });
  const info = await images.inspect(bytes);
  await audit(req.tryonAdmin.id, req.query.download === '1' ? 'product.image_downloaded' : 'product.image_viewed', row.id, { index, revision: row.review_revision });
  res.set({
    'Content-Type': info.mime, 'Content-Length': String(bytes.length), 'Cache-Control': 'private, no-store',
    'Content-Disposition': (req.query.download === '1' ? 'attachment' : 'inline') + '; filename="rookhposh-product-' + row.id + '-' + index + '.' + info.extension + '"',
    'X-Content-Type-Options': 'nosniff', 'X-Image-Width': String(info.width), 'X-Image-Height': String(info.height),
  });
  res.end(bytes);
}

module.exports = { detail, decide, history, reasons, saveReason, sendImage, content, reviewable };
