const pool = require('../config/database');
const { unlimitedProUserMobiles } = require('../config/env');
const { normalizeMobile } = require('../utils/number');
const { isLegacyStoreSlug, slugifyStoreName } = require('../utils/storeSlug');

async function runMigration(sql) {
  try {
    await pool.query(sql);
  } catch (error) {
    const ignoredCodes = new Set([
      'ER_DUP_FIELDNAME',
      'ER_DUP_KEYNAME',
      'ER_TABLE_EXISTS_ERROR',
      'ER_FK_DUP_NAME',
      'ER_CANT_CREATE_TABLE',
      'ER_DUP_ENTRY',
    ]);
    if (!ignoredCodes.has(error.code)) throw error;
  }
}

async function ensureRuntimeSchema() {
  const statements = [
    'ALTER TABLE users ADD COLUMN avatar LONGTEXT NULL',
    'ALTER TABLE users ADD COLUMN province VARCHAR(120) NULL',
    'ALTER TABLE users ADD COLUMN city VARCHAR(120) NULL',
    'ALTER TABLE users ADD COLUMN address TEXT NULL',
    'ALTER TABLE users ADD COLUMN postal_code VARCHAR(20) NULL',
    'ALTER TABLE users ADD COLUMN national_code VARCHAR(20) NULL',
    'ALTER TABLE users ADD COLUMN pro_unlimited TINYINT(1) NOT NULL DEFAULT 0',
    'ALTER TABLE users ADD COLUMN referred_seller_id BIGINT UNSIGNED NULL',
    'ALTER TABLE products ADD COLUMN qr_code LONGTEXT NULL',
    'ALTER TABLE products ADD COLUMN features JSON NULL',
    'ALTER TABLE products ADD COLUMN publish_status ENUM("active","inactive") NOT NULL DEFAULT "active"',
    'ALTER TABLE products ADD COLUMN pending_changes JSON NULL',
    'ALTER TABLE products ADD INDEX idx_products_publish_status (publish_status)',
    'ALTER TABLE users ADD INDEX idx_users_role_id (role, id)',
    'ALTER TABLE users ADD INDEX idx_users_role_verification_id (role, seller_verification_status, id)',
    'ALTER TABLE products ADD INDEX idx_products_status_id (status, id)',
    'ALTER TABLE products ADD INDEX idx_products_updated_id (updated_at, id)',
    'ALTER TABLE transactions ADD INDEX idx_transactions_status_id (status, id)',
    'ALTER TABLE tickets ADD INDEX idx_tickets_status_id (status, id)',
    'ALTER TABLE notifications ADD INDEX idx_notifications_user_read_id (user_id, is_read, id)',
    'ALTER TABLE seller_customers ADD COLUMN fullname VARCHAR(160) NULL',
    'ALTER TABLE seller_customers ADD COLUMN mobile VARCHAR(20) NULL',
    'ALTER TABLE seller_customers ADD COLUMN province VARCHAR(120) NULL',
    'ALTER TABLE seller_customers ADD COLUMN city VARCHAR(120) NULL',
    'ALTER TABLE seller_customers ADD COLUMN address TEXT NULL',
    'ALTER TABLE seller_customers ADD COLUMN postal_code VARCHAR(20) NULL',
    'ALTER TABLE seller_customers ADD COLUMN national_code VARCHAR(20) NULL',
    'ALTER TABLE seller_customers ADD COLUMN last_product_title VARCHAR(180) NULL',
    'ALTER TABLE seller_customers ADD COLUMN last_order_id BIGINT UNSIGNED NULL',
    'ALTER TABLE seller_customers ADD COLUMN last_order_at TIMESTAMP NULL',
    'ALTER TABLE transactions ADD COLUMN product_id BIGINT UNSIGNED NULL',
    'ALTER TABLE transactions ADD COLUMN package_id BIGINT UNSIGNED NULL',
    'ALTER TABLE transactions ADD COLUMN metadata JSON NULL',
    'ALTER TABLE pro_usages ADD COLUMN product_id BIGINT UNSIGNED NULL',
    'ALTER TABLE pro_usages ADD COLUMN input_image LONGTEXT NULL',
    'ALTER TABLE pro_usages ADD COLUMN product_image LONGTEXT NULL',
    'ALTER TABLE pro_usages ADD COLUMN output_image LONGTEXT NULL',
    'ALTER TABLE pro_usages MODIFY user_id BIGINT UNSIGNED NULL',
    'ALTER TABLE pro_usages ADD COLUMN ip_address VARCHAR(64) NULL',
    'ALTER TABLE pro_usages ADD COLUMN is_free_trial TINYINT(1) NOT NULL DEFAULT 0',
    'ALTER TABLE packages ADD COLUMN pro_requests_count INT UNSIGNED NOT NULL DEFAULT 0',
    'ALTER TABLE packages ADD COLUMN monthly_pro_request_limit INT UNSIGNED NOT NULL DEFAULT 0',
    'ALTER TABLE stores ADD COLUMN qr_code LONGTEXT NULL',
    'ALTER TABLE stores ADD COLUMN legacy_slug VARCHAR(180) NULL',
    'ALTER TABLE stores ADD COLUMN contact_phone VARCHAR(30) NULL',
    'ALTER TABLE stores MODIFY logo LONGTEXT NULL',
    'ALTER TABLE stores MODIFY banner LONGTEXT NULL',
    'ALTER TABLE ticket_messages MODIFY attachment LONGTEXT NULL',
    `CREATE TABLE IF NOT EXISTS pro_uploads (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NULL,
      product_id BIGINT UNSIGNED NOT NULL,
      ip_address VARCHAR(64) NULL,
      file_name VARCHAR(180) NULL,
      image LONGTEXT NOT NULL,
      status ENUM('uploaded','used') NOT NULL DEFAULT 'uploaded',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      used_at TIMESTAMP NULL,
      INDEX idx_pro_uploads_user_status (user_id, status, id),
      INDEX idx_pro_uploads_ip_status (ip_address, status, id),
      INDEX idx_pro_uploads_product_created (product_id, created_at)
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS pro_subscriptions (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      package_id BIGINT UNSIGNED NOT NULL,
      transaction_id BIGINT UNSIGNED NULL,
      starts_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_pro_subscriptions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_pro_subscriptions_package FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
      INDEX idx_pro_subscriptions_user_expiry (user_id, expires_at),
      INDEX idx_pro_subscriptions_transaction (transaction_id)
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS app_settings (
      \`key\` VARCHAR(120) PRIMARY KEY,
      \`value\` TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`,
    `INSERT INTO app_settings(\`key\`, \`value\`) VALUES('token_price','25000')
     ON DUPLICATE KEY UPDATE \`value\`=\`value\``,
    `INSERT INTO app_settings(\`key\`, \`value\`) VALUES('bank_info','{"bank_name":"ملت","card_number":"0000-0000-0000-0000","iban":"IR000000000000000000000000","account_holder":"مدیریت مارکت‌پلیس"}')
     ON DUPLICATE KEY UPDATE \`value\`=\`value\``,
  ];

  for (const statement of statements) {
    await runMigration(statement);
  }

  await markConfiguredUnlimitedUsers();
  await migrateLegacyStoreSlugs();
}

