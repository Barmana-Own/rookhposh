import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import apiClient from '../services/apiClient.js';
import { formatMoney } from '../utils/formatters.js';

export default function PaymentResult() {
  const { id } = useParams();
  const { user, loading: authLoading } = useAuth();
  return <PaymentStatus key={`${id}:${user?.id || ''}`} id={id} user={user} authLoading={authLoading} />;
}

function PaymentStatus({ id, user, authLoading }) {
  const [payment, setPayment] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const activeRequest = useRef(null);

  const check = async () => {
    if (activeRequest.current) return;
    if (!/^[a-f0-9]{32}$/.test(id || '')) {
      setError('شناسه پرداخت معتبر نیست.');
      return;
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(true);
    setError('');
    try {
      const options = { signal: controller.signal, timeout: 35000 };
      const response = await apiClient.post(`/api/payments/${id}/verify`, {}, options);
      if (!controller.signal.aborted) setPayment(response.data.data);
    } catch (requestError) {
      if (!controller.signal.aborted) setError(requestError.message || 'بررسی پرداخت انجام نشد.');
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        if (!controller.signal.aborted) setBusy(false);
      }
    }
  };

  useEffect(() => {
    if (authLoading || !user) return undefined;
    const controller = new AbortController();
    activeRequest.current = controller;
    const request = /^[a-f0-9]{32}$/.test(id || '')
      ? apiClient.get(`/api/payments/${id}`, { signal: controller.signal })
      : Promise.reject(new Error('شناسه پرداخت معتبر نیست.'));
    request.then((response) => {
      if (!controller.signal.aborted) setPayment(response.data.data);
    }).catch((requestError) => {
      if (!controller.signal.aborted) setError(requestError.message || 'بررسی پرداخت انجام نشد.');
    }).finally(() => {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        if (!controller.signal.aborted) setBusy(false);
      }
    });
    return () => {
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, [authLoading, user, id]);

  const success = payment?.status === 'success';
  const failed = payment?.status === 'failed';
  const title = success ? 'پرداخت با موفقیت تأیید شد' : failed ? 'پرداخت انجام نشد' : 'بررسی وضعیت پرداخت';

  return (
    <main dir="rtl" className="grid min-h-[100dvh] place-items-center bg-[#eef2ff] p-6 text-slate-950">
      <section className="card w-full max-w-lg space-y-5 text-center" aria-labelledby="payment-result-title" aria-busy={Boolean((busy && user) || authLoading)}>
        <h1 id="payment-result-title" className="text-2xl font-black">{title}</h1>
        <div role="status" className="space-y-3 leading-7">
          {authLoading || (busy && user) ? <p>در حال دریافت وضعیت از سرور...</p> : null}
          {!authLoading && !user ? <p>برای مشاهده نتیجه، به همان حسابی که پرداخت را آغاز کرده وارد شوید و این صفحه را دوباره باز کنید.</p> : null}
          {success ? <p>تراکنش ثبت و عملیات حساب تکمیل شد.</p> : payment?.status === 'pending' ? (
            <p>پرداخت هنوز نهایی نشده است. اگر پرداخت انجام داده‌اید، دکمه بررسی مجدد را بزنید. از پرداخت دوباره تا مشخص‌شدن نتیجه خودداری کنید.</p>
          ) : null}
          {payment ? <p>مبلغ: {formatMoney(payment.amount)}</p> : null}
          {payment ? <p>شناسه تراکنش: {payment.transaction_id}</p> : null}
          {payment?.reference ? <p>شماره مرجع بانک: {payment.reference}</p> : null}
        </div>
        {error ? <p role="alert" className="text-rose-600">{error}</p> : null}
        {user && !success && !failed ? (
          <button type="button" className="btn-primary w-full" disabled={busy || authLoading} onClick={check}>
            بررسی مجدد پرداخت
          </button>
        ) : null}
        <Link className="btn-soft w-full" to={payment?.return_path || (user?.role === 'Seller' ? '/seller/dashboard' : '/login')}>
          {user ? 'بازگشت به حساب' : 'ورود به حساب'}
        </Link>
      </section>
    </main>
  );
}
