import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import ErrorBoundary from '../ui/ErrorBoundary.jsx';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import AuthRecovery from '../auth/AuthRecovery.jsx';
import { accountHome } from '../../utils/authNavigation.js';

const titles = {
  '/admin': 'داشبورد مدیریت',
  '/admin/products': 'بررسی محصولات',
  '/admin/tryon': 'پرو آنلاین',
  '/admin/settings/tryon': 'تنظیمات هوش مصنوعی پرو مجازی',
  '/admin/users': 'کاربران و فروشگاه‌ها',
  '/admin/packages': 'مدیریت پکیج‌ها',
  '/admin/financial': 'گزارش مالی',
  '/admin/support': 'تیکت‌های پشتیبانی',
  '/seller/dashboard': 'داشبورد فروشگاه',
  '/seller/products': 'محصولات فروشگاه',
  '/seller/customers': 'مشتری‌ها',
  '/seller/transactions': 'تراکنش‌ها',
  '/seller/wallet': 'کیف پول فروشگاه',
  '/seller/packages': 'خرید پکیج',
  '/seller/tickets': 'تیکت سرویس',
  '/seller/store': 'صفحه فروشگاه',
};

export default function AppLayout({ role }) {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const { user, status } = useAuth();
  const verifying = status === 'checking' || status === 'temporarilyUnavailable';
  const location = useLocation();
  const crumb = titles[location.pathname] || 'داشبورد';

  if (!user && verifying) return <AuthRecovery />;

  if (!user) {
    const loginPath = role === 'Admin' ? '/admin/v2/login' : '/seller';
    return <Navigate to={`${loginPath}?next=${encodeURIComponent(location.pathname)}`} replace />;
  }
  if (role && user.role !== role) {
    return <Navigate to={accountHome(user)} replace />;
  }
  if (user.role === 'Seller' && String(user.seller_verification_status || '').toLowerCase() !== 'approved') {
    return <Navigate to="/seller/status" replace />;
  }

  return (
    <div
      key={user.id}
      dir="rtl"
      className="min-h-screen bg-[#eef2ff] bg-[radial-gradient(circle_at_top_left,_rgba(99,91,255,.18),transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(34,211,238,.16),transparent_35%)] p-3 text-slate-900 dark:bg-slate-950 dark:text-slate-100"
    >
      {verifying && <AuthRecovery embedded />}
      <div hidden={verifying} inert={verifying ? true : undefined}>
      <Sidebar open={isSidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Topbar onMenuClick={() => setSidebarOpen(true)} />
      <main className="lg:mr-72">
        <div className="mx-auto max-w-7xl px-2 pb-10">
          <div className="mb-6 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            مارکت‌پلیس <ChevronLeft size={16} /> {crumb}
          </div>
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
      </div>
    </div>
  );
}
