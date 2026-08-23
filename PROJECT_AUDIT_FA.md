# چک‌لیست کامل مشکلات پروژه

تاریخ بررسی: ۲۰۲۶-۰۸-۲۳

این چک‌لیست حاصل بررسی استاتیک کل Backend، Frontend، SQL، تنظیمات و فایل‌های عملیاتی پروژه است. هر مورد مشکل یا کار باقی‌مانده است و تا زمان اصلاح با `[ ]` باقی می‌ماند؛ بعد از رفع و اعتبارسنجی می‌توان آن را به `[x]` تغییر داد. مواردی که به MySQL، سرویس واقعی هوش مصنوعی، مرورگر یا محیط استقرار نیاز دارند در بخش اعتبارسنجی به‌عنوان «تأییدنشده در اجرا» مشخص شده‌اند. هیچ اصلاحی در کد محصول انجام نشده است.

## ۱) وضعیت کلی و کیفیت انتشار

- [ ] 1. پروژه در این مسیر مخزن Git نیست؛ پوشه .git وجود ندارد و git status با خطای not a git repository تمام می‌شود؛ تاریخچه، diff قابل اعتماد و rollback نسخه‌ای در دسترس نیست.
- [ ] 2. README، راهنمای نصب، قرارداد API، مستند معماری و راهنمای استقرار وجود ندارد.
- [ ] 3. تست واحد، تست یکپارچه، تست API، تست E2E و تست مرورگر در پروژه وجود ندارد؛ پیکربندی Jest/Vitest/Playwright/Cypress پیدا نشد.
- [ ] 4. اسکریپت npm test در ریشه فقط npm run lint را اجرا می‌کند و تست نیست؛ بنابراین ادعای تست در FIX_TASKS.md قابل اثبات نیست.
- [ ] 5. npm test فعلی fail است: خطای react-hooks/set-state-in-effect در frontend/src/pages/PublicProduct.jsx:166 و هشدار dependency در خط ۱۶۷.
- [ ] 6. چهار هشدار Fast Refresh در button.jsx، AuthContext.jsx، ThemeContext.jsx و UserContext.jsx باقی مانده است.
- [ ] 7. build موفق فقط bundle شدن را ثابت می‌کند؛ صحت DB، auth، پرداخت، provider، مجوزها و جریان‌های واقعی ثابت نشده است.
- [ ] 8. lint بک‌اند عملاً فقط node --check src/server.js است و lint واقعی، rule امنیتی یا coverage ندارد.
- [ ] 9. dependencyهای زیادی با مقدار latest در package.json ثبت شده‌اند؛ حتی با وجود lockfile، بازتولید محیط بدون استفاده دقیق از lock قابل اتکا نیست.
- [ ] 10. چند dependency و فایل قدیمی/بلااستفاده مثل multer، RoleLayout.jsx، RoleDashboard.jsx و Forbidden.jsx باقی مانده و معماری قدیمی و جدید هم‌زمان نگه‌داری می‌شوند.
- [ ] 11. CI، اسکن امنیتی، تست پیش از merge، release pipeline و کنترل اجباری lint وجود ندارد.
- [ ] 12. DEBUG_REPORT.md و FIX_TASKS.md با وضعیت فعلی تضاد دارند؛ از جمله ادعای تست واحد و lint/build موفق در حالی که تست وجود ندارد و lint فعلی fail است.
- [ ] 13. داده‌های تست، debug و E2E در full-dump.sql با داده قابل استفاده مخلوط شده‌اند و مرز محیط توسعه/واقعی مشخص نیست.

## ۲) تنظیمات، استقرار و عملیات

