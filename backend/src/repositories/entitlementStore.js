const pool = require('../config/database');
const ApiError = require('../utils/apiError');

function count(value) {
  const number = Number(value || 0);
  if (!Number.isSafeInteger(number) || number < 0) throw new ApiError(409, 'اطلاعات سهمیه معتبر نیست.');
  return number;
}

function summarize(subscriptions, purchased, consumed, purchasedReserved = 0) {
  const items = subscriptions.map((subscription) => {
    const remaining = Math.max(0, count(subscription.pro_requests_count) - count(subscription.used));
    const monthlyLimit = count(subscription.monthly_pro_request_limit);
    const unreserved = Math.max(0, remaining - count(subscription.reserved));
    const available = monthlyLimit > 0
      ? Math.min(unreserved, Math.max(0, monthlyLimit - count(subscription.month_used) - count(subscription.month_reserved)))
      : unreserved;
    return { ...subscription, remaining_tokens: remaining, available_tokens: available };
  });
  const purchasedRemaining = Math.max(0, count(purchased) - count(consumed));
  const remaining = items.reduce((total, item) => total + item.remaining_tokens, purchasedRemaining);
  const available = items.reduce((total, item) => total + item.available_tokens, Math.max(0, purchasedRemaining - count(purchasedReserved)));
  return {
    subscription: items.at(-1) || null,
    subscriptions: items,
    purchased_tokens_remaining: purchasedRemaining,
    tokens_remaining: count(remaining),
    tokens_available: count(available),
  };
}

async function getSummary(userId, connection = pool, { lock = false, requireSeller = false } = {}) {
  const [[user]] = await connection.query(
    `SELECT id, role, status, seller_verification_status, pro_unlimited FROM users WHERE id=?${lock ? ' FOR UPDATE' : ''}`, [userId],
  );
  if (!user || user.status !== 'active' || !['Seller', 'User'].includes(user.role) || (requireSeller && user.role !== 'Seller')
      || (user.role === 'Seller' && user.seller_verification_status !== 'approved')) {
    throw new ApiError(403, 'این حساب اجازه استفاده از سهمیه پرو را ندارد.');
  }
  if (user.role === 'User' && Number(user.pro_unlimited) === 1) {
    return { ...summarize([], 0, 0), has_unlimited_access: true };
  }
  const [subscriptions] = await connection.query(
    `SELECT ps.id, ps.package_id, ps.transaction_id, ps.starts_at, ps.expires_at,
            ps.package_title AS title, ps.role_type, ps.pro_requests_count, ps.monthly_pro_request_limit,
            COALESCE(usage_count.used,0) AS used, COALESCE(usage_count.month_used,0) AS month_used,
            COALESCE(reservations.reserved,0) AS reserved, COALESCE(reservations.month_reserved,0) AS month_reserved
     FROM pro_subscriptions ps
     LEFT JOIN transactions purchase ON purchase.id=ps.transaction_id
     LEFT JOIN (
       SELECT subscription_id, COUNT(*) AS used,
              SUM(created_at >= DATE_FORMAT(NOW(),'%Y-%m-01 00:00:00')) AS month_used
       FROM pro_usages WHERE quota_user_id=? AND quota_source='subscription' AND status='success'
       GROUP BY subscription_id
     ) usage_count ON usage_count.subscription_id=ps.id
      LEFT JOIN (
        SELECT subscription_id,COUNT(*) AS reserved,
          SUM(reserved_at >= DATE_FORMAT(NOW(),'%Y-%m-01 00:00:00')) AS month_reserved
        FROM virtual_tryon_jobs WHERE seller_id=? AND credit_reserved=1 AND quota_source='subscription'
        GROUP BY subscription_id
      ) reservations ON reservations.subscription_id=ps.id
     WHERE ps.user_id=? AND ps.role_type=? AND ps.starts_at<=NOW() AND ps.expires_at>NOW()
       AND (ps.transaction_id IS NULL OR (purchase.status='success' AND purchase.user_id=ps.user_id AND purchase.package_id=ps.package_id))
     ORDER BY ps.expires_at ASC, ps.id ASC`,
    [userId, userId, userId, user.role.toLowerCase()],
  );
  // Successful purchase transactions are the credit ledger. A callback replay cannot add another credit.
  const [[credits]] = await connection.query(
    `SELECT COALESCE(SUM(CASE WHEN
       JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.token_purchase'))='true'
       AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.token_quantity')) REGEXP '^[1-9][0-9]{0,5}$'
       AND CAST(JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.token_quantity')) AS UNSIGNED)<=100000
       AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.token_unit_price')) REGEXP '^[1-9][0-9]{0,10}$'
       AND CAST(JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.token_quantity')) AS DECIMAL(20,0))
           * CAST(JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.token_unit_price')) AS DECIMAL(20,0))=amount
       THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.token_quantity')) AS UNSIGNED) ELSE 0 END),0) AS purchased
     FROM transactions WHERE user_id=? AND status='success' AND package_id IS NULL AND type=? AND JSON_VALID(metadata)`,
    [userId, user.role === 'Seller' ? 'seller_package_purchase' : 'package_purchase'],
  );
  const [[debits]] = await connection.query(
    `SELECT COUNT(*) AS consumed,
      (SELECT COUNT(*) FROM virtual_tryon_jobs WHERE seller_id=? AND credit_reserved=1 AND quota_source='purchased') AS reserved
     FROM pro_usages WHERE quota_user_id=? AND quota_source='purchased' AND status='success'`, [userId, userId],
  );
  return summarize(subscriptions, credits.purchased, debits.consumed, debits.reserved);
}

