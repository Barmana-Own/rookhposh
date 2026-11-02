import { ChevronDown, Download, Eye, Images, Layers, LoaderCircle } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { downloadProOutput } from '../../utils/proOutput.js';
import { faDateTime } from '../../utils/formatters.js';
import { faNumber, tryonStatusLabel } from '../../utils/tryon.js';
import AccessibleModal from '../ui/AccessibleModal.jsx';
import PrivateImage from './PrivateImage.jsx';
import TryonEmptyState from './TryonEmptyState.jsx';
import './tryon.css';

export default function TryonHistory({ latest, history, error, onPage }) {
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [preview, setPreview] = useState(null);
  const [notice, setNotice] = useState('');
  const [downloading, setDownloading] = useState(null);
  const downloadLock = useRef(false);
  const dialogTrigger = useRef(null);
  const regionId = useId();
  const pagination = history?.pagination;
  const download = async (job) => {
    if (!job.images?.output || downloadLock.current) return;
    downloadLock.current = true; setNotice(''); setDownloading(job.id);
    try {
      const source = job.images.output.url;
      await downloadProOutput(source + (source.includes('?') ? '&' : '?') + 'download=1', 'rookhposh-tryon-' + job.id);
    } catch (downloadError) { setNotice(downloadError.message || 'دریافت فایل کامل نشد؛ دانلود را دوباره امتحان کنید.'); }
    finally { downloadLock.current = false; setDownloading(null); }
  };
  const view = (event, job) => { dialogTrigger.current = event.currentTarget; setPreview(job); };
  return (
    <div className="public-result-history">
      <section aria-label="آخرین خروجی موفق" className="public-latest-result">
        <div className="public-result-heading">
          <h3><Images size={22} aria-hidden="true" />آخرین خروجی موفق</h3>
          {latest && <span>{latest.product_title} · {faDateTime(latest.completed_at || latest.created_at)}</span>}
        </div>
        <div className="public-result-viewer">
          <div className={'public-result-stage' + (latest?.images?.output ? ' public-result-stage--image' : '')}>
            {latest?.images?.output
              ? <PrivateImage key={latest.images.output.url} asset={latest.images.output} alt="آخرین خروجی موفق پرو آنلاین" className="h-full max-h-full w-full object-contain" />
              : <TryonEmptyState unavailable={Boolean(latest)} />}
          </div>
          {latest && <div className="public-result-actions">
            <button type="button" className="public-button public-button--outline" onClick={(event) => view(event, latest)} disabled={!latest.images?.output}><Eye size={19} aria-hidden="true" />مشاهده خروجی</button>
            <button type="button" className="btn-primary" onClick={() => download(latest)} disabled={!latest.images?.output || Boolean(downloading)} aria-busy={downloading === latest.id}>
              {downloading === latest.id ? <LoaderCircle size={19} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Download size={19} aria-hidden="true" />}
              {downloading === latest.id ? 'در حال دانلود...' : 'دانلود خروجی'}
            </button>
          </div>}
        </div>
      </section>
      {notice && <p role="alert" className="public-operation-error">{notice}</p>}
      {error && <p role="alert" className="public-operation-error">{error} <button className="underline" onClick={() => onPage(1)}>تلاش مجدد دریافت سوابق</button></p>}
      <button type="button" className="public-history-toggle" aria-expanded={open} aria-controls={regionId}
        onClick={() => { setOpen(!open); setEverOpened(true); }}>
        <span><Layers size={18} aria-hidden="true" />موارد قبلی{pagination?.total ? ' (' + faNumber(pagination.total) + ')' : ''}</span>
        <ChevronDown size={20} aria-hidden="true" />
      </button>
      <div className="tryon-accordion" data-open={open} aria-hidden={!open} inert={open ? undefined : true}>
        <div className="min-h-0 overflow-hidden" id={regionId} role="region" aria-label="موارد قبلی پرو">
          {everOpened && <div>
            {!history?.items?.length && <p className="public-history-empty">مورد قبلی برای نمایش وجود ندارد.</p>}
            <div className="public-history-grid">
              {(history?.items || []).map(item => <article key={item.id} className="public-history-card">
                <div className="public-history-thumbnail">
                  {item.images?.output ? <PrivateImage asset={item.images.output} alt={'خروجی ' + item.product_title} /> : <span className="text-sm text-slate-500">خروجی موجود نیست.</span>}
                </div>
                <div className="public-history-product">
                  {item.images?.product && <div><PrivateImage asset={item.images.product} alt="تصویر محصول سابقه" /></div>}
                  <b>{item.product_title || 'محصول نامشخص'}</b>
                </div>
                <p>{faDateTime(item.completed_at || item.created_at)} · {tryonStatusLabel[item.status] || 'نامشخص'}</p>
                {item.error_message && <p className="public-history-error">{item.error_message}</p>}
                <div className="public-history-actions">
                  <button className="public-button" onClick={(event) => view(event, item)} disabled={!item.images?.output}><Eye size={15} aria-hidden="true" />مشاهده</button>
                  <button className="public-button" onClick={() => download(item)} disabled={!item.images?.output || Boolean(downloading)} aria-busy={downloading === item.id}>
                    {downloading === item.id ? <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
                    {downloading === item.id ? 'در حال دانلود...' : 'دانلود'}
                  </button>
                </div>
              </article>)}
            </div>
            {pagination?.totalPages > 1 && <div className="public-history-pagination">
              <button disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>قبلی</button>
              <span>صفحه {faNumber(pagination.page)} از {faNumber(pagination.totalPages)}</span>
              <button disabled={pagination.page >= pagination.totalPages} onClick={() => onPage(pagination.page + 1)}>بعدی</button>
            </div>}
          </div>}
        </div>
      </div>
      <AccessibleModal returnFocusRef={dialogTrigger} open={Boolean(preview)} title={preview?.product_title || 'مشاهده خروجی'} onClose={() => setPreview(null)} wide>
        {preview && <div className="flex h-[65vh] items-center justify-center"><PrivateImage asset={preview.images?.output} alt="نمای بزرگ خروجی پرو" className="h-full max-h-full w-full object-contain" /></div>}
      </AccessibleModal>
    </div>
  );
}
