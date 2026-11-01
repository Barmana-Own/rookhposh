async function ensureEntitlementSchema(connection) {
  const changes = [
    'ALTER TABLE pro_subscriptions ADD COLUMN package_title VARCHAR(180) NULL',
    "ALTER TABLE pro_subscriptions ADD COLUMN role_type ENUM('user','seller') NULL",
    'ALTER TABLE pro_subscriptions ADD COLUMN pro_requests_count INT UNSIGNED NULL',
    'ALTER TABLE pro_subscriptions ADD COLUMN monthly_pro_request_limit INT UNSIGNED NULL',
    'ALTER TABLE pro_subscriptions ADD UNIQUE INDEX uk_pro_subscriptions_transaction (transaction_id)',
    'ALTER TABLE pro_usages ADD COLUMN quota_user_id BIGINT UNSIGNED NULL',
    'ALTER TABLE pro_usages ADD COLUMN subscription_id BIGINT UNSIGNED NULL',
    "ALTER TABLE pro_usages ADD COLUMN quota_source VARCHAR(16) NOT NULL DEFAULT 'legacy'",
    'ALTER TABLE pro_usages ADD INDEX idx_pro_usages_quota (quota_user_id,quota_source,subscription_id,status,created_at)',
    'ALTER TABLE pro_usages ADD INDEX idx_pro_usages_trial_ip (ip_address,is_free_trial,status)',
  ];
  for (const sql of changes) {
    try {
      await connection.query(sql);
    } catch (error) {
      if (!['ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME'].includes(error.code)) throw error;
    }
  }
  // Populate existing paid subscriptions once; never recreate them or extend their original expiry.
  await connection.query(
    `UPDATE pro_subscriptions ps JOIN packages p ON p.id=ps.package_id
     LEFT JOIN transactions t ON t.id=ps.transaction_id
     SET ps.package_title=COALESCE(ps.package_title,JSON_UNQUOTE(JSON_EXTRACT(t.metadata,'$.package_title')),p.title),
         ps.role_type=COALESCE(ps.role_type,p.role_type),
         ps.pro_requests_count=COALESCE(ps.pro_requests_count,p.pro_requests_count),
         ps.monthly_pro_request_limit=COALESCE(ps.monthly_pro_request_limit,p.monthly_pro_request_limit)
     WHERE ps.package_title IS NULL OR ps.role_type IS NULL OR ps.pro_requests_count IS NULL OR ps.monthly_pro_request_limit IS NULL`,
  );
  await connection.query(
    `UPDATE pro_usages pu SET quota_user_id=user_id,
       subscription_id=(SELECT ps.id FROM pro_subscriptions ps
         WHERE ps.user_id=pu.user_id AND ps.package_id=pu.package_id AND ps.starts_at<=pu.created_at AND ps.expires_at>pu.created_at
         ORDER BY ps.expires_at ASC,ps.id ASC LIMIT 1)
     WHERE pu.quota_source='legacy' AND pu.is_free_trial=0 AND pu.user_id IS NOT NULL AND pu.quota_user_id IS NULL`,
  );
  await connection.query("UPDATE pro_usages SET quota_source='subscription' WHERE quota_source='legacy' AND subscription_id IS NOT NULL");
}

module.exports = { ensureEntitlementSchema };
