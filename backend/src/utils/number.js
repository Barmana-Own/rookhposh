const digitMap = {
  '۰': '0',
  '۱': '1',
  '۲': '2',
  '۳': '3',
  '۴': '4',
  '۵': '5',
  '۶': '6',
  '۷': '7',
  '۸': '8',
  '۹': '9',
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
};

function normalizeDigits(value = '') {
  return String(value).replace(/[۰-۹٠-٩]/g, (digit) => digitMap[digit] || digit);
}

function normalizeMobile(mobile = '') {
  const normalizedDigits = normalizeDigits(mobile)
    .replace(/[^\d+]/g, '')
    .trim();

  if (normalizedDigits.startsWith('+98')) return `0${normalizedDigits.slice(3)}`;
  if (normalizedDigits.startsWith('0098')) return `0${normalizedDigits.slice(4)}`;
  return normalizedDigits.replace(/^\+/, '');
}

function normalizeContactPhone(value = '') {
  const normalized = normalizeMobile(value);
  if (!normalized) return null;
  if (!/^\d{7,20}$/u.test(normalized)) {
    const error = new Error('شماره تلفن تماس معتبر نیست.');
    error.status = 400;
    throw error;
  }
  return normalized;
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || String(value).trim() === '') return fallback;
  const normalized = normalizeDigits(value)
    .replace(/[٬،,]/g, '')
    .replace(/٫/g, '.')
    .replace(/\s+/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : fallback;
}

function toInteger(value, fallback = 0) {
  return Math.trunc(toNumber(value, fallback));
}

module.exports = { normalizeDigits, normalizeMobile, normalizeContactPhone, toNumber, toInteger };
