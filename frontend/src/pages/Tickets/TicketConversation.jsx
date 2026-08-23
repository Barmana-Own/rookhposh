import { ArrowRight, Download, Mail, Send, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import FileDropzone from '../../components/ui/FileDropzone.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useAsyncResource } from '../../hooks/useAsyncResource.js';
import apiClient from '../../services/apiClient.js';
import { isImageDataUrl, readFileAsDataUrl } from '../../utils/file.js';
import { toPersianMessage } from '../../utils/errorMessages.js';

const statusLabel = { open: 'باز', answered: 'پاسخ داده شده', closed: 'بسته' };
const priorityLabel = { low: 'کم', medium: 'متوسط', high: 'زیاد' };
const roleLabel = { Admin: 'پشتیبانی', Seller: 'فروشنده', User: 'کاربر' };

function formatDate(value) {
  return value ? new Date(value).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }) : '---';
}

function AttachmentPreview({ attachment }) {
  if (!attachment) return null;
  const image = isImageDataUrl(attachment);
  return (
    <div className="mt-4 overflow-hidden rounded-2xl bg-slate-950 text-white">
      {image && <img src={attachment} alt="پیوست تیکت" className="max-h-80 w-full object-contain" />}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs font-bold">
        <span>{image ? 'تصویر پیوست‌شده' : 'فایل پیوست‌شده'}</span>
        <a className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2" href={attachment} target="_blank" rel="noreferrer" download={!image}>
          <Download size={14} />
          {image ? 'مشاهده تصویر' : 'دانلود فایل'}
        </a>
      </div>
    </div>
  );
}

function endpointFor(role, ticketId) {
  return role === 'Admin' ? `/api/admin/tickets/${ticketId}` : `/api/tickets/${ticketId}`;
}

