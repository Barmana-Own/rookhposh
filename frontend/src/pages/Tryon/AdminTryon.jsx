import { useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import AdminPagination from '../../components/admin/AdminPagination.jsx';
import PrivateImagePanel from '../../components/admin/PrivateImagePanel.jsx';
import AccessibleModal from '../../components/ui/AccessibleModal.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { useAsyncResource } from '../../hooks/useAsyncResource.js';
import apiClient from '../../services/apiClient.js';
import { faDateTime } from '../../utils/formatters.js';
import { activeTryonStates, faNumber, tryonStatusLabel } from '../../utils/tryon.js';

const unknown = (value) => value == null || value === '' ? 'نامشخص' : String(value);
function Facts({ values }) {
  return <dl className="grid gap-3 sm:grid-cols-2">{values.map(([title, value]) => <div key={title} className="min-w-0 rounded-xl bg-slate-50 p-3 dark:bg-white/5"><dt className="text-xs text-slate-500">{title}</dt><dd className="mt-1 break-words text-sm [overflow-wrap:anywhere]">{unknown(value)}</dd></div>)}</dl>;
}
function JobDetail({ id }) {
  const { data: job, error, loading, reload } = useAsyncResource(
    async () => (await apiClient.get('/api/admin/tryon/jobs/' + id)).data.data, [id],
    { pollMs: 5000, keepPreviousData: true },
  );
  if (!job) return <p role={error ? 'alert' : 'status'}>{error?.message || (loading ? 'در حال دریافت جزئیات...' : 'اطلاعات پیدا نشد.')} {error && <button className="btn-soft" onClick={reload}>تلاش مجدد</button>}</p>;
  const device = job.device || {};
  return <div className="space-y-6">
    {error && <p role="alert" className="text-rose-600">{error.message}</p>}
    {activeTryonStates.has(job.status) && <p role="status" className="text-sm text-indigo-600">این عملیات فعال است؛ وضعیت به‌روزرسانی می‌شود.</p>}
    <section className="space-y-3"><h3 className="font-black">عملیات و نتیجه</h3><Facts values={[
      ['شناسه عملیات', job.id], ['وضعیت', tryonStatusLabel[job.status]], ['محصول', job.product_title],
      ['سرویس موفق', job.service_name], ['مدل', job.model], ['ثبت درخواست', faDateTime(job.created_at)],
      ['شروع', faDateTime(job.started_at)], ['پایان', faDateTime(job.completed_at)],
      ['مدت پردازش', job.duration_ms == null ? null : faNumber(Math.round(job.duration_ms / 1000)) + ' ثانیه'],
      ['تعداد تلاش', faNumber(job.attempts_count)], ['کد خطا', job.error_code], ['پیام خطا', job.error_message],
    ]} /></section>
    <section className="space-y-3"><h3 className="font-black">تصاویر واقعی عملیات</h3>
      {job.status !== 'completed' && !job.images?.output && <p className="text-sm text-slate-500">برای این عملیات هنوز خروجی موفق ثبت نشده است.</p>}
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[['input', 'عکس ورودی'], ['product', 'لباس انتخاب‌شده'], ['output', 'خروجی پرو']].map(([kind, title]) => <PrivateImagePanel key={kind} asset={job.images?.[kind]} title={title} />)}
      </div>
    </section>
    <section className="space-y-3"><h3 className="font-black">صاحب تصویر</h3><Facts values={[
      ['شناسه حساب', job.user_id], ['نام', job.user?.fullname], ['شماره', job.user?.mobile], ['ایمیل', job.user?.email],
      ['نوع مالکیت', job.owner_kind === 'visitor' ? 'بازدیدکننده با نشست خصوصی' : job.owner_kind === 'legacy' ? 'سابقه قدیمی با مالک نامشخص' : 'حساب کاربری'],
      ['تعداد عملیات دیگر', job.previous_operations == null ? null : faNumber(job.previous_operations)],
    ]} /></section>
    <section className="space-y-3"><h3 className="font-black">اطلاعات اختیاری دستگاه و شبکه</h3>
      <p className="text-xs leading-6 text-slate-500">مشخصات دستگاه از اطلاعات گزارش‌شدهٔ مرورگر هستند و تأیید سخت‌افزاری محسوب نمی‌شوند. مدل یا نسخهٔ غیرقابل‌تشخیص، نامشخص نمایش داده می‌شود.</p>
      {!job.device ? <p className="text-sm text-slate-500">اطلاعات دستگاه و IP ثبت نشده یا مدت نگهداری آن پایان یافته است.</p> : <Facts values={[
        ['نوع دستگاه', device.device_type], ['سیستم‌عامل', device.os], ['نسخه گزارش‌شدهٔ سیستم‌عامل', device.os_version], ['مرورگر', device.browser],
        ['مدل دستگاه', device.device_model], ['User-Agent', device.user_agent], ['صفحه', device.screen_width && device.screen_height ? faNumber(device.screen_width) + ' × ' + faNumber(device.screen_height) : null],
        ['Viewport', device.viewport_width && device.viewport_height ? faNumber(device.viewport_width) + ' × ' + faNumber(device.viewport_height) : null],
        ['Device Pixel Ratio', device.pixel_ratio], ['زبان', device.language], ['IP', job.network?.ip], ['پایان نگهداری', faDateTime(job.diagnostics_expires_at)],
      ]} />}
    </section>
    <section className="space-y-3"><h3 className="font-black">ترتیب تلاش سرویس‌ها</h3>
      {!job.attempts?.length ? <p className="text-sm text-slate-500">جزئیات تلاش برای این سابقه موجود نیست.</p> :
        <div className="space-y-3">{job.attempts.map((attempt) => <div key={attempt.sequence_no} className="space-y-2 rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
          <b>{faNumber(attempt.sequence_no)}. {attempt.provider_name}</b>
          <Facts values={[
            ['مدل', attempt.model], ['نتیجه تلاش', attempt.state], ['شناسه ارائه‌دهنده', attempt.request_id],
            ['شروع', faDateTime(attempt.started_at)], ['پایان', faDateTime(attempt.completed_at)],
            ['مدت', attempt.duration_ms == null ? null : faNumber(attempt.duration_ms) + ' میلی‌ثانیه'],
            ['کد خطا', attempt.error_code], ['خطای فنی پاک‌سازی‌شده', attempt.technical_message],
            ['مصرف یا هزینه گزارش‌شده', attempt.cost_amount == null ? null : attempt.cost_amount + ' ' + (attempt.cost_currency || '')],
          ]} />
        </div>)}</div>}
    </section>
  </div>;
}
export default function AdminTryon() {
  const [draft, setDraft] = useState({ q: '', status: '', provider: '', from: '', to: '' });
  const [filter, setFilter] = useState(draft);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const dialogTrigger = useRef(null);
  const { data, error, loading, reload } = useAsyncResource(async () => {
    const params = new URLSearchParams({ ...filter, page: String(page), limit: '20' });
    return (await apiClient.get('/api/admin/tryon/jobs?' + params)).data.data;
  }, [filter, page], { pollMs: 5000, keepPreviousData: true });
  const change = (key) => (event) => setDraft({ ...draft, [key]: event.target.value });
  return <section className="page min-w-0">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-black">پرو آنلاین</h1><p className="mt-2 text-sm text-slate-500">عملیات واقعی، نتایج و تلاش سرویس‌ها؛ دسترسی به جزئیات در سوابق مدیریتی ثبت می‌شود.</p></div><button className="btn-soft" onClick={reload}><RefreshCw size={17} />به‌روزرسانی</button></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['total', 'کل عملیات'], ['successful', 'موفق'], ['failed', 'ناموفق'], ['active', 'در حال پردازش']].map(([key, label]) => <div className="card" key={key}><p className="text-sm text-slate-500">{label}</p><b className="mt-3 block text-2xl">{data ? faNumber(data.totals[key]) : '—'}</b></div>)}</div>
    <form className="card grid gap-3 sm:grid-cols-2 xl:grid-cols-3" onSubmit={(event) => { event.preventDefault(); setPage(1); setFilter({ ...draft }); }}>
      <label className="space-y-1 text-sm">شناسه عملیات یا کاربر<input className="input w-full" value={draft.q} maxLength={120} onChange={change('q')} placeholder="شناسه، نام، شماره یا ایمیل" /></label>
      <label className="space-y-1 text-sm">وضعیت<select className="input w-full" value={draft.status} onChange={change('status')}><option value="">همه وضعیت‌ها</option>{Object.entries(tryonStatusLabel).filter(([value]) => value !== 'idle').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="space-y-1 text-sm">سرویس<select className="input w-full" value={draft.provider} onChange={change('provider')}><option value="">همه سرویس‌ها</option><option value="1">سرویس اول</option><option value="2">سرویس دوم</option><option value="3">سرویس سوم</option><option value="legacy">سوابق قدیمی</option></select></label>
      <label className="space-y-1 text-sm">از تاریخ<input type="date" className="input w-full" value={draft.from} onChange={change('from')} /></label>
      <label className="space-y-1 text-sm">تا تاریخ<input type="date" className="input w-full" value={draft.to} onChange={change('to')} /></label>
      <div className="flex items-end"><button className="btn-primary" type="submit">اعمال فیلتر</button></div>
    </form>
    {error && <p className="card text-rose-600" role="alert">{error.message}</p>}
    {loading && !data && <p role="status">در حال دریافت عملیات...</p>}
    {data && !data.items.length && <p className="card text-center text-slate-500">عملیاتی با این فیلتر ثبت نشده است.</p>}
    <DataTable rows={data?.items || []} columns={[
      { key: 'id', label: 'شناسه', render: (row) => <span dir="ltr" className="inline-block max-w-36 break-all font-mono text-xs">{row.id}</span> },
      { key: 'user_name', label: 'کاربر', render: (row) => row.user_name || (row.legacy_usage_id ? 'مالک نامشخص در سابقه قدیمی' : 'بازدیدکننده') },
      { key: 'product_title', label: 'محصول' }, { key: 'status', label: 'وضعیت', render: (row) => tryonStatusLabel[row.status] || row.status },
      { key: 'successful_provider_name', label: 'سرویس موفق', render: (row) => row.successful_provider_name || '—' },
      { key: 'attempts_count', label: 'تلاش', render: (row) => faNumber(row.attempts_count) },
      { key: 'created_at', label: 'زمان ثبت', render: (row) => faDateTime(row.created_at) },
    ]} renderActions={(row) => <button className="btn-soft" onClick={(event) => { dialogTrigger.current = event.currentTarget; setSelected(row.id); }}>جزئیات</button>} />
    <AdminPagination pagination={data?.pagination} onPageChange={setPage} />
    <AccessibleModal returnFocusRef={dialogTrigger} open={Boolean(selected)} onClose={() => setSelected(null)} title="جزئیات پرو آنلاین" wide>{selected && <JobDetail key={selected} id={selected} />}</AccessibleModal>
  </section>;
}
