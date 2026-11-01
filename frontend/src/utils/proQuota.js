export function canUsePro(quota) {
  if (!quota) return false;
  if (typeof quota.can_use_pro === 'boolean') return quota.can_use_pro;
  return Boolean(quota.has_unlimited_access || quota.has_tokens || quota.has_subscription || Number(quota.free_remaining) > 0);
}

export function proQuotaMessage(quota) {
  if (!canUsePro(quota)) return 'سهمیه پرو آنلاین این فروشگاه به پایان رسیده است.';
  if (quota.has_unlimited_access) return 'پرو آنلاین نامحدود فعال است.';
  if (quota.has_tokens || (quota.has_subscription && quota.can_use_pro === undefined)) return 'پرو آنلاین با اعتبار فروشگاه فعال است.';
  return `${Number(quota.free_remaining || 0).toLocaleString('fa-IR')} تجربه رایگان باقی مانده است.`;
}

export function mergeProQuota(previous, next) {
  const merged = { ...previous };
  for (const key of ['free_limit', 'free_used', 'free_remaining', 'has_subscription', 'has_unlimited_access', 'subscription', 'has_tokens', 'can_use_pro']) {
    if (Object.hasOwn(next, key)) merged[key] = next[key];
  }
  return merged;
}
