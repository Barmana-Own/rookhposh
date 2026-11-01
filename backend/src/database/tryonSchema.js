const { providerOrigin } = require('../tryon/config');

const statements = [
  `CREATE TABLE IF NOT EXISTS virtual_tryon_providers (
    id TINYINT UNSIGNED PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    adapter VARCHAR(32) NOT NULL,
    endpoint VARCHAR(1024) NOT NULL,
    model VARCHAR(160) NULL,
    secret_ciphertext TEXT NULL,
    enabled TINYINT(1) NOT NULL DEFAULT 0,
    priority TINYINT UNSIGNED NOT NULL DEFAULT 1,
    timeout_seconds SMALLINT UNSIGNED NOT NULL DEFAULT 300,
    retry_limit TINYINT UNSIGNED NOT NULL DEFAULT 0,
    options_json JSON NULL,
    cooldown_until DATETIME(3) NULL,
    consecutive_failures INT UNSIGNED NOT NULL DEFAULT 0,
    last_error_code VARCHAR(80) NULL,
    updated_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT ck_tryon_provider_slots CHECK (id BETWEEN 1 AND 3)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS virtual_tryon_jobs (
    id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    owner_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    owner_kind ENUM('account','visitor','legacy') NOT NULL,
    user_id BIGINT UNSIGNED NULL,
    seller_id BIGINT UNSIGNED NULL,
    product_id BIGINT UNSIGNED NULL,
    product_title VARCHAR(180) NULL,
    product_slug VARCHAR(180) NULL,
    image_index SMALLINT UNSIGNED NULL,
    variant_id VARCHAR(80) NULL,
    request_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    active_owner_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE,
    status VARCHAR(16) NOT NULL DEFAULT 'validating',
    stage TINYINT UNSIGNED NOT NULL DEFAULT 1,
    progress TINYINT UNSIGNED NULL,
    credit_reserved TINYINT(1) NOT NULL DEFAULT 0,
    reserved_at DATETIME(3) NULL,
    quota_source VARCHAR(16) NULL,
    subscription_id BIGINT UNSIGNED NULL,
    package_id BIGINT UNSIGNED NULL,
    usage_id BIGINT UNSIGNED NULL UNIQUE,
    legacy_upload_id BIGINT UNSIGNED NULL UNIQUE,
    legacy_usage_id BIGINT UNSIGNED NULL UNIQUE,
    legacy_endpoint VARCHAR(16) NULL,
    successful_provider_id TINYINT UNSIGNED NULL,
    successful_provider_name VARCHAR(120) NULL,
    model VARCHAR(160) NULL,
    provider_output_ciphertext TEXT NULL,
    attempts_count INT UNSIGNED NOT NULL DEFAULT 0,
    retry_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
    last_retry_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    retryable TINYINT(1) NOT NULL DEFAULT 0,
    needs_reconciliation TINYINT(1) NOT NULL DEFAULT 0,
    retry_after DATETIME(3) NULL,
    error_code VARCHAR(80) NULL,
    error_message VARCHAR(500) NULL,
    device_json JSON NULL,
    network_ciphertext TEXT NULL,
    diagnostics_consent TINYINT(1) NOT NULL DEFAULT 0,
    diagnostics_expires_at DATETIME(3) NULL,
    processing_consent_at DATETIME(3) NULL,
    privacy_version VARCHAR(32) NULL,
    lock_token CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
    lease_until DATETIME(3) NULL,
    started_at DATETIME(3) NULL,
    completed_at DATETIME(3) NULL,
    deleted_at DATETIME(3) NULL,
    images_purged_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uk_tryon_owner_request(owner_hash,request_key),
    INDEX idx_tryon_owner_completed(owner_hash,status,completed_at,id),
    INDEX idx_tryon_state_queue(status,lease_until,created_at),
    INDEX idx_tryon_seller_reservations(seller_id,credit_reserved,quota_source,subscription_id,created_at),
    INDEX idx_tryon_product_created(product_id,created_at,id),
    INDEX idx_tryon_created(created_at,id),
    INDEX idx_tryon_deleted(deleted_at,images_purged_at),
    CONSTRAINT fk_tryon_job_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_tryon_job_product FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE SET NULL,
    CONSTRAINT fk_tryon_job_seller FOREIGN KEY(seller_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS virtual_tryon_files (
    id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    job_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    kind ENUM('input','product','output') NOT NULL,
    storage_key VARCHAR(160) NOT NULL UNIQUE,
    mime VARCHAR(40) NOT NULL,
    extension VARCHAR(8) NOT NULL,
    byte_size INT UNSIGNED NOT NULL,
    width INT UNSIGNED NOT NULL,
    height INT UNSIGNED NOT NULL,
    sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uk_tryon_job_file(job_id,kind),
    CONSTRAINT fk_tryon_file_job FOREIGN KEY(job_id) REFERENCES virtual_tryon_jobs(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS virtual_tryon_attempts (
    id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    job_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    sequence_no INT UNSIGNED NOT NULL,
    provider_id TINYINT UNSIGNED NOT NULL,
    provider_name VARCHAR(120) NOT NULL,
    model VARCHAR(160) NULL,
    state VARCHAR(20) NOT NULL,
    request_id VARCHAR(100) NULL,
    error_code VARCHAR(80) NULL,
    technical_message VARCHAR(500) NULL,
    recoverable TINYINT(1) NOT NULL DEFAULT 0,
    uncertain TINYINT(1) NOT NULL DEFAULT 0,
    retry_after_seconds INT UNSIGNED NULL,
    cost_amount DECIMAL(18,6) NULL,
    cost_currency VARCHAR(12) NULL,
    started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    completed_at DATETIME(3) NULL,
    duration_ms INT UNSIGNED NULL,
    UNIQUE KEY uk_tryon_attempt_sequence(job_id,sequence_no),
    INDEX idx_tryon_attempt_provider(provider_id,started_at),
    CONSTRAINT fk_tryon_attempt_job FOREIGN KEY(job_id) REFERENCES virtual_tryon_jobs(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS virtual_tryon_audit (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    actor_id BIGINT UNSIGNED NULL,
    action VARCHAR(80) NOT NULL,
    target_id VARCHAR(80) NULL,
    details_json JSON NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_tryon_audit_target(target_id,created_at),
    INDEX idx_tryon_audit_actor(actor_id,created_at)
  ) ENGINE=InnoDB`,
];

