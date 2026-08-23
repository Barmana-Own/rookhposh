const service = require('../services/sellerService');
const asyncHandler = require('../utils/asyncHandler');
const { toNumber } = require('../utils/number');

const ok = (res, data) => res.json({ success: true, data });
const frontendOrigin = () => process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://dash.rookhposh.ir' : 'http://localhost:5173');

exports.dashboard = asyncHandler(async (req, res) => ok(res, await service.dashboard(req.user.id)));
exports.products = asyncHandler(async (req, res) => ok(res, await service.products(req.user.id, req.query)));
exports.createProduct = asyncHandler(async (req, res) => ok(res, await service.createProduct(req.user.id, req.body)));
exports.updateProduct = asyncHandler(async (req, res) => ok(res, await service.updateProduct(req.user.id, req.params.id, req.body)));
exports.setProductPublishStatus = asyncHandler(async (req, res) => ok(res, await service.setProductPublishStatus(req.user.id, req.params.id, req.body)));
exports.transactions = asyncHandler(async (req, res) => ok(res, await service.orders(req.user.id)));
exports.wallet = asyncHandler(async (req, res) => ok(res, await service.wallet(req.user.id)));
exports.chargeWallet = asyncHandler(async (req, res) => ok(res, await service.chargeWallet(req.user.id, req.body)));
exports.exportTransactions = asyncHandler(async (req, res) => {
  const buffer = await service.exportTransactions(req.user.id);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="seller-transactions.xlsx"');
  res.send(buffer);
});
exports.tickets = asyncHandler(async (req, res) => ok(res, await service.tickets(req.user.id)));
exports.notifications = asyncHandler(async (req, res) => ok(res, await service.notifications(req.user.id)));
exports.readNotifications = asyncHandler(async (req, res) => ok(res, await service.readNotifications(req.user.id)));
exports.store = asyncHandler(async (req, res) => ok(res, await service.store(req.user.id)));
exports.updateStore = asyncHandler(async (req, res) => ok(res, await service.updateStore(req.user.id, req.body)));
exports.previewStore = asyncHandler(async (req, res) => ok(res, await service.previewStore(req.user.id)));
exports.storeQrCode = asyncHandler(async (req, res) => ok(res, await service.storeQrCode(req.user.id, frontendOrigin())));
exports.productQrCode = asyncHandler(async (req, res) => ok(res, await service.productQrCode(req.user.id, toNumber(req.params.id), frontendOrigin())));
exports.customers = asyncHandler(async (req, res) => ok(res, await service.customers(req.user.id)));
exports.exportCustomers = asyncHandler(async (req, res) => {
  const buffer = await service.exportCustomers(req.user.id);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="seller-customers.xlsx"');
  res.send(buffer);
});
exports.packages = asyncHandler(async (req, res) => ok(res, await service.packages()));
exports.purchasePackage = asyncHandler(async (req, res) => ok(res, await service.purchasePackage(req.user.id, req.params.id, req.body)));
exports.packageSettings = asyncHandler(async (req, res) => ok(res, await service.packageSettings()));
exports.purchaseTokens = asyncHandler(async (req, res) => ok(res, await service.purchaseTokens(req.user.id, req.body)));
