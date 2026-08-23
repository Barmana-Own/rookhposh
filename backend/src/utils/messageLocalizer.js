const messageMap = {
  'insufficient balance': 'موجودی کیف پول برای انجام این عملیات کافی نیست.',
  'product not found': 'محصول پیدا نشد.',
  'product not available': 'این محصول در دسترس نیست.',
  'only approved products can be activated or deactivated': 'فقط محصول تاییدشده را می‌توان فعال یا غیرفعال کرد.',
  'package not found': 'پکیج پیدا نشد.',
  'token quantity invalid': 'تعداد توکن واردشده معتبر نیست.',
  'pending payment not found': 'درخواست پرداخت پیدا نشد یا قبلاً بررسی شده است.',
  'ticket not found': 'تیکت پیدا نشد.',
  'ticket is closed': 'این تیکت بسته شده است.',
  forbidden: 'شما به این بخش دسترسی ندارید.',
  'purchase required': 'برای ثبت امتیاز ابتدا محصول را خریداری کنید.',
  'rating invalid': 'امتیاز واردشده معتبر نیست.',
  'network error': 'ارتباط با سرور برقرار نشد.',
  'internal server error': 'خطای داخلی سرور رخ داد. لطفاً دوباره تلاش کنید.',
  'pro api request timed out.': 'پاسخ سرویس پرو بیش از حد طول کشید. لطفاً دوباره تلاش کنید.',
};

function localizeMessage(value, fallback = 'خطای غیرمنتظره‌ای رخ داد. لطفاً دوباره تلاش کنید.') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;

  const exact = messageMap[raw.toLowerCase()];
  if (exact) return exact;
  if (/^route not found:/i.test(raw)) return 'مسیر درخواستی پیدا نشد.';
  if (/insufficient\s+balance/i.test(raw)) return messageMap['insufficient balance'];
  if (/timeout|timed out/i.test(raw)) return 'پاسخ سرویس بیش از حد طول کشید. لطفاً دوباره تلاش کنید.';
  return raw;
}

function localizeErrors(errors = []) {
  return Array.isArray(errors)
    ? errors.map((item) => (typeof item === 'string' ? localizeMessage(item) : { ...item, message: localizeMessage(item?.message) }))
    : [];
}

module.exports = { localizeMessage, localizeErrors };
