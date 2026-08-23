import { useState } from 'react';
import AdminPagination from '../../components/admin/AdminPagination.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import TicketConfirmationCard from '../../components/ui/TicketConfirmationCard.jsx';
import { useAsyncResource } from '../../hooks/useAsyncResource.js';
import apiClient from '../../services/apiClient.js';
import { downloadBlob } from '../../utils/downloadBlob.js';
import { faDateTime, formatMoney } from '../../utils/formatters.js';

const segments = [
  ['users', 'کاربران'],
  ['sellers', 'فروشندگان'],
  ['company', 'شرکت'],
];

const ranges = [
  ['1d', '۱ روز'],
  ['7d', '۷ روز'],
  ['30d', '۳۰ روز'],
];

const bankFields = [
  ['bank_name', 'نام بانک'],
  ['card_number', 'شماره کارت'],
  ['iban', 'شماره شبا'],
  ['account_holder', 'نام صاحب حساب'],
];

const paymentMethodLabels = {
  wallet: 'کیف پول',
  bank_transfer: 'واریز حساب',
  direct_gateway: 'درگاه مستقیم',
};

function paymentMethodOf(row = {}) {
  return row.metadata?.payment_method || row.metadata?.source || 'wallet';
}

function receiptUrlOf(row = {}) {
  return row.metadata?.receipt?.dataUrl || row.metadata?.receipt?.url || '';
}

function paymentMethodLabel(row = {}) {
  return paymentMethodLabels[paymentMethodOf(row)] || paymentMethodOf(row);
}

function receiptKind(row = {}) {
  const method = paymentMethodOf(row);
  if (receiptUrlOf(row)) return method === 'bank_transfer' ? 'رسید آپلودی واریز' : 'رسید آپلودی';
  if (method === 'direct_gateway') return 'رسید درگاه';
  if (method === 'wallet') return 'رسید کیف پول';
  return 'رسید سیستمی';
}

