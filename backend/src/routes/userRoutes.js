const router = require('express').Router();
const controller = require('../controllers/userController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');

router.use(authenticate, authorize('User'));
router.get('/dashboard', controller.dashboard);
router.get('/wallet', controller.wallet);
router.post('/wallet/charge', controller.chargeWallet);
router.get('/packages', controller.packages);
router.post('/packages/:id/purchase', controller.purchasePackage);
router.get('/packages/settings', controller.packageSettings);
router.post('/tokens/purchase', controller.purchaseTokens);
router.get('/services', controller.services);
router.get('/services/pro/quota', controller.proQuota);
router.post('/services/pro/upload', controller.uploadProImage);
router.post('/services/pro/use', controller.useProService);
router.get('/transactions', controller.transactions);
router.get('/transactions/export', controller.exportTransactions);
router.get('/tickets', controller.tickets);
router.get('/profile', controller.profile);
router.patch('/profile', controller.updateProfile);
router.get('/notifications', controller.notifications);
router.post('/notifications/read', controller.readNotifications);
router.get('/products', controller.products);
router.post('/products/:id/purchase', controller.purchaseProduct);
router.post('/products/:id/review', controller.createReview);

module.exports = router;
