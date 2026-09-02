const jwt = require('jsonwebtoken');
const ApiError = require('../utils/apiError');
const db = require('../repositories/dbStore');
const { jwtSecret, jwtUserExpiresIn, jwtAdminExpiresIn } = require('../config/env');
const { normalizeDigits, normalizeMobile } = require('../utils/number');

const tokenFor = (user) =>
  jwt.sign(
    { id: user.id, role: user.role, username: user.username, fullname: user.fullname },
    jwtSecret,
    { expiresIn: user.role === 'Admin' ? jwtAdminExpiresIn : jwtUserExpiresIn },
  );

const otpStore = new Map();

const roleValue = (role = 'User') => (String(role).toLowerCase() === 'seller' ? 'Seller' : 'User');
const otpKey = (mobile, role) => `${role}:${mobile}`;

function makeOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

exports.requestOtp = async ({ mobile, role = 'User', store_slug }) => {
  const cleanMobile = normalizeMobile(mobile);
  if (cleanMobile.length < 10) throw new ApiError(400, 'شماره موبایل معتبر نیست.');
  const requestedRole = roleValue(role);
  const existingUser = await db.findUserByMobileAndRole(cleanMobile, requestedRole);
  const code = makeOtp();
  otpStore.set(otpKey(cleanMobile, requestedRole), {
    code,
    role: requestedRole,
    store_slug: store_slug || '',
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
  return {
    mobile: cleanMobile,
    expires_in: 300,
    dev_code: code,
    existing_account: Boolean(existingUser),
    requires_identity: !existingUser,
    seller_verification_status: existingUser?.seller_verification_status || null,
  };
};

exports.verifyOtp = async ({ mobile, code, role = 'User', fullname, store_name, national_code, store_slug }) => {
  const cleanMobile = normalizeMobile(mobile);
  const requestedRole = roleValue(role);
  const cleanCode = normalizeDigits(code).trim();
  const otp = otpStore.get(otpKey(cleanMobile, requestedRole));
  if (!otp || otp.code !== cleanCode || otp.expiresAt < Date.now()) {
    throw new ApiError(401, 'کد تایید معتبر نیست یا منقضی شده است.');
  }

  // A mobile number may have a user account and a seller account. Resolve the
  // OTP against the requested role so the two entry points never cross over.
  let user = await db.findUserByMobileAndRole(cleanMobile, requestedRole);
  if (!user) {
    const existingAccount = await db.findUserByUsername(cleanMobile);
    const username = existingAccount ? `${cleanMobile}-${requestedRole.toLowerCase()}` : cleanMobile;
    user = await db.createUser({
      fullname: fullname || (requestedRole === 'Seller' ? 'فروشگاه جدید' : 'کاربر جدید'),
      username,
      mobile: cleanMobile,
      password: `otp-${cleanMobile}`,
      role: requestedRole,
      store_name: store_name || fullname || 'فروشگاه من',
      national_code: normalizeDigits(national_code || ''),
      referred_store_slug: store_slug || otp.store_slug,
    });
  }

  if (user.status === 'blocked') {
    throw new ApiError(403, 'حساب کاربری شما مسدود شده است.');
  }

  otpStore.delete(otpKey(cleanMobile, requestedRole));
  const safeUser = db.safeUser(user);
  return { token: tokenFor(safeUser), user: safeUser };
};

exports.register = async (payload) => {
  if (await db.findUserByUsername(payload.username)) throw new ApiError(409, 'این نام کاربری یا ایمیل قبلا ثبت شده است.');
  if (payload.email && (await db.findUserByUsername(payload.email))) throw new ApiError(409, 'این نام کاربری یا ایمیل قبلا ثبت شده است.');
  const user = await db.createUser(payload);
  return { token: tokenFor(user), user };
};

exports.login = async ({ username, password }) => {
  const normalizedUsername = normalizeDigits(username);
  const user = await db.findUserByUsername(normalizedUsername) || await db.findUserByUsername(username);
  if (!user) throw new ApiError(401, 'نام کاربری یا رمز عبور اشتباه است.');
  if (user.status === 'blocked') throw new ApiError(403, 'حساب کاربری شما مسدود شده است.');
  const approvedSeller = user.role === 'Seller' && String(user.seller_verification_status).toLowerCase() === 'approved';
  if (user.status !== 'active' && !approvedSeller) throw new ApiError(403, 'حساب کاربری شما فعال نیست.');

  const ok = await db.bcrypt.compare(password, user.password);
  if (!ok) throw new ApiError(401, 'نام کاربری یا رمز عبور اشتباه است.');

  const safeUser = db.safeUser(user);
  return { token: tokenFor(safeUser), user: safeUser };
};

exports.me = async (id) => db.findUserById(id);
exports.forgotPassword = async () => ({ message: 'درخواست بازیابی رمز عبور ثبت شد.' });
exports.changePassword = async (id, password) => {
  const hash = await db.bcrypt.hash(password, 10);
  await require('../config/database').query('UPDATE users SET password=? WHERE id=?', [hash, id]);
  return { changed: true };
};

exports.normalizeMobile = normalizeMobile;
exports.roleValue = roleValue;
