import { ImagePlus } from 'lucide-react';
import { useId } from 'react';
import PublicWaves from '../public/PublicWaves.jsx';

export default function TryonEmptyState({ input = false, unavailable = false }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  if (input) return <div className="public-input-empty">
    <ImagePlus size={30} aria-hidden="true" />
    <b>هنوز عکسی انتخاب نکرده‌اید</b>
    <p>برای شروع، عکس خود را آپلود کنید یا با دوربین عکس بگیرید.</p>
  </div>;
  return (
    <div className="public-result-empty">
      <PublicWaves />
      <svg className="public-empty-art" viewBox="0 0 240 180" aria-hidden="true" focusable="false">
        <defs><linearGradient id={id} x2="1" y2="1"><stop stopColor="#fafbff" /><stop offset="1" stopColor="#cbd1ff" /></linearGradient></defs>
        <ellipse cx="124" cy="135" rx="103" ry="28" stroke="#9384ff" strokeDasharray="7 7" fill="none" />
        <rect x="52" y="34" width="127" height="120" rx="22" transform="rotate(-12 115 94)" fill={'url(#' + id + ')'} stroke="#fff" strokeWidth="3" />
        <rect x="66" y="29" width="127" height="120" rx="21" fill={'url(#' + id + ')'} stroke="#fff" strokeWidth="3" />
        <circle cx="157" cy="64" r="12" fill="#9d91ff" />
        <path d="m84 122 27-37q5-7 10 0l17 21 10-11q5-5 9 1l20 26Z" fill="#a89eff" />
        <path d="m195 13 4-10m10 18 10-7m-6 22 12-1M29 96l3-9 3 9 9 3-9 3-3 9-3-9-9-3Z" stroke="#8b7cff" strokeWidth="5" strokeLinecap="round" fill="#8b7cff" />
      </svg>
      <h4>{unavailable ? 'فایل این سابقه در دسترس نیست.' : 'هنوز خروجی موفقی ندارید'}</h4>
      {!unavailable && <p>اولین پرو شما اینجا نمایش داده می‌شود.</p>}
    </div>
  );
}
