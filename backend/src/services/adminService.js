const db = require('../repositories/dbStore');
const { exportWorkbook, exportWorkbookSheets } = require('../utils/excelExport');
const { toNumber } = require('../utils/number');
const financial = require('../repositories/financialStore');
const productReviews = require('./productReviewService');

const userStatusLabel = { active: 'فعال', blocked: 'مسدود' };
const sellerVerificationLabel = {
  none: 'ندارد',
  pending: 'در انتظار',
  approved: 'تایید شده',
  rejected: 'رد شده',
};

const exportUsersColumns = [
  { header: 'شناسه', key: 'id', width: 12 },
  { header: 'نام کامل', key: 'fullname', width: 26 },
  { header: 'نام کاربری', key: 'username', width: 22 },
  { header: 'ایمیل', key: 'email', width: 30 },
  { header: 'موبایل', key: 'mobile', width: 18 },
  { header: 'کد ملی', key: 'national_code', width: 18 },
  { header: 'موجودی کیف پول', key: 'wallet_balance', width: 18 },
  { header: 'وضعیت حساب', key: 'status_text', width: 16 },
  { header: 'تاریخ ثبت', key: 'created_at', width: 22 },
  { header: 'آخرین بروزرسانی', key: 'updated_at', width: 22 },
];

const exportSellersColumns = [
  ...exportUsersColumns.slice(0, 7),
  { header: 'نام فروشگاه', key: 'store_name', width: 26 },
  { header: 'وضعیت احراز هویت', key: 'verification_text', width: 20 },
  { header: 'علت رد', key: 'seller_reject_reason', width: 36 },
  { header: 'وضعیت حساب', key: 'status_text', width: 16 },
  { header: 'تاریخ ثبت', key: 'created_at', width: 22 },
  { header: 'آخرین بروزرسانی', key: 'updated_at', width: 22 },
];

function exportUserRow(row) {
  return {
    ...row,
    status_text: userStatusLabel[row.status] || row.status || '',
  };
}

function exportSellerRow(row) {
  return {
    ...row,
    status_text: userStatusLabel[row.status] || row.status || '',
    verification_text: sellerVerificationLabel[String(row.seller_verification_status || '').toLowerCase()]
      || row.seller_verification_status
      || '',
  };
}

exports.dashboard = async () => db.dashboardFor('Admin');
exports.products = async (query = {}) => db.listProducts({
  status: query.status || 'pending',
  search: query.q,
  page: query.page,
  limit: query.limit,
  includeMeta: true,
  imageLimit: query.status === 'pending' ? 4 : 1,
  compactImages: true,
  includeReviewStats: false,
  excludePendingChanges: query.status !== 'pending',
});
exports.approveProduct = async (id, actorId, payload) => productReviews.decide(id, actorId, 'approved', payload);
exports.rejectProduct = async (id, actorId, payload) => productReviews.decide(id, actorId, 'rejected', payload);

exports.users = async (query = {}) => db.listUsers({
  role: query.role,
  page: query.page,
  limit: query.limit,
  includeMeta: true,
});
exports.exportUsers = async () => {
  const [users, sellers] = await Promise.all([
    db.listUsers({ role: 'User' }),
    db.listUsers({ role: 'Seller' }),
  ]);
  return exportWorkbookSheets([
    { name: 'کاربران', columns: exportUsersColumns, rows: users.map(exportUserRow) },
    { name: 'فروشگاه‌ها', columns: exportSellersColumns, rows: sellers.map(exportSellerRow) },
  ]);
};
exports.createUser = async (data) => db.createUser(data);
exports.updateUser = async (id, data) => db.updateAdminUser(id, data);
exports.blockUser = async (id) => db.setUserStatus(id, 'blocked');
exports.unblockUser = async (id) => db.setUserStatus(id, 'active');
exports.deleteUser = async (id) => db.deleteUser(id);
exports.approveSeller = async (id) => db.setSellerVerification(id, 'approved');
exports.rejectSeller = async (id, reason) => db.setSellerVerification(id, 'rejected', reason || 'اطلاعات هویتی کافی نیست.');

