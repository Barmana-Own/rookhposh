export function financialStatusLabel(row) {
  return { success: 'تأیید شده', pending: 'در انتظار تأیید', failed: 'ناموفق', unverified: 'نیازمند تأیید بانک' }[row.settlement_status || row.status] || 'نامشخص';
}

export function financialTypeLabel(row) {
  if (row.type === 'wallet_charge') return 'شارژ کیف پول';
  if (row.type === 'seller_package_purchase') return row.metadata?.token_purchase ? 'خرید توکن فروشگاه' : 'خرید اشتراک فروشگاه';
  return 'تراکنش مالی';
}

export function receiptUrlOf(row = {}) {
  const value = row.metadata?.receipt?.dataUrl || row.metadata?.receipt?.url || '';
  if (typeof value !== 'string') return '';
  if (/^data:(?:image\/(?:png|jpeg|webp|gif)|application\/pdf);base64,[A-Za-z0-9+/=\r\n]+$/.test(value)) return value;
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && !Array.from(value).some((character) => character.charCodeAt(0) <= 32)) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}

const paymentMethods = { wallet: 'اعتبار کیف پول', bank_transfer: 'واریز بانکی', direct_gateway: 'درگاه اینترنتی' };

export function paymentMethodOf(row = {}) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  if (Object.hasOwn(paymentMethods, metadata.payment_method)) return metadata.payment_method;
  if (Object.hasOwn(paymentMethods, metadata.source)) return metadata.source;
  return null;
}

export function paymentMethodLabel(row = {}) {
  return paymentMethods[paymentMethodOf(row)] || 'روش نامشخص';
}