- [ ] 14. اگر JWT_SECRET تنظیم نشود، مقدار ناامن change-this-secret استفاده می‌شود و برنامه production با secret پیش‌فرض متوقف نمی‌شود: backend/src/config/env.js:11.
- [ ] 15. تنظیم پیش‌فرض DB کاربر root با password خالی است: backend/src/config/env.js:13-18 و backend/.env.example:3-7.
- [ ] 16. origin پیش‌فرض Pro روی HTTP و IP خام 91.107.232.169:6000 است؛ تصویر کاربر و توکن روی شبکه رمزنگاری‌نشده ارسال می‌شود: env.js:9.
- [ ] 17. FRONTEND_URL پیش‌فرض localhost است؛ در صورت تنظیم نشدن، QR فروشگاه به http://localhost:5173 اشاره می‌کند: sellerController.js:5 و sellerService.js:33,42.
- [ ] 18. frontend/public/.htaccess API را به localhost:5050 و Pro را به HTTP IP proxy می‌کند؛ برای production، TLS، timeout و خطای upstream قابل اتکا نیست.
- [ ] 19. frontend/vite.config.js نیز proxy توسعه را به همان IP HTTP hardcode کرده است.
- [ ] 20. endpoint /health فقط متن ثابت برمی‌گرداند و اتصال MySQL، schema، pool، provider یا readiness را بررسی نمی‌کند: backend/src/app.js:30.
- [ ] 21. server.js graceful shutdown، SIGTERM handling، drain pool و مدیریت خطای listen ندارد.
- [ ] 22. ensureRuntimeSchema در هر startup ده‌ها ALTER TABLE و CREATE TABLE اجرا می‌کند؛ نیاز به DDL privilege در runtime، تأخیر startup و race بین چند instance دارد.
- [ ] 23. migration version، checksum، ترتیب رسمی، transaction و rollback وجود ندارد.
- [ ] 24. setup.js و runtimeSetup.js migrationهای جدا و drift کرده دارند؛ setup همه ستون‌هایی را که runtime و repository انتظار دارند ایجاد نمی‌کند.
- [ ] 25. ER_CANT_CREATE_TABLE و بعضی خطاهای migration عمداً ignore می‌شوند و خطای واقعی foreign key/schema پنهان می‌ماند: setup.js:12-24 و runtimeSetup.js:3-16.
- [ ] 26. setup.js SQL را با split ساده روی ; می‌شکند؛ این parser در برابر semicolon داخل string یا SQL پیچیده امن نیست.
- [ ] 27. schema، seed، setup و migrationها DB را hardcode شده روی marketplace می‌خواهند، اما pool از DB_NAME می‌خواند؛ DB_NAME متفاوت باعث می‌شود setup و API روی دو DB کار کنند.
- [ ] 28. full-dump.sql با DROP DATABASE IF EXISTS شروع می‌شود؛ restore بدون guard یا تأیید می‌تواند کل DB را حذف کند.
- [ ] 29. export.js schema را وارد dump می‌کند، اما tableOrder داده‌های app_settings و pro_subscriptions را export نمی‌کند؛ restore تنظیمات/subscription را از دست می‌دهد.
- [ ] 30. dump مستقیماً داخل backend/src/database/full-dump.sql نوشته می‌شود و retention، رمزنگاری، masking و access policy ندارد.
- [ ] 31. dump شامل password hash، PII، کد ملی، موبایل، آدرس، wallet و داده مالی است و برای share/commit امن نیست.
- [ ] 32. بخشی از فارسی dump به ???? تبدیل شده و داده‌های تاریخی debug داخل آن باقی مانده است.
- [ ] 33. seed با DELETE و ON DUPLICATE KEY UPDATE روی حساب‌ها، wallet و رکوردها اثر مخرب دارد؛ اجرای آن روی DB واقعی خطرناک است: backend/src/database/seed.sql:42-70.
- [ ] 34. seed حساب‌های فعال demo با hash مشترک دارد؛ password نمونه طبق گزارش پروژه password است: seed.sql:3-12.
- [ ] 35. logging فقط morgan/console است؛ correlation id، structured log، audit log، alert، rotation و redaction وجود ندارد.
- [ ] 36. pool با queueLimit=0 نامحدود است و در بار بالا صف حافظه بدون سقف می‌سازد: backend/src/config/database.js:4-10.

## ۳) احراز هویت و کنترل دسترسی

