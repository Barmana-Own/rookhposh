import { useState } from 'react';
import SellerTable from '../../../components/seller/SellerTable.jsx';
import { useAsyncResource } from '../../../hooks/useAsyncResource.js';
import { sellerApi } from '../../../services/seller/sellerApi.js';
import { faDateTime } from '../../../utils/formatters.js';

const statusLabels = { validating: 'بررسی ورودی', queued: 'در صف', processing: 'در حال پردازش', saving: 'ذخیره خروجی', completed: 'موفق', failed: 'ناموفق', timed_out: 'پایان مهلت', cancelled: 'لغوشده' };
const creditLabels = { consumed: 'کسر شده', released: 'آزاد شده؛ بدون کسر', reserved: 'رزرو شده', not_charged: 'بدون کسر', unknown: 'نامشخص در سابقه قدیمی' };
const number = value => value == null ? 'نامشخص' : Number(value).toLocaleString('fa-IR');

export default function SellerProUsages() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { data, loading, error, reload } = useAsyncResource(() => sellerApi.getProUsages({ page, limit: 20, status, from, to }), [page, status, from, to], { pollMs: 15000 });
  const change = setter => event => { setter(event.target.value); setPage(1); };
  return <div className="space-y-4">
    <div className="card flex flex-wrap gap-4 text-sm" aria-live="polite">
      <span>مانده فعلی: <b>{number(data?.summary?.tokens_remaining)}</b></span>
      <span>قابل استفاده: <b>{number(data?.summary?.tokens_available)}</b></span>
      <span>مصرف در بازه: <b>{number(data?.summary?.filtered_tokens_consumed)}</b></span>
      <span>رزرو در بازه: <b>{number(data?.summary?.filtered_tokens_reserved)}</b></span>
    </div>
    <div className="card grid gap-3 sm:grid-cols-3">
      <label>وضعیت<select className="input mt-2" value={status} onChange={change(setStatus)}><option value="all">همه وضعیت‌ها</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>از تاریخ<input type="date" className="input mt-2" value={from} onChange={change(setFrom)} /></label>
      <label>تا تاریخ<input type="date" className="input mt-2" value={to} onChange={change(setTo)} /></label>
    </div>
    <SellerTable page={page} onPageChange={setPage} pagination={data?.pagination} rows={data?.items || []} loading={loading} error={error} onRetry={reload}
      columns={[
        { key: 'operation_id', label: 'شناسه عملیات', render: row => <bdi className="break-all text-xs">{row.operation_id}</bdi> },
        { key: 'product_title', label: 'محصول', render: row => row.product_title || 'محصول حذف‌شده' },
        { key: 'created_at', label: 'زمان ثبت', render: row => faDateTime(row.created_at) },
        { key: 'tokens_consumed', label: 'توکن مصرف‌شده', render: row => number(row.tokens_consumed) },
        { key: 'status', label: 'نتیجه عملیات', render: row => statusLabels[row.status] || 'نامشخص' },
        { key: 'credit_status', label: 'وضعیت اعتبار', render: row => creditLabels[row.credit_status] || 'نامشخص' },
      ]} />
    <p className="text-xs text-slate-500">مانده، وضعیت فعلی سهمیه فروشگاه است. مانده پس از هر عملیات در سوابق قدیمی ثبت نشده و قابل محاسبه قطعی نیست.</p>
  </div>;
}