exports.packages = async (query = {}) => db.listPackages(query.role_type, { includeInactive: true });
exports.createPackage = async (payload) => db.createPackage(payload);
exports.updatePackage = async (id, payload) => db.updatePackage(id, payload);
exports.packageSettings = async () => ({ token_price: Number(await db.getSetting('token_price', 25000) || 25000) });
exports.updatePackageSettings = async (payload = {}) => {
  const tokenPrice = toNumber(payload.token_price || 0);
  await db.setSetting('token_price', tokenPrice > 0 ? tokenPrice : 25000);
  return exports.packageSettings();
};

exports.bankInfo = async () => JSON.parse(await db.getSetting('bank_info', '{}') || '{}');
exports.updateBankInfo = async (payload = {}) => {
  const info = {
    bank_name: String(payload.bank_name || '').trim(),
    card_number: String(payload.card_number || '').trim(),
    iban: String(payload.iban || '').trim(),
    account_holder: String(payload.account_holder || '').trim(),
  };
  await db.setSetting('bank_info', JSON.stringify(info));
  return info;
};

exports.tickets = async (query = {}) => db.listTickets({
  userRole: query.role,
  page: query.page,
  limit: query.limit,
  includeMeta: true,
});
exports.ticket = async (id) => db.getTicket(id);
exports.replyTicket = async (id, adminId, payload) => db.replyTicket(id, adminId, payload);
exports.closeTicket = async (id) => db.closeTicket(id);
exports.supportFaqs = async () => JSON.parse(await db.getSetting('support_faqs', '[]') || '[]');
exports.updateSupportFaqs = async (payload = {}) => {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const cleanItems = items
    .map((item) => ({
      audience: ['user', 'seller'].includes(item.audience) ? item.audience : 'user',
      category: String(item.category || '').trim() || 'عمومی',
      question: String(item.question || '').trim(),
      answer: String(item.answer || '').trim(),
      attachment: item.attachment || null,
      attachment_name: item.attachment_name || '',
    }))
    .filter((item) => item.question && item.answer);

  await db.setSetting('support_faqs', JSON.stringify(cleanItems));
  return cleanItems;
};

exports.orders = async () => db.listTransactions();
exports.pendingPayments = async (query = {}) => db.listPendingPayments({
  page: query.page,
  limit: query.limit,
  includeMeta: true,
});
exports.approvePayment = async (id) => db.approvePendingPayment(id);
exports.rejectPayment = async (id, reason) => db.rejectPendingPayment(id, reason);
exports.notifications = async (id) => db.listNotifications(id);
exports.readNotifications = async (id) => db.markNotificationsRead(id);

exports.financialReport = async (segment, query = {}) => financial.report(segment, query);

exports.exportFinancial = async (segment, query = {}) => {
  const report = await financial.report(segment, query, { exportAll: true });
  return exportWorkbook(
    'Financial Report',
    [
      { header: 'نام', key: 'user_name', width: 24 },
      { header: 'ایمیل', key: 'user_email', width: 28 },
      { header: 'نقش', key: 'user_role', width: 14 },
      { header: 'نوع تراکنش', key: 'type', width: 24 },
      { header: 'مبلغ', key: 'amount', width: 16 },
      { header: 'وضعیت', key: 'status', width: 14 },
      { header: 'کد پیگیری بانک', key: 'bank_reference', width: 26 },
      { header: 'توضیحات', key: 'description', width: 36 },
      { header: 'تاریخ تراکنش', key: 'created_at', width: 22 },
    ],
    report.rows.map((row) => ({
      ...row,
      status: { success: 'تأیید شده', pending: 'در انتظار تأیید', failed: 'ناموفق', unverified: 'نیازمند تأیید بانک' }[row.settlement_status] || row.status,
    })),
  );
};
