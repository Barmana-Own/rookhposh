const service = require('../services/adminService');
const asyncHandler = require('../utils/asyncHandler');
const { toNumber } = require('../utils/number');

const ok = (res, data) => res.json({ success: true, data });

exports.dashboard = asyncHandler(async (req, res) => ok(res, await service.dashboard()));
exports.products = asyncHandler(async (req, res) => ok(res, await service.products(req.query)));
exports.approveProduct = asyncHandler(async (req, res) => ok(res, await service.approveProduct(toNumber(req.params.id))));
exports.rejectProduct = asyncHandler(async (req, res) => ok(res, await service.rejectProduct(toNumber(req.params.id), req.body.reject_reason)));

exports.users = asyncHandler(async (req, res) => ok(res, await service.users(req.query)));
exports.createUser = asyncHandler(async (req, res) => ok(res, await service.createUser(req.body)));
exports.updateUser = asyncHandler(async (req, res) => ok(res, await service.updateUser(toNumber(req.params.id), req.body)));
exports.blockUser = asyncHandler(async (req, res) => ok(res, await service.blockUser(toNumber(req.params.id))));
exports.unblockUser = asyncHandler(async (req, res) => ok(res, await service.unblockUser(toNumber(req.params.id))));
exports.deleteUser = asyncHandler(async (req, res) => ok(res, await service.deleteUser(toNumber(req.params.id))));
exports.approveSeller = asyncHandler(async (req, res) => ok(res, await service.approveSeller(toNumber(req.params.id))));
exports.rejectSeller = asyncHandler(async (req, res) => ok(res, await service.rejectSeller(toNumber(req.params.id), req.body.reason)));

exports.packages = asyncHandler(async (req, res) => ok(res, await service.packages(req.query)));
exports.createPackage = asyncHandler(async (req, res) => ok(res, await service.createPackage(req.body)));
exports.updatePackage = asyncHandler(async (req, res) => ok(res, await service.updatePackage(toNumber(req.params.id), req.body)));
exports.packageSettings = asyncHandler(async (req, res) => ok(res, await service.packageSettings()));
exports.updatePackageSettings = asyncHandler(async (req, res) => ok(res, await service.updatePackageSettings(req.body)));
exports.bankInfo = asyncHandler(async (req, res) => ok(res, await service.bankInfo()));
exports.updateBankInfo = asyncHandler(async (req, res) => ok(res, await service.updateBankInfo(req.body)));

exports.tickets = asyncHandler(async (req, res) => ok(res, await service.tickets(req.query)));
exports.ticket = asyncHandler(async (req, res) => ok(res, await service.ticket(toNumber(req.params.id))));
exports.replyTicket = asyncHandler(async (req, res) => ok(res, await service.replyTicket(toNumber(req.params.id), req.user.id, req.body)));
exports.closeTicket = asyncHandler(async (req, res) => ok(res, await service.closeTicket(toNumber(req.params.id))));
exports.supportFaqs = asyncHandler(async (req, res) => ok(res, await service.supportFaqs()));
exports.updateSupportFaqs = asyncHandler(async (req, res) => ok(res, await service.updateSupportFaqs(req.body)));

exports.orders = asyncHandler(async (req, res) => ok(res, await service.orders()));
exports.pendingPayments = asyncHandler(async (req, res) => ok(res, await service.pendingPayments(req.query)));
exports.approvePayment = asyncHandler(async (req, res) => ok(res, await service.approvePayment(toNumber(req.params.id))));
exports.rejectPayment = asyncHandler(async (req, res) => ok(res, await service.rejectPayment(toNumber(req.params.id), req.body.reason)));
exports.notifications = asyncHandler(async (req, res) => ok(res, await service.notifications(req.user.id)));
exports.readNotifications = asyncHandler(async (req, res) => ok(res, await service.readNotifications(req.user.id)));

exports.financialReport = asyncHandler(async (req, res) => ok(res, await service.financialReport(req.params.segment, req.query)));
exports.exportFinancial = asyncHandler(async (req, res) => {
  const segment = req.params.segment || (req.params.id && req.originalUrl.includes('/seller/') ? 'sellers' : 'users');
  const buffer = await service.exportFinancial(segment, req.query);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${segment}-financial-report.xlsx"`);
  res.send(buffer);
});