async function activateSubscription(connection, { userId, packageId, transactionId, metadata = {} }) {
  const [[owner]] = await connection.query('SELECT id FROM users WHERE id=? FOR UPDATE', [userId]);
  if (!owner) throw new ApiError(409, 'حساب خرید پیدا نشد.');
  const [[existing]] = await connection.query('SELECT id, user_id, package_id FROM pro_subscriptions WHERE transaction_id=? LIMIT 1', [transactionId]);
  if (existing) {
    if (Number(existing.user_id) !== Number(userId) || Number(existing.package_id) !== Number(packageId)) {
      throw new ApiError(409, 'اشتراک این تراکنش با حساب مطابقت ندارد.');
    }
    return existing;
  }
  const [[pack]] = await connection.query('SELECT title, role_type, duration_days, pro_requests_count, monthly_pro_request_limit FROM packages WHERE id=?', [packageId]);
  if (!pack) throw new ApiError(409, 'اطلاعات بسته خرید پیدا نشد.');
  const duration = Number(metadata.duration_days ?? pack.duration_days);
  const requests = count(metadata.pro_requests_count ?? pack.pro_requests_count);
  const monthly = count(metadata.monthly_pro_request_limit ?? pack.monthly_pro_request_limit);
  const role = metadata.role_type ?? pack.role_type;
  const title = String(metadata.package_title ?? pack.title).trim();
  if (!Number.isSafeInteger(duration) || duration < 1 || duration > 36500 || requests > 4294967295
      || monthly > 4294967295 || !['seller', 'user'].includes(role) || !title || title.length > 180) {
    throw new ApiError(409, 'اطلاعات بسته خرید معتبر نیست.');
  }
  const [result] = await connection.query(
    `INSERT INTO pro_subscriptions(user_id,package_id,transaction_id,starts_at,expires_at,package_title,role_type,pro_requests_count,monthly_pro_request_limit)
     VALUES(?,?,?,NOW(),DATE_ADD(NOW(), INTERVAL ? DAY),?,?,?,?)`,
    [userId, packageId, transactionId, duration, title, role, requests, monthly],
  );
  return { id: result.insertId, package_id: packageId, role_type: role, duration_days: duration };
}

module.exports = { getSummary, activateSubscription, summarize };
