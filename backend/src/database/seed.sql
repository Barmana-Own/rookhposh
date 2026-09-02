USE marketplace;

SET @password_hash = '$2b$10$fUVgYWXMv8hMtYot01/y.uiI/.62MzR3bmsR37jChgIB2T7IwWJM6';

INSERT INTO users(fullname,username,email,mobile,password,role,status,seller_verification_status,wallet_balance) VALUES
('مدیر سیستم','admin','admin@example.com','09120000001',@password_hash,'Admin','active','none',0),
('فروشگاه نمونه','seller','seller@example.com','09120000002',@password_hash,'Seller','active','approved',4200000),
('کاربر نمونه','user','user@example.com','09120000003',@password_hash,'User','active','none',8450000),
('سارا رضایی','user2','sara@example.com','09120000004',@password_hash,'User','active','none',3250000),
('محمد مهدی','user3','mehdi@example.com','09120000005',@password_hash,'User','active','none',6100000),
('فروشگاه در انتظار','seller_pending','pending-seller@example.com','09120000006',@password_hash,'Seller','active','pending',1800000),
('فروشگاه رد شده','seller_rejected','rejected-seller@example.com','09120000007',@password_hash,'Seller','active','rejected',900000)
ON DUPLICATE KEY UPDATE
  fullname=VALUES(fullname),
  email=VALUES(email),
  mobile=VALUES(mobile),
  password=VALUES(password),
  role=VALUES(role),
  status=VALUES(status),
  seller_verification_status=VALUES(seller_verification_status),
  wallet_balance=VALUES(wallet_balance),
  updated_at=CURRENT_TIMESTAMP;

SET @admin_id = (SELECT id FROM users WHERE username='admin');
SET @seller_id = (SELECT id FROM users WHERE username='seller');
SET @seller_pending_id = (SELECT id FROM users WHERE username='seller_pending');
SET @seller_rejected_id = (SELECT id FROM users WHERE username='seller_rejected');
SET @user_id = (SELECT id FROM users WHERE username='user');
SET @user2_id = (SELECT id FROM users WHERE username='user2');
SET @user3_id = (SELECT id FROM users WHERE username='user3');

INSERT INTO stores(seller_id,store_name,slug,description,status) VALUES
(@seller_id,'فروشگاه نمونه','sample-store','فروشگاه رسمی نمونه با چند محصول تایید شده','active'),
(@seller_pending_id,'فروشگاه در انتظار','pending-store','فروشگاهی که هنوز تایید هویت کامل ندارد','active'),
(@seller_rejected_id,'فروشگاه رد شده','rejected-store','نمونه فروشگاه رد شده برای تست پنل ادمین','inactive')
ON DUPLICATE KEY UPDATE
  store_name=VALUES(store_name),
  slug=VALUES(slug),
  description=VALUES(description),
  status=VALUES(status);

DELETE FROM products
WHERE seller_id=@seller_id
  AND title IN (
    'قالب فروشگاهی پریمیوم',
    'پکیج تبلیغات شبکه اجتماعی',
    'ابزار گزارش فروش',
    'محصول در انتظار بررسی',
    'محصول رد شده'
  );

INSERT INTO products(seller_id,title,description,price,images,status,reject_reason,created_at) VALUES
(@seller_id,'قالب فروشگاهی پریمیوم','قالب آماده برای ساخت فروشگاه آنلاین با طراحی واکنش‌گرا',1250000,JSON_ARRAY('/images/products/white-tshirt.png'),'active',NULL,DATE_SUB(NOW(), INTERVAL 80 DAY)),
(@seller_id,'پکیج تبلیغات شبکه اجتماعی','کمپین تبلیغاتی برای افزایش فروش محصولات فروشگاه',2350000,JSON_ARRAY('/images/products/white-tshirt.png'),'active',NULL,DATE_SUB(NOW(), INTERVAL 55 DAY)),
(@seller_id,'ابزار گزارش فروش','داشبورد تحلیلی برای بررسی سفارش‌ها، مشتریان و درآمد',1750000,JSON_ARRAY('/images/products/white-tshirt.png'),'active',NULL,DATE_SUB(NOW(), INTERVAL 25 DAY)),
(@seller_id,'محصول در انتظار بررسی','این محصول بعد از ثبت در فروشگاه باید توسط ادمین بررسی شود',980000,JSON_ARRAY('/images/products/white-tshirt.png'),'pending',NULL,DATE_SUB(NOW(), INTERVAL 3 DAY)),
(@seller_id,'محصول رد شده','نمونه محصول رد شده برای تست وضعیت‌ها',720000,JSON_ARRAY('/images/products/white-tshirt.png'),'rejected','تصویر و توضیحات محصول کافی نیست.',DATE_SUB(NOW(), INTERVAL 8 DAY));

