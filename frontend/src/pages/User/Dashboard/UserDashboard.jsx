import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import UserMetricCard from '../../../components/user/UserMetricCard';
import UserPageHeader from '../../../components/user/UserPageHeader';
import UserTable from '../../../components/user/UserTable';
import SkeletonGrid from '../../../components/ui/Skeleton';
import { useAsyncResource } from '../../../hooks/useAsyncResource';
import { userApi } from '../../../services/user/userApi';
import { chartCurrencyTick, chartDateLabel, formatMoney } from '../../../utils/formatters';

const chartAxisProps = {
  orientation: 'left',
  width: 96,
  tickMargin: 12,
  tickLine: false,
};

export default function UserDashboard() {
  const { loading, error, data } = useAsyncResource(() => userApi.getDashboard());

  if (loading) return <SkeletonGrid />;

  if (error) {
    return (
      <section className="page">
        <UserPageHeader title="داشبورد کاربر" description="در دریافت اطلاعات داشبورد مشکلی پیش آمد." />
        <div className="card text-rose-600">{error.message || 'ارتباط با سرور برقرار نشد.'}</div>
      </section>
    );
  }

  const rows = data?.recentPurchases || [];
  const chartData = data?.charts?.length ? data.charts : [{ name: 'امروز', amount: 0, orders: 0 }];

  return (
    <section className="page">
      <UserPageHeader title="داشبورد کاربر" description="نمای سریع از کیف پول، خریدهای اخیر، سرویس‌های استفاده شده و تراکنش‌های حساب." />
      <div className="grid-auto">
        <UserMetricCard label="موجودی کیف پول" value={data?.walletBalance || '۰ تومان'} helper="آماده خرید و تمدید" />
        <UserMetricCard label="سرویس‌های استفاده شده" value={data?.usedServices || 0} helper="بر اساس دیتابیس" />
        <UserMetricCard label="تعداد تراکنش‌ها" value={data?.transactions || 0} helper="مالی و سرویس‌ها" />
        <UserMetricCard label="آخرین خریدها" value={rows.length} helper="خریدهای اخیر" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="card xl:col-span-2">
          <h2 className="mb-4 font-black">روند تراکنش‌های کاربر</h2>
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="userAmount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#635bff" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#635bff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" tickFormatter={chartDateLabel} />
                <YAxis {...chartAxisProps} tickFormatter={chartCurrencyTick} />
                <Tooltip formatter={(value) => [formatMoney(value), 'مبلغ']} labelFormatter={(label) => `بازه: ${label}`} />
                <Area type="monotone" dataKey="amount" stroke="#635bff" fill="url(#userAmount)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h2 className="mb-4 font-black">تعداد عملیات</h2>
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData}>
                <XAxis dataKey="name" tickFormatter={chartDateLabel} hide />
                <YAxis {...chartAxisProps} />
                <Tooltip formatter={(value) => [`${Number(value || 0).toLocaleString('fa-IR')} عملیات`, 'تعداد عملیات']} labelFormatter={(label) => `بازه: ${label}`} />
                <Bar dataKey="orders" fill="#22d3ee" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <UserTable
        loading={false}
        error={null}
        page={1}
        onPageChange={() => {}}
        rows={rows}
        columns={[
          { key: 'id', label: 'شناسه' },
          { key: 'title', label: 'خرید' },
          { key: 'date', label: 'تاریخ' },
          { key: 'amount', label: 'مبلغ' },
        ]}
      />
    </section>
  );
}
