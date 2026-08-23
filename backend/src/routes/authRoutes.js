const router = require('express').Router();
const controller = require('../controllers/authController');
const { authenticate } = require('../middlewares/authMiddleware');
const validate = require('../middlewares/validate');
const { loginRules, registerRules } = require('../validators/authValidator');

router.post('/register', registerRules, validate, controller.register);
router.post('/login', loginRules, validate, controller.login);
router.post('/otp/request', controller.requestOtp);
router.post('/otp/verify', controller.verifyOtp);
router.post('/forgot-password', controller.forgotPassword);
router.patch('/change-password', authenticate, controller.changePassword);
router.get('/me', authenticate, controller.me);
router.post('/logout', authenticate, controller.logout);

module.exports = router;
