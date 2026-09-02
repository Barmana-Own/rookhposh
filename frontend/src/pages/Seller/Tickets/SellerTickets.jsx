import { ArrowLeft, ChevronDown, Info, Mail } from 'lucide-react';
import { useMemo, useState } from 'react';
import SellerPageHeader from '../../../components/seller/SellerPageHeader';
import SellerTable from '../../../components/seller/SellerTable';
import SellerToast from '../../../components/seller/SellerToast';
import FileDropzone from '../../../components/ui/FileDropzone.jsx';
import { useAsyncResource } from '../../../hooks/useAsyncResource';
import apiClient from '../../../services/apiClient';
import { sellerApi } from '../../../services/seller/sellerApi';
import { readFileAsDataUrl } from '../../../utils/file';
import { ticketPath } from '../../../utils/ticketLinks.js';

const statusText = { open: 'باز', answered: 'پاسخ داده شده', closed: 'بسته' };
const priorityText = { low: 'کم', medium: 'متوسط', high: 'زیاد' };
const tabs = [
  { key: 'list', label: 'تیکت‌ها' },
  { key: 'faq', label: 'سوالات پرتکرار' },
  { key: 'new', label: 'تیکت جدید' },
];
const faqs = [
  'چطور درخواست بررسی محصول را پیگیری کنم؟',
  'چطور درباره خرید پکیج فروشگاه تیکت بزنم؟',
  'چطور اطلاعات فروشگاه یا QR Code را اصلاح کنم؟',
  'اگر محصول رد شد از کجا علت را ببینم؟',
];

