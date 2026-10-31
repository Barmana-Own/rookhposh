import { Building2, IdCard, Phone, ShieldCheck, Store } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { postLoginPath } from '../utils/authNavigation.js';
import { otpCountdown, otpDeadline } from '../utils/otpCountdown.js';

export default function SellerAuth() {
  const { user, loading: authLoading, requestOtp, verifyOtp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next');
  const [step, setStep] = useState('mobile');
  const [requiresIdentity, setRequiresIdentity] = useState(true);
  const [form, setForm] = useState({ mobile: '', code: '', fullname: '', store_name: '', national_code: '' });
  const [deadline, setDeadline] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const countdown = otpCountdown(deadline, now);

  useEffect(() => {
    if (deadline === null) return undefined;
    function updateClock() {
      const currentTime = Date.now();
      setNow(currentTime);
      if (currentTime >= deadline) clearInterval(timer);
    }
    const timer = setInterval(updateClock, 1000);
    document.addEventListener('visibilitychange', updateClock);
    window.addEventListener('focus', updateClock);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', updateClock);
      window.removeEventListener('focus', updateClock);
    };
  }, [deadline]);

  if (authLoading) {
    return <main dir="rtl" className="grid min-h-screen place-items-center bg-[#eef2ff] p-4 font-bold text-slate-700">در حال بررسی حساب فروشگاه...</main>;
  }

  if (user?.role === 'Seller' || user?.role === 'Admin') {
    return <Navigate to={postLoginPath(user, next)} replace />;
  }

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const sendCode = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await requestOtp({ mobile: form.mobile, role: 'Seller' });
      if (result.delivery !== 'sms') throw new Error('پاسخ ارسال پیامک معتبر نیست.');
      const sentAt = Date.now();
      setDeadline(otpDeadline(result.expires_in, result.resend_after, sentAt));
      setNow(sentAt);
      setField('code', '');
      const identityRequired = result.requires_identity !== false;
      setRequiresIdentity(identityRequired);
      setStep(identityRequired ? 'identity' : 'code');
    } catch (requestError) {
      setError(requestError.message || 'ارسال کد انجام نشد.');
    } finally {
      setLoading(false);
    }
  };

  const verify = async (event) => {
    event.preventDefault();
    if (otpCountdown(deadline).canResend) {
      setError('زمان اعتبار کد تمام شده است. لطفاً کد جدید درخواست کنید.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const seller = await verifyOtp({ ...form, role: 'Seller' });
      navigate(postLoginPath(seller, next), { replace: true });
    } catch (requestError) {
      setError(requestError.message || 'ثبت‌نام فروشگاه انجام نشد.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main dir="rtl" className="grid min-h-screen place-items-center bg-[#eef2ff] p-4 text-slate-950">
      <form onSubmit={step === 'mobile' ? sendCode : verify} className="glass w-full max-w-2xl rounded-[2rem] p-5 shadow-2xl shadow-indigo-500/15 sm:p-8">
        <div className="mb-8 text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-[2rem] bg-gradient-to-br from-indigo-500 to-cyan-400 text-white">
            <Store size={34} />
          </div>
          <h1 className="mt-5 text-3xl font-black sm:text-4xl">ورود فروشگاه</h1>
          <p className="mt-3 text-sm leading-7 text-slate-500">ابتدا شماره موبایل را تایید کنید، سپس فرم احراز هویت فروشگاه برای بررسی ادمین ثبت می‌شود.</p>
        </div>

        {error ? <div role="alert" className="mb-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">{error}</div> : null}
        {step !== 'mobile' ? <div role="status" className="mb-4 rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-sm font-bold text-cyan-700">کد برای شما پیامک شد.</div> : null}
        {step !== 'mobile' ? <p className="mb-4 text-center text-sm font-bold text-slate-600">
          {countdown.canResend ? 'زمان اعتبار کد تمام شد؛ اگر پیامک را دریافت نکرده‌اید، کد جدید درخواست کنید.' : <>زمان باقی‌ماندهٔ اعتبار کد: <bdi role="timer" aria-live="off" className="tabular-nums">{countdown.label}</bdi></>}
        </p> : null}

        <div className="grid gap-4">
          <label className="block space-y-2">
            <span className="text-sm font-black">شماره موبایل</span>
            <div className="input flex items-center gap-3 rounded-2xl px-4 py-3">
              <Phone size={18} className="text-slate-400" />
              <input className="w-full bg-transparent outline-none" value={form.mobile} onChange={(event) => setField('mobile', event.target.value)} placeholder="09120000000" inputMode="tel" autoComplete="tel" maxLength={32} required disabled={step !== 'mobile' || loading} />
            </div>
          </label>

        {step !== 'mobile' ? (
          <>
              <label className="block space-y-2">
                <span className="text-sm font-black">کد تایید</span>
                <div className="input flex items-center gap-3 rounded-2xl px-4 py-3">
                  <ShieldCheck size={18} className="text-slate-400" />
                  <input className="w-full bg-transparent text-center tracking-[0.5em] outline-none" value={form.code} onChange={(event) => setField('code', event.target.value)} placeholder="------" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9۰-۹٠-٩]{6}" maxLength={6} required disabled={loading} />
                </div>
              </label>
              {requiresIdentity ? <label className="block space-y-2">
                <span className="text-sm font-black">نام و نام خانوادگی</span>
                <div className="input flex items-center gap-3 rounded-2xl px-4 py-3">
                  <IdCard size={18} className="text-slate-400" />
                  <input className="w-full bg-transparent outline-none" value={form.fullname} onChange={(event) => setField('fullname', event.target.value)} placeholder="نام فروشگاه" maxLength={160} disabled={loading} />
                </div>
              </label> : null}
              {requiresIdentity ? <label className="block space-y-2">
                <span className="text-sm font-black">نام فروشگاه</span>
                <div className="input flex items-center gap-3 rounded-2xl px-4 py-3">
                  <Building2 size={18} className="text-slate-400" />
                  <input className="w-full bg-transparent outline-none" value={form.store_name} onChange={(event) => setField('store_name', event.target.value)} placeholder="نام فروشگاه" maxLength={160} disabled={loading} />
                </div>
              </label> : null}
              {requiresIdentity ? <label className="block space-y-2">
                <span className="text-sm font-black">کد ملی</span>
                <div className="input flex items-center gap-3 rounded-2xl px-4 py-3">
                  <IdCard size={18} className="text-slate-400" />
                  <input className="w-full bg-transparent outline-none" value={form.national_code} onChange={(event) => setField('national_code', event.target.value)} placeholder="0012345678" inputMode="numeric" pattern="[0-9۰-۹٠-٩]{10}" maxLength={10} disabled={loading} />
                </div>
              </label> : null}
            </>
          ) : null}
        </div>

        <button className="btn-primary mt-6 w-full justify-center py-3 text-base" disabled={loading || (step !== 'mobile' && countdown.canResend)}>
          {loading ? 'در حال بررسی...' : step === 'mobile' ? 'ارسال کد تایید' : requiresIdentity ? 'ثبت احراز هویت فروشگاه' : 'ورود به پنل فروشگاه'}
        </button>

        {step !== 'mobile' ? <div className="mt-4 flex flex-wrap justify-between gap-3 text-sm font-bold text-indigo-700">
          {countdown.canResend ? <button type="button" onClick={sendCode} disabled={loading} className="disabled:opacity-50">
            {loading ? 'در حال ارسال...' : 'ارسال مجدد کد'}
          </button> : null}
          <button type="button" disabled={loading} onClick={() => {
            setStep('mobile');
            setField('code', '');
            setError('');
            setDeadline(null);
          }}>تغییر شماره موبایل</button>
        </div> : null}

      </form>
    </main>
  );
}
