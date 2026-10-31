const express = require('express');
const service = require('../services/paymentService');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate, authorize } = require('../middlewares/authMiddleware');
const { omidpay } = require('../config/env');
const ApiError = require('../utils/apiError');

const router = express.Router();

router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

const callback = asyncHandler(async (req, res) => {
  if (!omidpay.enabled) throw new ApiError(503, 'درگاه پرداخت هنوز فعال نشده است.');
  try {
    // State, amount and reference from the browser never authorize fulfillment.
    await service.reconcile(req.params.id, req.body?.token ?? req.query?.token ?? null);
  } catch (error) {
    if (error.status === 400 || error.status === 404) throw error;
    console.warn('Payment callback requires retry', { paymentId: req.params.id });
  }
  res.redirect(303, service.resultUrl(req.params.id));
});

router.post('/omidpay/callback/:id', express.urlencoded({ extended: false, limit: '8kb', parameterLimit: 25 }), callback);
router.get('/omidpay/callback/:id', callback);

router.get('/:id', authenticate, authorize('User', 'Seller'), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.status(req.params.id, req.user.id) });
}));
router.post('/:id/verify', authenticate, authorize('User', 'Seller'), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.reconcile(req.params.id, null, req.user.id) });
}));

module.exports = router;
