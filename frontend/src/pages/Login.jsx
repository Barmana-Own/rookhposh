import { ArrowRight, Phone, ShieldCheck, Store } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

const home = { Admin: '/admin', Seller: '/seller/dashboard', User: '/user' };

function nextPathFor(user, fallback = null) {
  if (user.role === 'Seller' && String(user.seller_verification_status || '').toLowerCase() !== 'approved') return '/seller/status';
  const allowedFallback = user.role === 'Admin'
    ? fallback?.startsWith('/admin')
    : user.role === 'Seller'
      ? fallback?.startsWith('/seller')
      : fallback?.startsWith('/user');
  if (allowedFallback) return fallback;
  return home[user.role] || '/user';
}

export default function Login() {
  const { user, requestOtp, verifyOtp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = useMemo(() => searchParams.get('next') || null, [searchParams]);
  const storeSlug = useMemo(() => searchParams.get('store') || '', [searchParams]);
  const [step, setStep] = useState('mobile');
  const [mobile, setMobile] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to={nextPathFor(user, next)} replace />;

  const sendCode = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await requestOtp({ mobile, role: 'User', store_slug: storeSlug });
      setDevCode(result.dev_code || '');
      setStep('code');
    } catch (requestError) {
      setError(requestError.message || 'ارسال کد انجام نشد.');
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const loggedInUser = await verifyOtp({ mobile, code, role: 'User', store_slug: storeSlug });
      navigate(nextPathFor(loggedInUser, next), { replace: true });
    } catch (requestError) {
      setError(requestError.message || 'کد تایید معتبر نیست.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main dir="rtl" className="grid min-h-[100dvh] w-full place-items-center bg-[#eef2ff] px-3 py-5 text-slate-950 sm:p-6">
      <form onSubmit={step === 'mobile' ? sendCode : submitCode} className="glass w-full max-w-xl rounded-[1.75rem] p-5 shadow-2xl shadow-indigo-500/15 sm:rounded-[2rem] sm:p-8">
        <div className="mb-6 text-center sm:mb-8">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-[1.5rem] bg-gradient-to-br from-indigo-500 to-cyan-400 text-white shadow-lg shadow-indigo-500/25 sm:h-20 sm:w-20 sm:rounded-[2rem]">
            <Store size={30} />
          </div>
          <h1 className="mt-4 text-3xl font-black sm:mt-5 sm:text-4xl">ورود به حساب</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-slate-500">برای ورود یا ثبت‌نام فقط شماره موبایل را وارد کنید و کد ۶ رقمی را تایید کنید.</p>
        </div>

        {error ? <div className="mb-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">{error}</div> : null}
        {devCode ? <div className="mb-4 rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-sm font-bold text-cyan-700">کد تست: {devCode}</div> : null}

        {step === 'mobile' ? (
          <label className="block space-y-2">
            <span className="text-sm font-black">شماره موبایل</span>
            <div className="input flex items-center gap-3 rounded-2xl px-4 py-3">
              <Phone size={18} className="text-slate-400" />
              <input className="min-w-0 w-full bg-transparent text-base outline-none" value={mobile} onChange={(event) => setMobile(event.target.value)} placeholder="09120000000" inputMode="tel" autoComplete="tel" />
            </div>
          </label>
        ) : (
          <label className="block space-y-2">
            <span className="text-sm font-black">کد تایید ۶ رقمی</span>
            <div className="input flex items-center gap-3 rounded-2xl px-4 py-3">
              <ShieldCheck size={18} className="text-slate-400" />
              <input className="min-w-0 w-full bg-transparent text-center text-base tracking-[0.35em] outline-none sm:tracking-[0.5em]" value={code} onChange={(event) => setCode(event.target.value)} placeholder="------" inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
            </div>
          </label>
        )}

        <button className="btn-primary mt-6 w-full justify-center py-3 text-base" disabled={loading}>
          {loading ? 'در حال بررسی...' : step === 'mobile' ? 'ارسال کد تایید' : 'ورود / ثبت‌نام'}
        </button>

        <a href="/seller" className="mt-5 flex items-center justify-center gap-2 text-sm font-bold text-indigo-600">
          <ArrowRight size={16} />
          ورود و ثبت‌نام فروشنده
        </a>
      </form>
    </main>
  );
}
