const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const ApiError = require('../utils/apiError');
const { detectImageMime } = require('../utils/proImageResponse');
const { MAX_IMAGE_BYTES, MAX_PIXELS, storageRoot, frontendOrigin, providerOrigin, seal, unseal } = require('./config');
const network = require('./network');

const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
sharp.cache({ memory: 32, files: 0, items: 32 });
sharp.concurrency(2);

async function initialize() {
  await fs.mkdir(storageRoot, { recursive: true, mode: 0o700 });
  if ((await fs.lstat(storageRoot)).isSymbolicLink()) throw new Error('Private try-on storage must be a directory.');
  await fs.chmod(storageRoot, 0o700);
  await fs.access(storageRoot, require('node:fs').constants.R_OK | require('node:fs').constants.W_OK);
}

function fromDataUrl(value) {
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 100) throw new ApiError(413, 'حجم تصویر بیش از حد مجاز است.');
  const match = /^data:image\/(?:png|jpeg|webp|gif|avif);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(value);
  if (!match || match[1].length % 4 !== 0) throw new ApiError(400, 'فایل تصویری معتبر نیست.');
  return Buffer.from(match[1], 'base64');
}

async function inspect(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new ApiError(413, 'اندازه فایل تصویری معتبر نیست.');
  const mime = detectImageMime(bytes);
  if (!extensions[mime]) throw new ApiError(400, 'فرمت فایل تصویری مجاز نیست.');
  try {
    const image = sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: 'warning' });
    const meta = await image.metadata();
    if (!meta.width || !meta.height || meta.width * meta.height > MAX_PIXELS || (meta.pages || 1) > 1) throw new Error('Invalid dimensions');
    await image.stats(); // Decode pixels, not only the header.
    return { mime, extension: extensions[mime], width: meta.width, height: meta.height, byte_size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  } catch { throw new ApiError(400, 'محتوای تصویر خراب یا ابعاد آن بیش از حد مجاز است.'); }
}

async function loadSource(source, { allowedHosts = [] } = {}) {
  if (typeof source !== 'string' || !source) throw new ApiError(400, 'تصویر در دسترس نیست.');
  if (source.startsWith('data:')) return fromDataUrl(source);
  let url;
  try {
    if (source.startsWith('/') && !/^\/(?:uploads|storage|assets)\//.test(source)) throw new Error('Unsafe path');
    url = new URL(source, frontendOrigin);
  } catch { throw new ApiError(400, 'منبع تصویر معتبر نیست.'); }
  const hosts = new Set([new URL(frontendOrigin).hostname, providerOrigin.hostname, 'kwai-kolors-kolors-virtual-try-on.hf.space', ...allowedHosts]);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    if (!hosts.has(url.hostname)) throw new ApiError(400, 'منبع تصویر مجاز نیست.');
    const response = await network.request(url.href, { image: true, maxBytes: MAX_IMAGE_BYTES, timeoutMs: 30000, headers: { accept: 'image/*' } });
    if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.location) {
      url = new URL(response.headers.location, url);
      continue;
    }
    if (response.status !== 200) throw new ApiError(502, 'فایل تصویر از منبع دریافت نشد.');
    await inspect(response.body);
    return response.body;
  }
  throw new ApiError(502, 'تعداد تغییر مسیر تصویر بیش از حد مجاز است.');
}

async function store(bytes) {
  const metadata = await inspect(bytes);
  const id = crypto.randomBytes(16).toString('hex');
  const storage_key = `${id.slice(0, 2)}/${id}.${metadata.extension}`;
  const destination = path.join(storageRoot, storage_key);
  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  await fs.writeFile(destination, bytes, { mode: 0o600, flag: 'wx', flush: true });
  return { id, storage_key, ...metadata };
}

function stagePath(id) {
  if (!/^[a-f0-9]{32}$/.test(id)) throw new ApiError(400, 'شناسه عملیات معتبر نیست.');
  return path.join(storageRoot, 'pending', id + '.json');
}

async function stage(id, bytes, provider, requestId) {
  const asset = await store(bytes);
  const location = stagePath(id);
  const temporary = location + '.' + crypto.randomBytes(8).toString('hex');
  try {
    await fs.mkdir(path.dirname(location), { recursive: true, mode: 0o700 });
    const safeProvider = { id: provider.id, name: provider.name, model: provider.model || null };
    await fs.writeFile(temporary, seal(JSON.stringify({ asset, provider: safeProvider, requestId: requestId || null }), 'pending:' + id), { mode: 0o600, flag: 'wx', flush: true });
    await fs.rename(temporary, location);
    return { asset, provider: safeProvider, requestId };
  } catch (error) {
    await remove(asset);
    await fs.unlink(temporary).catch((failure) => { if (failure.code !== 'ENOENT') throw failure; });
    throw error;
  }
}

async function staged(id) {
  try { return JSON.parse(unseal(await fs.readFile(stagePath(id), 'utf8'), 'pending:' + id)); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function clearStage(id) {
  try { await fs.unlink(stagePath(id)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

async function read(asset) {
  if (!asset || !/^[a-f0-9]{2}\/[a-f0-9]{32}\.(png|jpg|webp|gif|avif)$/.test(asset.storage_key)) throw new ApiError(404, 'تصویر پیدا نشد.');
  const location = path.join(storageRoot, asset.storage_key);
  try {
    const stat = await fs.lstat(location);
    const resolved = await fs.realpath(location);
    if (stat.isSymbolicLink() || !stat.isFile() || !resolved.startsWith(`${await fs.realpath(storageRoot)}${path.sep}`) || stat.size > MAX_IMAGE_BYTES) throw new Error('Invalid private file');
    const bytes = await fs.readFile(location);
    if (bytes.length !== Number(asset.byte_size) || crypto.createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error('File changed');
    return bytes;
  } catch { throw new ApiError(410, 'فایل تصویر در دسترس نیست یا آسیب دیده است.'); }
}

async function remove(asset) {
  if (!asset?.storage_key || !/^[a-f0-9]{2}\/[a-f0-9]{32}\.(png|jpg|webp|gif|avif)$/.test(asset.storage_key)) return;
  try { await fs.unlink(path.join(storageRoot, asset.storage_key)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

module.exports = { initialize, fromDataUrl, inspect, loadSource, store, read, remove, extensions, stage, staged, clearStage };
