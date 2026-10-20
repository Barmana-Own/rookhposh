import { useState } from 'react';
import PaymentModal from '../../../components/payments/PaymentModal.jsx';
import SellerModal from '../../../components/seller/SellerModal.jsx';
import SellerPageHeader from '../../../components/seller/SellerPageHeader';
import SellerTable from '../../../components/seller/SellerTable.jsx';
import SellerToast from '../../../components/seller/SellerToast.jsx';
import { useAsyncResource } from '../../../hooks/useAsyncResource';
import { sellerApi } from '../../../services/seller/sellerApi';
import { redirectToGateway } from '../../../utils/payment.js';
import { formatMoney, formatNumberInput, moneyInWords, onlyDigits } from '../../../utils/formatters';

export default function SellerWallet() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, loading, error } = useAsyncResource(() => sellerApi.getWallet(), [refreshKey]);
  const [modal, setModal] = useState(false);
  const [amount, setAmount] = useState('1,000,000');
  const [payment, setPayment] = useState({ open: false, result: null, error: '' });
  const [toast, setToast] = useState('');
  const numericAmount = Number(onlyDigits(amount) || 0);

  const notify = (message) => {
    setToast(message);
    setTimeout(() => setToast(''), 2400);
  };

  const submitPayment = async (payload) => {
    try {
      const result = await sellerApi.chargeWallet(numericAmount, payload);
      if (redirectToGateway(result)) return;
      setPayment({ open: true, result: { ...result, amount: numericAmount }, error: '' });
      setRefreshKey((key) => key + 1);
      notify(result.status === 'pending' ? 'درخواست شارژ کیف پول ثبت شد.' : 'کیف پول فروشگاه شارژ شد.');
    } catch (requestError) {
      setPayment((current) => ({ ...current, error: requestError.message || 'پرداخت انجام نشد.' }));
    }
  };

  return (
    <section className="page">
      <SellerPageHeader
        title="کیف پول فروشگاه"
        description="شارژ حساب، مشاهده موجودی و تاریخچه پرداخت‌های فروشگاه."
        action={<button className="btn-primary" onClick={() => setModal(true)}>شارژ کیف پول</button>}
      />

      <div className="card">
        <div className="text-sm font-bold text-slate-500">موجودی فعلی</div>
        <div className="mt-2 text-3xl font-black text-indigo-600">{data?.balance || '—'}</div>
      </div>

      <SellerTable
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

      <SellerModal open={modal} title="شارژ کیف پول فروشگاه" onClose={() => setModal(false)}>
        <div className="grid gap-3">
          <input className="input" value={amount} onChange={(event) => setAmount(formatNumberInput(event.target.value))} placeholder="مبلغ شارژ" inputMode="numeric" />
          <div className="text-xs font-bold text-slate-500">
            {numericAmount ? `${formatMoney(numericAmount)} - ${moneyInWords(numericAmount)}` : 'مبلغ را به تومان وارد کنید.'}
          </div>
          <button
            className="btn-primary"
            onClick={() => {
              setModal(false);
              setPayment({ open: true, result: null, error: '' });
            }}
          >
            ادامه پرداخت
          </button>
        </div>
      </SellerModal>

      <PaymentModal
        open={payment.open}
        allowWallet={false}
        amount={numericAmount}
        title="جزئیات پرداخت شارژ کیف پول"
        description="روش پرداخت فروشگاه را انتخاب کنید و رسید را دریافت کنید."
        bankInfo={data?.bankInfo}
        result={payment.result}
        error={payment.error}
        onSubmit={submitPayment}
        onClose={() => setPayment({ open: false, result: null, error: '' })}
      />

      <SellerToast message={toast} />
    </section>
  );
}
