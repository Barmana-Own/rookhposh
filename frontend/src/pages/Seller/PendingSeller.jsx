import { Clock3, LogOut, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';

export default function PendingSeller() {
  const { user, logout, refreshUser } = useAuth();

  useEffect(() => {
    if (user?.role !== 'Seller' || String(user.seller_verification_status || '').toLowerCase() === 'approved') return undefined;
    let active = true;
    const refresh = () => {
      if (active) refreshUser().catch(() => {});
    };
    const interval = window.setInterval(refresh, 5000);
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
    // refreshUser is intentionally omitted: AuthContext recreates it when the user changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, user?.seller_verification_status]);

  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'Seller') return <Navigate to={user.role === 'Admin' ? '/admin' : '/user'} replace />;
  if (String(user.seller_verification_status || '').toLowerCase() === 'approved') return <Navigate to="/seller/dashboard" replace />;

  const rejected = String(user.seller_verification_status || '').toLowerCase() === 'rejected';

  return (
    <main dir="rtl" className="grid min-h-screen place-items-center bg-[#eef2ff] p-4 text-slate-900">
      <section className="glass w-full max-w-xl rounded-[2rem] p-8 text-center">
        <div className={`mx-auto grid h-20 w-20 place-items-center rounded-[2rem] ${rejected ? 'bg-rose-500/10 text-rose-600' : 'bg-indigo-500/10 text-indigo-600'}`}>
          {rejected ? <ShieldAlert size={38} /> : <Clock3 size={38} />}
        </div>
        <h1 className="mt-6 text-3xl font-black">{rejected ? 'درخواست فروشگاه رد شده است' : 'حساب فروشگاه شما در حال بررسی است'}</h1>
        <p className="mt-4 leading-8 text-slate-500">
          {rejected
            ? 'نتیجه بررسی توسط ادمین ثبت شده است. بعد از اصلاح اطلاعات می‌توانید دوباره با حساب جدید یا اطلاعات کامل‌تر اقدام کنید.'
            : 'تا وقتی احراز هویت فروشگاه توسط ادمین تایید نشده، دسترسی به پنل فروشگاه فعال نمی‌شود. بعد از مشخص شدن نتیجه، از طریق اعلان‌ها مطلع می‌شوید.'}
        </p>

        {rejected && user.seller_reject_reason && (
          <div className="mt-6 rounded-3xl bg-rose-50 p-4 text-right text-sm font-bold text-rose-700">
            علت رد: {user.seller_reject_reason}
          </div>
        )}

        {!rejected && (
          <div className="mt-6 rounded-3xl bg-indigo-50 p-4 text-right text-sm font-bold text-indigo-700">
            وضعیت فعلی: در انتظار تایید ادمین
          </div>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button className="btn-primary" onClick={() => window.location.reload()}>
            <ShieldCheck size={18} />
            بررسی مجدد وضعیت
          </button>
          <button className="btn-soft" onClick={logout}>
            <LogOut size={18} />
            خروج از حساب
          </button>
        </div>
      </section>
    </main>
  );
}
