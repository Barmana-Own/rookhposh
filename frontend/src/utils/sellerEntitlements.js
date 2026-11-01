import { faDate } from './formatters.js';

export function sellerEntitlementStats(data = {}) {
  const subscription = data.subscription || null;
  const safeCount = (value) => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
  const remaining = safeCount(data.tokens_remaining);
  const available = safeCount(data.tokens_available);
  const expiry = subscription?.expires_at;
  return [
    {
      label: 'نوع اشتراک',
      value: subscription?.title || 'بدون اشتراک',
      delta: subscription ? (expiry && Number.isFinite(new Date(expiry).getTime()) ? `اعتبار تا ${faDate(expiry)}` : 'فعال') : 'خرید از بخش پکیج‌ها',
    },
    {
      label: 'توکن‌های باقی‌مانده',
      value: remaining.toLocaleString('fa-IR'),
      delta: available < remaining ? `${available.toLocaleString('fa-IR')} قابل مصرف در این ماه` : 'قابل استفاده برای پرو آنلاین',
    },
  ];
}
