import { Building2, IdCard, Phone, ShieldCheck, Store } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function SellerAuth() {
  const { user, loading: authLoading, requestOtp, verifyOtp } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState('mobile');
  const [requiresIdentity, setRequiresIdentity] = useState(true);
  const [form, setForm] = useState({ mobile: '', code: '', fullname: '', store_name: '', national_code: '' });
  const [devCode, setDevCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (authLoading) {
    return <main dir="rtl" className="grid min-h-screen place-items-center bg-[#eef2ff] p-4 font-bold text-slate-700">در حال بررسی حساب فروشنده...</main>;
  }

  if (user?.role === 'Seller') {
    const approved = String(user.seller_verification_status || '').toLowerCase() === 'approved';
    return <Navigate to={approved ? '/seller/dashboard' : '/seller/status'} replace />;
  }

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const sendCode = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await requestOtp({ mobile: form.mobile, role: 'Seller' });
      setDevCode(result.dev_code || '');
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
    setError('');
    setLoading(true);
    try {
      const seller = await verifyOtp({ ...form, role: 'Seller' });
      const approved = String(seller.seller_verification_status || '').toLowerCase() === 'approved';
      navigate(approved ? '/seller/dashboard' : '/seller/status', { replace: true });
    } catch (requestError) {
      setError(requestError.message || 'ثبت‌نام فروشنده انجام نشد.');
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
          <h1 className="mt-5 text-3xl font-black sm:text-4xl">ورود فروشنده</h1>
          <p className="mt-3 text-sm leading-7 text-slate-500">ابتدا شماره موبایل را تایید کنید، سپس فرم احراز هویت فروشنده برای بررسی ادمین ثبت می‌شود.</p>
        </div>

        {error ? <div className="mb-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">{error}</div> : null}
        {devCode ? <div className="mb-4 rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-sm font-bold text-cyan-700">کد تست: {devCode}</div> : null}

        <div className="grid gap-4">
          <label className="block space-y-2">
            <span className="text-sm font-black">شماره موبایل</span>
            <div className="input flex items-center gap-3 rounded-2xl px-4 py-3">
              <Phone size={18} className="text-slate-400" />
              <input className="w-full bg-transparent outline-none" value={form.mobile} onChange={(event) => setField('mobile', event.target.value)} placeholder="09120000000" inputMode="tel" disabled={step !== 'mobile'} />
            </div>
          </label>

        {step !== 'mobile' ? (
          <>
              <label className="block space-y-2">
                <span className="text-sm font-black">کد تایید</span>
                <div className="input flex items-center gap-3 rounded-2xl px-4 py-3">
                  <ShieldCheck size={18} className="text-slate-400" />
                  <input className="w-full bg-transparent text-center tracking-[0.5em] outline-none" value={form.code} onChange={(event) => setField('code', event.target.value)} placeholder="------" inputMode="numeric" maxLength={6} />
                </div>
              </label>
              {requiresIdentity ? <label className="block space-y-2">
                <span className="text-sm font-black">نام و نام خانوادگی</span>
                <div className="input flex items-center gap-3 rounded-2xl px-4 py-3">
                  <IdCard size={18} className="text-slate-400" />
                  <input className="w-full bg-transparent outline-none" value={form.fullname} onChange={(event) => setField('fullname', event.target.value)} placeholder="نام فروشنده" />
                </div>
              </label> : null}
              {requiresIdentity ? <label className="block space-y-2">
                <span className="text-sm font-black">نام فروشگاه</span>
                <div className="input flex items-center gap-3 rounded-2xl px-4 py-3">
                  <Building2 size={18} className="text-slate-400" />
                  <input className="w-full bg-transparent outline-none" value={form.store_name} onChange={(event) => setField('store_name', event.target.value)} placeholder="نام فروشگاه" />
                </div>
              </label> : null}
              {requiresIdentity ? <label className="block space-y-2">
                <span className="text-sm font-black">کد ملی</span>
                <div className="input flex items-center gap-3 rounded-2xl px-4 py-3">
                  <IdCard size={18} className="text-slate-400" />
                  <input className="w-full bg-transparent outline-none" value={form.national_code} onChange={(event) => setField('national_code', event.target.value)} placeholder="0012345678" inputMode="numeric" />
                </div>
              </label> : null}
            </>
          ) : null}
        </div>

        <button className="btn-primary mt-6 w-full justify-center py-3 text-base" disabled={loading}>
          {loading ? 'در حال بررسی...' : step === 'mobile' ? 'ارسال کد تایید' : requiresIdentity ? 'ثبت احراز هویت فروشنده' : 'ورود به پنل فروشنده'}
        </button>

        <a href="/login" className="mt-5 block text-center text-sm font-bold text-indigo-600">ورود کاربران عادی</a>
      </form>
    </main>
  );
}