- [ ] 37. DEMO_AUTH=true بدون token برای مسیرهای Admin، Seller و User کاربر ثابت می‌سازد: backend/src/middlewares/authMiddleware.js:6-23؛ فعال شدن اشتباه آن bypass کامل auth است.
- [ ] 38. JWT فقط verify می‌شود و status جاری user از DB در هر request بررسی نمی‌شود.
- [ ] 39. user بعد از block شدن با token قبلی می‌تواند به endpointهای معمول دسترسی داشته باشد؛ AppLayout هم blocked را بررسی نمی‌کند.
- [ ] 40. authorizeApprovedSeller فقط seller_verification_status را می‌بیند و status را بررسی نمی‌کند؛ seller approved ولی blocked به مسیرهای seller می‌رسد: authMiddleware.js:39-47.
- [ ] 41. /api/auth/me برای blocked user هم داده می‌دهد و frontend آن را به logout/blocked page تبدیل نمی‌کند.
- [ ] 42. OTP واقعی ارسال نمی‌شود و dev_code همیشه در API response برمی‌گردد: backend/src/services/authService.js:55-74؛ در Login و SellerAuth هم نمایش داده می‌شود.
- [ ] 43. OTP با Math.random تولید می‌شود، نه CSPRNG: authService.js:51-53.
- [ ] 44. OTP به‌ازای mobile/IP rate limit، maximum attempt و resend cooldown ندارد؛ فقط rate limit عمومی ۲۴۰ درخواست در دقیقه وجود دارد.
- [ ] 45. OTPهای منقضی و ناموفق از otpStore حذف نمی‌شوند و Map رشد می‌کند؛ فقط verify موفق delete می‌شود.
- [ ] 46. mobile فقط حداقل طول ۱۰ دارد؛ فرمت واقعی ایران، طول دقیق، پیش‌شماره و سقف ورودی بررسی نمی‌شود.
- [ ] 47. mobile در DB unique/index نیست؛ duplicate account و duplicate user/seller ممکن است: schema.sql:9,25-26.
- [ ] 48. duplicate check ثبت‌نام اتمیک نیست و در race قابل دور زدن است.
- [ ] 49. حساب OTP تازه‌ساخته‌شده password قابل پیش‌بینی otp-شماره‌موبایل دارد؛ login با mobile/username می‌تواند account takeover ایجاد کند: authService.js:91-100.
- [ ] 50. forgotPassword فقط پیام موفقیت برمی‌گرداند و هیچ reset token/OTP/link یا تغییر رمز ندارد: authService.js:133-134.
- [ ] 51. changePassword validator، حداقل طول، strength check و کنترل مقدار خالی ندارد و ممکن است 500 بدهد.
- [ ] 52. تغییر password sessionهای قبلی را revoke نمی‌کند.
- [ ] 53. logout فقط پاسخ موفقیت است؛ server-side revocation/denylist وجود ندارد: authController.js:9.
- [ ] 54. login ادمین MFA، lockout، محدودیت تلاش، audit و password rotation ندارد.
- [ ] 55. token در localStorage نگه‌داری می‌شود: frontend/src/contexts/AuthContext.jsx:15-17,52-98؛ XSS احتمالی به session theft منجر می‌شود.
- [ ] 56. Authorization به‌صورت global روی Axios تنظیم شده و ممکن است برای URL خارجی هم ارسال شود: apiClient.js:15-18 و proOutput.js:28-41.
- [ ] 57. interceptor Axios خطای واقعی Axios را به object ساده تبدیل می‌کند و response/config/stack را دور می‌ریزد؛ retry و تشخیص خطای شبکه سخت می‌شود.
- [ ] 58. اگر VITE_API_BASE_URL در production اشتباهاً localhost باشد، بی‌صدا به base خالی تبدیل می‌شود و requestها به origin فعلی می‌روند.
- [ ] 59. error handler در محیطی که NODE_ENV دقیقاً production نباشد error.message خام را می‌دهد؛ SQL/internal error ممکن است افشا شود.
- [ ] 60. rate limiter یک Map داخل یک process است، بین instanceها share نمی‌شود، entry منقضی را پاک نمی‌کند، Retry-After ندارد و برای OTP/payment/Pro جدا نیست.
- [ ] 61. controllerهای IP مقدار x-forwarded-for را بدون اعتبارسنجی دقیق استفاده می‌کنند؛ در proxy اشتباه IP قابل جعل است.
- [ ] 62. safeUser فقط password را حذف می‌کند و mobile، کد ملی، آدرس، wallet و وضعیت را در responseهای user/admin منتشر می‌کند.

## ۴) امنیت proxy و سرویس Pro

