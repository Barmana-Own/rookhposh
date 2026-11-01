import { useState } from 'react';
import { useAsyncResource } from '../../hooks/useAsyncResource.js';
import apiClient from '../../services/apiClient.js';
const empty = { title: '', description: '', active: true, requires_comment: false, sort_order: 100 };
export default function RejectionReasons() {
  const { data = [], error, reload } = useAsyncResource(async () => (await apiClient.get('/api/admin/product-rejection-reasons')).data.data, [], { refreshOnFocus: false });
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const save = async (event) => {
    event.preventDefault(); if (busy) return; setBusy(true); setFailure('');
    try {
      const body = { ...form, sort_order: Number(form.sort_order) };
      if (form.id) await apiClient.patch('/api/admin/product-rejection-reasons/' + form.id, body);
      else await apiClient.post('/api/admin/product-rejection-reasons', body);
      reload(); setForm(empty);
    } catch (err) { setFailure(err.message || 'ثبت دلیل انجام نشد.'); }
    finally { setBusy(false); }
  };
  return <div className="space-y-5">
    {(error || failure) && <p role="alert" className="text-rose-600">{failure || error.message}</p>}
    <div className="grid gap-2 sm:grid-cols-2">{data.map((item) => <button type="button" key={item.id} className="rounded-xl border border-slate-200 p-3 text-right text-sm dark:border-slate-700" onClick={() => setForm(item)}><b>{item.title}</b><span className="mr-2 text-xs text-slate-500">{item.active ? 'فعال' : 'غیرفعال'}</span></button>)}</div>
    <form className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700" onSubmit={save}>
      <h3 className="font-black">{form.id ? 'ویرایش دلیل' : 'افزودن دلیل'}</h3>
      <label className="block space-y-1 text-sm">عنوان فارسی<input required maxLength={180} className="input w-full" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
      <label className="block space-y-1 text-sm">توضیح<textarea maxLength={500} className="input w-full" value={form.description || ''} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
      <label className="block space-y-1 text-sm">ترتیب نمایش<input type="number" min="0" max="9999" className="input w-full" value={form.sort_order} onChange={(event) => setForm({ ...form, sort_order: event.target.value })} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />فعال</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.requires_comment} disabled={form.code === 'other'} onChange={(event) => setForm({ ...form, requires_comment: event.target.checked })} />الزام توضیح تکمیلی</label>
      <button type="submit" disabled={busy} className="btn-primary">{busy ? 'در حال ذخیره...' : 'ذخیره دلیل'}</button><button type="button" disabled={busy} className="btn-soft mr-2" onClick={() => setForm(empty)}>دلیل جدید</button>
    </form>
  </div>;
}
