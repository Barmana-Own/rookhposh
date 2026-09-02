import { ArrowLeft, ChevronDown, Info, Mail } from 'lucide-react';
import { useMemo, useState } from 'react';
import FileDropzone from '../../../components/ui/FileDropzone.jsx';
import UserPageHeader from '../../../components/user/UserPageHeader';
import UserTable from '../../../components/user/UserTable';
import UserToast from '../../../components/user/UserToast';
import { useUser } from '../../../contexts/UserContext';
import { useAsyncResource } from '../../../hooks/useAsyncResource';
import apiClient from '../../../services/apiClient';
import { userApi } from '../../../services/user/userApi';
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
  'چطور وضعیت تیکت را پیگیری کنم؟',
  'چطور فایل یا تصویر برای پشتیبانی ارسال کنم؟',
  'زمان پاسخ‌گویی پشتیبانی چقدر است؟',
  'اگر تیکت بسته شد چطور مکالمه را ببینم؟',
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

export default function UserTickets() {
  const { showToast } = useUser();
  const [refreshKey, setRefreshKey] = useState(0);
  const { loading, error, data = [] } = useAsyncResource(() => userApi.getTickets(), [refreshKey]);
  const { data: adminFaqs = [] } = useAsyncResource(async () => (await apiClient.get('/api/tickets/faqs')).data.data, []);
  const [activeTab, setActiveTab] = useState('list');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', message: '', priority: 'medium', attachment: '' });
  const [attachmentName, setAttachmentName] = useState('');
  const visibleFaqs = adminFaqs.length ? adminFaqs : faqs.map((question) => ({ question, answer: 'برای پیگیری دقیق‌تر، اگر پاسخ موردنظر را پیدا نکردید از تب تیکت جدید درخواست خود را ارسال کنید.' }));

  const activateNewTicket = () => {
    setActiveTab('new');
    window.setTimeout(() => document.getElementById('user-new-ticket')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  const rows = useMemo(
    () => data
      .map((item) => ({ ...item, statusLabel: statusText[item.rawStatus] || item.status, priorityLabel: priorityText[item.priority] || item.priority }))
      .filter((item) => (filter === 'all' || item.rawStatus === filter) && item.subject.includes(search)),
    [data, filter, search],
  );

  const handleTicketAttachment = async (file) => {
    const attachment = await readFileAsDataUrl(file);
    setForm((current) => ({ ...current, attachment }));
    setAttachmentName(file.name);
  };

  const submit = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      showToast('عنوان و متن تیکت را وارد کنید.');
      return;
    }
    setCreating(true);
    try {
      await userApi.createTicket(form);
      setForm({ title: '', message: '', priority: 'medium', attachment: '' });
      setAttachmentName('');
      setRefreshKey((key) => key + 1);
      setActiveTab('list');
      showToast('تیکت با موفقیت ثبت شد.');
    } catch {
      showToast('ارسال تیکت انجام نشد.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="page">
      <UserPageHeader
        title="تیکت‌های پشتیبانی"
        description="در این بخش می‌توانید تیکت جدید ثبت کنید، سوالات پرتکرار را ببینید و مکالمه با پشتیبانی را ادامه دهید."
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
          <UserTable
            loading={loading}
            error={error}
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
              <a className="btn-soft" href={ticketPath('User', row.id)} target="_blank" rel="noopener noreferrer">
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
            {['کیف پول', 'خرید محصول', 'پکیج‌ها', 'حساب کاربری'].map((item) => <button className="mt-3 flex w-full items-center justify-between rounded-2xl p-3 text-right font-bold hover:bg-slate-50" key={item}><span>{item}</span><ArrowLeft size={16} /></button>)}
          </div>
        </div>
      )}

      {activeTab === 'new' && (
        <div id="user-new-ticket" className="grid scroll-mt-24 gap-6 lg:grid-cols-[1fr_360px]">
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
              <li>حداکثر تا ۲۴ ساعت پس از ارسال تیکت، پاسخ برای شما ارسال خواهد شد.</li>
              <li>زمان پاسخ‌دهی بسته به نیاز بررسی و پیگیری ممکن است کمی طولانی‌تر شود.</li>
              <li>برای پیگیری وضعیت، نیازی به تماس تلفنی نیست.</li>
            </ul>
          </aside>
        </div>
      )}

      <UserToast />
    </section>
  );
}
