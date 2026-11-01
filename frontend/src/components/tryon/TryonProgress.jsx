import { faNumber, realProgress, tryonStatusLabel } from '../../utils/tryon.js';
import './tryon.css';

export default function TryonProgress({ job }) {
  const progress = realProgress(job);
  const stage = Math.min(4, Math.max(1, Number(job?.stage) || 1));
  const label = tryonStatusLabel[job?.status] || 'در حال پیگیری';
  return (
    <div className="tryon-progress w-full" data-state={job?.status}>
      <div className="tryon-progress-track" role="progressbar" aria-label="پیشرفت ساخت پرو"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress == null ? undefined : progress}
        aria-valuetext={label + '؛ مرحله ' + faNumber(stage) + ' از ۴' + (progress == null ? '؛ پیشرفت نامعین' : '؛ ' + faNumber(progress) + ' درصد')}>
        <span className={progress == null ? 'tryon-progress-wait' : 'tryon-progress-fill'} style={progress == null ? undefined : { width: progress + '%' }}>
          <span className="tryon-progress-dot" />
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-sm font-bold text-slate-500" dir="rtl">
        <span>مرحله {faNumber(stage)} از ۴</span>
        <span dir="rtl">{progress == null ? 'در حال پردازش' : faNumber(progress) + '٪'}</span>
      </div>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{label}؛ مرحله {faNumber(stage)} از ۴</span>
    </div>
  );
}
