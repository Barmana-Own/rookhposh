const db = require('../repositories/dbStore');
const { exportWorkbook } = require('../utils/excelExport');

function flattenDetails(metadata = {}) {
  return {
    buyer_fullname: metadata.buyer_fullname || '',
    buyer_mobile: metadata.buyer_mobile || '',
    province: metadata.province || '',
    city: metadata.city || '',
    address: metadata.address || '',
    postal_code: metadata.postal_code || '',
    national_code: metadata.national_code || '',
    product_title: metadata.product_title || '',
    seller_name: metadata.seller_name || '',
  };
}

exports.dashboard = async (id) => db.dashboardFor('User', id);
exports.orders = async (id) => ({
  financial: (await db.listTransactions({ userId: id })).filter((item) => item.type !== 'pro_usage'),
  pro: await db.listProUsages(id),
});
exports.tickets = async (id) => db.listTickets({ userId: id });
exports.products = async (query = {}) => db.listProducts({ status: 'active', search: query.q });
exports.purchaseProduct = async (id, productId, payload) => db.purchaseProduct(id, productId, payload);
exports.profile = async (id) => db.findUserById(id);
exports.updateProfile = async (id, payload) => db.updateUserProfile(id, payload);
exports.wallet = async (id) => ({ balance_toman: (await db.findUserById(id))?.wallet_balance || 0 });
exports.chargeWallet = async (id, payload) => db.chargeWallet(id, payload.amount, payload.description || 'شارژ حساب', payload);
exports.packages = async () => db.listPackages('user');
exports.purchasePackage = async (id, packageId, payload) => db.purchasePackage(id, packageId, 'user', payload);
exports.purchaseTokens = async (id, payload) => db.purchaseTokens(id, 'user', payload);
exports.packageSettings = async () => ({
  token_price: Number(await db.getSetting('token_price', 25000) || 25000),
  bank_info: JSON.parse(await db.getSetting('bank_info', '{}') || '{}'),
});
exports.services = async (id, query = {}) => db.listProUsages(id, query.product_id);
exports.proQuota = async (id, ipAddress) => db.getProQuota(id, ipAddress);
exports.uploadProImage = async (id, payload) => db.createProUpload({ ...payload, user_id: id });
exports.useProService = async (id, payload) => db.createProUsage(id, payload);
exports.notifications = async (id) => db.listNotifications(id);
exports.readNotifications = async (id) => db.markNotificationsRead(id);
exports.createReview = async (id, productId, payload) => db.createReview(id, productId, payload);

exports.exportTransactions = async (id, tab = 'financial') => {
  if (tab === 'services') {
    const rows = await db.listProUsages(id);
    return exportWorkbook(
      'User Services',
      [
        { header: 'شناسه', key: 'id', width: 12 },
        { header: 'عنوان', key: 'description', width: 36 },
        { header: 'مبلغ', key: 'amount', width: 16 },
        { header: 'وضعیت', key: 'status', width: 14 },
        { header: 'تاریخ', key: 'created_at', width: 22 },
      ],
      rows,
    );
  }

  const rows = (await db.listTransactions({ userId: id }))
    .filter((item) => item.type !== 'pro_usage')
    .map((item) => ({ ...item, ...flattenDetails(item.metadata) }));

  return exportWorkbook(
    'User Transactions',
    [
      { header: 'شناسه', key: 'id', width: 12 },
      { header: 'عنوان', key: 'description', width: 38 },
      { header: 'نوع', key: 'type', width: 20 },
      { header: 'محصول', key: 'product_title', width: 24 },
      { header: 'فروشگاه', key: 'seller_name', width: 24 },
      { header: 'استان', key: 'province', width: 18 },
      { header: 'شهر', key: 'city', width: 18 },
      { header: 'آدرس', key: 'address', width: 36 },
      { header: 'کد پستی', key: 'postal_code', width: 18 },
      { header: 'کد ملی', key: 'national_code', width: 18 },
      { header: 'مبلغ', key: 'amount', width: 16 },
      { header: 'وضعیت', key: 'status', width: 14 },
      { header: 'تاریخ', key: 'created_at', width: 22 },
    ],
    rows,
  );
};
