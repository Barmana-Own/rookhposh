import { useState } from 'react';
import { useAsyncResource } from '../../hooks/useAsyncResource.js';
import apiClient from '../../services/apiClient.js';
import { faNumber } from '../../utils/tryon.js';
import { faDateTime } from '../../utils/formatters.js';

const blank = (id) => ({ id, name: '', adapter: 'multipart', endpoint: '', model: '', enabled: false, priority: id, timeout_seconds: 120, retry_limit: 0, options: {}, api_key: '' });
function ProviderForm({ provider, id }) {
  const [form, setForm] = useState(() => ({ ...blank(id), ...provider, api_key: '' }));
  const [options, setOptions] = useState(() => JSON.stringify(provider?.options || {}, null, 2));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const update = (key) => (event) => setForm({ ...form, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value });
  const save = async (event) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const parsed = JSON.parse(options);
      const { data } = await apiClient.put('/api/admin/tryon/providers/' + id, { ...form, options: parsed,
        priority: Number(form.priority), timeout_seconds: Number(form.timeout_seconds), retry_limit: Number(form.retry_limit) });
      setForm({ ...data.data, api_key: '', clear_api_key: false });
      setNotice('تنظیمات سرویس ذخیره شد.');
    } catch (failure) { setError(failure instanceof SyntaxError ? 'فرمت JSON تنظیمات درخواست صحیح نیست.' : failure.message || 'ذخیره انجام نشد.'); }
    finally { setBusy(false); }
  };
  const test = async () => {
    if (busy) return; setBusy(true); setError(''); setNotice('');
    try {
      const { data } = await apiClient.post('/api/admin/tryon/providers/' + id + '/test');
      setNotice((data.data.reachable ? 'سرویس پاسخ داد. ' : 'سرویس در دسترس نبود. ') + data.data.message + ' وضعیت HTTP: ' + faNumber(data.data.http_status));
    } catch (failure) { setError(failure.message || 'تست اتصال کامل نشد.'); }
    finally { setBusy(false); }
  };
  return <form className="card space-y-4" onSubmit={save}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-black">سرویس {faNumber(id)}</h2><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={update('enabled')} />فعال</label></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1 text-sm">نام نمایشی<input className="input w-full" required maxLength={120} value={form.name} onChange={update('name')} /></label>
      <label className="space-y-1 text-sm">نوع ارائه‌دهنده<select className="input w-full" value={form.adapter} onChange={update('adapter')}>
        <option value="rookhposh_multipart">سرویس فعلی رخ‌پوش (person / cloth)</option><option value="multipart">Multipart سازگار</option><option value="json_images">JSON تصاویر</option><option value="openai_edit">API ویرایش تصویر OpenAI-compatible</option>
      </select></label>
      <label className="space-y-1 text-sm sm:col-span-2">API Endpoint<input dir="ltr" className="input w-full" required type="url" value={form.endpoint} onChange={update('endpoint')} autoComplete="off" /></label>
      <label className="space-y-1 text-sm">شناسه مدل<input dir="ltr" className="input w-full" maxLength={160} value={form.model} onChange={update('model')} /></label>
      <label className="space-y-1 text-sm">کلید جایگزین API<input dir="ltr" className="input w-full" type="password" autoComplete="new-password" maxLength={2048} value={form.api_key} onChange={update('api_key')} placeholder={form.has_api_key ? '•••••••• — برای حفظ کلید خالی بگذارید' : 'کلیدی ذخیره نشده است'} /></label>
      <label className="space-y-1 text-sm">اولویت اجرا<select className="input w-full" value={form.priority} onChange={update('priority')}>{[1, 2, 3].map((n) => <option key={n} value={n}>{faNumber(n)}</option>)}</select></label>
      <label className="space-y-1 text-sm">Timeout (ثانیه)<input className="input w-full" type="number" required min="5" max="600" value={form.timeout_seconds} onChange={update('timeout_seconds')} /></label>
      <label className="space-y-1 text-sm">تلاش مجدد مجاز (۰ تا ۲)<input className="input w-full" type="number" required min="0" max="2" value={form.retry_limit} onChange={update('retry_limit')} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(form.clear_api_key)} onChange={update('clear_api_key')} />حذف کلید ذخیره‌شده هنگام ذخیره</label>
    </div>
    <label className="block space-y-2 text-sm">تنظیمات فرمت درخواست (JSON)<textarea className="input min-h-28 w-full font-mono" dir="ltr" value={options} onChange={(event) => setOptions(event.target.value)} spellCheck="false" /></label>
    <p className="text-xs leading-6 text-slate-500">گزینه‌های پشتیبانی‌شده: person_field، cloth_field، output_hosts، prompt و allow_auth_failover. آدرس‌ها باید HTTPS عمومی باشند؛ آدرس سرویس فعلی به‌صورت سازگار حفظ شده است. تست اتصال از تنظیمات ذخیره‌شده استفاده می‌کند و تصویر تولید نمی‌کند.</p>
    {form.cooldown_until && <p className="text-sm text-amber-700">توقف موقت تا {faDateTime(form.cooldown_until)} · {form.last_error_code}</p>}
    {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}{error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    <div className="flex flex-wrap gap-2"><button type="submit" disabled={busy} className="btn-primary">{busy ? 'در حال انجام...' : 'ذخیره سرویس'}</button><button type="button" disabled={busy || !form.updated_at} className="btn-soft" onClick={test}>تست اتصال</button></div>
  </form>;
}
export default function AISettings() {
  const { data, loading, error, reload } = useAsyncResource(async () => (await apiClient.get('/api/admin/tryon/providers')).data.data, [], { refreshOnFocus: false });
  return <section className="page">
    <div><h1 className="text-2xl font-black">تنظیمات هوش مصنوعی پرو مجازی</h1><p className="mt-3 text-sm leading-7 text-slate-500">حداکثر سه سرویس به‌ترتیب اولویت اجرا می‌شوند. سرویس بعدی فقط در خطاهای قابل‌بازیابی امتحان می‌شود؛ رد ایمنی یا پاسخ نامشخص پس از ارسال، باعث اجرای دوباره نمی‌شود. کلیدها فقط در سرور و به‌صورت رمز‌شده نگهداری می‌شوند.</p></div>
    {loading && <p role="status">در حال دریافت تنظیمات...</p>}
    {error && <p role="alert" className="card text-rose-600">{error.message} <button className="btn-soft" onClick={reload}>تلاش مجدد</button></p>}
    {data && [1, 2, 3].map((id) => <ProviderForm key={id} id={id} provider={data.find((item) => Number(item.id) === id)} />)}
  </section>;
}
