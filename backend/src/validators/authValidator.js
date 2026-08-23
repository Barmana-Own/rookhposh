const { body } = require('express-validator');

const passwordMessage = 'رمز عبور باید حداقل ۸ کاراکتر و شامل حرف بزرگ، حرف کوچک و عدد باشد.';
const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

exports.loginRules = [
  body('username').trim().notEmpty().withMessage('نام کاربری الزامی است.'),
  body('password').notEmpty().withMessage('رمز عبور الزامی است.'),
];

exports.userRules = [
  body('fullname').trim().notEmpty().withMessage('نام و نام خانوادگی الزامی است.'),
  body('username').trim().isLength({ min: 3 }).withMessage('نام کاربری باید حداقل ۳ کاراکتر باشد.'),
  body('password').optional().matches(strongPassword).withMessage(passwordMessage),
  body('role').isIn(['Admin', 'Seller', 'User']).withMessage('نقش کاربر معتبر نیست.'),
];

exports.registerRules = [
  body('fullname').trim().notEmpty().withMessage('نام و نام خانوادگی الزامی است.'),
  body('username').trim().isLength({ min: 3 }).withMessage('نام کاربری باید حداقل ۳ کاراکتر باشد.'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('ایمیل معتبر نیست.'),
  body('password').matches(strongPassword).withMessage(passwordMessage),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) throw new Error('تکرار رمز عبور با رمز عبور یکسان نیست.');
    return true;
  }),
  body('role').isIn(['Seller', 'User']).withMessage('برای ثبت‌نام فقط نقش کاربر یا فروشنده مجاز است.'),
];
