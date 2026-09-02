import { Bell, LogOut, Menu, Moon, Search, Sun, UserCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useTheme } from '../../contexts/ThemeContext.jsx';
import apiClient from '../../services/apiClient.js';
import { sellerApi } from '../../services/seller/sellerApi.js';
import { userApi } from '../../services/user/userApi.js';
import { toPersianMessage } from '../../utils/errorMessages.js';

const roleRoutes = {
  Admin: { search: '/admin/products', profile: '/admin/users' },
  Seller: { search: '/seller/products', profile: '/seller/store' },
  User: { search: '/user/services', profile: '/user/profile' },
};

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('fa-IR', { dateStyle: 'short', timeStyle: 'short' });
}

async function loadNotifications(role) {
  const normalize = (item) => ({
    ...item,
    title: toPersianMessage(item.title, 'اعلان جدید'),
    body: toPersianMessage(item.body, 'اعلان جدیدی برای نمایش وجود دارد.'),
    unread: !item.is_read,
  });
  if (role === 'Admin') {
    const response = await apiClient.get('/api/admin/notifications');
    return response.data.data.map(normalize);
  }
  if (role === 'Seller') return (await sellerApi.getNotifications()).map(normalize);
  return (await userApi.getNotifications()).map(normalize);
}

async function readNotifications(role) {
  if (role === 'Admin') return apiClient.post('/api/admin/notifications/read');
  if (role === 'Seller') return sellerApi.readNotifications();
  return userApi.readNotifications();
}

export default function Topbar({ onMenuClick }) {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const profileRef = useRef(null);
  const notificationsRef = useRef(null);
  const [query, setQuery] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const routes = roleRoutes[user?.role] || roleRoutes.User;

  useEffect(() => {
    const close = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) setProfileOpen(false);
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) setNotificationsOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    if (!user?.role) return;
    let active = true;
    const refresh = () => {
      loadNotifications(user.role)
        .then((items) => {
          if (active) setNotifications(items);
        })
        .catch(() => {
          if (active) setNotifications([]);
        });
    };
    refresh();
    const refreshWhenVisible = () => {
      if (!document.hidden) refresh();
    };
    const interval = window.setInterval(() => {
      if (!document.hidden) refresh();
    }, 15000);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [user?.role]);

  const submitSearch = (event) => {
    if (event.key !== 'Enter' || !query.trim()) return;
    navigate(`${routes.search}?q=${encodeURIComponent(query.trim())}`);
  };

  const unreadCount = notifications.filter((item) => item.unread).length;

  const goProfile = () => {
    setProfileOpen(false);
    navigate(routes.profile);
  };

  const exit = () => {
    setProfileOpen(false);
    logout();
    navigate('/login', { replace: true });
  };

  const toggleNotifications = async () => {
    const next = !notificationsOpen;
    setNotificationsOpen(next);
    if (!next || !user?.role) return;
    try {
      const items = await loadNotifications(user.role);
      setNotifications(items);
      if (items.some((item) => item.unread)) {
        await readNotifications(user.role);
        setNotifications((current) => current.map((item) => ({ ...item, unread: false, is_read: 1 })));
      }
    } catch {
      setNotifications([]);
    }
  };

  return (
    <header className="sticky top-0 z-20 mb-6 rounded-b-3xl border border-white/60 bg-white/75 px-4 py-3 shadow-soft backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/75 lg:mr-72">
      <div className="flex items-center gap-3" dir="ltr">
        <div className="hidden min-w-0 flex-1 items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2 dark:bg-slate-800 md:flex" dir="rtl">
          <Search size={18} className="shrink-0 text-slate-400" />
          <input
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={submitSearch}
            placeholder="جستجو و رفتن به بخش مرتبط..."
          />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2" dir="ltr">
          <button className="order-1 btn-soft h-11 w-11 p-0 text-rose-600 sm:hidden" onClick={exit} aria-label="خروج از حساب" title="خروج از حساب">
            <LogOut size={18} />
          </button>

          <div className="relative order-3" ref={notificationsRef} dir="rtl">
            <button className="btn-soft relative h-11 w-11 p-0" onClick={toggleNotifications} aria-label="اعلان‌ها">
              <Bell size={18} />
              {unreadCount > 0 && <span className="absolute -left-1 -top-1 h-3 w-3 rounded-full bg-rose-500" />}
            </button>

            {notificationsOpen && (
              <div className="fixed inset-x-3 top-[4.75rem] z-[70] max-h-[calc(100dvh-6rem)] overflow-hidden rounded-3xl border border-white/60 bg-white/95 p-3 text-sm shadow-soft backdrop-blur-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-[min(28rem,calc(100dvh-6rem))] sm:w-[min(22rem,calc(100vw-1.5rem))] dark:border-white/10 dark:bg-slate-900/95">
                <div className="mb-3 flex items-center justify-between">
                  <b>اعلان‌ها</b>
                  <span className="text-xs font-bold text-slate-400">{notifications.length.toLocaleString('fa-IR')} مورد</span>
                </div>
                <div className="max-h-[min(23rem,calc(100dvh-10rem))] space-y-2 overflow-y-auto">
                  {notifications.length ? (
                    notifications.map((item) => (
                      <article key={item.id} className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/80">
                        <div className="flex items-center justify-between gap-3">
                          <span className="min-w-0 break-words font-black">{item.title}</span>
                          {item.unread && <span className="shrink-0 rounded-full bg-cyan-500/10 px-2 py-1 text-[10px] font-black text-cyan-600">جدید</span>}
                        </div>
                        <p className="mt-2 break-words leading-6 text-slate-500 dark:text-slate-300">{item.body}</p>
                        <p className="mt-2 text-xs text-slate-400">{formatDate(item.created_at)}</p>
                      </article>
                    ))
                  ) : (
                    <div className="rounded-2xl bg-slate-50 p-4 text-center text-slate-500 dark:bg-slate-800/80">اعلان جدیدی برای نمایش وجود ندارد.</div>
                  )}
                </div>
              </div>
            )}
          </div>

          <button className="order-2 btn-soft h-11 w-11 p-0" onClick={toggleTheme} aria-label="تغییر تم">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <div className="relative order-4 hidden sm:block sm:order-1" ref={profileRef} dir="rtl">
            <button className="btn-soft" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen}>
              <UserCircle size={18} /> {user?.fullname || user?.name || 'کاربر'}
            </button>
            {profileOpen && (
              <div className="absolute left-0 right-auto top-full mt-2 w-56 rounded-3xl border border-white/60 bg-white/95 p-2 text-sm shadow-soft backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/95">
                <button className="flex w-full items-center justify-between rounded-2xl px-4 py-3 font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800" onClick={goProfile}>
                  <span>مشاهده حساب</span>
                  <UserCircle size={17} />
                </button>
                <button className="flex w-full items-center justify-between rounded-2xl px-4 py-3 font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30" onClick={exit}>
                  <span>خروج از حساب</span>
                  <LogOut size={17} />
                </button>
              </div>
            )}
          </div>

          <button className="order-5 btn-soft h-11 w-11 p-0 lg:hidden" onClick={onMenuClick} aria-label="باز کردن منو">
            <Menu size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
