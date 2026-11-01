export const activeTryonStates = new Set(['validating', 'processing', 'saving']);
export const tryonStatusLabel = {
  idle: 'آماده شروع', validating: 'بررسی ورودی‌ها', processing: 'پردازش هوش مصنوعی',
  saving: 'ذخیره خروجی', completed: 'موفق', failed: 'ناموفق', timed_out: 'پایان مهلت پاسخ', cancelled: 'لغوشده',
};
export const faNumber = (value) => new Intl.NumberFormat('fa-IR').format(value);

export function realProgress(job) {
  if (job?.status === 'processing' || job?.progress == null) return null;
  if (job.status === 'completed') return 100;
  return Number.isFinite(Number(job.progress)) ? Math.max(0, Math.min(99, Number(job.progress))) : null;
}

export function newerOutput(current, next) {
  if (!next) return current;
  if (!current) return next;
  const left = new Date(current.completed_at || current.created_at).getTime();
  const right = new Date(next.completed_at || next.created_at).getTime();
  return right > left || (right === left && next.id > current.id) ? next : current;
}

export function basicDeviceInfo() {
  return {
    screen_width: window.screen.width, screen_height: window.screen.height,
    viewport_width: window.innerWidth, viewport_height: window.innerHeight,
    pixel_ratio: window.devicePixelRatio, language: navigator.language,
  };
}

export function imageDownloadName(filename, mime) {
  const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }[mime];
  if (!extension) throw new Error('فایل دریافتی، تصویر پشتیبانی‌شده نیست.');
  const safe = String(filename || 'rookhposh-tryon-' + new Date().toISOString().slice(0, 10))
    .split(/[\\/]/).pop().replace(/\.[A-Za-z0-9]{1,8}$/, '').replace(/[^A-Za-z0-9_.-]/g, '-').slice(0, 150);
  return (safe || 'rookhposh-tryon') + '.' + extension;
}
