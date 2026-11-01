const router = require('express').Router();
const { requireAdmin, sameOrigin, positiveId } = require('../tryon/identity');
const run = require('../utils/asyncHandler');
const service = require('../services/productReviewService');
const ok = (res, data) => res.json({ success: true, data });
router.use(['/products/:id/review', '/products/:id/review-history', '/products/:id/images/:index',
  '/products/:id/approve', '/products/:id/reject', '/product-rejection-reasons'], requireAdmin);
router.get('/products/:id/review', run(async (req, res) => ok(res, await service.detail(positiveId(req.params.id), req.tryonAdmin.id))));
router.get('/products/:id/review-history', run(async (req, res) => ok(res, await service.history(positiveId(req.params.id), req.query))));
router.get('/products/:id/images/:index', run(service.sendImage));
router.patch('/products/:id/approve', sameOrigin, run(async (req, res) => ok(res, await service.decide(positiveId(req.params.id), req.tryonAdmin.id, 'approved', req.body))));
router.patch('/products/:id/reject', sameOrigin, run(async (req, res) => ok(res, await service.decide(positiveId(req.params.id), req.tryonAdmin.id, 'rejected', req.body))));
router.get('/product-rejection-reasons', run(async (req, res) => ok(res, await service.reasons(true))));
router.post('/product-rejection-reasons', sameOrigin, run(async (req, res) => ok(res, await service.saveReason(null, req.body, req.tryonAdmin.id))));
router.patch('/product-rejection-reasons/:id', sameOrigin, run(async (req, res) => ok(res, await service.saveReason(positiveId(req.params.id), req.body, req.tryonAdmin.id))));
module.exports = router;