- [ ] 63. /pro-api هر path و method را به origin forward می‌کند و allowlist endpoint ندارد: backend/src/middleware/proApiProxy.js:53-68.
- [ ] 64. header authorization توکن marketplace را به provider خارجی می‌فرستد: proApiProxy.js:61-67.
- [ ] 65. provider پیش‌فرض HTTP است و TLS policy یا secret جداگانه ندارد.
- [ ] 66. proxy از JSON provider هر URL تصویر HTTP/HTTPS را پیدا و سمت سرور fetch می‌کند؛ URL به host provider محدود نیست و SSRF/open outbound fetch ایجاد می‌کند.
- [ ] 67. response JSON و image سقف اندازه ندارند؛ body کامل buffer و image بدون cap pipe می‌شود.
- [ ] 68. timeout پروکسی ۳۰۰ ثانیه است و request طولانی worker/connection را اشغال می‌کند.
- [ ] 69. /api/pro-output عمومی و بدون auth است؛ فقط hostname را allow می‌کند و protocol، port، path، content-type و size را محدود نمی‌کند.
- [ ] 70. هر URL مجاز روی HTTP یا port دلخواه همان host proxy می‌شود و HTML/فایل بزرگ بدون بررسی pipe می‌شود.
- [ ] 71. اگر output ناشناخته باشد، frontend آن را unchanged برمی‌گرداند و downloadProOutput با Axios و Authorization آن را باز می‌کند.
- [ ] 72. input، product image و output به شکل base64 در DB ذخیره می‌شوند و MIME، magic bytes، dimension، تعداد و maximum size سمت server کنترل نمی‌شود.
- [ ] 73. مسیر Pro ابتدا provider را از browser صدا می‌زند و بعد نتیجه را در DB ثبت می‌کند؛ موفقیت provider و شکست ثبت DB باعث جدایی خروجی از history می‌شود.
- [ ] 74. client می‌تواند output_image و amount را به endpoint مصرف بدهد؛ backend خروجی provider را verify نمی‌کند.
- [ ] 75. createProUsageEnhanced برای user الزام active/published بودن product را ندارد و package/seller/product تا حدی از payload client می‌آیند.
- [ ] 76. spendWallet و insert در pro_usages در transaction مشترک نیستند؛ debit موفق و insert ناموفق می‌تواند wallet را کم کند ولی usage نسازد.
- [ ] 77. check quota و insert usage اتمیک نیستند؛ requestهای هم‌زمان از free limit عبور می‌کنند.
- [ ] 78. quota user احراز‌شده با IP و نه user_id محاسبه می‌شود؛ کاربران یک NAT quota مشترک دارند.
- [ ] 79. quota عمومی IP-based و بدون device binding/cookie امن است؛ با جعل forwarded IP قابل دور زدن است.
- [ ] 80. subscription فعال عملاً unlimited است؛ pro_requests_count و monthly_pro_request_limit فقط خوانده می‌شوند و enforce نمی‌شوند.
- [ ] 81. activateProSubscription overlap و idempotency ندارد؛ خریدهای تکراری چند subscription می‌سازند.
- [ ] 82. history عمومی بر اساس IP با input/output image برگردانده می‌شود؛ کاربران پشت یک IP تاریخچه همدیگر را می‌بینند.
- [ ] 83. history کاربر pagination ندارد و image کامل را یکجا برمی‌گرداند.
- [ ] 84. findProImageSource آرایه‌ها را درست traverse نمی‌کند؛ providerی که URL را داخل array بدهد ممکن است با «تصویر خروجی نداشت» fail شود.
- [ ] 85. imageSourceToFile هر source خارجی/data URL را بدون size و timeout به File تبدیل می‌کند.
- [ ] 86. fetch provider در browser AbortController، timeout، retry policy و خطای قابل تفکیک ندارد.

## ۵) کیف پول، پرداخت و امور مالی

