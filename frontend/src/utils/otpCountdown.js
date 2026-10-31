export function otpDeadline(expiresIn, resendAfter, now = Date.now()) {
  const expiry = Number(expiresIn);
  const resend = Number(resendAfter);
  if (!Number.isFinite(expiry) || expiry <= 0 || expiry > 600
      || !Number.isFinite(resend) || resend < 0 || resend > 600) {
    throw new Error('زمان اعتبار کد معتبر نیست. لطفاً دوباره تلاش کنید.');
  }
  return now + Math.max(expiry, resend) * 1000;
}

export function otpCountdown(deadline, now = Date.now()) {
  const issued = Number.isFinite(deadline) && deadline > 0;
  const remaining = issued ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
  const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
  const seconds = String(remaining % 60).padStart(2, '0');
  return { remaining, label: `${minutes}:${seconds}`, canResend: issued && remaining === 0 };
}
