# گزارش RCA و رفع باگ رخ‌پوش

**نتیجه: PASS — آماده بررسی نهایی انتشار.** هر ۱۰ مورد گزارش بررسی شده و معیارهای پذیرش آن‌ها در محیط جداگانه عبور کرده است. این نتیجه مربوط به سورس و بررسی انتشار است؛ سرور تولید در این مأموریت Deploy یا Restart نشده و Migration تولید اجرا نشده است. آزمون‌های خارجی اجرا‌نشده در بخش محدودیت‌ها صریحاً BLOCKED هستند.

## نسخه و محیط

- گزارش مبنا: report.html، مربوط به e89a71707ffb18865fc0a525613c8e31756cec23، تاریخ ۲۰۲۶/۱۱/۰۱.
- نسخه واقعی آغاز کار: c8845e6f071af168dbf4532e40ca683b3a2dd610؛ مخزن ابتدا تمیز بود.
- شاخه: codex/root-cause-qa-20261101 در [مخزن اصلی](https://github.com/Barmana-Own/rookhposh).
- Commit نهایی پیاده‌سازی و تست‌ها: [bfef22249e81677a2b01e0155a1d4dcce588c26e](https://github.com/Barmana-Own/rookhposh/commit/bfef22249e81677a2b01e0155a1d4dcce588c26e). گزارش و شواهد در Commit مستندات بعد از آن قرار دارند؛ فایل اجرایی در Commit مستندات تغییر نمی‌کند.
- بازه اجرا: ۱ و ۲ نوامبر ۲۰۲۶ به وقت UTC، برابر با ۱ نوامبر در منطقه زمانی محیط کار.
- Frontend: React 19.2.7، Vite 8.1.0، JavaScript/JSX؛ Backend: Express 5.2.1 و CommonJS؛ ORM وجود ندارد و mysql2 3.22.5 استفاده می‌شود.
- محیط یکپارچه: Node.js 22.23.4، MariaDB 10.11.14 روی Linux؛ مرورگر روی Windows با Node.js 24.19.0، Playwright 1.64.1 و Chrome نصب‌شده 156.0.8078.76.
- اندازه‌های مرورگر: ۱۲۸۰×۹۶۰، ۱۰۲۴×۷۶۸، ۸۲۰×۱۱۸۰ و ۳۹۰×۸۴۴.
- پایگاه‌های آزمون فقط با پیشوند محافظت‌شده rookhposh_payment_test_ ساخته و پس از پایان حذف شدند. Fixture و سرویس کنترل‌شده AI فقط از ورودی تست قابل اجرا هستند و در برنامه تولید mount نمی‌شوند.

## خط مبنا و بازتولید

پیش از اتصال اصلاحات، ۱۰ تست مرورگر روی نسخه منجمد C884 اجرا شد: QA-01 موفق و QA-02 تا QA-10 ناموفق بودند. بنابراین مشکل اصلی NAT گزارش قدیمی در این نسخه از قبل بسته بود؛ برای آن اصلاح نمایشی یا انتساب مجدد تصاویر انجام نشد.

آزمون تنظیمات Production یک ضعف مستقل را تأیید کرد: با پرداخت غیرفعال، کلید پیش‌فرض/خالی JWT پذیرفته می‌شد. خط مبنای این آزمون ۲ PASS و ۱ FAIL بود. تنظیمات Production اکنون مستقل از فعال‌بودن پرداخت، کلید خصوصی حداقل ۳۲ نویسه‌ای می‌خواهد.

خروجی قابل بررسی: [نتایج ماشین‌خوان](docs/qa/root-cause-20261101/verification.json). این فایل وضعیت هر سناریو و پروژه مرورگر، شمارنده‌ها و هش لاگ‌ها را نگه می‌دارد و شامل رمز، کوکی نشست یا تصاویر کاربران واقعی نیست.

## وضعیت هر مشکل

| شناسه | اولویت | علت ریشه‌ای و اصلاح | شواهد و نتیجه | وضعیت |
|---|---|---|---|---|
| QA-01 | P1 | مسیرهای فعلی از قبل مالکیت هش‌شده نشست را اعمال می‌کردند. وابستگی مالکیت به IP بازگردانده نشد. ابطال انتخابی نشست اضافه، تنظیم کلید Production مستقل از پرداخت و نقش/وضعیت حساب در احراز هویت دوباره از DB بررسی شد. | دو مهمان با IP یکسان، فایل‌های سه‌گانه، aliases، درخواست تکراری، کوکی دست‌کاری‌شده/منقضی/تمدیدشده/باطل، CSRF، نقش تغییرکرده و قرنطینه legacy بررسی شدند. | PASS |
| QA-02 | P2 | تب مصرف از transactions مالی می‌خواند. GET /api/seller/pro-usages اکنون از pro_usages و Jobهای رزرو/ناموفق می‌خواند و summary از همان entitlementStore داشبورد گرفته می‌شود. | مصرف موفق یک توکن؛ شکست آزادسازی رزرو؛ Retry و تکرار بدون debit دوباره؛ جداسازی فروشندگان؛ فیلتر تاریخ/وضعیت و صفحه‌بندی. هیچ تصویر، IP یا داده دستگاه در DTO وجود ندارد. | PASS |
| QA-03 | P2 | CTA عمومی مشتری را به ورود فروشنده می‌برد. عنوان به «ورود فروشندگان» تغییر کرد و مسیر /seller روشن باقی ماند. | فروشگاه، محصول و شروع پرو بدون ورود در دسترس‌اند؛ QR و مسیر محصول حفظ شده است. | PASS |
| QA-04 | P2 | fallbackهای شماره کارت و شبای نمونه و فقدان اعتبارسنجی سمت سرور وجود داشت. تنظیم معتبر، مالک نام‌دار و checksum کارت/شبا لازم شد؛ در غیر این صورت روش غیرفعال و API با 409 رد می‌شود. | خالی، صفر، شبای غلط، تنظیم معتبر، ویرایش ادمین، انتقال تنظیم به فروشنده، رسید نامعتبر، ثبت pending، تأیید یک‌باره و عدم اعتباردهی پیش از تأیید آزموده شد. درگاه و کیف پول رگرسیون ندارند. | PASS |
| QA-05 | P2 | Topbar مقدار q را می‌نوشت ولی صفحات آن را مصرف نمی‌کردند. قرارداد q/status/page مشترک، جست‌وجوی پارامتری سرور و صفحه‌بندی فروشنده اضافه شد. | فارسی/عربی و انگلیسی، ID، نتیجه ناموجود، clear، Back/Forward، لینک مستقیم، فیلتر و tenant بررسی شدند. عبارت qa-no-such-product-20261101 اکنون «نتیجه‌ای یافت نشد» می‌دهد. | PASS |
| QA-06 | P2 | catch عمومی /auth/me توکن را حذف می‌کرد. چهار حالت مستقل، Retry محدود، لغو درخواست و کنترل پاسخ قدیمی پیاده شد؛ محافظ صفحه انتظار فروشنده و نتیجه پرداخت هم اصلاح شد. | 200، 401، 403، 503، شبکه، timeout، refresh، خروج دستی، ورود موفق، unmount، پاسخ دیررس و تغییر توکن؛ ورود واقعی با رمز و reload در چهار viewport موفق است. | PASS |
| QA-07 | P2 | null به‌جای «دریافت انجام شده ولی فروشگاه نیست» به Loading تعبیر می‌شد. Backend اکنون 404 و Frontend حالت‌های مستقل نشان می‌دهد. | slug معتبر/ناموجود/نامعتبر، legacy QR، null قدیمی، 500 و قطع شبکه با Retry بررسی شدند. | PASS |
| QA-08 | P3 | تب و فرم پیش‌فرض بسته کاربر پولی بود. رابط عملیاتی و ایجاد بسته جدید فروشنده‌محور شد؛ Backend ایجاد User package جدید را رد می‌کند. | بسته تاریخی مشتری در DB/API باقی ماند، در خرید عملیاتی نمایش داده نمی‌شود و بسته جدید بدون نقش صریح نیز seller ساخته می‌شود. | PASS |
| QA-09 | P3 | نوع تراکنش به‌جای روش پرداخت نمایش داده می‌شد. نوع و روش از هم جدا و فقط metadata شناخته‌شده برای روش پذیرفته می‌شود. | درگاه، واریز، کیف پول، ناموفق، برگشتی و legacy بدون metadata بررسی شدند؛ مقدار نامشخص حدس زده نمی‌شود. | PASS |
| QA-10 | P3 | متن‌های فرآیند طراحی داخل صفحه محصول باقی مانده بود. متن عملیاتی فارسی جایگزین شد. | نبود متن توسعه‌دهنده و حضور فرم‌ها، بسته‌ها و تنظیمات واقعی در چهار viewport بررسی شد. | PASS |

### فایل‌ها و مرز اصلاح

- نشست و مجوز: config/env.js، middlewares/authMiddleware.js، tryon/identity.js، tryon/routes.js، tryon/sessionRevocations.js و database/sessionRevocationSchema.js.
- گزارش اعتبار: repositories/sellerUsageStore.js، sellerService/controller/routes و SellerProUsages.jsx.
- بانک و رسید: services/bankInfo.js، services/paymentReceipt.js، dbStore.createPendingPayment، adminService، GlassCheckoutCard.jsx و Financial.jsx.
- جست‌وجو: utils/productSearch.js، dbStore.listProducts، سرویس‌های ادمین/فروشنده، useProductQuery.js، Topbar و صفحات محصولات.
- پایداری ورود: services/authSession.js، AuthContext، AuthRecovery، AppLayout، PendingSeller، PaymentResult و HomeRedirect.
- نمایش عمومی/بسته/کیف پول: PublicStore.jsx، AdminPackages.jsx، financialReport.js و SellerWallet.jsx.

فهرست کامل ۶۲ فایل سورس، تنظیم و تستِ Commit پیاده‌سازی:

~~~text
backend/package.json
backend/src/config/env.js
backend/src/controllers/sellerController.js
backend/src/controllers/storeController.js
backend/src/database/rollbackTryon.js
backend/src/database/runtimeSetup.js
backend/src/database/sessionRevocationSchema.js
backend/src/middleware/security.js
backend/src/middlewares/authMiddleware.js
backend/src/repositories/dbStore.js
backend/src/repositories/sellerUsageStore.js
backend/src/routes/sellerRoutes.js
backend/src/services/adminService.js
backend/src/services/bankInfo.js
backend/src/services/paymentReceipt.js
backend/src/services/sellerService.js
backend/src/tryon/identity.js
backend/src/tryon/routes.js
backend/src/tryon/sessionRevocations.js
backend/src/tryon/worker.js
backend/src/utils/productSearch.js
backend/test/bankInfo.test.js
backend/test/helpers/rootCauseE2EServer.js
backend/test/integration/entitlements.test.js
backend/test/integration/rootCause.test.js
backend/test/integration/rootCauseMigration.test.js
backend/test/paymentRoutes.test.js
backend/test/productSearch.test.js
backend/test/productionAuthConfig.test.js
backend/test/productionSession.test.js
backend/test/sellerOnlyAuth.test.js
e2e/root-cause-login.spec.cjs
e2e/root-cause-recovery.spec.cjs
e2e/root-cause.spec.cjs
frontend/src/components/auth/AuthRecovery.jsx
frontend/src/components/layout/AppLayout.jsx
frontend/src/components/layout/Topbar.jsx
frontend/src/components/seller/SellerTable.jsx
frontend/src/components/seller/SellerToolbar.jsx
frontend/src/components/ui/GlassCheckoutCard.jsx
frontend/src/contexts/AuthContext.jsx
frontend/src/hooks/useProductQuery.js
frontend/src/pages/Financial/Financial.jsx
frontend/src/pages/Packages/AdminPackages.jsx
frontend/src/pages/PaymentResult.jsx
frontend/src/pages/Products/Products.jsx
frontend/src/pages/PublicStore.jsx
frontend/src/pages/Seller/PendingSeller.jsx
frontend/src/pages/Seller/Products/SellerProducts.jsx
frontend/src/pages/Seller/Transactions/SellerProUsages.jsx
frontend/src/pages/Seller/Transactions/SellerTransactions.jsx
frontend/src/pages/Seller/Wallet/SellerWallet.jsx
frontend/src/routes/App.jsx
frontend/src/services/apiClient.js
frontend/src/services/authSession.js
frontend/src/services/seller/sellerApi.js
frontend/src/utils/financialReport.js
frontend/test/authSession.test.mjs
frontend/test/paymentPresentation.test.mjs
package.json
playwright.config.cjs
playwright.root-cause.config.cjs
~~~

## قراردادهای امنیت و داده

### نشست ناشناس

کوکی Production با نام __Host-rhp_tryon_session، ویژگی‌های HttpOnly، Secure، SameSite=Lax، Path=/ و بدون Domain صادر می‌شود. nonce تصادفی ۲۵۶ بیتی و امضاشده است. عمر ۱۸۰ روز و تمدید در ۳۰ روز پایانی با همان مالکیت حفظ می‌شود.

POST /api/tryon/session/revoke فقط نشست مهمان فعلی را باطل می‌کند. بدنه درخواست نمی‌تواند مالک دیگری انتخاب کند. تنها هش مالک نگهداری می‌شود و کوکی خام ثبت نمی‌شود. Tombstone حداکثر عمر امضای قابل استفاده به‌علاوه حاشیه زمانی را پوشش می‌دهد؛ cleanup در batch محدود انجام می‌شود. endpoint ابطال به ۱۰ درخواست در ساعت برای IP محدود است. IP ابزار محدودسازی است، نه اثبات مالکیت.

Origin غیرمجاز و درخواست cross-site فاقد Origin رد می‌شود؛ Originهای صریحاً مجاز و کلاینت‌های غیرمرورگری قبلی حفظ شده‌اند. انقضا/ابطال باعث بازیابی تصاویر بر اساس IP یا فروشنده نمی‌شود. سابقه ناشناس قدیمیِ بدون مالک معتبر همچنان در قرنطینه می‌ماند.

این API قرارداد ابطال **نشست ناشناس** است؛ مدل JWT حساب‌های احرازشده بازنویسی نشده است. نقش و وضعیت آن‌ها از پایگاه داده تازه بررسی می‌شود؛ pending/rejected seller برای دیدن وضعیت تأیید همچنان /auth/me دریافت می‌کند ولی عملیات پنل را نمی‌تواند اجرا کند.

### حسابداری توکن

مصرف نهایی از رکورد واقعی pro_usages خوانده می‌شود؛ رزرو و شکست از Job متناظر. اتصال مالی و مصرف با JOIN/UNION کنترل‌شده بدون دو بار شمردن انجام می‌شود. queryset فروشنده از شناسه معتبر req.user می‌آید. Queryهای دفتر مصرف از ایندکس‌های موجود سهمیه، محصول و فروشنده استفاده می‌کنند و صفحه‌بندی سمت سرور دارند.

مانده نمایش‌داده‌شده **مانده فعلی** است. balance_after تاریخی، چون snapshot قابل اتکایی ندارد، null باقی می‌ماند. رکورد legacy بدون انتساب قطعی به‌عنوان «نامشخص» و بدون debit ساختگی نشان داده می‌شود. تعداد و مانده‌های Fixture در کد تولید ثابت نشده‌اند.

### پرداخت و رسید

اعتبارسنجی شکلی شامل Luhn برای کارت و MOD-97 برای شبای ایران است؛ این بررسی به‌معنای تأیید مالکیت حساب یا تسویه بانکی نیست. مرجع روش شبا: [SWIFT](https://www.swift.com/sites/default/files/documents/swift_solutions_faq_ibanplus.pdf).

هنگام ایجاد واریز دستی، تنظیم جاری داخل transaction قفل و snapshot گیرنده در metadata ثبت می‌شود. فایل رسید از نظر قالب Base64، امضا و حجم حداکثر ۵ MiB کنترل می‌شود. PNG/JPEG/WebP/GIF/PDF پذیرفته می‌شوند؛ GIF معتبر قبلی و نمایش PDF موجود حفظ شده‌اند. وضعیت همیشه pending است و صرف ارسال رسید اعتبار ایجاد نمی‌کند. تأیید انتقال بانکی همچنان مسئولیت فرآیند ادمین است. درگاه مستقیم برای موفقیت به همان تأیید معتبر بانک وابسته مانده است.

### احراز هویت و رابط

401 معتبر توکن را حذف می‌کند. 403 مجوز ناکافی و خطای موقت آن را حذف نمی‌کنند؛ محتوای محافظت‌شده تا تأیید دوباره hidden/inert است. در فرم‌های قبلاً mount شده، وضعیت تا حد امکان نگه داشته می‌شود. Retry خودکار سه بار با فاصله ۱، ۲ و ۴ ثانیه، سپس Retry دستی است. درخواست هم‌زمان، logout، unmount و تغییر توکن با AbortController و نسل درخواست کنترل می‌شوند.

## Endpointهای جدید و اصلاح‌شده

| مسیر | تغییر |
|---|---|
| POST /api/tryon/session/revoke | جدید؛ ابطال مهمان فعلی، کنترل Origin، محدودسازی و clear-cookie |
| GET /api/seller/pro-usages | جدید؛ page/limit/status/from/to/q، summary و دفتر مصرف بدون تصاویر خصوصی |
| GET /api/seller/products | q و status واقعی؛ پاسخ legacy آرایه حفظ است و درخواست صفحه‌بندی items/pagination می‌دهد |
| GET /api/admin/products | مصرف q/status/page، حالت all، اعتبارسنجی و جست‌وجوی سرور |
| GET /api/stores/:slug | فروشگاه ناموجود 404؛ alias معتبر QR باقی است |
| GET /api/auth/me و محافظ APIها | تفکیک 401/403/خطای DB و مجوز تازه؛ قرارداد پاسخ موفق ثابت |
| GET/PATCH /api/admin/settings/bank | تنظیم معتبر، قابلیت پاک‌کردن کامل، هشدار وضعیت ناقص |
| GET /api/seller/packages/settings | مشخصات معتبر یا فقط اعلام غیرفعال‌بودن؛ بدون مقدار نمونه |
| POST /api/seller/wallet/charge، packages/:id/purchase، tokens/purchase | شاخه واریز دستی: اعتبارسنجی تنظیم/رسید و pending اتمیک؛ شاخه درگاه/کیف پول حفظ شده |
| POST /api/admin/packages | ایجاد بسته جدید فقط برای فروشنده؛ رکوردهای تاریخی حذف یا تغییر نقش داده نشدند |

## پشتیبان، Migration و Rollback

- Bundle محلی خط مبنا: work/root-cause-baseline-imhjds/source.bundle.
- بکاپ خصوصی سرور: /var/backups/rookhposh-dash/before-root-cause-20261101T222004Z؛ شامل SQL، source/bundle، فایل‌های build قبلی، تنظیمات خصوصی، Nginx، unit و تصاویر خصوصی.
- SHA256SUMS بکاپ دوباره بررسی و معتبر بود. فایل‌های محرمانه وارد Git نشده‌اند.
- تنها extension داده جدید: virtual_tryon_session_revocations با کلید اصلی owner_hash و ایندکس expires_at. هیچ جدول یا ستون موجود حذف نشده است.
- روی clone خصوصی بکاپ C884، ۲۳ جدول و ۶۷ ردیف موجود با تعداد و SHA-256 یکسان باقی ماندند؛ جدول جدید، تعداد جدول‌ها را به ۲۴ رساند. اجرای تکراری و down/up جدول خالی نیز موفق بود.
- rollback دارای داده ابطال رد می‌شود تا کوکی باطل دوباره معتبر نشود. برای rollback برنامه هم نسخه‌ای که registry ابطال را نادیده بگیرد قابل استفاده نیست؛ مسیر امن نگه‌داشتن اصلاح نشست و roll-forward است.
- Migration و rollback فقط روی دیتابیس جداگانه اجرا شد. در تولید، همان فرایند با PID 111536 و مسیر release C884 فعال ماند. سرویس‌های موقت و DBهای این مأموریت پاک شدند؛ بکاپ حفظ شده است.

## نتیجه آزمون‌ها

| گروه | موفق | ناموفق نهایی | Skip |
|---|---:|---:|---:|
| Backend unit | ۱۱۵ | ۰ | ۰ |
| Frontend unit | ۸۶ | ۰ | ۰ |
| Root Cause integration | ۱۴ | ۰ | ۰ |
| Try-on integration | ۲۱ | ۰ | ۰ |
| Product review integration | ۵ | ۰ | ۰ |
| Payment integration | ۸ | ۰ | ۰ |
| Entitlement integration | ۱۲ | ۰ | ۰ |
| Financial integration | ۷ | ۰ | ۰ |
| Migration روی clone بکاپ | ۱ | ۰ | ۰ |
| سناریوی یکتای مرورگر/viewport | ۸۴ | ۰ | ۰ |

مجموع شمارنده‌های Node: ۲۰۱ واحد و ۶۸ یکپارچه؛ پوشش نهایی مرورگر ۸۴ سناریوی یکتا است. شمارنده Node برای تست‌های گروه‌بندی‌شده مطابق خروجی خود runner گزارش شده است.

Lint خروجی ۰ دارد؛ چهار warning موجود Fast Refresh باقی است، بدون error. Build نهایی موفق و syntax تمام فایل‌های Backend بررسی شد. پروژه JavaScript است و فرمان TypeScript typecheck ندارد؛ اجرای tsc ادعا نمی‌شود.

مرورگر در چهار اجرای کامل ۶۸، ۳۶، ۲۰ و ۴ تست بررسی شد. خروجی اولین اجرا ۶۳/۶۸ و دوم ۳۵/۳۶ بود؛ چهار سناریوی طولانی به سقف ۴۵ ثانیه رسیدند، selector موبایل به نسخه مخفی جدول اشاره می‌کرد و یک تست کلیک Retry با بازیابی خودکار مسابقه داشت. سقف سناریوی کامل، selector قابل مشاهده و انتظار پایان واقعی Retry خودکار اصلاح شد. اجراهای بعدی همه موارد مربوط را گذراندند. وضعیت نهایی از آخرین نتیجه هر سناریو به دست آمده، نه با حذف تست یا تغییر انتظار به رفتار معیوب. یک اجرای قطع‌شده بر اثر reset ابزار نتیجه کامل نداشت و در شمارنده‌های پذیرش منظور نشده است.

فرمان‌های اجراشده:

~~~sh
npm run lint
npm run test:unit
npm run build
node --test test/integration/rootCause.test.js
node --test test/integration/tryon.test.js
node --test test/integration/reviews.test.js
node --test test/integration/payments.test.js
node --test test/integration/entitlements.test.js
node --test test/integration/financial.test.js
node --test test/integration/rootCauseMigration.test.js
node node_modules/@playwright/test/cli.js test -c playwright.root-cause.config.cjs
node node_modules/@playwright/test/cli.js test -c playwright.root-cause.config.cjs --grep "QA-02|QA-05|QA-06|regression: real try-on|synthetic browser camera"
node node_modules/@playwright/test/cli.js test -c playwright.root-cause.config.cjs --grep "QA-04|QA-06.*(503|temporary)"
node node_modules/@playwright/test/cli.js test -c playwright.root-cause.config.cjs root-cause-login.spec.cjs
~~~

Integrationها با runner خصوصیِ سازنده DB و متغیرهای NODE_ENV=test و DB_NAME محافظت‌شده اجرا شدند. دستور مستقیم بدون آماده‌سازی DB تست کافی نیست. E2E از RCA_BASE_URL و RCA_E2E_METADATA دیتاست موقت استفاده می‌کند؛ endpointهای _fixture به برنامه تولید اضافه نشده‌اند.

### رگرسیون پرو و دانلود

انتخاب محصول/مدل و عکس، پردازش واقعی صف تست، جلوگیری از درخواست تکراری، پیشرفت نامعین در مرحله AI، موفقیت/خطا/Retry، آخرین خروجی، آکاردئون تاریخچه، گزارش ادمین و تنظیمات سه سرویس بررسی شدند. تلاش سرویس‌ها و Failover ترتیبی اول/دوم/سوم در آزمون یکپارچه کنترل‌شده پوشش دارد.

دانلود جدید و قدیمی به‌صورت **رویداد download و ذخیره فایل** بررسی شد؛ بازشدن تب ملاک نبود. WebP دارای RIFF/WEBP و SHA-256 برابر بایت مرجع بود. آزمون API نیز PNG، Content-Type، Content-Disposition، Cache-Control، تطابق بایت و ابعاد ۷۲×۱۰۸ را کنترل کرد. کاربر دیگر و فروشنده پرداخت‌کننده مجوز فایل شخصی مشتری ندارند.

دوربین مجازی Chrome عکس معتبر ساخت و Trackها متوقف شدند؛ هیچ dispatch یا هزینه AI از این تست دوربین ایجاد نشد. این بررسی جای تست دوربین فیزیکی و جهت واقعی دوربین گوشی را نمی‌گیرد.

### بررسی امنیت نهایی و وابستگی‌ها

مرزهای مالکیت، جعل و replay نشست، CSRF، نقش تازه، tenant، پارامترهای SQL، فایل رسید، نشت کلید و پاسخ قدیمی احراز هویت بازبینی شدند. بررسی مستقل read-only هیچ bypass یا رگرسیون تأییدشده‌ای در دامنه QA-01 پیدا نکرد؛ diff و ۱۴ syntax check آن موفق بود. وابستگی‌های محلی آن reviewer موجود نبود و ادعای تست یکپارچه مستقل از سوی آن نشده است؛ آزمون‌های runtime والد در Linux و MariaDB جداگانه اجرا شده‌اند.

npm audit نیز واقعاً اجرا شد: Backend سیزده هشدار شامل دو high و Frontend چهارده هشدار شامل شش high دارد؛ critical صفر است. lockfileها و وابستگی‌ها در این اصلاح تغییر نکرده‌اند، بنابراین این هشدارها از نسخه قبلی‌اند. صفر بودن audit ادعا نمی‌شود.

بررسی مسیر اجرا نشان داد multer نصب شده ولی در سورس Backend فراخوانی نمی‌شود؛ هشدار mysql2 به مسیر پروتکل فشرده مربوط است که در اتصال فعلی فعال نیست؛ مسیر ExcelJS موجود، export بافر و نام ثابت است. بخش قابل توجه هشدارهای Frontend مربوط به build/dev و adapter Node است؛ انتشار فعلی فایل static است. این نتیجه، حذف هشدارهای audit یا اثبات بی‌خطر بودن تمام وابستگی‌ها نیست و بازبینی انتشار باید آن‌ها را حفظ کند. نمونه اطلاعیه رسمی: [Multer advisory](https://github.com/advisories/GHSA-q7qp-rjg7-q26m).

## محدودیت‌های باقی‌مانده

| بررسی | وضعیت | دلیل و پیش‌نیاز |
|---|---|---|
| ساخت تصویر جدید با سرویس خارجی فعال | BLOCKED | مصرف واقعی AI و اعتبار تولید در این مأموریت مجاز نشده بود؛ نیازمند آزمون کنترل‌شده با مجوز مصرف است. قرارداد و موتور موجود تغییر نکرده‌اند. |
| Failover واقعی به سرویس دوم/سوم | BLOCKED | تنظیمات و کلیدهای جایگزین طبق تصمیم قبلی کاربر هنوز ارائه نشده‌اند؛ مسیر ترتیبی با provider کنترل‌شده آزموده شده است. |
| پرداخت نهایی با کارت و OTP تازه | BLOCKED | پرداخت/پیامک واقعی و تغییر مالی تولید بدون مجوز صریح این مأموریت انجام نشد. تست provider و تسویه با DB واقعیِ تست و پاسخ کنترل‌شده انجام شد. |
| دوربین فیزیکی، Safari/iOS واقعی و Firefox در این RCA | BLOCKED | اجرای این مأموریت روی Chrome و دوربین مجازی بود؛ نتیجه نسخه قبلی به این نسخه تعمیم داده نشده است. |
| هشدارهای قدیمی وابستگی‌ها | OPEN | نتایج audit و حدود بررسی مسیر اجرا در بالا ثبت شده‌اند؛ تغییر گسترده نسخه‌ها انجام نشد. |

هیچ شکست حل‌نشده در ۱۰ معیار QA یا Migration آزمایشی باقی نمانده است. نتیجه PASS این گزارش مجوز خودکار Deploy نیست و به معنای تأیید آزمون‌های خارجی BLOCKED نیست.

## اسکرین‌شات‌های واقعی محیط آزمون

تمام تصاویر از داده‌های کنترل‌شده DB موقت‌اند و تصویر یا حساب کاربر واقعی منتشر نشده است.

- [دفتر مصرف فروشنده](docs/qa/root-cause-20261101/seller-usage.png)
- [واریز غیرفعال بدون حساب نمونه](docs/qa/root-cause-20261101/bank-unavailable.png)
- [حفظ نشست هنگام 503](docs/qa/root-cause-20261101/auth-unavailable.png)
- [فروشگاه ناموجود](docs/qa/root-cause-20261101/store-not-found.png)
- [مدیریت بسته فروشنده](docs/qa/root-cause-20261101/seller-packages.png)
- [خروجی و تاریخچه پرو](docs/qa/root-cause-20261101/tryon-completed.png)
