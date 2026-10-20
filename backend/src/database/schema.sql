CREATE DATABASE IF NOT EXISTS marketplace CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE marketplace;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  fullname VARCHAR(160) NOT NULL,
  username VARCHAR(80) NOT NULL UNIQUE,
  email VARCHAR(160) UNIQUE,
  mobile VARCHAR(20),
  avatar LONGTEXT,
  province VARCHAR(120),
  city VARCHAR(120),
  address TEXT,
  postal_code VARCHAR(20),
  national_code VARCHAR(20),
  password VARCHAR(255) NOT NULL,
  role ENUM('User','Seller','Admin') NOT NULL DEFAULT 'User',
  status ENUM('active','blocked') NOT NULL DEFAULT 'active',
  seller_verification_status ENUM('none','pending','approved','rejected') NOT NULL DEFAULT 'none',
  seller_reject_reason TEXT,
  wallet_balance DECIMAL(15,0) NOT NULL DEFAULT 0,
  pro_unlimited TINYINT(1) NOT NULL DEFAULT 0,
  referred_seller_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role_status (role, status),
  INDEX idx_users_seller_verification (seller_verification_status),
  INDEX idx_users_role_id (role, id),
  INDEX idx_users_role_verification_id (role, seller_verification_status, id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS packages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  description TEXT,
  price DECIMAL(15,0) NOT NULL DEFAULT 0,
  role_type ENUM('user','seller') NOT NULL,
  pro_requests_count INT UNSIGNED NOT NULL DEFAULT 0,
  monthly_pro_request_limit INT UNSIGNED NOT NULL DEFAULT 0,
  duration_days INT UNSIGNED NOT NULL DEFAULT 30,
  features JSON,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_packages_title_role (title, role_type),
  INDEX idx_packages_role_status (role_type, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS app_settings (
  `key` VARCHAR(120) PRIMARY KEY,
  `value` TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  seller_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT,
  features JSON,
  price DECIMAL(15,0) NOT NULL DEFAULT 0,
  images JSON,
  qr_code LONGTEXT,
  status ENUM('pending','active','rejected') NOT NULL DEFAULT 'pending',
  publish_status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  pending_changes JSON,
  reject_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_products_seller FOREIGN KEY (seller_id) REFERENCES users(id),
  INDEX idx_products_seller_status (seller_id, status),
  INDEX idx_products_publish_status (publish_status),
  INDEX idx_products_status (status),
  INDEX idx_products_status_id (status, id),
  INDEX idx_products_updated_id (updated_at, id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS seller_customers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  seller_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  fullname VARCHAR(160),
  mobile VARCHAR(20),
  province VARCHAR(120),
  city VARCHAR(120),
  address TEXT,
  postal_code VARCHAR(20),
  national_code VARCHAR(20),
  last_product_title VARCHAR(180),
  last_order_id BIGINT UNSIGNED,
  last_order_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_seller_customers_seller FOREIGN KEY (seller_id) REFERENCES users(id),
  CONSTRAINT fk_seller_customers_user FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE KEY uk_seller_customer (seller_id, user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS transactions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  seller_id BIGINT UNSIGNED NULL,
  product_id BIGINT UNSIGNED NULL,
  package_id BIGINT UNSIGNED NULL,
  type ENUM('wallet_charge','package_purchase','product_purchase','pro_usage','seller_package_purchase','company_income','refund') NOT NULL,
  amount DECIMAL(15,0) NOT NULL DEFAULT 0,
  status ENUM('pending','success','failed') NOT NULL DEFAULT 'success',
  description TEXT,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_transactions_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_transactions_seller FOREIGN KEY (seller_id) REFERENCES users(id),
  CONSTRAINT fk_transactions_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_transactions_package FOREIGN KEY (package_id) REFERENCES packages(id),
  INDEX idx_transactions_user_type (user_id, type),
  INDEX idx_transactions_seller_type (seller_id, type),
  INDEX idx_transactions_created_at (created_at),
  INDEX idx_transactions_status_id (status, id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS gateway_payments (
  id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  transaction_id BIGINT UNSIGNED NOT NULL UNIQUE,
  user_id BIGINT UNSIGNED NOT NULL,
  request_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  order_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  amount_rial BIGINT UNSIGNED NOT NULL,
  token VARCHAR(256) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE,
  bank_reference VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE,
  state ENUM('created','pending','verifying','verified','success','failed') NOT NULL DEFAULT 'created',
  lock_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
  locked_at DATETIME(3) NULL,
  bank_verified_at DATETIME(3) NULL,
  last_error VARCHAR(80) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_gateway_payments_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
  UNIQUE KEY uk_gateway_payments_request (user_id, request_key),
  INDEX idx_gateway_payments_state_created (state, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pro_usages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  package_id BIGINT UNSIGNED NULL,
  product_id BIGINT UNSIGNED NULL,
  amount DECIMAL(15,0) NOT NULL DEFAULT 0,
  status ENUM('success','failed') NOT NULL DEFAULT 'success',
  description TEXT,
  input_image LONGTEXT,
  product_image LONGTEXT,
  output_image LONGTEXT,
  ip_address VARCHAR(64),
  is_free_trial TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pro_usages_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_pro_usages_package FOREIGN KEY (package_id) REFERENCES packages(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pro_uploads (
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
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pro_subscriptions (
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
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stores (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  seller_id BIGINT UNSIGNED NOT NULL UNIQUE,
  store_name VARCHAR(160) NOT NULL,
  slug VARCHAR(180) NOT NULL UNIQUE,
  description TEXT,
  contact_phone VARCHAR(30),
  logo LONGTEXT,
  banner LONGTEXT,
  qr_code LONGTEXT,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_stores_seller FOREIGN KEY (seller_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tickets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  priority ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  status ENUM('open','answered','closed') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tickets_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_tickets_user_status (user_id, status),
  INDEX idx_tickets_status_id (status, id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ticket_messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id BIGINT UNSIGNED NOT NULL,
  sender_id BIGINT UNSIGNED NOT NULL,
  message TEXT NOT NULL,
  attachment LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ticket_messages_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_ticket_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  body TEXT,
  type VARCHAR(60) NOT NULL DEFAULT 'general',
  related_id BIGINT UNSIGNED NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notifications_user_read (user_id, is_read, created_at),
  INDEX idx_notifications_user_read_id (user_id, is_read, id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reviews (
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
) ENGINE=InnoDB;
