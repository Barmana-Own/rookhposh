const service = require('../services/authService');
const asyncHandler = require('../utils/asyncHandler');

exports.register = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await service.register(req.body) }));
exports.login = asyncHandler(async (req, res) => res.json({ success: true, data: await service.login(req.body) }));
exports.requestOtp = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json({ success: true, data: await service.requestOtp(req.body || {}) });
});
exports.verifyOtp = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json({ success: true, data: await service.verifyOtp(req.body || {}) });
});
exports.me = asyncHandler(async (req, res) => res.json({ success: true, data: await service.me(req.user.id) }));
exports.logout = (req, res) => res.json({ success: true, message: 'خروج با موفقیت انجام شد.' });
exports.forgotPassword = asyncHandler(async (req, res) => res.json({ success: true, data: await service.forgotPassword(req.body) }));
exports.changePassword = asyncHandler(async (req, res) => res.json({ success: true, data: await service.changePassword(req.user.id, req.body.password) }));
