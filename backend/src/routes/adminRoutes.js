const router = require('express').Router();
const controller = require('../controllers/adminController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');
const validate = require('../middlewares/validate');
const { userRules } = require('../validators/authValidator');

router.use(authenticate, authorize('Admin'));

router.get('/dashboard', controller.dashboard);

router.get('/products', controller.products);
router.patch('/products/:id/approve', controller.approveProduct);
router.patch('/products/:id/reject', controller.rejectProduct);

router.get('/users', controller.users);
router.post('/users', userRules, validate, controller.createUser);
router.patch('/users/:id', controller.updateUser);
router.patch('/users/:id/block', controller.blockUser);
router.patch('/users/:id/unblock', controller.unblockUser);
router.delete('/users/:id', controller.deleteUser);
router.patch('/sellers/:id/approve', controller.approveSeller);
router.patch('/sellers/:id/reject', controller.rejectSeller);

router.get('/packages', controller.packages);
router.post('/packages', controller.createPackage);
router.get('/packages/settings', controller.packageSettings);
router.patch('/packages/settings', controller.updatePackageSettings);
router.patch('/packages/:id', controller.updatePackage);
router.get('/settings/bank', controller.bankInfo);
router.patch('/settings/bank', controller.updateBankInfo);

router.get('/notifications', controller.notifications);
router.post('/notifications/read', controller.readNotifications);

router.get('/financial', controller.orders);
router.get('/payments/pending', controller.pendingPayments);
router.patch('/payments/:id/approve', controller.approvePayment);
router.patch('/payments/:id/reject', controller.rejectPayment);
router.get('/reports/financial/:segment', controller.financialReport);
router.get('/reports/financial/:segment/export', controller.exportFinancial);
router.get('/reports/financial/user/:id/export', controller.exportFinancial);
router.get('/reports/financial/seller/:id/export', controller.exportFinancial);

router.get('/support', controller.tickets);
router.get('/support/faqs', controller.supportFaqs);
router.patch('/support/faqs', controller.updateSupportFaqs);
router.get('/tickets', controller.tickets);
router.get('/tickets/:id', controller.ticket);
router.post('/tickets/:id/reply', controller.replyTicket);
router.patch('/tickets/:id/close', controller.closeTicket);

module.exports = router;
