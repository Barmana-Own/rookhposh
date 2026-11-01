import { useRef, useState } from 'react';
import { useAsyncResource } from '../../hooks/useAsyncResource.js';
import apiClient from '../../services/apiClient.js';
import { faDateTime, formatMoney } from '../../utils/formatters.js';
import { faNumber } from '../../utils/tryon.js';
import PrivateImagePanel from './PrivateImagePanel.jsx';
import AdminPagination from './AdminPagination.jsx';
import AccessibleModal from '../ui/AccessibleModal.jsx';

export function ReviewHistory({ productId, seller = false, initial }) {
  const [page, setPage] = useState(1);
  const { data, error } = useAsyncResource(async () => page === 1 && initial ? initial
    : (await apiClient.get('/api/' + (seller ? 'seller' : 'admin') + '/products/' + productId + '/review-history?page=' + page)).data.data,
  [productId, page, initial, seller], { refreshOnFocus: false });
  return <section className="space-y-3"><h3 className="font-black">سوابق بررسی محصول</h3>
    {error && <p role="alert" className="text-rose-600">{error.message}</p>}
    {data && !data.items.length && <p className="text-sm text-slate-500">هنوز تصمیمی ثبت نشده است.</p>}
    {data?.items.map((item) => <article key={item.id} className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm dark:bg-white/5">
      <b>{item.action === 'approved' ? 'تأیید محصول' : 'رد محصول'}</b>
      <p>{faDateTime(item.created_at)} · {item.actor_name || 'مدیر'}</p>
      {item.reason_title && <p>دلیل: {item.reason_title}</p>}{item.comment && <p className="whitespace-pre-wrap">توضیحات: {item.comment}</p>}
    </article>)}
    <AdminPagination pagination={data?.pagination} onPageChange={setPage} />
  </section>;
}
function Features({ items }) {
  if (!items || (Array.isArray(items) && !items.length)) return <p className="text-sm text-slate-500">ویژگی ثبت نشده است.</p>;
  return <ul className="list-inside list-disc space-y-1 text-sm">{(Array.isArray(items) ? items : Object.entries(items).map(([key, value]) => key + ': ' + value)).map((item, i) => <li key={i}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>)}</ul>;
}
export default function ProductReviewDetail({ id, onReviewed }) {
  const { data, error, reload } = useAsyncResource(async () => (await apiClient.get('/api/admin/products/' + id + '/review')).data.data, [id], { refreshOnFocus: false });
  const [action, setAction] = useState(null);
  const [reasonId, setReasonId] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [done, setDone] = useState('');
  const lock = useRef(false);
  const reason = data?.reasons.find((item) => String(item.id) === reasonId);
  const decide = async () => {
    if (!data || lock.current || !action) return;
    if (action === 'rejected' && (!reason || (reason.requires_comment && !comment.trim()))) return;
    lock.current = true; setBusy(true); setFailure('');
    try {
      await apiClient.patch('/api/admin/products/' + id + (action === 'approved' ? '/approve' : '/reject'), {
        review_token: data.review_token, revision: data.revision, reason_id: reasonId ? Number(reasonId) : undefined, comment: comment.trim(),
      });
      setDone(action === 'approved' ? 'محصول تأیید شد و به فروشنده اطلاع داده شد.' : 'محصول یا ویرایش آن با ثبت دلیل رد شد و به فروشنده اطلاع داده شد.');
      setAction(null); reload(); onReviewed?.(id);
    } catch (err) { setFailure(err.message || 'تصمیم ثبت نشد؛ جزئیات را تازه کنید.'); }
    finally { lock.current = false; setBusy(false); }
  };
  if (!data) return <p role={error ? 'alert' : 'status'}>{error?.message || 'در حال دریافت جزئیات محصول...'}{error && <button className="btn-soft" onClick={reload}>تلاش مجدد</button>}</p>;
  const product = data.product;
  return <div className="space-y-6">
    {done && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-700">{done}</p>}
    {failure && <p role="alert" className="text-rose-600">{failure} <button className="underline" onClick={() => { reload(); setAction(null); }}>به‌روزرسانی جزئیات</button></p>}
    <div className="grid gap-3 text-sm sm:grid-cols-2">
      <p><b>نام محصول:</b> {product.title}</p><p><b>شناسه:</b> {faNumber(product.id)}</p>
      <p><b>فروشنده:</b> {data.seller?.store_name || data.seller?.fullname || 'نامشخص'}</p>
      <p><b>قیمت:</b> {formatMoney(product.price)}</p><p><b>دسته‌بندی:</b> {product.category || 'ثبت نشده'}</p>
      <p><b>موجودی:</b> {product.stock == null ? 'ثبت نشده' : faNumber(product.stock)}</p>
      <p><b>وضعیت بررسی:</b> {{pending: 'در انتظار بررسی', active: 'تأیید شده', approved: 'تأیید شده', rejected: 'رد شده'}[data.review_status] || data.review_status}</p>
      <p><b>انتشار:</b> {data.publish_status === 'inactive' ? 'غیرفعال' : 'فعال پس از تأیید'}</p>
      <p><b>ایجاد:</b> {faDateTime(data.created_at)}</p><p><b>آخرین ویرایش:</b> {faDateTime(data.updated_at)}</p>
    </div>
    {data.current_product && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">اطلاعات زیر مربوط به ویرایش پیشنهادی فروشنده است. نسخهٔ تأییدشده تا تصمیم جدید حفظ می‌شود.</p>}
    <section className="space-y-2"><h3 className="font-black">توضیحات</h3><p className="whitespace-pre-wrap break-words text-sm leading-7">{product.description || 'توضیحی ثبت نشده است.'}</p></section>
    <section className="space-y-2"><h3 className="font-black">مشخصات و ویژگی‌ها</h3><Features items={product.features} /></section>
    <section className="space-y-2"><h3 className="font-black">تنوع‌ها</h3>{product.variants?.length ? <Features items={product.variants} /> : <p className="text-sm text-slate-500">تنوع جداگانه‌ای در اطلاعات فعلی ثبت نشده است.</p>}</section>
    <section className="space-y-3"><h3 className="font-black">تمام تصاویر محصول</h3><div className="grid min-w-0 gap-3 sm:grid-cols-2">{product.images.map((asset, index) => <PrivateImagePanel key={asset.url} asset={asset} title={index === 0 ? 'تصویر اصلی' : 'تصویر گالری ' + faNumber(index + 1)} />)}</div>{!product.images.length && <p role="alert" className="text-rose-600">این محصول تصویر قابل بررسی ندارد.</p>}</section>
    {data.current_product && <details className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><summary className="cursor-pointer font-bold">مشاهده نسخه فعلیِ تأییدشده</summary><div className="mt-3 space-y-3"><b>{data.current_product.title}</b><p className="text-sm">{data.current_product.description}</p><div className="grid gap-3 sm:grid-cols-2">{data.current_product.images.map((asset, index) => <PrivateImagePanel key={asset.url} asset={asset} title={'تصویر نسخه فعلی ' + faNumber(index + 1)} />)}</div></div></details>}
    <ReviewHistory productId={id} initial={data.history} />
    {data.reviewable && !done && <section className="space-y-4 border-t border-slate-200 pt-4 dark:border-slate-700">
      <div className="flex flex-wrap gap-3"><button className="btn-primary" disabled={busy} onClick={() => { setAction('approved'); setFailure(''); }}>تأیید محصول</button><button className="btn-soft text-rose-600" disabled={busy} onClick={() => { setAction('rejected'); setFailure(''); }}>رد محصول</button></div>
      <AccessibleModal open={action === 'approved'} onClose={() => setAction(null)} title="تأیید نهایی محصول" busy={busy}>
        <div className="space-y-3"><p className="text-sm">تأیید نهایی محصول «{product.title}» را ثبت می‌کنید؟</p><button className="btn-primary" disabled={busy} onClick={decide}>{busy ? 'در حال ثبت...' : 'ثبت تأیید نهایی'}</button><button className="btn-soft mr-2" disabled={busy} onClick={() => setAction(null)}>انصراف</button></div>
      </AccessibleModal>
      {action === 'rejected' && <form className="space-y-3 rounded-xl bg-rose-50 p-4 dark:bg-rose-500/10" onSubmit={(event) => { event.preventDefault(); decide(); }}>
        <label className="block space-y-2 text-sm">دلیل رد محصول<select required className="input w-full" value={reasonId} onChange={(event) => setReasonId(event.target.value)}><option value="">دلیل را انتخاب کنید</option>{data.reasons.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label className="block space-y-2 text-sm">توضیحات تکمیلی{reason?.requires_comment ? ' (الزامی)' : ' (اختیاری)'}<textarea required={reason?.requires_comment} maxLength={2000} className="input min-h-24 w-full" value={comment} onChange={(event) => setComment(event.target.value)} /></label>
        <div className="flex gap-2"><button className="btn-primary bg-rose-600" type="submit" disabled={busy || !reason || (reason.requires_comment && !comment.trim())}>{busy ? 'در حال ثبت...' : 'ثبت رد محصول'}</button><button type="button" className="btn-soft" disabled={busy} onClick={() => setAction(null)}>انصراف</button></div>
      </form>}
    </section>}
  </div>;
}