export default function TicketConversation() {
  const { ticketId } = useParams();
  const { user } = useAuth();
  const role = user?.role || 'User';
  const [ticketOverride, setTicketOverride] = useState(null);
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');

  const listPath = role === 'Admin' ? '/admin/support' : role === 'Seller' ? '/seller/tickets' : '/user/tickets';
  const { data: loadedTicket, loading, error: loadError } = useAsyncResource(
    async () => (await apiClient.get(endpointFor(role, ticketId))).data.data,
    [role, ticketId],
  );
  const ticket = ticketOverride?.id?.toString() === ticketId ? ticketOverride : loadedTicket;
  const error = actionError || (loadError ? toPersianMessage(loadError.message, 'دریافت تیکت انجام نشد.') : '');

  const reply = async () => {
    if (!message.trim() || !ticket || ticket.status === 'closed') return;
    setSending(true);
    setActionError('');
    try {
      const path = role === 'Admin' ? `/api/admin/tickets/${ticketId}/reply` : `/api/tickets/${ticketId}/reply`;
      const response = await apiClient.post(path, { message, attachment: attachment || null });
      setTicketOverride(response.data.data);
      setMessage('');
      setAttachment('');
      setAttachmentName('');
      setNotice('پاسخ با موفقیت ثبت شد.');
    } catch (requestError) {
      setActionError(toPersianMessage(requestError.message, 'ارسال پاسخ انجام نشد.'));
    } finally {
      setSending(false);
    }
  };

  const closeTicket = async () => {
    if (!ticket || ticket.status === 'closed') return;
    try {
      const path = role === 'Admin' ? `/api/admin/tickets/${ticketId}/close` : `/api/tickets/${ticketId}/close`;
      const response = await apiClient.patch(path);
      setTicketOverride(response.data.data);
      setNotice('تیکت بسته شد.');
    } catch (requestError) {
      setActionError(toPersianMessage(requestError.message, 'بستن تیکت انجام نشد.'));
    }
  };

  const handleAttachment = async (file) => {
    try {
      setAttachment(await readFileAsDataUrl(file));
      setAttachmentName(file.name);
    } catch (fileError) {
      setActionError(toPersianMessage(fileError.message, 'خواندن فایل انجام نشد.'));
    }
  };

  if (loading) {
    return <main dir="rtl" className="grid min-h-screen place-items-center bg-[#eef2ff] p-6 font-bold text-slate-700">در حال دریافت گفت‌وگوی تیکت...</main>;
  }

  if (error && !ticket) {
    return (
      <main dir="rtl" className="grid min-h-screen place-items-center bg-[#eef2ff] p-6">
        <div className="card w-full max-w-xl text-center">
          <h1 className="text-2xl font-black">دریافت تیکت انجام نشد</h1>
          <p className="mt-3 text-rose-600">{error}</p>
          <Link className="btn-primary mt-6" to={listPath}>بازگشت به فهرست تیکت‌ها</Link>
        </div>
      </main>
    );
  }

  return (
    <section dir="rtl" className="page">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-indigo-600" to={listPath}>
            <ArrowRight size={17} />
            بازگشت به فهرست تیکت‌ها
          </Link>
          <h1 className="text-3xl font-black">گفت‌وگوی تیکت #{ticket.id}</h1>
          <p className="mt-2 text-slate-500">این صفحه برای بررسی کامل پیام‌ها و ارسال پاسخ در اختیار شماست.</p>
        </div>
        {ticket.status !== 'closed' && (
          <button type="button" className="btn-soft text-rose-600" onClick={closeTicket}>
            <X size={17} />
            بستن تیکت
          </button>
        )}
      </div>

      {notice && <div className="card border-emerald-200 bg-emerald-50 text-sm font-bold text-emerald-700">{notice}</div>}
      {error && <div className="card border-rose-200 bg-rose-50 text-sm font-bold text-rose-600">{error}</div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="card min-w-0 bg-white p-4 sm:p-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-slate-400"><Mail size={17} /> موضوع تیکت</div>
              <h2 className="mt-2 text-2xl font-black">{ticket.title}</h2>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-black">
              <span className="rounded-full bg-indigo-50 px-3 py-2 text-indigo-700">وضعیت: {statusLabel[ticket.status] || ticket.status}</span>
              <span className="rounded-full bg-slate-100 px-3 py-2 text-slate-600">اولویت: {priorityLabel[ticket.priority] || ticket.priority}</span>
            </div>
          </div>

          <div className="space-y-4">
            {(ticket.messages || []).map((item) => {
              const isAdmin = item.sender_role === 'Admin';
              return (
                <article key={item.id} className={`rounded-3xl p-5 ${isAdmin ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-800 ring-1 ring-slate-200'}`}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs font-bold opacity-80">
                    <span>{item.sender_name || roleLabel[item.sender_role] || 'کاربر'} ({roleLabel[item.sender_role] || item.sender_role})</span>
                    <span>{formatDate(item.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-wrap leading-8">{item.message}</p>
                  <AttachmentPreview attachment={item.attachment} />
                </article>
              );
            })}
          </div>
        </div>

        <aside className="card h-fit space-y-5 bg-white p-5 sm:p-6 xl:sticky xl:top-24">
          <div>
            <p className="text-sm font-bold text-slate-500">تعداد پیام‌ها</p>
            <strong className="mt-1 block text-3xl font-black text-indigo-600">{(ticket.messages || []).length.toLocaleString('fa-IR')}</strong>
          </div>
          {ticket.status === 'closed' ? (
            <div className="rounded-2xl bg-slate-100 p-4 text-center text-sm font-bold text-slate-500">این تیکت بسته شده و فقط قابل مشاهده است.</div>
          ) : (
            <>
              <textarea className="input min-h-40 w-full resize-y" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="پاسخ خود را بنویسید..." />
              <FileDropzone accept="image/*,.pdf,.zip,.rar,.doc,.docx,.xls,.xlsx,.txt" fileName={attachmentName} label="پیوست پاسخ" helper="تصویر یا فایل موردنیاز را همراه پاسخ ارسال کنید." onSelect={handleAttachment} />
              <button type="button" className="btn-primary w-full" onClick={reply} disabled={sending || !message.trim()}>
                <Send size={17} />
                {sending ? 'در حال ارسال...' : 'ارسال پاسخ'}
              </button>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
