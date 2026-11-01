import { ChevronDown, Download, Eye, ImagePlus, Trash2 } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { tryonApi } from '../../services/tryonApi.js';
import { downloadProOutput } from '../../utils/proOutput.js';
import { faDateTime } from '../../utils/formatters.js';
import { faNumber, tryonStatusLabel } from '../../utils/tryon.js';
import AccessibleModal from '../ui/AccessibleModal.jsx';
import PrivateImage from './PrivateImage.jsx';
import './tryon.css';

export default function TryonHistory({ latest, history, error, onPage, onDeleted }) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [preview, setPreview] = useState(null);
  const [remove, setRemove] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const downloadLock = useRef(false);
  const regionId = useId();
  const pagination = history?.pagination;

  const download = async (job) => {
    if (!job.images?.output || downloadLock.current) return;
    downloadLock.current = true; setNotice('');
    try {
      const source = job.images.output.url;
      await downloadProOutput(source + (source.includes('?') ? '&' : '?') + 'download=1',
        'rookhposh-tryon-' + job.id);
    } catch (downloadError) { setNotice(downloadError.message || 'دریافت فایل کامل نشد؛ دانلود را دوباره امتحان کنید.'); }
    finally { downloadLock.current = false; }
  };
  const erase = async () => {
    if (!remove || busy) return;
    setBusy(true); setNotice('');
    try {
      await tryonApi.erase(remove.id, token);
      setRemove(null); onDeleted?.();
    } catch (deleteError) { setNotice(deleteError.message || 'حذف انجام نشد.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-w-0 space-y-4">
      <section aria-label="آخرین خروجی موفق" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-black">آخرین خروجی موفق</h3>
          {latest && <span className="text-xs text-slate-500">{latest.product_title} · {faDateTime(latest.completed_at || latest.created_at)}</span>}
        </div>
        <div className="flex h-[320px] min-w-0 items-center justify-center overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-black/30 lg:h-[460px]">
          {latest?.images?.output ? (
            <PrivateImage key={latest.images.output.url} asset={latest.images.output} alt="آخرین خروجی موفق پرو آنلاین" className="h-full max-h-full w-full object-contain" />
          ) : (
            <div className="space-y-3 text-center text-sm text-slate-500">
              <ImagePlus className="mx-auto" size={36} aria-hidden="true" />
              <p>{latest ? 'فایل این سابقه در دسترس نیست.' : 'هنوز خروجی موفقی ندارید؛ اولین پرو شما اینجا نمایش داده می‌شود.'}</p>
            </div>
          )}
        </div>
        {latest && (
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" className="btn-soft" onClick={() => setPreview(latest)} disabled={!latest.images?.output}><Eye size={17} />مشاهده خروجی</button>
            <button type="button" className="btn-soft" onClick={() => download(latest)} disabled={!latest.images?.output}><Download size={17} />دانلود خروجی</button>
            <button type="button" className="btn-soft text-rose-600" onClick={() => setRemove(latest)}><Trash2 size={16} />حذف از سوابق</button>
          </div>
        )}
      </section>
      {notice && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{notice}</p>}
      {error && <p role="alert" className="text-sm text-rose-600">{error} <button className="underline" onClick={() => onPage(1)}>تلاش مجدد دریافت سوابق</button></p>}
      <button type="button" className="btn-soft w-full justify-between" aria-expanded={open} aria-controls={regionId}
        onClick={() => { setOpen(!open); setEverOpened(true); }}>
        <span>موارد قبلی{pagination?.total ? ' (' + faNumber(pagination.total) + ')' : ''}</span>
        <ChevronDown size={18} className={open ? 'rotate-180 transition motion-reduce:transition-none' : 'transition motion-reduce:transition-none'} />
      </button>
      <div className="tryon-accordion" data-open={open} aria-hidden={!open} inert={open ? undefined : true}>
        <div className="min-h-0 overflow-hidden" id={regionId} role="region" aria-label="موارد قبلی پرو">
          {everOpened && (
            <div className="space-y-4 py-2">
              {!history?.items?.length && <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500 dark:bg-white/5">مورد قبلی برای نمایش وجود ندارد.</p>}
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                {(history?.items || []).map((item) => (
                  <article key={item.id} className="min-w-0 space-y-3 rounded-2xl border border-slate-200 bg-white/70 p-3 dark:border-white/10 dark:bg-black/20">
                    <div className="flex h-44 items-center justify-center overflow-hidden rounded-xl bg-white dark:bg-black/20">
                      {item.images?.output ? <PrivateImage asset={item.images.output} alt={'خروجی ' + item.product_title} className="h-full w-full object-contain" />
                        : <span className="text-sm text-slate-500">خروجی موجود نیست.</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {item.images?.product && <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg"><PrivateImage asset={item.images.product} alt="تصویر محصول سابقه" className="h-full w-full object-contain" /></div>}
                      <b className="min-w-0 break-words text-sm">{item.product_title || 'محصول نامشخص'}</b>
                    </div>
                    <p className="text-xs text-slate-500">{faDateTime(item.completed_at || item.created_at)} · {tryonStatusLabel[item.status] || 'نامشخص'}</p>
                    {item.error_message && <p className="break-words text-xs text-rose-600">{item.error_message}</p>}
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-soft" onClick={() => setPreview(item)} disabled={!item.images?.output}><Eye size={15} />مشاهده</button>
                      <button className="btn-soft" onClick={() => download(item)} disabled={!item.images?.output}><Download size={15} />دانلود</button>
                      <button className="btn-soft text-rose-600" aria-label={'حذف سابقه ' + item.id} onClick={() => setRemove(item)}><Trash2 size={15} /></button>
                    </div>
                  </article>
                ))}
              </div>
              {pagination?.totalPages > 1 && (
                <div className="flex items-center justify-between gap-2">
                  <button className="btn-soft" disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>قبلی</button>
                  <span className="text-xs text-slate-500">صفحه {faNumber(pagination.page)} از {faNumber(pagination.totalPages)}</span>
                  <button className="btn-soft" disabled={pagination.page >= pagination.totalPages} onClick={() => onPage(pagination.page + 1)}>بعدی</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <AccessibleModal open={Boolean(preview)} title={preview?.product_title || 'مشاهده خروجی'} onClose={() => setPreview(null)} wide>
        {preview && <div className="flex h-[65vh] items-center justify-center"><PrivateImage asset={preview.images?.output} alt="نمای بزرگ خروجی پرو" className="h-full max-h-full w-full object-contain" /></div>}
      </AccessibleModal>
      <AccessibleModal open={Boolean(remove)} title="حذف عکس‌های این مورد" onClose={() => setRemove(null)} busy={busy}
        description="تصاویر این مورد از سامانه فعال حذف می‌شوند و در سوابق شما نمایش داده نخواهند شد. این کار عملیات در حال پردازش را لغو نمی‌کند.">
        <button className="btn-primary bg-rose-600" onClick={erase} disabled={busy}>{busy ? 'در حال حذف...' : 'تأیید حذف این مورد'}</button>
      </AccessibleModal>
    </div>
  );
}
