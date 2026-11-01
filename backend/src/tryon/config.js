const path = require('node:path');
const crypto = require('node:crypto');
const { jwtSecret, proApiOrigin, corsOrigin, omidpay } = require('../config/env');

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_PIXELS = 24 * 1024 * 1024;
const ACTIVE_STATES = ['validating', 'processing', 'saving'];
const TERMINAL_STATES = ['completed', 'failed', 'timed_out', 'cancelled'];
const storageRoot = path.resolve(process.env.TRYON_STORAGE_ROOT || path.join(__dirname, '../../private/tryon'));
const providerOrigin = new URL(proApiOrigin);
const frontendOrigin = new URL(process.env.FRONTEND_URL || omidpay.frontendUrl).origin;
const allowedOrigins = new Set([frontendOrigin, ...String(corsOrigin).split(',').map((x) => x.trim())]);

function encryptionKey() {
  const secret = process.env.TRYON_SECRET_KEY;
  if (process.env.NODE_ENV === 'production' && (!secret || secret.length < 32)) {
    throw new Error('A private TRYON_SECRET_KEY is required for try-on encryption.');
  }
  return crypto.createHash('sha256').update(secret || `${jwtSecret}|tryon-development`).digest();
}

function seal(value, purpose) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(purpose));
  const bytes = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), bytes.toString('base64url')].join('.');
}

function unseal(value, purpose) {
  if (!value) return '';
  const [version, iv, tag, bytes] = String(value).split('.');
  if (version !== 'v1' || !iv || !tag || !bytes) throw new Error('Invalid encrypted try-on configuration.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(purpose));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(bytes, 'base64url')), decipher.final()]).toString('utf8');
}

// Refuse readiness before dispatching any image when private storage cannot be protected.
if (process.env.NODE_ENV === 'production') encryptionKey();

module.exports = {
  MAX_IMAGE_BYTES, MAX_PIXELS, ACTIVE_STATES, TERMINAL_STATES, storageRoot,
  providerOrigin, frontendOrigin, allowedOrigins, seal, unseal,
};