- [ ] 87. direct_gateway درگاه واقعی نیست؛ transaction موفق و افزایش wallet مستقیم انجام می‌شود: dbStore.js:793-850.
- [ ] 88. UI شماره کارت، expiry، CVC و card holder را می‌گیرد اما backend آن‌ها را verify یا استفاده نمی‌کند؛ ریسک PCI/privacy و پیام «پرداخت امن» کاذب ایجاد می‌شود.
- [ ] 89. payment method ناشناخته بی‌صدا به wallet تبدیل می‌شود.
- [ ] 90. charge و spend positive/finite/max validation مشترک ندارند؛ مقدار منفی در spend می‌تواند موجودی را افزایش دهد و zero transaction موفق بسازد.
- [ ] 91. NaN، Infinity و عدد بسیار بزرگ می‌تواند خطای DB یا رفتار نادرست ایجاد کند.
- [ ] 92. receipt bank transfer base64/JSON خام است و MIME، size، magic bytes، antivirus و expiry ندارد.
- [ ] 93. هیچ idempotency key، provider reference، callback verification یا duplicate protection برای payment/wallet وجود ندارد.
- [ ] 94. pending payment فقط با تصمیم admin موفق می‌شود و اصالت رسید/پرداخت بانکی verify نمی‌شود.
- [ ] 95. reject payment برای user notification ارسال نمی‌کند و audit کامل ندارد.
- [ ] 96. package price، duration و limits مثبت/finite و معتبر validate نمی‌شوند: dbStore.js:1040-1084.
- [ ] 97. token quantity فقط >=1 بررسی می‌شود؛ decimal، Infinity، عدد بسیار بزرگ و بدون cap پذیرفته می‌شود.
- [ ] 98. خرید token فقط transaction/notification می‌سازد؛ token balance، ledger و کاهش token در مصرف وجود ندارد.
- [ ] 99. approve pending دوباره role user و role_type package را محکم validate نمی‌کند.
- [ ] 100. package/token purchase و activation idempotent نیستند.
- [ ] 101. خرید product فقط status active را می‌بیند و publish_status را نه؛ محصول مخفی‌شده با ID قابل خرید است.
- [ ] 102. product price بدون positive/finite/stock/availability check مصرف می‌شود و product خارج از transaction اصلی خوانده می‌شود.
- [ ] 103. خرید محصول فقط wallet خریدار را کم می‌کند؛ credit فروشنده، commission، settlement، invoice، refund، delivery و order state وجود ندارد.
- [ ] 104. company_income فقط در seed نمونه وجود دارد و خرید واقعی commission/income ایجاد نمی‌کند.
- [ ] 105. seller sales_total جمع همه transactionهای seller_id است و package/Pro/product را از هم جدا نمی‌کند.
- [ ] 106. chartها type و status را filter نمی‌کنند و pending/failed/charge/package را به شکل sales/orders جمع می‌زنند.
- [ ] 107. گزارش مالی admin typeMap ساده و از نظر revenue/expense/refund/sales نادرست است: backend/src/services/adminService.js:69-83.
- [ ] 108. exportهای مالی user/seller id را به query منتقل نمی‌کنند و aggregate segment را export می‌کنند، نه رکورد id خواسته‌شده.
- [ ] 109. listTransactions pagination ندارد، metadata و PII را کامل می‌دهد و JOIN اجباری buyer رکورد user حذف‌شده را از تاریخچه ناپدید می‌کند.
- [ ] 110. refund، chargeback، reversal، reconciliation و ledger append-only وجود ندارد.
- [ ] 111. admin wallet را مستقیم overwrite می‌کند؛ ledger، دلیل، approver، before/after و audit ثبت نمی‌شود.
- [ ] 112. admin UI عملیات delete/block و تغییر wallet را بدون تأیید مجدد و بدون کنترل خطای مناسب انجام می‌دهد.
- [ ] 113. deleteUser hard delete است و transaction/review/ticket/customer/product/store/usage را حذف می‌کند؛ سابقه مالی و audit از بین می‌رود.
- [ ] 114. اگر id مربوط به Admin باشد، داده‌های وابسته حذف می‌شوند ولی خود admin به‌علت شرط SQL باقی می‌ماند؛ نتیجه نیمه‌حذف و مخرب است.
- [ ] 115. FKها ON DELETE یکسان ندارند و delete دستی این ناهمگونی را پنهان می‌کند.

## ۶) دیتابیس، مدل داده و کارایی

- [ ] 116. users.mobile unique/index ندارد و referred_seller_id نیز FK/index ندارد: schema.sql:9,22-26.
- [ ] 117. wallet_balance، products.price و transactions.amount CHECK غیرمنفی/positive ندارند؛ business invariant فقط به JavaScript ناقص سپرده شده است.
- [ ] 118. pro_usages.product_id FK و index ندارد، در حالی که برای quota/history/filter استفاده می‌شود.
- [ ] 119. pro_subscriptions.transaction_id FK ندارد و package delete می‌تواند trace پرداخت را قطع کند.
- [ ] 120. روی pro_usages.ip_address index نیست؛ quota با COUNT روی کل table اجرا می‌شود.
- [ ] 121. تصویر، attachment، metadata و setting JSON سقف اندازه schema ندارد؛ base64 هم payload و DB را بزرگ‌تر می‌کند.
- [ ] 122. listUsers، listProducts، listCustomers، listTransactions، listTickets و listProUsages pagination server-side ندارند.
- [ ] 123. getProduct کل listProducts را می‌خواند و بعد در JavaScript find می‌کند؛ QR، خرید، review و update با O(n) سنگین می‌شوند.
- [ ] 124. listTickets برای هر ticket یک query جدا برای messages دارد و N+1 است.
- [ ] 125. listProducts review aggregate کل reviews را group می‌کند و search با %query% index-friendly نیست.
- [ ] 126. exportهای Excel همه ردیف‌ها و PII را در memory می‌سازند و streaming/cap ندارند.
- [ ] 127. Ticket، FAQ، receipt و تصویر داخل DB اصلی‌اند؛ object storage، CDN، thumbnail و lifecycle وجود ندارد.
- [ ] 128. seller_customers آخرین سفارش را denormalize می‌کند اما repair/consistency job ندارد.
- [ ] 129. delete کاربر می‌تواند داده چند حوزه و گزارش را هم‌زمان تغییر دهد؛ audit مستقل وجود ندارد.
- [ ] 130. transactionهای مالی append-only نیستند و status/metadata بدون event history تغییر می‌کنند.