function PaymentReceiptModal({ row, onClose }) {
  if (!row) return null;

  const receiptUrl = receiptUrlOf(row);
  const receipt = row.metadata?.receipt || {};
  const isPdf = receipt.type?.includes('pdf') || receipt.name?.toLowerCase?.().endsWith('.pdf') || receiptUrl.startsWith('data:application/pdf');

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="mx-auto flex min-h-full max-w-3xl items-center justify-center">
        <div className="w-full rounded-[2rem] border border-white/60 bg-white p-5 shadow-2xl shadow-slate-900/20">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-black">رسید تراکنش #{row.id}</h3>
              <p className="mt-1 text-sm text-slate-500">
                روش پرداخت: <b>{paymentMethodLabel(row)}</b> | نوع رسید: <b>{receiptKind(row)}</b>
              </p>
            </div>
            <button type="button" className="btn-soft" onClick={onClose}>بستن</button>
          </div>

          {receiptUrl ? (
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-3">
              {isPdf ? (
                <iframe title={`receipt-${row.id}`} src={receiptUrl} className="h-[70vh] w-full rounded-2xl bg-white" />
              ) : (
                <img src={receiptUrl} alt={`رسید تراکنش ${row.id}`} className="mx-auto max-h-[70vh] rounded-2xl object-contain" />
              )}
              <a className="btn-primary mt-4 w-full" href={receiptUrl} target="_blank" rel="noreferrer">
                باز کردن رسید در تب جدید
              </a>
            </div>
          ) : (
            <div className="flex justify-center">
              <TicketConfirmationCard
                ticketId={row.id}
                amount={row.amount}
                date={row.created_at}
                cardHolder={paymentMethodLabel(row)}
                last4Digits={String(row.id || '0000').slice(-4)}
                barcodeValue={String(row.id || '00000000000000').padEnd(14, '0').slice(0, 14)}
                title="رسید پرداخت"
                description={`این رسید سیستمی برای پرداخت از روش ${paymentMethodLabel(row)} ساخته شده است.`}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Financial() {
  const [segment, setSegment] = useState('users');
  const [range, setRange] = useState('30d');
  const [pendingPage, setPendingPage] = useState(1);
  const [notice, setNotice] = useState('');
  const [bankEdits, setBankEdits] = useState(null);
  const [receiptRow, setReceiptRow] = useState(null);
  const [pendingActionId, setPendingActionId] = useState(null);
  const { data, reload: reloadReport } = useAsyncResource(
    async () => (await apiClient.get(`/api/admin/reports/financial/${segment}?range=${range}`)).data.data,
    [segment, range],
    { keepPreviousData: true },
  );
  const { data: pendingResponse, reload: reloadPending, updateData: updatePending } = useAsyncResource(
    async () => (await apiClient.get(`/api/admin/payments/pending?page=${pendingPage}&limit=25`)).data.data,
    [pendingPage],
    { pollMs: 4000, keepPreviousData: true },
  );
  const { data: bankInfo = {}, reload: reloadBankInfo } = useAsyncResource(async () => (await apiClient.get('/api/admin/settings/bank')).data.data, []);

  const pending = Array.isArray(pendingResponse) ? pendingResponse : pendingResponse?.items || [];
  const pendingPagination = Array.isArray(pendingResponse) ? null : pendingResponse?.pagination;

  const removePendingRow = (id) => {
    const total = Math.max(0, Number(pendingPagination?.total || 0) - 1);
    const totalPages = pendingPagination ? Math.max(1, Math.ceil(total / pendingPagination.pageSize)) : pendingPage;
    if (pendingPage > totalPages) setPendingPage(totalPages);
    updatePending((current) => {
      if (!current || Array.isArray(current)) return current;
      const items = (current.items || []).filter((item) => Number(item.id) !== Number(id));
      return {
        ...current,
        items,
        pagination: current.pagination
          ? { ...current.pagination, total, totalPages }
          : current.pagination,
      };
    });
  };

  const bankForm = bankEdits || bankInfo || {};

  const flash = (message) => {
    setNotice(message);
    setTimeout(() => setNotice(''), 2400);
  };

  const exportExcel = async () => {
    const response = await apiClient.get(`/api/admin/reports/financial/${segment}/export?range=${range}`, { responseType: 'blob' });
    downloadBlob(response.data, `admin-financial-${segment}-${range}.xlsx`);
  };

  const approve = async (id) => {
    if (pendingActionId) return;
    setPendingActionId(id);
    try {
      await apiClient.patch(`/api/admin/payments/${id}/approve`);
      removePendingRow(id);
      flash('پرداخت تایید شد.');
      reloadPending();
      reloadReport();
    } catch (error) {
      flash(error.message || 'تایید پرداخت انجام نشد.');
    } finally {
      setPendingActionId(null);
    }
  };

  const reject = async (id) => {
    const reason = window.prompt('علت رد پرداخت را بنویسید:', 'رسید پرداخت قابل تایید نیست.');
    if (!reason) return;
    if (pendingActionId) return;
    setPendingActionId(id);
    try {
      await apiClient.patch(`/api/admin/payments/${id}/reject`, { reason });
      removePendingRow(id);
      flash('پرداخت رد شد.');
      reloadPending();
      reloadReport();
    } catch (error) {
      flash(error.message || 'رد پرداخت انجام نشد.');
    } finally {
      setPendingActionId(null);
    }
  };

  const saveBankInfo = async () => {
    await apiClient.patch('/api/admin/settings/bank', bankForm);
    setBankEdits(null);
    flash('مشخصات حساب بانکی ذخیره شد.');
    reloadBankInfo();
  };

  return (
    <section className="page">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">گزارش مالی</h1>
          <p className="text-slate-500">گزارش مالی کاربران، فروشندگان و شرکت با خروجی Excel و تایید رسیدهای واریز به حساب.</p>
        </div>
        <button className="btn-primary" onClick={exportExcel}>خروجی Excel</button>
      </div>

      {notice ? <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</div> : null}

      <div className="card flex flex-wrap gap-2">
        {segments.map((item) => (
          <button key={item[0]} className={segment === item[0] ? 'btn-primary' : 'btn-soft'} onClick={() => setSegment(item[0])}>
            {item[1]}
          </button>
        ))}
        {ranges.map((item) => (
          <button key={item[0]} className={range === item[0] ? 'btn-primary' : 'btn-soft'} onClick={() => setRange(item[0])}>
            {item[1]}
          </button>
        ))}
      </div>

      <div className="card">
        <h2 className="mb-2 text-xl font-black">مشخصات حساب بانکی ادمین</h2>
        <p className="mb-4 text-sm text-slate-500">این اطلاعات در پرداخت‌های «واریز به حساب» برای کاربر و فروشنده نمایش داده می‌شود.</p>
        <div className="grid gap-3 md:grid-cols-2">
          {bankFields.map(([key, label]) => (
            <label key={key} className="space-y-2">
              <span className="text-sm font-bold text-slate-500">{label}</span>
              <input
                className="input"
                value={bankForm[key] || ''}
                onChange={(event) => setBankEdits((value) => ({ ...(value || bankForm), [key]: event.target.value }))}
              />
            </label>
          ))}
        </div>
        <button className="btn-primary mt-4" onClick={saveBankInfo}>ذخیره مشخصات حساب</button>
      </div>

      {pending.length ? (
        <div className="card">
          <h2 className="mb-4 text-xl font-black">پرداخت‌های در انتظار تایید</h2>
          <DataTable
            rows={pending}
            columns={[
              { key: 'id', label: 'شناسه' },
              { key: 'user_name', label: 'کاربر' },
              { key: 'user_role', label: 'نقش' },
              { key: 'type', label: 'نوع' },
              { key: 'payment_method', label: 'روش پرداخت', render: (row) => paymentMethodLabel(row) },
              { key: 'amount', label: 'مبلغ', render: (row) => formatMoney(row.amount || 0) },
              { key: 'created_at', label: 'تاریخ', render: (row) => faDateTime(row.created_at) },
              {
                key: 'receipt',
                label: 'رسید',
                render: (row) => (
                  <button type="button" className="btn-soft" onClick={() => setReceiptRow(row)}>
                    {receiptKind(row)}
                  </button>
                ),
              },
              {
                key: 'actions',
                label: 'عملیات',
                render: (row) => (
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-primary" disabled={Boolean(pendingActionId)} onClick={() => approve(row.id)}>تایید</button>
                    <button className="btn-soft" disabled={Boolean(pendingActionId)} onClick={() => reject(row.id)}>رد</button>
                  </div>
                ),
              },
            ]}
          />
          <AdminPagination pagination={pendingPagination} onPageChange={setPendingPage} />
        </div>
      ) : null}

      <DataTable
        rows={data?.rows || []}
        columns={[
          { key: 'user_name', label: 'نام' },
          { key: 'user_email', label: 'ایمیل' },
          { key: 'type', label: 'نوع' },
          { key: 'payment_method', label: 'روش پرداخت', render: (row) => paymentMethodLabel(row) },
          { key: 'amount', label: 'مبلغ', render: (row) => formatMoney(row.amount || 0) },
          { key: 'status', label: 'وضعیت' },
          { key: 'created_at', label: 'تاریخ', render: (row) => faDateTime(row.created_at) },
          {
            key: 'receipt',
            label: 'رسید',
            render: (row) => (
              <button type="button" className="btn-soft" onClick={() => setReceiptRow(row)}>
                {receiptKind(row)}
              </button>
            ),
          },
        ]}
      />
      <PaymentReceiptModal row={receiptRow} onClose={() => setReceiptRow(null)} />
    </section>
  );
}
