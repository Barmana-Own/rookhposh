import { useState } from 'react';
import AdminPagination from '../../components/admin/AdminPagination.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { useAsyncResource } from '../../hooks/useAsyncResource.js';
import apiClient from '../../services/apiClient.js';
import { formatMoney, formatNumberInput, onlyDigits } from '../../utils/formatters.js';

const verifyLabel = { none: 'ندارد', pending: 'در انتظار', approved: 'تایید شده', rejected: 'رد شده' };
const statusLabel = { active: 'فعال', blocked: 'مسدود' };

function verificationStatus(value) {
  return String(value || '').toLowerCase();
}

const emptyEdit = {
  id: null,
  role: '',
  fullname: '',
  username: '',
  email: '',
  mobile: '',
  national_code: '',
  wallet_balance: '',
  store_name: '',
  password: '',
};

export default function Users() {
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState('User');
  const { data: response, reload, updateData } = useAsyncResource(
    async () => (await apiClient.get(`/api/admin/users?role=${tab}&page=${page}&limit=25`)).data.data,
    [tab, page],
    { pollMs: 5000, keepPreviousData: true },
  );
  const [notice, setNotice] = useState('');
  const [edit, setEdit] = useState(null);

  const data = Array.isArray(response) ? response : response?.items || [];
  const pagination = Array.isArray(response) ? null : response?.pagination;

  const notify = (text) => {
    setNotice(text);
    setTimeout(() => setNotice(''), 2400);
  };

  const updateRowAfterAction = (id, action) => {
    updateData((current) => {
      if (!current) return current;
      const update = (items) => items
        .filter((item) => Number(item.id) !== Number(id) || action !== 'delete')
        .map((item) => {
          if (Number(item.id) !== Number(id)) return item;
          if (action === 'approve') return { ...item, seller_verification_status: 'approved', status: item.status === 'blocked' ? 'blocked' : 'active' };
          if (action === 'reject') return { ...item, seller_verification_status: 'rejected' };
          if (action === 'block') return { ...item, status: 'blocked' };
          if (action === 'unblock') return { ...item, status: 'active' };
          return item;
        });
      if (Array.isArray(current)) return update(current);
      return { ...current, items: update(current.items || []) };
    });
  };

  const run = async (request, success, action, id) => {
    await request();
    if (action && id != null) updateRowAfterAction(id, action);
    reload();
    notify(success);
  };

  const openEdit = (row) => {
    setEdit({
      ...emptyEdit,
      ...row,
      wallet_balance: formatNumberInput(row.wallet_balance || 0),
      password: '',
    });
  };

  const saveEdit = async () => {
    const payload = {
      fullname: edit.fullname,
      username: edit.username,
      email: edit.email,
      mobile: edit.mobile,
      national_code: edit.national_code,
      wallet_balance: Number(onlyDigits(edit.wallet_balance) || 0),
      store_name: edit.store_name,
      ...(edit.password ? { password: edit.password } : {}),
    };
    await run(() => apiClient.patch(`/api/admin/users/${edit.id}`, payload), 'اطلاعات حساب ذخیره شد.');
    setEdit(null);
  };

  const sellerRows = data.filter((item) => item.role === 'Seller').map((item) => ({
    ...item,
    verify_text: verifyLabel[verificationStatus(item.seller_verification_status)] || item.seller_verification_status,
    status_text: statusLabel[item.status] || item.status,
  }));

  const customerRows = data.filter((item) => item.role === 'User').map((item) => ({ ...item, status_text: statusLabel[item.status] || item.status }));

  const accountActions = (row, sellerActions = false) => (
    <div className="flex flex-wrap gap-2">
      <button className="btn-soft" onClick={() => openEdit(row)}>ویرایش</button>
      {sellerActions && verificationStatus(row.seller_verification_status) === 'pending' && (
        <button className="btn-primary" onClick={() => run(() => apiClient.patch(`/api/admin/sellers/${row.id}/approve`), 'هویت فروشنده تایید شد.', 'approve', row.id)}>
          تایید هویت
        </button>
      )}
      {sellerActions && verificationStatus(row.seller_verification_status) === 'pending' && (
        <button className="btn-soft" onClick={() => run(() => apiClient.patch(`/api/admin/sellers/${row.id}/reject`, { reason: 'مدارک هویتی کامل نیست.' }), 'هویت فروشنده رد شد.', 'reject', row.id)}>
          رد هویت
        </button>
      )}
      <button
        className="btn-soft"
        onClick={() =>
          run(
            () => apiClient.patch(`/api/admin/users/${row.id}/${row.status === 'blocked' ? 'unblock' : 'block'}`),
            row.status === 'blocked' ? 'حساب رفع مسدود شد.' : 'حساب مسدود شد.',
            row.status === 'blocked' ? 'unblock' : 'block',
            row.id,
          )
        }
      >
        {row.status === 'blocked' ? 'رفع مسدودی' : 'مسدود'}
      </button>
      <button className="btn-soft text-rose-600" onClick={() => run(() => apiClient.delete(`/api/admin/users/${row.id}`), 'حساب حذف شد.', 'delete', row.id)}>
        حذف
      </button>
    </div>
  );

  return (
    <section className="page">
      <div>
        <h1 className="text-3xl font-black">کاربران و فروشندگان</h1>
        <p className="text-slate-500">کاربران عادی و فروشندگان جدا مدیریت می شوند؛ اطلاعات حساب، کد ملی، کیف پول و وضعیت حساب قابل ویرایش است.</p>
      </div>

      {notice && <div className="card border-emerald-200 bg-emerald-50 text-sm font-bold text-emerald-700">{notice}</div>}

      <div className="card flex flex-wrap gap-2">
        <button className={tab === 'User' ? 'btn-primary' : 'btn-soft'} onClick={() => { setTab('User'); setPage(1); }}>کاربران عادی</button>
        <button className={tab === 'Seller' ? 'btn-primary' : 'btn-soft'} onClick={() => { setTab('Seller'); setPage(1); }}>فروشندگان</button>
      </div>

      {tab === 'Seller' ? (
        <>
          <DataTable
            rows={sellerRows}
            columns={[
              { key: 'fullname', label: 'نام' },
              { key: 'store_name', label: 'نام فروشگاه' },
              { key: 'mobile', label: 'موبایل' },
              { key: 'national_code', label: 'کد ملی' },
              { key: 'verify_text', label: 'هویت' },
              { key: 'status_text', label: 'وضعیت' },
            ]}
            renderActions={(row) => accountActions(row, true)}
          />
          <AdminPagination pagination={pagination} onPageChange={setPage} />
        </>
        ) : (
        <>
          <DataTable
            rows={customerRows}
            columns={[
              { key: 'fullname', label: 'نام' },
              { key: 'username', label: 'نام کاربری' },
              { key: 'mobile', label: 'موبایل' },
              { key: 'national_code', label: 'کد ملی' },
              { key: 'wallet_balance', label: 'موجودی', render: (row) => formatMoney(row.wallet_balance || 0) },
              { key: 'status_text', label: 'وضعیت' },
            ]}
            renderActions={(row) => accountActions(row)}
          />
          <AdminPagination pagination={pagination} onPageChange={setPage} />
        </>
        )}

      {edit && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
          <div className="glass max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-3xl p-6">
            <h3 className="text-xl font-black">ویرایش اطلاعات حساب</h3>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <input className="input" value={edit.fullname || ''} onChange={(event) => setEdit({ ...edit, fullname: event.target.value })} placeholder="نام کامل" />
              <input className="input" value={edit.username || ''} onChange={(event) => setEdit({ ...edit, username: event.target.value })} placeholder="نام کاربری" />
              <input className="input" value={edit.email || ''} onChange={(event) => setEdit({ ...edit, email: event.target.value })} placeholder="ایمیل" />
              <input className="input" value={edit.mobile || ''} onChange={(event) => setEdit({ ...edit, mobile: event.target.value })} placeholder="شماره موبایل" />
              <input className="input" value={edit.national_code || ''} onChange={(event) => setEdit({ ...edit, national_code: event.target.value })} placeholder="کد ملی" />
              <input className="input" value={edit.wallet_balance || ''} onChange={(event) => setEdit({ ...edit, wallet_balance: formatNumberInput(event.target.value) })} placeholder="موجودی کیف پول" />
              {edit.role === 'Seller' && (
                <input className="input md:col-span-2" value={edit.store_name || ''} onChange={(event) => setEdit({ ...edit, store_name: event.target.value })} placeholder="نام فروشگاه" />
              )}
              <input className="input md:col-span-2" value={edit.password || ''} onChange={(event) => setEdit({ ...edit, password: event.target.value })} placeholder="رمز عبور جدید (اختیاری)" />
            </div>
            <div className="mt-5 flex gap-3">
              <button className="btn-primary" onClick={saveEdit}>ذخیره تغییرات</button>
              <button className="btn-soft" onClick={() => setEdit(null)}>انصراف</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
