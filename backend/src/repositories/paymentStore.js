const { randomBytes } = require('node:crypto');
const pool = require('../config/database');
const ApiError = require('../utils/apiError');

function parseMetadata(value) {
  return typeof value === 'string' ? JSON.parse(value) : (value || {});
}

async function inTransaction(operation) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function create(userId, amountRial, transaction, requestKey, requestHash) {
  return inTransaction(async (connection) => {
    const [[user]] = await connection.query(
      'SELECT id, role, status, seller_verification_status FROM users WHERE id=? FOR UPDATE', [userId],
    );
    if (!user || user.status !== 'active' || !['User', 'Seller'].includes(user.role)
        || (user.role === 'Seller' && user.seller_verification_status !== 'approved')) {
      throw new ApiError(403, 'این حساب اجازه شروع پرداخت را ندارد.');
    }
    if (transaction.metadata?.role_type && transaction.metadata.role_type !== user.role.toLowerCase()) {
      throw new ApiError(403, 'این بسته برای نقش حساب شما قابل خرید نیست.');
    }
    const [[existing]] = await connection.query(
      'SELECT * FROM gateway_payments WHERE user_id=? AND request_key=? FOR UPDATE', [userId, requestKey],
    );
    if (existing) {
      if (existing.request_hash !== requestHash) throw new ApiError(409, 'این درخواست قبلاً با اطلاعات دیگری ثبت شده است.');
      return { ...existing, existing: true };
    }
    const id = randomBytes(16).toString('hex');
    const metadata = { ...transaction.metadata, source: 'direct_gateway', payment_method: 'direct_gateway', gateway_payment_id: id };
    const [result] = await connection.query(
      `INSERT INTO transactions(user_id,seller_id,package_id,type,amount,status,description,metadata)
       VALUES(?,?,?,?,?,'pending',?,?)`,
      [userId, transaction.seller_id || null, transaction.package_id || null, transaction.type,
        amountRial / 10, transaction.description, JSON.stringify(metadata)],
    );
    const orderId = BigInt(`0x${randomBytes(10).toString('hex')}`).toString();
    await connection.query(
      'INSERT INTO gateway_payments(id,transaction_id,user_id,request_key,request_hash,order_id,amount_rial) VALUES(?,?,?,?,?,?,?)',
      [id, result.insertId, userId, requestKey, requestHash, orderId, amountRial],
    );
    return { id, order_id: orderId, transaction_id: result.insertId, amount_rial: amountRial };
  });
}

async function attachToken(id, token) {
  const [result] = await pool.query(
    "UPDATE gateway_payments SET token=?, state='pending' WHERE id=? AND state='created'", [token, id],
  );
  if (result.affectedRows !== 1) throw new ApiError(409, 'وضعیت درخواست پرداخت تغییر کرده است.');
}

async function failInitialization(id) {
  return inTransaction(async (connection) => {
    await connection.query(
      `UPDATE transactions t JOIN gateway_payments g ON g.transaction_id=t.id
       SET t.status='failed', g.state='failed', g.last_error='INITIALIZATION_FAILED'
       WHERE g.id=? AND g.state='created'`, [id],
    );
  });
}

async function get(id, userId = null) {
  const [rows] = await pool.query(
    `SELECT g.*, t.user_id, t.amount, t.type, t.package_id, t.metadata, t.status AS transaction_status, u.role
     FROM gateway_payments g JOIN transactions t ON t.id=g.transaction_id JOIN users u ON u.id=t.user_id
     WHERE g.id=? ${userId === null ? '' : 'AND t.user_id=?'} LIMIT 1`,
    userId === null ? [id] : [id, userId],
  );
  if (!rows[0]) throw new ApiError(404, 'درخواست پرداخت پیدا نشد.');
  return { ...rows[0], metadata: parseMetadata(rows[0].metadata) };
}

