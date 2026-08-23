import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import AdminPagination from '../../components/admin/AdminPagination.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import FileDropzone from '../../components/ui/FileDropzone.jsx';
import { useAsyncResource } from '../../hooks/useAsyncResource.js';
import apiClient from '../../services/apiClient.js';
import { readFileAsDataUrl } from '../../utils/file.js';
import { ticketPath } from '../../utils/ticketLinks.js';

const statusLabel = { open: 'باز', answered: 'پاسخ داده شده', closed: 'بسته' };
const priorityLabel = { low: 'کم', medium: 'متوسط', high: 'زیاد' };
const roleLabel = { Admin: 'ادمین', Seller: 'فروشنده', User: 'کاربر' };
const roleTabs = [
  { key: 'all', label: 'همه تیکت‌ها' },
  { key: 'User', label: 'کاربران' },
  { key: 'Seller', label: 'فروشندگان' },
];

const emptyFaq = {
  audience: 'user',
  category: 'عمومی',
  question: '',
  answer: '',
  attachment: null,
  attachment_name: '',
};

export default function Support() {
  const [page, setPage] = useState(1);
  const [faqRefreshKey, setFaqRefreshKey] = useState(0);
  const [audience, setAudience] = useState('all');
  const { data: ticketResponse, reload: reloadTickets, updateData: updateTickets } = useAsyncResource(
    async () => {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (audience !== 'all') params.set('role', audience);
      return (await apiClient.get(`/api/admin/tickets?${params.toString()}`)).data.data;
    },
    [audience, page],
    { pollMs: 5000, keepPreviousData: true },
  );
  const { data: faqItems = [] } = useAsyncResource(async () => (await apiClient.get('/api/admin/support/faqs')).data.data, [faqRefreshKey]);
  const [section, setSection] = useState('tickets');
  const [notice, setNotice] = useState('');
  const [faqForm, setFaqForm] = useState(emptyFaq);
  const [savingFaq, setSavingFaq] = useState(false);

  const data = Array.isArray(ticketResponse) ? ticketResponse : ticketResponse?.items || [];
  const pagination = Array.isArray(ticketResponse) ? null : ticketResponse?.pagination;

  const rows = data
    .filter((ticket) => audience === 'all' || ticket.user_role === audience)
    .map((ticket) => ({
      ...ticket,
      role_text: roleLabel[ticket.user_role] || ticket.user_role,
      status_text: statusLabel[ticket.status] || ticket.status,
      priority_text: priorityLabel[ticket.priority] || ticket.priority,
    }));

  const notify = (text) => {
    setNotice(text);
    setTimeout(() => setNotice(''), 2400);
  };

  const close = async (id) => {
    await apiClient.patch(`/api/admin/tickets/${id}/close`);
    updateTickets((current) => {
      if (!current || Array.isArray(current)) return current;
      return {
        ...current,
        items: (current.items || []).map((ticket) => (ticket.id === id ? { ...ticket, status: 'closed' } : ticket)),
      };
    });
    reloadTickets();
    notify('تیکت بسته شد.');
  };

  const handleFaqAttachment = async (file) => {
    const dataUrl = await readFileAsDataUrl(file);
    setFaqForm((current) => ({ ...current, attachment: dataUrl, attachment_name: file.name }));
  };

  const addFaq = async () => {
    if (!faqForm.question.trim() || !faqForm.answer.trim()) {
      notify('سوال و پاسخ را وارد کنید.');
      return;
    }
    setSavingFaq(true);
    try {
      await apiClient.patch('/api/admin/support/faqs', { items: [faqForm, ...faqItems] });
      setFaqForm(emptyFaq);
      setFaqRefreshKey((key) => key + 1);
      notify('سوال متداول ذخیره شد.');
    } finally {
      setSavingFaq(false);
    }
  };

  const removeFaq = async (index) => {
    const nextItems = faqItems.filter((_, itemIndex) => itemIndex !== index);
    await apiClient.patch('/api/admin/support/faqs', { items: nextItems });
    setFaqRefreshKey((key) => key + 1);
    notify('سوال متداول حذف شد.');
  };

  return (
    <section className="page">
      <div>
        <h1 className="text-3xl font-black">پشتیبانی</h1>
        <p className="text-slate-500">مدیریت تیکت‌های کاربران و فروشندگان، پاسخ‌گویی، بستن تیکت‌ها و ساخت سوالات متداول.</p>
      </div>

      <div className="card flex flex-wrap gap-3 bg-white p-3">
        <button className={section === 'tickets' ? 'btn-primary' : 'btn-soft'} onClick={() => setSection('tickets')}>تیکت‌ها</button>
        <button className={section === 'faq' ? 'btn-primary' : 'btn-soft'} onClick={() => setSection('faq')}>سوالات متداول</button>
      </div>

      {notice && <div className="card border-emerald-200 bg-emerald-50 text-sm font-bold text-emerald-700">{notice}</div>}

      {section === 'tickets' && (
        <>
          <div className="card flex flex-wrap gap-3 bg-white p-3">
            {roleTabs.map((tab) => (
              <button key={tab.key} className={audience === tab.key ? 'btn-primary' : 'btn-soft'} onClick={() => { setAudience(tab.key); setPage(1); }}>
                {tab.label}
              </button>
            ))}
          </div>

          <DataTable
            rows={rows}
            columns={[
              { key: 'id', label: 'شناسه' },
              { key: 'title', label: 'موضوع' },
              { key: 'user_name', label: 'کاربر' },
              { key: 'role_text', label: 'نوع حساب' },
              { key: 'priority_text', label: 'اولویت' },
              { key: 'status_text', label: 'وضعیت' },
            ]}
            renderActions={(row) => (
              <div className="flex gap-2">
                <a className={row.status === 'closed' ? 'btn-soft' : 'btn-primary'} href={ticketPath('Admin', row.id)} target="_blank" rel="noopener noreferrer">
                  {row.status === 'closed' ? 'مشاهده چت در صفحه جدید' : 'پاسخ در صفحه جدید'}
                </a>
                <button className="btn-soft" disabled={row.status === 'closed'} onClick={() => close(row.id)}>
                  بستن
                </button>
              </div>
            )}
          />
          <AdminPagination pagination={pagination} onPageChange={setPage} />
        </>
      )}

      {section === 'faq' && (
        <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
          <div className="card h-fit space-y-4 bg-white">
            <h2 className="text-xl font-black">افزودن سوال متداول</h2>
            <select className="input w-full" value={faqForm.audience} onChange={(event) => setFaqForm((current) => ({ ...current, audience: event.target.value }))}>
              <option value="user">برای کاربران</option>
              <option value="seller">برای فروشندگان</option>
            </select>
            <input className="input w-full" value={faqForm.category} onChange={(event) => setFaqForm((current) => ({ ...current, category: event.target.value }))} placeholder="دسته‌بندی" />
            <input className="input w-full" value={faqForm.question} onChange={(event) => setFaqForm((current) => ({ ...current, question: event.target.value }))} placeholder="عنوان سوال" />
            <textarea className="input min-h-32 w-full" value={faqForm.answer} onChange={(event) => setFaqForm((current) => ({ ...current, answer: event.target.value }))} placeholder="متن پاسخ" />
            <FileDropzone
              accept="image/*,.pdf,.zip,.rar,.doc,.docx,.txt"
              fileName={faqForm.attachment_name}
              label="فایل راهنما"
              helper="در صورت نیاز فایل آموزشی یا تصویر راهنما را ضمیمه کنید."
              onSelect={handleFaqAttachment}
            />
            <button className="btn-primary w-full" onClick={addFaq} disabled={savingFaq}>
              <Plus size={18} />
              {savingFaq ? 'در حال ذخیره...' : 'ثبت سوال متداول'}
            </button>
          </div>

          <div className="card bg-white">
            <h2 className="text-xl font-black">سوالات ثبت‌شده</h2>
            <div className="mt-5 divide-y divide-slate-100">
              {faqItems.map((item, index) => (
                <article key={`${item.question}-${index}`} className="py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-indigo-600">{item.audience === 'seller' ? 'فروشندگان' : 'کاربران'} / {item.category}</div>
                      <h3 className="mt-2 font-black">{item.question}</h3>
                      <p className="mt-2 text-sm leading-7 text-slate-500">{item.answer}</p>
                      {item.attachment && <a className="mt-3 inline-flex rounded-2xl bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-600" href={item.attachment} target="_blank" rel="noreferrer">مشاهده فایل</a>}
                    </div>
                    <button className="btn-soft text-rose-600" onClick={() => removeFaq(index)}>
                      <Trash2 size={16} />
                      حذف
                    </button>
                  </div>
                </article>
              ))}
              {!faqItems.length && <div className="py-10 text-center text-sm font-bold text-slate-400">هنوز سوال متداولی ثبت نشده است.</div>}
            </div>
          </div>
        </div>
      )}

    </section>
  );
}