SET @product_1 = (SELECT id FROM products WHERE seller_id=@seller_id AND title='قالب فروشگاهی پریمیوم' ORDER BY id DESC LIMIT 1);
SET @product_2 = (SELECT id FROM products WHERE seller_id=@seller_id AND title='پکیج تبلیغات شبکه اجتماعی' ORDER BY id DESC LIMIT 1);
SET @product_3 = (SELECT id FROM products WHERE seller_id=@seller_id AND title='ابزار گزارش فروش' ORDER BY id DESC LIMIT 1);

DELETE FROM seller_customers WHERE seller_id=@seller_id AND user_id IN (@user_id,@user2_id,@user3_id);
INSERT IGNORE INTO seller_customers(seller_id,user_id,created_at) VALUES
(@seller_id,@user_id,DATE_SUB(NOW(), INTERVAL 65 DAY)),
(@seller_id,@user2_id,DATE_SUB(NOW(), INTERVAL 28 DAY)),
(@seller_id,@user3_id,DATE_SUB(NOW(), INTERVAL 9 DAY));

DELETE FROM pro_usages WHERE description LIKE '%[seed]%';
DELETE FROM transactions WHERE description LIKE '%[seed]%';

INSERT INTO transactions(user_id,seller_id,type,amount,status,description,created_at) VALUES
(@user_id,NULL,'wallet_charge',8500000,'success','شارژ کیف پول [seed]',DATE_SUB(NOW(), INTERVAL 120 DAY)),
(@user_id,@seller_id,'product_purchase',1250000,'success','خرید قالب فروشگاهی پریمیوم [seed]',DATE_SUB(NOW(), INTERVAL 95 DAY)),
(@user_id,@seller_id,'pro_usage',340000,'success','استفاده از سرویس پرو [seed]',DATE_SUB(NOW(), INTERVAL 49 DAY)),
(@user_id,@seller_id,'product_purchase',1750000,'success','خرید ابزار گزارش فروش [seed]',DATE_SUB(NOW(), INTERVAL 18 DAY)),
(@user2_id,@seller_id,'product_purchase',2350000,'success','خرید پکیج تبلیغات شبکه اجتماعی [seed]',DATE_SUB(NOW(), INTERVAL 42 DAY)),
(@user3_id,@seller_id,'product_purchase',1250000,'success','خرید قالب فروشگاهی پریمیوم [seed]',DATE_SUB(NOW(), INTERVAL 11 DAY)),
(@admin_id,NULL,'company_income',520000,'success','درآمد شرکت از کارمزد فروش [seed]',DATE_SUB(NOW(), INTERVAL 28 DAY)),
(@admin_id,NULL,'company_income',760000,'success','درآمد شرکت از فروش سرویس‌ها [seed]',DATE_SUB(NOW(), INTERVAL 9 DAY));

DELETE tm FROM ticket_messages tm
JOIN tickets t ON t.id=tm.ticket_id
WHERE t.title IN ('مشکل در خرید پکیج نمونه','درخواست بررسی محصول نمونه','سوال درباره کیف پول نمونه');

DELETE FROM tickets
WHERE title IN ('مشکل در خرید پکیج نمونه','درخواست بررسی محصول نمونه','سوال درباره کیف پول نمونه');

INSERT INTO tickets(user_id,title,priority,status,created_at) VALUES
(@user_id,'مشکل در خرید پکیج نمونه','high','answered',DATE_SUB(NOW(), INTERVAL 6 DAY));
SET @ticket_user = LAST_INSERT_ID();
INSERT INTO ticket_messages(ticket_id,sender_id,message,created_at) VALUES
(@ticket_user,@user_id,'بعد از خرید پکیج، رسید را در تراکنش‌ها نمی‌بینم.',DATE_SUB(NOW(), INTERVAL 6 DAY)),
(@ticket_user,@admin_id,'رسید خرید بررسی شد و در بخش تراکنش‌ها قابل مشاهده است.',DATE_SUB(NOW(), INTERVAL 5 DAY));

INSERT INTO tickets(user_id,title,priority,status,created_at) VALUES
(@seller_id,'درخواست بررسی محصول نمونه','medium','open',DATE_SUB(NOW(), INTERVAL 3 DAY));
SET @ticket_seller = LAST_INSERT_ID();
INSERT INTO ticket_messages(ticket_id,sender_id,message,created_at) VALUES
(@ticket_seller,@seller_id,'لطفا محصول در انتظار بررسی را تایید کنید.',DATE_SUB(NOW(), INTERVAL 3 DAY));

INSERT INTO tickets(user_id,title,priority,status,created_at) VALUES
(@user2_id,'سوال درباره کیف پول نمونه','low','closed',DATE_SUB(NOW(), INTERVAL 20 DAY));
SET @ticket_closed = LAST_INSERT_ID();
INSERT INTO ticket_messages(ticket_id,sender_id,message,created_at) VALUES
(@ticket_closed,@user2_id,'چطور می‌توانم کیف پول را شارژ کنم؟',DATE_SUB(NOW(), INTERVAL 20 DAY)),
(@ticket_closed,@admin_id,'از بخش کیف پول، مبلغ را وارد و دکمه شارژ را بزنید.',DATE_SUB(NOW(), INTERVAL 19 DAY));
