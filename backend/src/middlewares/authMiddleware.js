const jwt = require('jsonwebtoken');
const ApiError = require('../utils/apiError');
const db = require('../repositories/dbStore');
const { jwtSecret } = require('../config/env');

function demoUserForPath(path) {
  if (process.env.DEMO_AUTH !== 'true') return null;
  if (path.startsWith('/api/admin')) return { id: 1, role: 'Admin', username: 'admin', fullname: 'مدیر سیستم' };
  if (path.startsWith('/api/seller')) return { id: 2, role: 'Seller', username: 'seller', fullname: 'فروشنده نمونه', seller_verification_status: 'approved' };
  if (path.startsWith('/api/user')) return { id: 3, role: 'User', username: 'user', fullname: 'کاربر نمونه' };
  return null;
}

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    const demoUser = demoUserForPath(req.originalUrl);
    if (demoUser) {
      req.user = demoUser;
      return next();
    }
    return next(new ApiError(401, 'برای دسترسی ابتدا وارد شوید.'));
  }

  try {
    req.user = jwt.verify(token, jwtSecret);
    return next();
  } catch {
    return next(new ApiError(401, 'نشست شما منقضی شده است. دوباره وارد شوید.'));
  }
}

const authorize = (...roles) => (req, res, next) => (
  roles.includes(req.user?.role) ? next() : next(new ApiError(403, 'شما مجوز دسترسی به این بخش را ندارید.'))
);

async function authorizeApprovedSeller(req, res, next) {
  if (req.user?.role !== 'Seller') return next();
  const currentUser = await db.findUserById(req.user.id);
  if (!currentUser) return next(new ApiError(401, 'حساب کاربری شما پیدا نشد.'));
  if (String(currentUser.seller_verification_status || '').toLowerCase() !== 'approved') {
    return next(new ApiError(403, 'حساب فروشندگی شما هنوز تایید نشده است.'));
  }
  req.user = currentUser;
  return next();
}

module.exports = { authenticate, authorize, authorizeApprovedSeller };
