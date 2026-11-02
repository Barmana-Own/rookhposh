const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { jwtSecret } = require('../config/env');
const ApiError = require('../utils/apiError');
const { allowedOrigins } = require('./config');
const sessionRevocations = require('./sessionRevocations');

const COOKIE = process.env.NODE_ENV === 'production' ? '__Host-rhp_tryon_session' : 'rhp_tryon_session';
const { SESSION_SECONDS } = sessionRevocations;
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const signature = (value) => crypto.createHmac('sha256', jwtSecret).update(`tryon-session:${value}`).digest('hex');

function verifySession(value, now = Math.floor(Date.now() / 1000)) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}\.\d{10}\.[a-f0-9]{64}$/.test(value)) return null;
  const [nonce, expires, mac] = value.split('.');
  const expected = signature(`${nonce}.${expires}`);
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
      || Number(expires) <= now || Number(expires) > now + SESSION_SECONDS + 60) return null;
  return { nonce, expires: Number(expires) };
}

async function visitor(req, res) {
  const cookies = String(req.headers.cookie || '').split(';');
  const raw = cookies.find((item) => item.trim().startsWith(`${COOKIE}=`))?.trim().slice(COOKIE.length + 1);
  const now = Math.floor(Date.now() / 1000);
  const presented = verifySession(raw, now);
  req.tryonPresentedSession = presented ? { hash: digest('visitor:' + presented.nonce), expires: presented.expires } : null;
  const session = presented && !await sessionRevocations.isRevoked(req.tryonPresentedSession.hash) ? presented : null;
  const nonce = session?.nonce || crypto.randomBytes(32).toString('hex');
  if (!session || session.expires - now < 30 * 86400) {
    const value = `${nonce}.${now + SESSION_SECONDS}`;
    res.cookie(COOKIE, `${value}.${signature(value)}`, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
      path: '/', maxAge: SESSION_SECONDS * 1000,
    });
  }
  return { kind: 'visitor', hash: digest(`visitor:${nonce}`), userId: null };
}

async function currentAccount(header) {
  if (!header) return null;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) throw new ApiError(401, 'نشست ورود معتبر نیست.');
  let claims;
  try { claims = jwt.verify(header.slice(7), jwtSecret); } catch { throw new ApiError(401, 'نشست شما منقضی شده است.'); }
  const id = Number(claims.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(401, 'نشست ورود معتبر نیست.');
  const [[user]] = await pool.query('SELECT id,role,status,fullname,email,mobile FROM users WHERE id=?', [id]);
  if (!user || user.status !== 'active' || user.role !== claims.role || !['Admin', 'Seller', 'User'].includes(user.role)) {
    throw new ApiError(403, 'این حساب اجازه دسترسی ندارد.');
  }
  return user;
}

function principal({ legacyVisitor = false } = {}) {
  return async (req, res, next) => {
    try {
      const anonymous = await visitor(req, res);
      const user = legacyVisitor ? null : await currentAccount(req.headers.authorization);
      req.tryonOwner = user
        ? { kind: 'account', hash: digest(`account:${user.id}`), userId: Number(user.id) }
        : anonymous;
      req.tryonVisitor = anonymous;
      req.tryonAccount = user;
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Referrer-Policy', 'no-referrer');
      next();
    } catch (error) { next(error); }
  };
}

async function requireAdmin(req, res, next) {
  try {
    const user = await currentAccount(req.headers.authorization);
    if (!user || user.role !== 'Admin') throw new ApiError(403, 'دسترسی مدیریت لازم است.');
    req.tryonAdmin = user;
    res.setHeader('Cache-Control', 'private, no-store');
    next();
  } catch (error) { next(error); }
}

function sameOrigin(req, res, next) {
  const origin = req.headers.origin;
  if ((origin && !allowedOrigins.has(origin)) || (!origin && req.headers['sec-fetch-site'] === 'cross-site')) {
    return next(new ApiError(403, 'مبدأ درخواست مجاز نیست.'));
  }
  return next();
}

function assertId(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{32}$/i.test(value)) throw new ApiError(404, 'عملیات پیدا نشد.');
  return value.toLowerCase();
}

function positiveId(value) {
  if (!/^[1-9]\d{0,15}$/.test(String(value))) throw new ApiError(400, 'شناسه معتبر نیست.');
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new ApiError(400, 'شناسه معتبر نیست.');
  return result;
}

module.exports = { principal, requireAdmin, sameOrigin, assertId, positiveId, verifySession, digest, COOKIE };
