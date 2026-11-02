const crypto = require('node:crypto');
const sharp = require('sharp');
const ApiError = require('../utils/apiError');
const { detectImageMime } = require('../utils/proImageResponse');

const WIDTHS = new Set([160, 320, 640, 960, 1280]);
const MAX_BYTES = 12 * 1024 * 1024;
const MAX_CACHE_BYTES = 24 * 1024 * 1024;
const cache = new Map(), pending = new Map(), waiters = [];
let cacheBytes = 0, running = 0;
const inlineImage = value => typeof value === 'string' && /^data:image\/(?:png|jpeg|webp|gif|avif);base64,/i.test(value);
const version = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 24);

function reference(source, route) {
  return inlineImage(source) ? route + '?v=' + version(source) : source;
}

async function slot(action) {
  if (running >= 2) {
    if (waiters.length >= 16) throw new ApiError(503, 'دریافت تصویر موقتاً ممکن نیست؛ دوباره امتحان کنید.');
    await new Promise(resolve => waiters.push(resolve));
  } else running++;
  try { return await action(); }
  finally { const next = waiters.shift(); if (next) next(); else running--; }
}

function remember(key, value) {
  if (value.bytes.length > MAX_CACHE_BYTES) return;
  while (cacheBytes + value.bytes.length > MAX_CACHE_BYTES && cache.size) {
    const first = cache.keys().next().value;
    cacheBytes -= cache.get(first).bytes.length; cache.delete(first);
  }
  cache.set(key, value); cacheBytes += value.bytes.length;
}

// Only sources read from an active public store/product reach this function.
// It never fetches URLs, accesses private try-on files or changes stored originals.
async function render(source, { width, webp = false, expectedVersion } = {}) {
  if (!inlineImage(source) || source.length > Math.ceil(MAX_BYTES * 4 / 3) + 100) throw new ApiError(404, 'تصویر عمومی پیدا نشد.');
  const revision = version(source);
  if (expectedVersion && expectedVersion !== revision) throw new ApiError(404, 'این نسخه تصویر دیگر در دسترس نیست.');
  if (width !== undefined && !WIDTHS.has(Number(width))) throw new ApiError(400, 'اندازه تصویر معتبر نیست.');
  const key = revision + ':' + (width || 'original') + ':' + webp;
  if (cache.has(key)) {
    const value = cache.get(key); cache.delete(key); cache.set(key, value); return value;
  }
  if (pending.has(key)) return pending.get(key);
  if (pending.size >= 32) throw new ApiError(503, 'دریافت تصویر موقتاً ممکن نیست؛ دوباره امتحان کنید.');
  const task = slot(async () => {
    const encoded = source.slice(source.indexOf(',') + 1);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4) throw new ApiError(400, 'فایل تصویر معتبر نیست.');
    const original = Buffer.from(encoded, 'base64');
    const mime = detectImageMime(original);
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'].includes(mime) || original.length > MAX_BYTES) throw new ApiError(400, 'فایل تصویر معتبر نیست.');
    let bytes = original, contentType = mime, metadata;
    try {
      const image = sharp(original, { animated: true, limitInputPixels: 24_000_000, failOn: 'warning' });
      metadata = await image.metadata();
      if (!metadata.width || !metadata.height || metadata.width * metadata.height > 24_000_000) throw new Error('Invalid dimensions');
      if (width && webp && (metadata.pages || 1) === 1) {
        const result = await image.rotate().resize({ width: Number(width), withoutEnlargement: true }).webp({ lossless: true, effort: 3 }).toBuffer({ resolveWithObject: true });
        bytes = result.data; contentType = 'image/webp'; metadata = result.info;
      } else await image.stats();
    } catch { throw new ApiError(400, 'محتوای تصویر عمومی معتبر نیست.'); }
    const value = { bytes, mime: contentType, width: metadata.width, height: metadata.height, etag: '"' + crypto.createHash('sha256').update(bytes).digest('hex') + '"' };
    remember(key, value); return value;
  });
  pending.set(key, task);
  try { return await task; } finally { if (pending.get(key) === task) pending.delete(key); }
}

module.exports = { reference, render, WIDTHS };
