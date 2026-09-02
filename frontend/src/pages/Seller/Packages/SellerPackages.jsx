import { CheckCircleIcon, Coins, StarIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import PaymentModal from '../../../components/payments/PaymentModal.jsx';
import SellerPageHeader from '../../../components/seller/SellerPageHeader';
import SellerToast from '../../../components/seller/SellerToast';
import EmptyState from '../../../components/ui/EmptyState.jsx';
import { useAsyncResource } from '../../../hooks/useAsyncResource';
import { sellerApi } from '../../../services/seller/sellerApi';
import { formatMoney, formatNumberInput, moneyInWords, onlyDigits } from '../../../utils/formatters';

function SellerPricing({ plans, onSelect }) {
  return (
    <section className="rounded-[2rem] bg-white px-6 py-8 shadow-sm ring-1 ring-slate-200/80">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-black text-slate-950">پکیج‌های قابل رشد برای فروشگاه‌ها</h2>
        <p className="mt-3 text-sm leading-7 text-slate-500">
          پکیج‌های فعال فروشگاه‌ها با خدمات مشخص، قیمت شفاف و امکان پرداخت مرحله‌ای.
        </p>
      </div>
      <div className="mx-auto mt-8 grid max-w-5xl gap-4 md:grid-cols-3">
        {plans.map((plan, index) => (
          <article key={plan.id} className="relative flex min-h-[410px] flex-col rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-sm">
            {index === 1 ? (
              <span className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold">
                <StarIcon className="h-3 w-3 fill-current" />
                محبوب
              </span>
            ) : null}
            <div className="border-b border-slate-200 bg-slate-50/70 p-5">
              <h3 className="text-xl font-black">{plan.name}</h3>
              <p className="mt-1 text-sm text-slate-500">{Number(plan.duration_days || 0).toLocaleString('fa-IR')} روزه</p>
              <div className="mt-4 text-3xl font-black">{plan.price}</div>
            </div>
            <div className="flex flex-1 flex-col p-5">
              <ul className="space-y-4 text-sm text-slate-600">
                <li className="flex items-center gap-2"><CheckCircleIcon size={17} />درخواست پرو: {plan.proRequests.toLocaleString('fa-IR')}</li>
                <li className="flex items-center gap-2"><CheckCircleIcon size={17} />سقف ماهانه: {plan.monthlyLimit.toLocaleString('fa-IR')}</li>
                {(plan.features || []).map((feature) => (
                  <li key={feature} className="flex items-center gap-2"><CheckCircleIcon size={17} />{feature}</li>
                ))}
              </ul>
              <button className={index === 1 ? 'btn-primary mt-auto' : 'btn-soft mt-auto'} onClick={() => onSelect(plan)}>
                خرید / تمدید
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function SellerPackages() {
  const { data, loading, error } = useAsyncResource(() => sellerApi.getPackages());
  const [toast, setToast] = useState('');
  const [tokenQuantity, setTokenQuantity] = useState('10');
  const [payment, setPayment] = useState({ open: false, kind: '', item: null, amount: 0, result: null, error: '' });

  const tokenPrice = Number(data?.tokenPrice || 0);
  const packages = data?.items || [];
  const totalTokensPrice = useMemo(() => Number(onlyDigits(tokenQuantity) || 0) * tokenPrice, [tokenQuantity, tokenPrice]);

  const notify = (message) => {
    setToast(message);
    setTimeout(() => setToast(''), 2400);
  };

  const openPackagePayment = (plan) => setPayment({ open: true, kind: 'package', item: plan, amount: plan.rawPrice, result: null, error: '' });
  const openTokenPayment = () => setPayment({ open: true, kind: 'tokens', item: null, amount: totalTokensPrice, result: null, error: '' });

  const pay = async (payload) => {
    try {
      const result =
        payment.kind === 'package'
          ? await sellerApi.purchasePackage(payment.item.id, payload)
          : await sellerApi.purchaseTokens(Number(onlyDigits(tokenQuantity) || 0), payload);

      setPayment((current) => ({ ...current, result: { ...result, amount: current.amount }, error: '' }));
      notify(result.status === 'pending' ? 'درخواست پرداخت ثبت شد.' : 'خرید با موفقیت انجام شد.');
    } catch (requestError) {
      setPayment((current) => ({ ...current, error: requestError.message || 'پرداخت انجام نشد.' }));
    }
  };

  return (
    <section className="page">
      <SellerPageHeader title="خرید و تمدید پکیج" description="پکیج‌های فعال فروشگاه و خرید توکن را با کیف پول، واریز حساب یا درگاه مستقیم مدیریت کنید." />

      {error ? (
        <EmptyState title="دریافت پکیج‌ها انجام نشد" description={error.message || 'ارتباط با سرور برقرار نشد.'} />
      ) : !loading && packages.length === 0 ? (
        <EmptyState title="پکیج فعالی برای فروشگاه ثبت نشده" description="بعد از اینکه ادمین پکیج فروشگاه ایجاد و فعال کند، در این صفحه قابل خرید خواهد بود." />
      ) : (
        <SellerPricing plans={packages} onSelect={openPackagePayment} />
      )}

      <div className="card">
        <div className="mb-4 flex items-center gap-2">
          <Coins size={20} className="text-cyan-500" />
          <h2 className="text-xl font-black">خرید توکن</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-[0.8fr_1.2fr_auto]">
          <input className="input" value={tokenQuantity} onChange={(event) => setTokenQuantity(formatNumberInput(event.target.value))} placeholder="تعداد توکن" inputMode="numeric" />
          <div className="rounded-3xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm">
            <div className="font-bold text-slate-500">قیمت هر توکن: {formatMoney(tokenPrice)}</div>
            <div className="mt-2 text-lg font-black text-indigo-600">مبلغ نهایی: {formatMoney(totalTokensPrice)}</div>
            <div className="mt-1 text-xs font-bold text-slate-500">{moneyInWords(totalTokensPrice)}</div>
          </div>
          <button className="btn-primary" onClick={openTokenPayment}>ثبت خرید توکن</button>
        </div>
      </div>

      <PaymentModal
        open={payment.open}
        amount={payment.amount}
        title={payment.kind === 'tokens' ? 'پرداخت خرید توکن' : `پرداخت ${payment.item?.name || 'پکیج'}`}
        description="روش پرداخت را انتخاب کنید. در واریز حساب، رسید برای تایید ادمین ثبت می‌شود."
        result={payment.result}
        error={payment.error}
        bankInfo={data?.bankInfo}
        onSubmit={pay}
        onClose={() => setPayment({ open: false, kind: '', item: null, amount: 0, result: null, error: '' })}
      />

      <SellerToast message={toast} />
    </section>
  );
}