async function claim(id) {
  const lockId = randomBytes(16).toString('hex');
  const [result] = await pool.query(
    `UPDATE gateway_payments SET state='verifying', lock_id=?, locked_at=NOW(3), last_error=NULL
     WHERE id=? AND (state='pending' OR (state='verifying' AND locked_at<DATE_SUB(NOW(3), INTERVAL 1 MINUTE)))`,
    [lockId, id],
  );
  return result.affectedRows === 1 ? lockId : null;
}

async function recordVerification(id, lockId, reference) {
  const [result] = await pool.query(
    `UPDATE gateway_payments SET state='verified', bank_reference=?, bank_verified_at=NOW(3), lock_id=NULL
     WHERE id=? AND state='verifying' AND lock_id=?`, [reference, id, lockId],
  );
  if (result.affectedRows !== 1) throw new ApiError(409, 'تأیید پرداخت هم‌زمان در حال انجام است.');
}

async function releaseClaim(id, lockId, code = 'VERIFICATION_UNAVAILABLE') {
  await pool.query(
    `UPDATE gateway_payments SET state='pending', lock_id=NULL, last_error=?
     WHERE id=? AND state='verifying' AND lock_id=?`, [code, id, lockId],
  );
}

async function finalize(id) {
  return inTransaction(async (connection) => {
    const [[payment]] = await connection.query(
      `SELECT g.state, g.transaction_id, t.user_id, t.type, t.amount, t.package_id, t.metadata, t.status AS transaction_status
       FROM gateway_payments g JOIN transactions t ON t.id=g.transaction_id WHERE g.id=? FOR UPDATE`, [id],
    );
    if (!payment) throw new ApiError(404, 'درخواست پرداخت پیدا نشد.');
    if (payment.state === 'success') return;
    if (payment.state !== 'verified') throw new ApiError(409, 'پرداخت هنوز توسط بانک تأیید نشده است.');
    if (payment.transaction_status !== 'pending') throw new ApiError(409, 'وضعیت ثبت تراکنش نیاز به بررسی دارد.');
    const metadata = parseMetadata(payment.metadata);
    if (payment.type === 'wallet_charge') {
      const [result] = await connection.query(
        'UPDATE users SET wallet_balance=wallet_balance+? WHERE id=?', [payment.amount, payment.user_id],
      );
      if (result.affectedRows !== 1) throw new ApiError(409, 'حساب پرداخت پیدا نشد.');
    } else if (payment.package_id) {
      // Honor the purchased duration, even if the administrator later edits or deactivates the package.
      const duration = Number(metadata.duration_days);
      if (!Number.isSafeInteger(duration) || duration < 1 || duration > 36500) {
        throw new ApiError(409, 'اطلاعات بسته پرداخت معتبر نیست.');
      }
      await connection.query(
        `INSERT INTO pro_subscriptions(user_id,package_id,transaction_id,starts_at,expires_at)
         VALUES(?,?,?,NOW(),DATE_ADD(NOW(), INTERVAL ? DAY))`,
        [payment.user_id, payment.package_id, payment.transaction_id, duration],
      );
    } else if (metadata.token_purchase !== true) {
      throw new ApiError(409, 'نوع عملیات پرداخت معتبر نیست.');
    }
    const [completed] = await connection.query("UPDATE transactions SET status='success' WHERE id=? AND status='pending'", [payment.transaction_id]);
    if (completed.affectedRows !== 1) throw new ApiError(409, 'وضعیت تراکنش پرداخت تغییر کرده است.');
    await connection.query("UPDATE gateway_payments SET state='success', last_error=NULL WHERE id=?", [id]);
    await connection.query(
      'INSERT INTO notifications(user_id,title,body,type,related_id) VALUES(?,?,?,?,?)',
      [payment.user_id, 'پرداخت تأیید شد', 'پرداخت شما توسط بانک تأیید و عملیات تکمیل شد.', 'payment_approved', payment.transaction_id],
    );
  });
}

module.exports = { create, attachToken, failInitialization, get, claim, recordVerification, releaseClaim, finalize };