## ۷) فروشنده، فروشگاه و کاتالوگ

- [ ] 131. createUser برای Seller store را active می‌سازد حتی وقتی verification pending است: dbStore.js:206-220.
- [ ] 132. approve/reject seller status فروشگاه را sync نمی‌کند؛ store قدیمی/جدید می‌تواند عمومی بماند.
- [ ] 133. getStoreBySlug فقط stores.status را می‌بیند و role/status/verification seller را کنترل نمی‌کند.
- [ ] 134. updateStore به client اجازه تغییر slug و status می‌دهد، هرچند UI آن را قفل اعلام می‌کند؛ whitelist و validator ندارد.
- [ ] 135. slug تکراری/نامعتبر با خطای خام unique/DB تمام می‌شود و خطای قابل فهم ندارد.
- [ ] 136. با تغییر slug، QR store پاک می‌شود اما QR cached product پاک نمی‌شود؛ تصویر QR می‌تواند URL قدیمی داشته باشد.
- [ ] 137. storeQrCode قبل از null-check به sellerStore.slug دسترسی دارد؛ seller بدون store با 500 مواجه می‌شود.
- [ ] 138. productQrCode برای product pending/rejected/hidden QR می‌سازد و وجود store را هم قبل از URL check نمی‌کند.
- [ ] 139. create/update product title، description، price، تعداد تصویر، MIME، حجم و ابعاد را server-side validate نمی‌کند.
- [ ] 140. Number(payload.price || ... || 0) صفر، تهی، NaN و ورودی غیرعادی را به شکل امن تفکیک نمی‌کند.
- [ ] 141. setProductPublishStatus هر مقدار غیر از inactive را active می‌کند و enum strict ندارد.
- [ ] 142. setProductStatus enum strict ندارد و id ناموجود را با null و HTTP 200 پاسخ می‌دهد.
- [ ] 143. form فروشنده price و description ندارد و همیشه price:0 و description:'' می‌فرستد؛ محصول جدید رایگان و edit قادر به پاک کردن توضیح است.
- [ ] 144. submit، publish و QR در SellerProducts try/catch و feedback خطای مناسب ندارند و unhandled promise می‌سازند.
- [ ] 145. FileDropzone فقط accept input را تنظیم می‌کند؛ drag-and-drop آن را enforce نمی‌کند.
- [ ] 146. uploadها سقف اندازه، تعداد، MIME واقعی، signature، compression و virus scan ندارند.
- [ ] 147. avatar/logo/banner/image با FileReader به base64 تبدیل می‌شوند و هر اندازه فایل را در memory نگه می‌دارند.
- [ ] 148. فقط handler محصول بخشی از فایل‌های غیرتصویری را filter می‌کند؛ avatar، logo، banner، ticket و FAQ validation واقعی ندارند.
- [ ] 149. slug ناموجود در public store با 200 و data:null پاسخ داده می‌شود و frontend spinner بی‌نهایت نشان می‌دهد.
- [ ] 150. logo، banner، attachment و image از DB بدون scheme allowlist داخل src، href و CSS backgroundImage قرار می‌گیرند.
- [ ] 151. URL ذخیره‌شده مخرب یا خارجی ریسک unsafe navigation، tracking، phishing و stored XSS/URL abuse دارد.
- [ ] 152. searchهای seller customer/product/transaction client-side و case-sensitive هستند؛ page با filter/search reset نمی‌شود.
- [ ] 153. seller customer API و export همه PII شامل آدرس، کد ملی، کد پستی و موبایل را بدون masking می‌دهند.
- [ ] 154. backend برای export customer/transaction route دارد اما UI همه این قابلیت‌ها را ارائه نمی‌کند؛ API/UI ناهماهنگ‌اند.
- [ ] 155. share store فقط toast است و از Web Share API استفاده نمی‌کند؛ clipboard failure هم موفق اعلام می‌شود.

## ۸) تیکت، review و پشتیبانی

