import { Info } from 'lucide-react';

export default function TryOnNotice({ className = '' }) {
  return (
    <div
      role="note"
      className={`flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100 ${className}`}
    >
      <Info size={19} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-black">نکته مهم درباره خروجی پرو</p>
        <p className="mt-1 text-xs leading-6">
          با توجه به حالت‌های مختلف ایستادن فرد، نمای پشت فرد و لباس‌های بلند مانند مانتو و شلوار، ممکن است خروجی کمی با تصویر اصلی تفاوت داشته باشد.
        </p>
      </div>
    </div>
  );
}
