import { useState } from 'react';
import PaymentModal from '../../../components/payments/PaymentModal.jsx';
import UserConfirmDialog from '../../../components/user/UserConfirmDialog';
import UserMetricCard from '../../../components/user/UserMetricCard';
import UserModal from '../../../components/user/UserModal';
import UserPageHeader from '../../../components/user/UserPageHeader';
import UserTable from '../../../components/user/UserTable';
import UserToast from '../../../components/user/UserToast';
import { useUser } from '../../../contexts/UserContext';
import { useAsyncResource } from '../../../hooks/useAsyncResource';
import { userApi } from '../../../services/user/userApi';
import { redirectToGateway } from '../../../utils/payment.js';
import { formatMoney, formatNumberInput, moneyInWords, onlyDigits } from '../../../utils/formatters';

export default function UserWallet() {
  const { showToast } = useUser();
  const [refreshKey, setRefreshKey] = useState(0);
  const { loading, error, data } = useAsyncResource(() => userApi.getWallet(), [refreshKey]);
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [amount, setAmount] = useState('500,000');
  const [payment, setPayment] = useState({ open: false, result: null, error: '' });

  const numericAmount = Number(onlyDigits(amount) || 0);

  const openPayment = () => {
    setConfirm(false);
    setModal(false);
    setPayment({ open: true, result: null, error: '' });
  };

  const charge = async (payload) => {
    try {
      const result = await userApi.chargeWallet(numericAmount, payload);
      if (redirectToGateway(result)) return;
      setPayment({ open: true, result: { ...result, amount: numericAmount }, error: '' });
      setRefreshKey((key) => key + 1);
      showToast(result.status === 'pending' ? 'درخواست شارژ کیف پول ثبت شد.' : 'شارژ حساب با موفقیت ثبت شد.');
    } catch (requestError) {
      setPayment((current) => ({ ...current, error: requestError.message || 'پرداخت انجام نشد.' }));
    }
  };

  return (
    <section className="page">
      <UserPageHeader
        title="کیف پول"
        description="موجودی، شارژ حساب و تاریخچه عملیات کیف پول."
        action={<button className="btn-primary" onClick={() => setModal(true)}>شارژ حساب</button>}
      />

      <UserMetricCard label="موجودی فعلی" value={data?.balance || '—'} helper="قابل استفاده برای خرید پکیج و سرویس پرو" />

      <UserTable
        loading={loading}
        error={error}
        page={1}
        onPageChange={() => {}}
        rows={data?.history || []}
        columns={[
          { key: 'id', label: 'شناسه' },
          { key: 'amount', label: 'مبلغ' },
          { key: 'method', label: 'روش' },
          { key: 'date', label: 'تاریخ' },
          { key: 'status', label: 'وضعیت' },
        ]}
      />

      <UserModal open={modal} title="شارژ حساب" onClose={() => setModal(false)}>
        <div className="grid gap-3">
          <input
            className="input"
            value={amount}
            onChange={(event) => setAmount(formatNumberInput(event.target.value))}
            placeholder="مبلغ شارژ"
            inputMode="numeric"
          />
          <div className="text-xs font-bold text-slate-500">
            {numericAmount ? `${formatMoney(numericAmount)} - ${moneyInWords(numericAmount)}` : 'مبلغ را به تومان وارد کنید.'}
          </div>
          <button className="btn-primary" onClick={() => setConfirm(true)}>ادامه پرداخت</button>
        </div>
      </UserModal>

      <UserConfirmDialog
        open={confirm}
        title="تایید شارژ حساب"
        description={`مبلغ ${formatMoney(numericAmount)} برای شارژ کیف پول پرداخت شود؟`}
        onCancel={() => setConfirm(false)}
        onConfirm={openPayment}
      />

      <PaymentModal
        open={payment.open}
        allowWallet={false}
        amount={numericAmount}
        title="جزئیات پرداخت شارژ کیف پول"
        description="روش پرداخت را انتخاب کنید و بعد از ثبت، رسید دریافت کنید."
        bankInfo={data?.bankInfo}
        result={payment.result}
        error={payment.error}
        onSubmit={charge}
        onClose={() => setPayment({ open: false, result: null, error: '' })}
      />

      <UserToast />
    </section>
  );
}