function configuredUnlimitedMobileVariants() {
  const variants = new Set();
  String(unlimitedProUserMobiles || '')
    .split(',')
    .map((mobile) => normalizeMobile(mobile))
    .filter((mobile) => /^\d{10,15}$/u.test(mobile))
    .forEach((mobile) => {
      variants.add(mobile);
      if (mobile.startsWith('0')) {
        variants.add(`+98${mobile.slice(1)}`);
        variants.add(`0098${mobile.slice(1)}`);
      }
    });
  return [...variants];
}

async function markConfiguredUnlimitedUsers() {
  const mobiles = configuredUnlimitedMobileVariants();
  if (!mobiles.length) return;
  const placeholders = mobiles.map(() => '?').join(',');
  await pool.query(
    `UPDATE users SET pro_unlimited=1 WHERE role='User' AND mobile IN (${placeholders})`,
    mobiles,
  );
}

async function migrateLegacyStoreSlugs() {
  const [stores] = await pool.query(
    `SELECT s.id, s.seller_id, s.store_name, s.slug, s.legacy_slug, u.username
     FROM stores s
     LEFT JOIN users u ON u.id=s.seller_id
     ORDER BY s.id ASC`,
  );
  const occupied = new Set(stores.map((store) => String(store.slug || '')));

  for (const store of stores) {
    let legacySlug = store.legacy_slug || '';
    if (!legacySlug && isLegacyStoreSlug(store.slug)) legacySlug = store.slug;
    if (!legacySlug && /^\d{6,}-seller$/u.test(String(store.username || ''))) legacySlug = store.username;
    if (
      !isLegacyStoreSlug(store.slug)
      && legacySlug
      && /^\d{6,}-seller$/u.test(legacySlug)
      && legacySlug !== String(store.username || '')
    ) {
      legacySlug = '';
    }
    if (legacySlug !== (store.legacy_slug || '')) {
      await pool.query('UPDATE stores SET legacy_slug=? WHERE id=?', [legacySlug || null, store.id]);
    }
    if (!isLegacyStoreSlug(store.slug)) continue;
    const base = slugifyStoreName(store.store_name, `seller-${store.seller_id}`);
    let nextSlug = base;
    let suffix = 2;
    while (occupied.has(nextSlug) && nextSlug !== store.slug) {
      nextSlug = `${base}-${suffix}`;
      suffix += 1;
    }
    if (nextSlug === store.slug) continue;
    await pool.query('UPDATE stores SET slug=?, qr_code=NULL WHERE id=?', [nextSlug, store.id]);
    occupied.delete(String(store.slug || ''));
    occupied.add(nextSlug);
  }
}

module.exports = { ensureRuntimeSchema };
