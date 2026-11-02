const jwt = require('jsonwebtoken');
const ApiError = require('../utils/apiError');
const db = require('../repositories/dbStore');
const { jwtSecret } = require('../config/env');

function demoUserForPath(path) {
  if (process.env.DEMO_AUTH !== 'true') return null;
  if (path.startsWith('/api/admin')) return { id: 1, role: 'Admin', username: 'admin', fullname: 'مدیر سیستم' };
  if (path.startsWith('/api/seller')) return { id: 2, role: 'Seller', username: 'seller', fullname: 'فروشگاه نمونه', seller_verification_status: 'approved' };
  return null;
}

async function authenticate(req, res, next) {
  const header = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    const demoUser = demoUserForPath(req.originalUrl);
    if (demoUser && process.env.NODE_ENV !== 'production') { req.user = demoUser; return next(); }
    return next(new ApiError(401, 'برای دسترسی ابتدا وارد شوید.'));
  }
  let claims;
  try { claims = jwt.verify(token, jwtSecret); }
  catch { return next(new ApiError(401, 'نشست شما منقضی شده است. دوباره وارد شوید.')); }
  if (!Number.isSafeInteger(Number(claims.id)) || Number(claims.id) < 1) return next(new ApiError(401, 'نشست ورود معتبر نیست.'));
  try {
    const current = await db.findUserById(Number(claims.id));
    const legacyApprovedSeller = current?.role === 'Seller' && current.status !== 'blocked'
      && current.seller_verification_status === 'approved';
    if (!current) return next(new ApiError(401, 'نشست این حساب دیگر معتبر نیست. دوباره وارد شوید.'));
    if (current.role !== claims.role || (current.status !== 'active' && !legacyApprovedSeller)) {
      return next(new ApiError(403, 'این حساب اجازه دسترسی ندارد.'));
    }
    if (!['Admin', 'Seller'].includes(current.role)) return next(new ApiError(403, 'ورود به سامانه فقط از بخش فروشندگان امکان‌پذیر است.'));
    req.user = current;
    return next();
  } catch (error) {
    // A database outage is not evidence that a signed session is invalid.
    return next(error);
  }
}

const authorize = (...roles) => (req, res, next) => (
  roles.includes(req.user?.role) ? next() : next(new ApiError(403, 'شما مجوز دسترسی به این بخش را ندارید.'))
);

async function authorizeApprovedSeller(req, res, next) {
  if (req.user?.role !== 'Seller') return next();
  const currentUser = await db.findUserById(req.user.id);
  if (!currentUser) return next(new ApiError(401, 'حساب کاربری شما پیدا نشد.'));
  if (currentUser.role !== 'Seller' || currentUser.status === 'blocked') {
    return next(new ApiError(403, 'حساب فروشگاه شما اجازه دسترسی ندارد.'));
  }
  if (String(currentUser.seller_verification_status || '').toLowerCase() !== 'approved') {
    return next(new ApiError(403, 'احراز هویت فروشگاه شما هنوز تایید نشده است.'));
  }
  req.user = currentUser;
  return next();
}

module.exports = { authenticate, authorize, authorizeApprovedSeller };
