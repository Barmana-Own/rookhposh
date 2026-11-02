const ApiError = require('../utils/apiError');
const MAX_BYTES = 5 * 1024 * 1024;
function validateReceipt(value) {
  const invalid = () => new ApiError(400, 'رسید معتبر با فرمت PNG، JPEG، WebP، GIF یا PDF و حجم حداکثر ۵ مگابایت لازم است.');
  if (!value || typeof value.dataUrl !== 'string' || value.dataUrl.length > MAX_BYTES * 1.4) throw invalid();
  const match = /^data:(image\/png|image\/jpeg|image\/webp|image\/gif|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value.dataUrl);
  if (!match) throw invalid();
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_BYTES || bytes.toString('base64') !== match[2]) throw invalid();
  const type = match[1];
  const valid = type === 'image/png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : type === 'image/webp' ? bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP'
        : type === 'image/gif' ? ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii',0,6))
          : bytes.toString('ascii',0,5) === '%PDF-';
  if (!valid) throw invalid();
  return { name: String(value.name || 'receipt').replace(/[\x00-\x1f\x7f]/g, '').slice(0,180), type, size: bytes.length, dataUrl: value.dataUrl };
}
module.exports = { validateReceipt };
