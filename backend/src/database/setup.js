const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function runSql(connection, file) {
  const sql = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const statements = sql.split(/;\s*$/m).map((item) => item.trim()).filter(Boolean);
  for (const statement of statements) await connection.query(statement);
}

async function runMigration(connection, sql) {
  try {
    await connection.query(sql);
  } catch (error) {
    const ignoredCodes = new Set([
      'ER_DUP_FIELDNAME',
      'ER_DUP_KEYNAME',
      'ER_TABLE_EXISTS_ERROR',
      'ER_FK_DUP_NAME',
      'ER_CANT_CREATE_TABLE',
    ]);
    if (!ignoredCodes.has(error.code)) throw error;
  }
}

async function applyMigrations(connection) {
  const statements = [
    'ALTER TABLE marketplace.users ADD COLUMN avatar LONGTEXT NULL',
    'ALTER TABLE marketplace.users ADD COLUMN province VARCHAR(120) NULL',
    'ALTER TABLE marketplace.users ADD COLUMN city VARCHAR(120) NULL',
    'ALTER TABLE marketplace.users ADD COLUMN address TEXT NULL',
    'ALTER TABLE marketplace.users ADD COLUMN postal_code VARCHAR(20) NULL',
    'ALTER TABLE marketplace.users ADD COLUMN national_code VARCHAR(20) NULL',
    'ALTER TABLE marketplace.products ADD COLUMN qr_code LONGTEXT NULL',
    'ALTER TABLE marketplace.products ADD COLUMN features JSON NULL',
    'ALTER TABLE marketplace.products ADD COLUMN publish_status ENUM("active","inactive") NOT NULL DEFAULT "active"',
    'ALTER TABLE marketplace.products ADD COLUMN pending_changes JSON NULL',
    'ALTER TABLE marketplace.products ADD INDEX idx_products_publish_status (publish_status)',
    'ALTER TABLE marketplace.users ADD INDEX idx_users_role_id (role, id)',
    'ALTER TABLE marketplace.users ADD INDEX idx_users_role_verification_id (role, seller_verification_status, id)',
    'ALTER TABLE marketplace.products ADD INDEX idx_products_status_id (status, id)',
    'ALTER TABLE marketplace.products ADD INDEX idx_products_updated_id (updated_at, id)',
    'ALTER TABLE marketplace.transactions ADD INDEX idx_transactions_status_id (status, id)',
    'ALTER TABLE marketplace.tickets ADD INDEX idx_tickets_status_id (status, id)',
    'ALTER TABLE marketplace.notifications ADD INDEX idx_notifications_user_read_id (user_id, is_read, id)',
    'ALTER TABLE marketplace.seller_customers ADD COLUMN fullname VARCHAR(160) NULL',
    'ALTER TABLE marketplace.seller_customers ADD COLUMN mobile VARCHAR(20) NULL',
    'ALTER TABLE marketplace.seller_customers ADD COLUMN province VARCHAR(120) NULL',
    'ALTER TABLE marketplace.seller_customers ADD COLUMN city VARCHAR(120) NULL',
    'ALTER TABLE marketplace.seller_customers ADD COLUMN address TEXT NULL',
    'ALTER TABLE marketplace.seller_customers ADD COLUMN postal_code VARCHAR(20) NULL',
    'ALTER TABLE marketplace.seller_customers ADD COLUMN national_code VARCHAR(20) NULL',
    'ALTER TABLE marketplace.seller_customers ADD COLUMN last_product_title VARCHAR(180) NULL',
    'ALTER TABLE marketplace.seller_customers ADD COLUMN last_order_id BIGINT UNSIGNED NULL',
    'ALTER TABLE marketplace.seller_customers ADD COLUMN last_order_at TIMESTAMP NULL',
    'ALTER TABLE marketplace.transactions ADD COLUMN product_id BIGINT UNSIGNED NULL',
    'ALTER TABLE marketplace.transactions ADD COLUMN package_id BIGINT UNSIGNED NULL',
    'ALTER TABLE marketplace.transactions ADD COLUMN metadata JSON NULL',
    'ALTER TABLE marketplace.packages ADD COLUMN pro_requests_count INT UNSIGNED NOT NULL DEFAULT 0',
    'ALTER TABLE marketplace.packages ADD COLUMN monthly_pro_request_limit INT UNSIGNED NOT NULL DEFAULT 0',
    'ALTER TABLE marketplace.pro_usages ADD COLUMN ip_address VARCHAR(64) NULL',
    'ALTER TABLE marketplace.pro_usages ADD COLUMN is_free_trial TINYINT(1) NOT NULL DEFAULT 0',
    'ALTER TABLE marketplace.pro_usages MODIFY user_id BIGINT UNSIGNED NULL',
    'ALTER TABLE marketplace.stores ADD COLUMN qr_code LONGTEXT NULL',
    'ALTER TABLE marketplace.stores MODIFY logo LONGTEXT NULL',
    'ALTER TABLE marketplace.stores MODIFY banner LONGTEXT NULL',
    'ALTER TABLE marketplace.ticket_messages MODIFY attachment LONGTEXT NULL',
    `CREATE TABLE IF NOT EXISTS marketplace.pro_uploads (
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
    `CREATE TABLE IF NOT EXISTS marketplace.pro_subscriptions (
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
    `CREATE TABLE IF NOT EXISTS marketplace.notifications (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      title VARCHAR(200) NOT NULL,
      body TEXT,
      type VARCHAR(60) NOT NULL DEFAULT 'general',
      related_id BIGINT UNSIGNED NULL,
      is_read TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_notifications_user_read (user_id, is_read, created_at)
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS marketplace.reviews (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      product_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      seller_id BIGINT UNSIGNED NOT NULL,
      rating TINYINT UNSIGNED NOT NULL,
      comment TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_reviews_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_reviews_seller FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY uk_reviews_product_user (product_id, user_id),
      INDEX idx_reviews_seller (seller_id, created_at)
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS marketplace.app_settings (
      \`key\` VARCHAR(120) PRIMARY KEY,
      \`value\` TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`,
    `INSERT INTO marketplace.app_settings(\`key\`, \`value\`) VALUES('token_price','25000')
     ON DUPLICATE KEY UPDATE \`value\`=\`value\``,
  ];

  for (const statement of statements) {
    await runMigration(connection, statement);
  }
}

async function setup() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_SETUP_USER || process.env.DB_USER || 'root',
    password: process.env.DB_SETUP_PASSWORD ?? process.env.DB_PASSWORD ?? '',
    charset: 'utf8mb4',
    multipleStatements: false,
  });
  await runSql(connection, 'schema.sql');
  await applyMigrations(connection);
  await connection.query(`ALTER TABLE marketplace.transactions MODIFY type ENUM('wallet_charge','package_purchase','product_purchase','pro_usage','seller_package_purchase','company_income','refund') NOT NULL`);
  await runSql(connection, 'seed.sql');
  await connection.end();
  console.log('Database marketplace is ready.');
}

setup().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
