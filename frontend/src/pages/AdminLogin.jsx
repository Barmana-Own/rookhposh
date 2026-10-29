import { Eye, EyeOff, LockKeyhole, ShieldCheck, Store, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function AdminLogin() {
  const { user, login, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user?.role === 'Admin') return <Navigate to="/admin" replace />;

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const loggedInUser = await login({ username, password });
      if (loggedInUser.role !== 'Admin') {
        logout();
        throw new Error('این حساب دسترسی ورود به پنل ادمین را ندارد.');
      }

      const requestedPath = new URLSearchParams(location.search).get('next');
      navigate(requestedPath?.startsWith('/admin') ? requestedPath : '/admin', { replace: true });
    } catch (requestError) {
      setError(requestError.message || 'ورود به پنل ادمین انجام نشد.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main dir="rtl" className="grid min-h-[100dvh] w-full place-items-center bg-[#eef2ff] px-4 py-6 text-slate-950 sm:px-6">
      <form onSubmit={submit} className="glass w-full max-w-lg rounded-[2rem] p-5 shadow-2xl shadow-indigo-500/15 sm:p-8">
        <div className="mb-7 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-[1.5rem] bg-gradient-to-br from-indigo-500 to-cyan-400 text-white shadow-lg shadow-indigo-500/25">
            <Store size={30} />
          </div>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white/70 px-3 py-1.5 text-xs font-black text-indigo-600">
            <ShieldCheck size={15} /> ورود امن مدیریت
          </div>
          <h1 className="mt-4 text-3xl font-black sm:text-4xl">ورود ادمین</h1>
          <p className="mt-3 text-sm leading-7 text-slate-500">برای ورود به پنل مدیریت، نام کاربری و رمز عبور را وارد کنید.</p>
        </div>

        {error ? <div className="mb-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">{error}</div> : null}

        <label className="block space-y-2">
          <span className="text-sm font-black">نام کاربری یا ایمیل</span>
          <div className="input flex items-center gap-3 rounded-2xl px-4 py-3">
            <UserRound size={18} className="text-slate-400" />
            <input
              className="min-w-0 w-full bg-transparent text-base outline-none"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="admin@example.com"
              autoComplete="username"
              required
            />
          </div>
        </label>

        <label className="mt-5 block space-y-2">
          <span className="text-sm font-black">رمز عبور</span>
          <div className="input flex items-center gap-3 rounded-2xl px-4 py-3">
            <LockKeyhole size={18} className="text-slate-400" />
            <input
              className="min-w-0 w-full bg-transparent text-base outline-none"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="رمز عبور"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="text-slate-400 transition hover:text-indigo-600"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? 'پنهان کردن رمز عبور' : 'نمایش رمز عبور'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>

        <button className="btn-primary mt-7 w-full justify-center py-3 text-base" disabled={loading}>
          {loading ? 'در حال ورود...' : 'ورود به پنل مدیریت'}
        </button>

        <a href="/seller" className="mt-5 block text-center text-sm font-bold text-indigo-600">
          ورود فروشندگان با شماره موبایل
        </a>
      </form>
    </main>
  );
}
