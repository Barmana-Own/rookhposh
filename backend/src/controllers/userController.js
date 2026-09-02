const service = require('../services/userService');
const asyncHandler = require('../utils/asyncHandler');

const ok = (res, data) => res.json({ success: true, data });

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const value = forwarded ? String(forwarded).split(',')[0].trim() : req.socket.remoteAddress || req.ip || '';
  return value.replace(/^::ffff:/, '').slice(0, 64);
}

exports.dashboard = asyncHandler(async (req, res) => ok(res, await service.dashboard(req.user.id)));
exports.transactions = asyncHandler(async (req, res) => ok(res, await service.orders(req.user.id)));
exports.exportTransactions = asyncHandler(async (req, res) => {
  const tab = req.query.tab === 'services' ? 'services' : 'financial';
  const buffer = await service.exportTransactions(req.user.id, tab);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="user-${tab}.xlsx"`);
  res.send(buffer);
});
exports.tickets = asyncHandler(async (req, res) => ok(res, await service.tickets(req.user.id)));
exports.products = asyncHandler(async (req, res) => ok(res, await service.products(req.query)));
exports.purchaseProduct = asyncHandler(async (req, res) => ok(res, await service.purchaseProduct(req.user.id, req.params.id, req.body)));
exports.createReview = asyncHandler(async (req, res) => ok(res, await service.createReview(req.user.id, req.params.id, req.body)));
exports.profile = asyncHandler(async (req, res) => ok(res, await service.profile(req.user.id)));
exports.updateProfile = asyncHandler(async (req, res) => ok(res, await service.updateProfile(req.user.id, req.body)));
exports.wallet = asyncHandler(async (req, res) => ok(res, await service.wallet(req.user.id)));
exports.chargeWallet = asyncHandler(async (req, res) => ok(res, await service.chargeWallet(req.user.id, req.body)));
exports.packages = asyncHandler(async (req, res) => ok(res, await service.packages()));
exports.purchasePackage = asyncHandler(async (req, res) => ok(res, await service.purchasePackage(req.user.id, req.params.id, req.body)));
exports.packageSettings = asyncHandler(async (req, res) => ok(res, await service.packageSettings()));
exports.purchaseTokens = asyncHandler(async (req, res) => ok(res, await service.purchaseTokens(req.user.id, req.body)));
exports.services = asyncHandler(async (req, res) => ok(res, await service.services(req.user.id, req.query)));
exports.proQuota = asyncHandler(async (req, res) => ok(res, await service.proQuota(req.user.id, clientIp(req))));
exports.uploadProImage = asyncHandler(async (req, res) => ok(res, await service.uploadProImage(req.user.id, {
  ...(req.body || {}),
  ip_address: clientIp(req),
})));
exports.useProService = asyncHandler(async (req, res) => ok(res, await service.useProService(req.user.id, { ...(req.body || {}), client_ip: clientIp(req) })));
exports.notifications = asyncHandler(async (req, res) => ok(res, await service.notifications(req.user.id)));
exports.readNotifications = asyncHandler(async (req, res) => ok(res, await service.readNotifications(req.user.id)));
