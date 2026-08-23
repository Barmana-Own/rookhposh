const QRCode = require('qrcode');
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
  };
}

exports.dashboard = async (id) => db.dashboardFor('Seller', id);
exports.products = async (id, query = {}) => db.listProducts({ sellerId: id, status: query.status, search: query.q });
exports.createProduct = async (id, payload) => db.createProduct(id, payload);
exports.updateProduct = async (id, productId, payload) => db.updateProduct(id, productId, payload);
exports.setProductPublishStatus = async (id, productId, payload) => db.setProductPublishStatus(id, productId, payload.publish_status);
exports.orders = async (id) => db.listTransactions({ sellerId: id });
exports.wallet = async (id) => ({ balance_toman: (await db.findUserById(id))?.wallet_balance || 0 });
exports.chargeWallet = async (id, payload) => db.chargeWallet(id, payload.amount, payload.description || 'شارژ کیف پول فروشنده', payload);
exports.tickets = async (id) => db.listTickets({ userId: id });
exports.notifications = async (id) => db.listNotifications(id);
exports.readNotifications = async (id) => db.markNotificationsRead(id);
exports.store = async (id) => db.getStoreBySeller(id);
exports.updateStore = async (id, payload) => db.updateStore(id, payload);
exports.previewStore = async (id) => ({ ...(await db.getStoreBySeller(id)), products: await db.listProducts({ sellerId: id, status: 'active' }) });

exports.storeQrCode = async (id, origin = process.env.NODE_ENV === 'production' ? 'https://dash.rookhposh.ir' : 'http://localhost:5173') => {
  const sellerStore = await db.getStoreBySeller(id);
  const url = `${origin}/stores/${sellerStore.slug}`;
  const qrcode = await QRCode.toDataURL(url);
  await db.saveStoreQrCode(id, qrcode);
  return { url, qrcode };
};

exports.productQrCode = async (sellerId, productId, origin = process.env.NODE_ENV === 'production' ? 'https://dash.rookhposh.ir' : 'http://localhost:5173') => {
  const product = await db.getProduct(productId);
  if (!product || product.seller_id !== sellerId) {
    const error = new Error('product not found');
    error.status = 404;
    throw error;
  }
  const sellerStore = await db.getStoreBySeller(sellerId);
  const url = `${origin}/stores/${sellerStore.slug}/products/${product.id}`;
  const qrcode = await QRCode.toDataURL(url);
  await db.saveProductQrCode(product.id, qrcode);
  return { url, product_id: product.id, qrcode };
};

exports.customers = async (id) => db.listCustomers(id);
exports.packages = async () => db.listPackages('seller');
exports.purchasePackage = async (id, packageId, payload) => db.purchasePackage(id, packageId, 'seller', payload);
exports.purchaseTokens = async (id, payload) => db.purchaseTokens(id, 'seller', payload);
exports.packageSettings = async () => ({
  token_price: Number(await db.getSetting('token_price', 25000) || 25000),
  bank_info: JSON.parse(await db.getSetting('bank_info', '{}') || '{}'),
});

exports.exportTransactions = async (id) => {
  const rows = (await exports.orders(id)).map((row) => ({ ...row, ...flattenDetails(row.metadata) }));
  return exportWorkbook(
    'Seller Transactions',
    [
      { header: 'شناسه', key: 'id', width: 12 },
      { header: 'خریدار', key: 'buyer_fullname', width: 24 },
      { header: 'موبایل', key: 'buyer_mobile', width: 18 },
      { header: 'محصول', key: 'product_title', width: 24 },
      { header: 'استان', key: 'province', width: 18 },
      { header: 'شهر', key: 'city', width: 18 },
      { header: 'آدرس', key: 'address', width: 36 },
      { header: 'کد پستی', key: 'postal_code', width: 18 },
      { header: 'کد ملی', key: 'national_code', width: 18 },
      { header: 'نوع', key: 'type', width: 22 },
      { header: 'مبلغ', key: 'amount', width: 16 },
      { header: 'وضعیت', key: 'status', width: 14 },
      { header: 'توضیحات', key: 'description', width: 38 },
      { header: 'تاریخ', key: 'created_at', width: 22 },
    ],
    rows,
  );
};

exports.exportCustomers = async (id) => {
  const rows = await exports.customers(id);
  return exportWorkbook(
    'Seller Customers',
    [
      { header: 'شناسه کاربر', key: 'user_id', width: 14 },
      { header: 'نام', key: 'fullname', width: 24 },
      { header: 'ایمیل', key: 'email', width: 28 },
      { header: 'موبایل', key: 'customer_mobile', width: 18 },
      { header: 'استان', key: 'province', width: 18 },
      { header: 'شهر', key: 'city', width: 18 },
      { header: 'آدرس', key: 'address', width: 36 },
      { header: 'کد پستی', key: 'postal_code', width: 18 },
      { header: 'کد ملی', key: 'national_code', width: 18 },
      { header: 'آخرین محصول', key: 'last_product_title', width: 24 },
      { header: 'آخرین سفارش', key: 'last_order_id', width: 16 },
      { header: 'تعداد سفارش', key: 'orders', width: 16 },
      { header: 'وضعیت', key: 'status', width: 14 },
    ],
    rows,
  );
};