- [ ] 156. create/reply ticket برای title/message/priority/attachment validator طول، enum و content ندارد.
- [ ] 157. attachment تیکت LONGTEXT بدون size/type/virus validation ذخیره می‌شود.
- [ ] 158. list ticket pagination ندارد و پیام‌ها N+1 خوانده می‌شوند.
- [ ] 159. replyTicket وضعیت closed را بیرون transaction می‌خواند و داخل transaction lock/recheck ندارد؛ reply هم‌زمان با close ممکن است ثبت شود.
- [ ] 160. ticket closed_at، audit actor، status history و SLA ندارد.
- [ ] 161. closeTicket existence/affectedRows را check نمی‌کند و id ناموجود می‌تواند null/200 بدهد.
- [ ] 162. FAQ در یک setting JSON ذخیره می‌شود؛ حجم کل، تعداد و attachment محدود نیست و update کل setting را overwrite می‌کند.
- [ ] 163. ticket و review anti-spam، cooldown و rate limit اختصاصی ندارند.
- [ ] 164. rating integer/finite بودن check نمی‌شود و decimal به TINYINT می‌رسد.
- [ ] 165. comment review length، moderation و spam/profanity check ندارد.
- [ ] 166. review فقط وجود خرید را چک می‌کند و active/published بودن محصول یا تحویل واقعی را چک نمی‌کند.
- [ ] 167. edit review دوباره notification «نظر جدید» می‌فرستد و dedup/moderation ندارد.

## ۹) رابط کاربری و جریان‌های Frontend

- [ ] 168. AppLayout فقط routeهای داخلی را ErrorBoundary می‌کند؛ login، seller auth، public store و public product boundary ندارند.
- [ ] 169. route /403 در App.jsx نیست، اما layout قدیمی به آن redirect می‌کند؛ layout فعلی role اشتباه را به home redirect می‌کند و Forbidden عملاً unreachable است.
- [ ] 170. /user/notifications route دارد اما در Sidebar کاربر نمایش داده نمی‌شود.
- [ ] 171. UserProfile fetch اولیه loading/error UI ندارد و شکست API می‌تواند صفحه نیمه‌خالی/unhandled rejection بسازد.
- [ ] 172. UserNotifications برای fetch و readAll catch/loading ندارد.
- [ ] 173. UserTransactions برای export/review error/loading کامل ندارد و برای product_purchase ناموفق/pending هم دکمه review نشان می‌دهد.
- [ ] 174. UserTable page را بعد از filter/search reset یا clamp نمی‌کند و می‌تواند صفحه خالی نشان دهد.
- [ ] 175. DataTable admin loading، error، empty state و pagination ندارد و تمام ردیف‌ها را render می‌کند.
- [ ] 176. SellerTable error/loading state مستقل ندارد و خطای query می‌تواند به empty UI تبدیل شود.
- [ ] 177. admin Users برای delete/block/save handling خطای قابل مشاهده و confirm ندارد؛ run شکست را مدیریت نمی‌کند.
- [ ] 178. admin Products approve/reject loading lock و catch ندارد؛ double click چند request می‌فرستد.
- [ ] 179. بعضی actionهای Financial و Support برای approve/reject/save/close/reply catch و feedback کامل ندارند.
- [ ] 180. modal/drawerها role=dialog، aria-modal، focus trap، focus restore، Escape close و keyboard navigation ندارند: UserModal/UserDrawer/SellerModal/SellerDrawer.
- [ ] 181. رفتار close با backdrop و دکمه بین modalها یکسان نیست.
- [ ] 182. SellerStore خطای fetch store/QR را نادیده می‌گیرد؛ QR نبودن store می‌تواند 500 شود ولی UI fallback نشان می‌دهد.
- [ ] 183. SellerStoreProfile loading/error ندارد و ممکن است روی fallback «فروشگاه من» ذخیره کند.
- [ ] 184. SellerCustomers فقط name/email را جستجو می‌کند و mobile/address و export در UI ندارد.
- [ ] 185. SellerTransactions export backend دارد ولی UI دکمه خروجی ندارد و همه تراکنش‌ها را یکجا می‌گیرد.
- [ ] 186. Profile validation برای email/mobile/national/postal/length ندارد و avatar size enforce نمی‌شود.
- [ ] 187. AuthorFormCard می‌تواند state داخلی خود را بعد از cancel با parent initialProfile از دست بدهد تا key تغییر کند.
- [ ] 188. FileDropzone preview image error/fallback ندارد و فایل خراب UI را می‌شکند.
- [ ] 189. PaymentModal direct gateway را بدون اعتبارسنجی card/expiry/CVC قابل submit می‌کند.
- [ ] 190. صفحات package/token input صفر/خالی را UI-side نمی‌بندند و total صفر به payment flow می‌رسد.
- [ ] 191. AdminPackages placeholder انگلیسی unrelated دارد: Select Rick and Morty characters در خط ۱۴۸.
- [ ] 192. token price نامعتبر/صفر در admin silently به 25000 تبدیل می‌شود و خطای واقعی به admin نشان داده نمی‌شود.
- [ ] 193. public product status/404 واقعی و SEO metadata ندارد؛ public store برای null spinner بی‌نهایت دارد.
- [ ] 194. PublicProduct قبل از ثبت مصرف provider را صدا می‌زند و retry بدون idempotency است.
- [ ] 195. PublicProduct.jsx:166 هم lint error دارد و هم dependency ناقص؛ تغییر imageهای همان product ممکن است selected image قدیمی بماند.
- [ ] 196. blob/output در browser بدون سقف memory/size به data URL تبدیل می‌شود و می‌تواند tab را مصرف کند.
- [ ] 197. Topbar هر ۵ ثانیه برای همه roleها notification poll می‌کند؛ backoff، visibility control و cache ندارد.
- [ ] 198. PendingSeller نیز هر ۵ ثانیه poll و روی focus refresh می‌کند؛ backoff/rate limit اختصاصی ندارد.
- [ ] 199. bundle چند chunk بزرگ دارد؛ chart حدود ۳۷۷KB و index حدود ۲۷۰KB قبل از gzip است و performance budget وجود ندارد.
- [ ] 200. متن‌ها و naming بین فارسی/انگلیسی/نام‌های قدیمی یکدست نیستند و نشانه‌های scaffold/demo در UI نهایی باقی مانده‌اند.

