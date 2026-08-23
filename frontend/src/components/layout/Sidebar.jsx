import {
  BarChart3,
  Boxes,
  CreditCard,
  Headphones,
  IdCard,
  LayoutDashboard,
  LogOut,
  PackagePlus,
  QrCode,
  ShoppingBag,
  Sparkles,
  Store,
  UserCircle,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';

const menuByRole = {
  Admin: {
    section: 'ادمین',
    items: [
      ['/admin', 'داشبورد مدیریت', LayoutDashboard],
      ['/admin/products', 'محصولات', Boxes],
      ['/admin/users', 'کاربران', Users],
      ['/admin/packages', 'پکیج‌ها', ShoppingBag],
      ['/admin/financial', 'گزارش مالی', Wallet],
      ['/admin/support', 'پشتیبانی', Headphones],
    ],
  },
  Seller: {
    section: 'فروشنده',
    items: [
      ['/seller/dashboard', 'داشبورد فروشنده', Store],
      ['/seller/products', 'محصولات', PackagePlus],
      ['/seller/customers', 'مشتری‌ها', Users],
      ['/seller/transactions', 'تراکنش‌ها', CreditCard],
      ['/seller/wallet', 'کیف پول', Wallet],
      ['/seller/packages', 'خرید پکیج', ShoppingBag],
      ['/seller/tickets', 'تیکت‌های سرویس', Headphones],
      ['/seller/store/profile', 'پروفایل فروشگاه', IdCard],
      ['/seller/store', 'صفحه فروشگاه', QrCode],
    ],
  },
  User: {
    section: 'کاربر',
    items: [
      ['/user', 'داشبورد کاربر', UserCircle],
      ['/user/wallet', 'کیف پول', Wallet],
      ['/user/packages', 'خرید پکیج', ShoppingBag],
      ['/user/services', 'سرویس‌ها و محصولات', Sparkles],
      ['/user/transactions', 'تراکنش‌ها', CreditCard],
      ['/user/tickets', 'تیکت‌های پشتیبانی', Headphones],
      ['/user/profile', 'پروفایل', UserCircle],
    ],
  },
};

function NavItem({ item, onClick }) {
  const [to, label, Icon] = item;

  return (
    <NavLink
      to={to}
      end={to === '/admin' || to === '/seller/dashboard' || to === '/user' || to === '/seller/store'}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition ${
          isActive
            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
            : 'text-slate-500 hover:bg-white/80 dark:text-slate-400 dark:hover:bg-slate-800'
        }`
      }
    >
      <Icon size={18} />
      <span className="flex-1 text-right">{label}</span>
    </NavLink>
  );
}

function SidebarContent({ onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const menu = menuByRole[user?.role || 'User'] || menuByRole.User;
  const exit = () => {
    logout();
    onClose?.();
    navigate('/login', { replace: true });
  };

  return (
    <div className="glass h-full overflow-y-auto rounded-[2rem] p-4">
      <div className="mb-6 flex items-center justify-between gap-3 px-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-white">
            <BarChart3 />
          </div>
          <div>
            <b>رخ‌پوش</b>
            <p className="text-xs text-slate-500 dark:text-slate-400">مرکز مارکت‌پلیس</p>
          </div>
        </div>
        <button className="btn-soft h-10 w-10 p-0 lg:hidden" onClick={onClose} aria-label="بستن منو">
          <X size={18} />
        </button>
      </div>

      <nav>
        <p className="mb-2 px-4 text-xs font-black text-slate-400">{menu.section}</p>
        <div className="space-y-2">{menu.items.map((item) => <NavItem key={item[0]} item={item} onClick={onClose} />)}</div>
      </nav>

      <button className="mt-6 flex w-full items-center justify-between gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-black text-rose-600 transition hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300" onClick={exit}>
        <LogOut size={18} />
        <span className="flex-1 text-right">خروج از حساب</span>
      </button>
    </div>
  );
}

export default function Sidebar({ open, onClose }) {
  return (
    <>
      <aside className="fixed inset-y-0 right-0 z-30 hidden w-72 p-4 lg:block">
        <SidebarContent />
      </aside>
      <div
        className={`fixed inset-0 z-40 bg-slate-950/45 transition lg:hidden ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
      />
      <aside className={`fixed inset-y-0 right-0 z-50 w-72 p-3 transition duration-300 lg:hidden ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <SidebarContent onClose={onClose} />
      </aside>
    </>
  );
}
