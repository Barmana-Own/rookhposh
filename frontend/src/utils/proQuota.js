export function canUsePro(quota) {
  if (!quota) return false;
  if (typeof quota.can_use_pro === 'boolean') return quota.can_use_pro;
  return Boolean(quota.has_tokens || quota.has_subscription);
}

export function proQuotaMessage(quota) {
  if (!canUsePro(quota)) return 'سهمیه پرو آنلاین این فروشگاه به پایان رسیده است.';
  return 'پرو آنلاین برای شما رایگان است؛ هر پرو از اعتبار همین فروشگاه کم می‌شود.';
}

export function mergeProQuota(previous, next) {
  const merged = { ...previous };
  for (const key of ['free_limit', 'free_used', 'free_remaining', 'has_subscription', 'has_unlimited_access', 'subscription', 'has_tokens', 'can_use_pro', 'billing_source', 'customer_payment_required', 'customer_usage_limit']) {
    if (Object.hasOwn(next, key)) merged[key] = next[key];
  }
  return merged;
}