function TicketTabs({ active, onChange }) {
  return (
    <div className="card flex flex-wrap gap-3 bg-white p-3">
      {tabs.map((tab) => (
        <button key={tab.key} className={active === tab.key ? 'btn-primary' : 'btn-soft'} onClick={() => onChange(tab.key)}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export default function SellerTickets() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { data = [] } = useAsyncResource(() => sellerApi.getTickets(), [refreshKey]);
  const { data: adminFaqs = [] } = useAsyncResource(async () => (await apiClient.get('/api/tickets/faqs')).data.data, []);
  const [activeTab, setActiveTab] = useState('list');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState('');
  const [form, setForm] = useState({ title: '', message: '', priority: 'medium', attachment: '' });
  const [attachmentName, setAttachmentName] = useState('');
  const visibleFaqs = adminFaqs.length ? adminFaqs : faqs.map((question) => ({ question, answer: 'اگر پاسخ موردنظر را پیدا نکردید، از تب تیکت جدید درخواست خود را ارسال کنید.' }));

  const activateNewTicket = () => {
    setActiveTab('new');
    window.setTimeout(() => document.getElementById('seller-new-ticket')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  const rows = useMemo(
    () => data
      .map((item) => ({ ...item, statusLabel: statusText[item.rawStatus] || item.status, priorityLabel: priorityText[item.priority] || item.priority }))
      .filter((item) => (filter === 'all' || item.rawStatus === filter) && item.subject.includes(search)),
    [data, filter, search],
  );

  const notify = (message) => {
    setToast(message);
    setTimeout(() => setToast(''), 2200);
  };

  const handleTicketAttachment = async (file) => {
    const attachment = await readFileAsDataUrl(file);
    setForm((current) => ({ ...current, attachment }));
    setAttachmentName(file.name);
  };

  const submit = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      notify('عنوان و متن تیکت را وارد کنید.');
      return;
    }
    setCreating(true);
    try {
      await sellerApi.createTicket(form);
      setForm({ title: '', message: '', priority: 'medium', attachment: '' });
      setAttachmentName('');
      setRefreshKey((key) => key + 1);
      setActiveTab('list');
      notify('تیکت با موفقیت ثبت شد.');
    } catch {
      notify('ارسال تیکت انجام نشد.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="page">
      <SellerPageHeader
        title="تیکت‌های سرویس"
        description="تیکت جدید ثبت کنید، سوالات رایج فروشگاه‌ها را ببینید و مکالمه با پشتیبانی را ادامه دهید."
        action={<button type="button" className="btn-primary" onClick={activateNewTicket}>ارسال تیکت جدید</button>}
      />

      <TicketTabs active={activeTab} onChange={setActiveTab} />

      {activeTab === 'list' && (
        <>
          <div className="card grid gap-3 bg-white md:grid-cols-[1fr_220px]">
            <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="جستجو در عنوان تیکت..." />
            <select className="input" value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="all">همه تیکت‌ها</option>
              <option value="open">باز</option>
              <option value="answered">پاسخ داده شده</option>
              <option value="closed">بسته</option>
            </select>
          </div>
          <SellerTable
            page={page}
            onPageChange={setPage}
            rows={rows}
            columns={[
              { key: 'id', label: 'شناسه', render: (row) => <span className="inline-flex items-center gap-2"><Mail size={18} />{row.id}</span> },
              { key: 'subject', label: 'عنوان' },
              { key: 'statusLabel', label: 'وضعیت' },
              { key: 'priorityLabel', label: 'اولویت' },
              { key: 'replies', label: 'پیام‌ها' },
            ]}
            actions={(row) => (
              <a className="btn-soft" href={ticketPath('Seller', row.id)} target="_blank" rel="noopener noreferrer">
                مشاهده / پاسخ در صفحه جدید
              </a>
            )}
          />
        </>
      )}

      {activeTab === 'faq' && (
        <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
          <div className="card bg-white p-6">
            <h2 className="text-2xl font-black">سوالات پرتکرار</h2>
            <div className="mt-6 divide-y divide-slate-100 border border-slate-100">
              {visibleFaqs.map((item, index) => (
                <details key={`${item.question}-${index}`} className="group p-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between font-bold">
                    {item.question}
                    <ChevronDown size={18} className="transition group-open:rotate-180" />
                  </summary>
                  <p className="mt-4 text-sm leading-7 text-slate-500">{item.answer}</p>
                  {item.attachment && <a className="mt-4 inline-flex rounded-2xl bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-600" href={item.attachment} target="_blank" rel="noreferrer">دانلود فایل راهنما</a>}
                </details>
              ))}
            </div>
            <div className="mt-6 flex items-center gap-2 border-t border-slate-100 pt-5 text-sm text-slate-500">
              <Info size={18} className="text-indigo-600" />
              پاسخ خود را پیدا نکردید؟ <button className="font-bold text-indigo-600" onClick={activateNewTicket}>تیکت جدید بفرستید.</button>
            </div>
          </div>
          <div className="card h-fit bg-white p-6">
            <h3 className="font-black">دسته‌بندی‌ها</h3>
            {['محصولات', 'فروشگاه', 'پکیج فروشگاه', 'تراکنش‌ها'].map((item) => <button className="mt-3 flex w-full items-center justify-between rounded-2xl p-3 text-right font-bold hover:bg-slate-50" key={item}><span>{item}</span><ArrowLeft size={16} /></button>)}
          </div>
        </div>
      )}

      {activeTab === 'new' && (
        <div id="seller-new-ticket" className="grid scroll-mt-24 gap-6 lg:grid-cols-[1fr_360px]">
          <div className="card bg-white p-8">
            <h2 className="text-2xl font-black">تیکت جدید</h2>
            <p className="mt-2 text-sm text-slate-500">برای ارسال تیکت جدید فرم زیر را کامل کنید.</p>
            <div className="mt-6 grid gap-4">
              <select className="input" value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}>
                <option value="low">اولویت کم</option>
                <option value="medium">اولویت متوسط</option>
                <option value="high">اولویت زیاد</option>
              </select>
              <input className="input" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="عنوان تیکت" />
              <textarea className="input min-h-36" value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} placeholder="متن تیکت" />
              <FileDropzone accept="image/*,.pdf,.zip,.rar,.doc,.docx,.txt" fileName={attachmentName} label="پیوست تیکت" helper="عکس، PDF یا فایل‌های رایج را می‌توانید ضمیمه کنید." onSelect={handleTicketAttachment} />
              <button className="btn-primary w-fit px-10" onClick={submit} disabled={creating}>{creating ? 'در حال ارسال...' : 'ارسال تیکت'}</button>
            </div>
          </div>
          <aside className="card h-fit bg-white p-8 text-sm leading-8 text-slate-500">
            <div className="mx-auto mb-6 grid h-28 w-28 place-items-center rounded-full bg-indigo-50 text-indigo-600">
              <Mail size={42} />
            </div>
            <ul className="list-disc space-y-4 pr-5">
              <li>تیکت‌های مربوط به محصول و فروشگاه توسط پشتیبانی بررسی می‌شود.</li>
              <li>برای بررسی سریع‌تر، تصویر یا فایل مرتبط را ضمیمه کنید.</li>
              <li>وضعیت و پاسخ‌ها از همین صفحه قابل پیگیری است.</li>
            </ul>
          </aside>
        </div>
      )}

      <SellerToast message={toast} />
    </section>
  );
}