## ۱۰) تناقض‌های کسب‌وکاری و قابلیت‌های ناقص

- [ ] 201. مدل Marketplace بین product، لباس، Pro، package، token و store قرارداد یکپارچه ندارد؛ price، quota، token و subscription به هم متصل نیستند.
- [ ] 202. فرم seller فقط title/image دارد، ولی backend و گزارش admin price/description/financial را فرض می‌کنند؛ request/response دو سمت ناهماهنگ است.
- [ ] 203. status seller، status store و publish status محصول state machine ندارند؛ ترکیب‌های نامعتبر مثل Seller pending + Store active + Product public ممکن است.
- [ ] 204. active package در seller dashboard subscription واقعی user نیست و از package list برداشته می‌شود: dbStore.js:1670-1680.
- [ ] 205. limitهای package در UI نمایش داده می‌شوند اما backend enforce نمی‌کند.
- [ ] 206. token فروخته می‌شود اما balance یا مصرف token وجود ندارد و Pro با wallet/free trial ثبت می‌شود.
- [ ] 207. transaction type برای token با package purchase reuse شده و گزارش مالی را مبهم می‌کند.
- [ ] 208. direct gateway، bank transfer و wallet reconciliation و provider state واقعی ندارند؛ success به معنی پرداخت واقعی نیست.
- [ ] 209. purchase product order lifecycle، inventory و fulfillment ندارد؛ customer فقط آخرین خرید را نگه می‌دارد.
- [ ] 210. dashboard عنوان sales/revenue را برای aggregation شامل charge/package/Pro/transactionهای غیرمرتبط استفاده می‌کند؛ اعداد برای تصمیم مالی قابل اعتماد نیستند.

## اعتبارسنجی انجام‌شده

- [x] npm run build: موفق؛ Vite bundle ساخته شد.
- [x] بررسی syntax همه فایل‌های backend با node --check: موفق.
- [x] npm run lint --prefix backend: موفق، اما فقط node --check src/server.js است.
- [ ] npm test: ناموفق؛ چون فقط lint است و lint frontend یک error و پنج warning دارد.
- [ ] npm audit: ریشه ۲ high؛ frontend پنج high؛ backend یک high و دو moderate.
- [ ] اجرای MySQL، migration واقعی، auth/CRUD احراز‌شده، پرداخت، provider، مرورگر و E2E در این بررسی انجام نشد؛ بنابراین آن بخش‌ها هنوز نیازمند validation محیط اجرا هستند.

## اولویت اصلاح

- [ ] 1. قبل از هر انتشار: secret و credential پیش‌فرض، DEMO_AUTH، OTP قابل‌نمایش، gateway جعلی، password قابل پیش‌بینی، دسترسی token بعد از block، proxy/SSRF، HTTP provider و upload limits.
- [ ] 2. سپس: ledger append-only و idempotent، state machine فروشنده/store/product، token/subscription enforcement، settlement/refund و حذف hard-delete.
- [ ] 3. بعد: migration versioned، constraint/index/pagination، حذف dump/seed مخرب و جداسازی داده demo.
- [ ] 4. سپس: تست API/E2E، اصلاح lint fail، error/loading UI، accessibility modalها و قرارداد مستند API.
