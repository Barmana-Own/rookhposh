const { addColumn } = require('./tryonSchema');

const reasons = [
  ['low_image_quality', 'کیفیت پایین تصاویر'],
  ['inappropriate_main_image', 'نامناسب‌بودن تصویر اصلی'],
  ['image_product_mismatch', 'مغایرت تصاویر با محصول'],
  ['incomplete_information', 'ناقص‌بودن اطلاعات محصول'],
  ['title_mismatch', 'مغایرت عنوان با محتوای محصول'],
  ['invalid_description', 'توضیحات ناقص یا نامعتبر'],
  ['wrong_category', 'دسته‌بندی اشتباه'],
  ['duplicate_product', 'محصول تکراری'],
  ['policy_violation', 'مغایرت با قوانین فروشگاه'],
  ['other', 'سایر موارد'],
];

async function ensureReviewSchema(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS product_rejection_reasons (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
    title VARCHAR(180) NOT NULL,
    description VARCHAR(500) NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    requires_comment TINYINT(1) NOT NULL DEFAULT 0,
    sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);
  await connection.query(`CREATE TABLE IF NOT EXISTS product_review_decisions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    product_id BIGINT UNSIGNED NULL,
    actor_id BIGINT UNSIGNED NULL,
    action ENUM('approved','rejected') NOT NULL,
    reason_id INT UNSIGNED NULL,
    reason_title VARCHAR(180) NULL,
    comment TEXT NULL,
    actor_name VARCHAR(160) NULL,
    snapshot_json JSON NULL,
    previous_status VARCHAR(20) NOT NULL,
    next_status VARCHAR(20) NOT NULL,
    reviewed_revision INT UNSIGNED NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_product_decisions(product_id,created_at,id),
    CONSTRAINT fk_product_decision_product FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE SET NULL,
    CONSTRAINT fk_product_decision_actor FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`);
  await connection.query(`CREATE TABLE IF NOT EXISTS product_review_views (
    id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    product_id BIGINT UNSIGNED NOT NULL,
    actor_id BIGINT UNSIGNED NOT NULL,
    revision INT UNSIGNED NOT NULL,
    decision_id BIGINT UNSIGNED NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    expires_at DATETIME(3) NOT NULL,
    INDEX idx_product_review_views(product_id,actor_id,expires_at),
    CONSTRAINT fk_product_view_product FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
    CONSTRAINT fk_product_view_actor FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  const [[decisionReference]] = await connection.query("SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='product_review_decisions' AND COLUMN_NAME='product_id'");
  if (decisionReference?.IS_NULLABLE === 'NO') {
    await connection.query('ALTER TABLE product_review_decisions DROP FOREIGN KEY fk_product_decision_product, MODIFY product_id BIGINT UNSIGNED NULL, ADD CONSTRAINT fk_product_decision_product FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE SET NULL');
  }
  const [[viewReference]] = await connection.query("SELECT DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME='fk_product_view_product'");
  if (viewReference && viewReference.DELETE_RULE !== 'CASCADE') {
    await connection.query('ALTER TABLE product_review_views DROP FOREIGN KEY fk_product_view_product, ADD CONSTRAINT fk_product_view_product FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE');
  }
  for (const sql of [
    'ALTER TABLE products ADD COLUMN review_revision INT UNSIGNED NOT NULL DEFAULT 1',
    "ALTER TABLE products ADD COLUMN review_status VARCHAR(16) NULL",
    'ALTER TABLE products ADD COLUMN reject_reason_id INT UNSIGNED NULL',
    'ALTER TABLE products ADD COLUMN reject_comment TEXT NULL',
    'ALTER TABLE products ADD COLUMN reviewed_by BIGINT UNSIGNED NULL',
    'ALTER TABLE products ADD COLUMN reviewed_at DATETIME(3) NULL',
  ]) await addColumn(connection, sql);
  for (const [index, [code, title]] of reasons.entries()) {
    await connection.query(
      'INSERT INTO product_rejection_reasons(code,title,requires_comment,sort_order) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE code=code',
      [code, title, code === 'other' ? 1 : 0, index + 1],
    );
  }
}

module.exports = { ensureReviewSchema, reasons };
