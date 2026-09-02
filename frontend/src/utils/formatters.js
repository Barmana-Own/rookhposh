const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

const ones = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
const teens = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
const tens = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const hundreds = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
const scales = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون'];

export function normalizeDigits(value = '') {
  return String(value)
    .replace(/[۰-۹]/g, (digit) => String(persianDigits.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)));
}

export function onlyDigits(value = '') {
  return normalizeDigits(value).replace(/[^\d]/g, '');
}

export function toPersianDigits(value = '') {
  return String(value).replace(/\d/g, (digit) => persianDigits[Number(digit)] || digit);
}

export function formatNumber(value = 0) {
  return Number(onlyDigits(value) || 0).toLocaleString('fa-IR');
}

export function formatMoney(value = 0) {
  return `${formatNumber(value)} تومان`;
}

function chunkToWords(value) {
  const number = Number(value || 0);
  if (!number) return '';

  const parts = [];
  const hundred = Math.floor(number / 100);
  const rest = number % 100;

  if (hundred) parts.push(hundreds[hundred]);

  if (rest >= 10 && rest < 20) {
    parts.push(teens[rest - 10]);
  } else {
    const ten = Math.floor(rest / 10);
    const one = rest % 10;
    if (ten) parts.push(tens[ten]);
    if (one) parts.push(ones[one]);
  }

  return parts.filter(Boolean).join(' و ');
}

export function numberToPersianWords(input = 0) {
  const digits = onlyDigits(input);
  const number = Number(digits || 0);
  if (!number) return 'صفر';

  const chunks = [];
  let remaining = number;
  let scaleIndex = 0;

  while (remaining > 0 && scaleIndex < scales.length) {
    const chunk = remaining % 1000;
    if (chunk) {
      const text = chunkToWords(chunk);
      chunks.unshift([text, scales[scaleIndex]].filter(Boolean).join(' '));
    }
    remaining = Math.floor(remaining / 1000);
    scaleIndex += 1;
  }

  return chunks.join(' و ');
}

export function moneyInWords(value = 0) {
  const digits = onlyDigits(value);
  const amount = Number(digits || 0);
  if (!amount) return 'صفر تومان';
  return `${numberToPersianWords(amount)} تومان`;
}

export function formatNumberInput(value = '') {
  const digits = onlyDigits(value);
  if (!digits) return '';
  return Number(digits).toLocaleString('en-US');
}

export function formatPriceWithWords(value = 0) {
  return `${formatMoney(value)} - ${moneyInWords(value)}`;
}

export function faDate(value) {
  return value ? new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'medium' }).format(new Date(value)) : '-';
}

export function faDateTime(value) {
  return value
    ? new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : '-';
}

export function chartDateLabel(value = '') {
  const text = String(value);
  if (/^\d{4}-\d{2}/.test(text)) {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'short', year: 'numeric' }).format(new Date(`${text}-01T00:00:00`));
  }
  return toPersianDigits(text);
}

export function chartCurrencyTick(value = 0) {
  return `${formatNumber(value)} ت`;
}