async function addColumn(connection, sql) {
  try { await connection.query(sql); } catch (error) {
    if (!['ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME'].includes(error.code)) throw error;
  }
}

async function ensureTryonSchema(connection) {
  for (const sql of statements) await connection.query(sql);
  for (const sql of [
    'ALTER TABLE virtual_tryon_jobs ADD COLUMN reserved_at DATETIME(3) NULL',
    'ALTER TABLE virtual_tryon_jobs ADD COLUMN provider_output_ciphertext TEXT NULL',
    'ALTER TABLE virtual_tryon_jobs ADD COLUMN processing_consent_at DATETIME(3) NULL',
    'ALTER TABLE virtual_tryon_jobs ADD COLUMN privacy_version VARCHAR(32) NULL',
    'ALTER TABLE virtual_tryon_jobs ADD COLUMN images_purged_at DATETIME(3) NULL',
    'ALTER TABLE virtual_tryon_jobs ADD INDEX idx_tryon_deleted(deleted_at,images_purged_at)',
    'ALTER TABLE pro_usages ADD COLUMN visitor_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL',
    'ALTER TABLE pro_usages ADD COLUMN tryon_job_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL',
    'ALTER TABLE pro_usages ADD COLUMN completed_at DATETIME(3) NULL',
    'ALTER TABLE pro_usages ADD UNIQUE INDEX uk_pro_usage_tryon_job (tryon_job_id)',
    'ALTER TABLE pro_usages ADD INDEX idx_pro_usage_owner (visitor_hash,status,created_at,id)',
    'ALTER TABLE pro_uploads ADD COLUMN visitor_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL',
    'ALTER TABLE pro_uploads ADD COLUMN tryon_job_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL',
    'ALTER TABLE pro_uploads ADD INDEX idx_pro_upload_visitor (visitor_hash,status,id)',
  ]) await addColumn(connection, sql);
  await connection.query(
    `INSERT INTO virtual_tryon_providers(id,name,adapter,endpoint,enabled,priority,options_json)
     VALUES(1,?,'rookhposh_multipart',?,1,1,?)
     ON DUPLICATE KEY UPDATE id=id`,
    ['سرویس فعلی پرو مجازی', new URL('/try-on', providerOrigin).href, JSON.stringify({ output_hosts: ['kwai-kolors-kolors-virtual-try-on.hf.space'] })],
  );
  // Preserve every old row. Unknown anonymous owners are deliberately NOT inferred from IP.
  await connection.query(
    `INSERT IGNORE INTO virtual_tryon_jobs(
      id,owner_hash,owner_kind,user_id,seller_id,product_id,product_title,request_key,request_hash,status,stage,progress,
      usage_id,legacy_usage_id,created_at,started_at,completed_at,error_code,error_message)
     SELECT MD5(CONCAT('legacy-tryon:',pu.id)),
       SHA2(IF(pu.user_id IS NULL,CONCAT('legacy:',pu.id),CONCAT('account:',pu.user_id)),256),
       IF(pu.user_id IS NULL,'legacy','account'),pu.user_id,p.seller_id,pu.product_id,p.title,
       CONCAT('legacy-',pu.id),SHA2(CONCAT('legacy:',pu.id),256),
       IF(pu.status='success','completed','failed'),4,IF(pu.status='success',100,NULL),
       pu.id,pu.id,pu.created_at,NULL,pu.created_at,
       IF(pu.status='success',NULL,'LEGACY_FAILURE'),IF(pu.status='success',NULL,'عملیات قدیمی ناموفق ثبت شده است.')
     FROM pro_usages pu LEFT JOIN products p ON p.id=pu.product_id
     WHERE pu.tryon_job_id IS NULL`,
  );
}

module.exports = { ensureTryonSchema, addColumn, statements };
