const router = require('express').Router();
const controller = require('../controllers/sellerController');
const { authenticate, authorize, authorizeApprovedSeller } = require('../middlewares/authMiddleware');

router.use(authenticate, authorize('Seller'), authorizeApprovedSeller);

router.get('/dashboard', controller.dashboard);
router.get('/products', controller.products);
router.post('/products', controller.createProduct);
router.patch('/products/:id', controller.updateProduct);
router.patch('/products/:id/publish', controller.setProductPublishStatus);
router.get('/products/:id/qrcode', controller.productQrCode);

router.get('/customers', controller.customers);
router.get('/customers/export', controller.exportCustomers);

router.get('/transactions', controller.transactions);
router.get('/transactions/export', controller.exportTransactions);
router.get('/wallet', controller.wallet);
router.post('/wallet/charge', controller.chargeWallet);

router.get('/packages', controller.packages);
router.post('/packages/:id/purchase', controller.purchasePackage);
router.get('/packages/settings', controller.packageSettings);
router.post('/tokens/purchase', controller.purchaseTokens);

router.get('/tickets', controller.tickets);
router.get('/notifications', controller.notifications);
router.post('/notifications/read', controller.readNotifications);

router.get('/store', controller.store);
router.patch('/store', controller.updateStore);
router.get('/store/preview', controller.previewStore);
router.get('/store/qrcode', controller.storeQrCode);

module.exports = router;
