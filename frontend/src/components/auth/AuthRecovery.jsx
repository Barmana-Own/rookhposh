import { useAuth } from '../../contexts/AuthContext.jsx';
export default function AuthRecovery({ embedded = false }) {
  const { status, error, retryAuth, logout, retryScheduled } = useAuth();
  const checking = status === 'checking';
  const forbidden = error?.kind === 'forbidden';
  return <section dir="rtl" className={embedded ? 'card mb-4 space-y-4 text-center' : 'grid min-h-screen place-content-center gap-4 bg-[#eef2ff] p-6 text-center text-slate-950 dark:bg-slate-950 dark:text-white'}>
    <h1 className="text-xl font-black">{checking ? 'در حال بررسی ورود...' : forbidden ? 'دسترسی این حساب نیاز به بررسی دارد' : 'ارتباط با سرور موقتاً در دسترس نیست'}</h1>
    {!checking && <p role="status" className="text-sm leading-7 text-slate-500">نشست شما حفظ شده است. تا تأیید دوباره، اطلاعات محافظت‌شده نمایش داده نمی‌شود.{retryScheduled ? ' بررسی خودکار دوباره انجام می‌شود.' : ''}</p>}
    <div className="flex flex-wrap justify-center gap-3"><button className="btn-primary" disabled={checking} onClick={() => void retryAuth()}>تلاش مجدد</button><button className="btn-soft" onClick={logout}>خروج از حساب</button></div>
  </section>;
}
