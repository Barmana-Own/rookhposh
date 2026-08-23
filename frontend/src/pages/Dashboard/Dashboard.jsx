import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import StatCard from '../../components/ui/StatCard.jsx';
import SkeletonGrid from '../../components/ui/Skeleton.jsx';
import { useAsyncResource } from '../../hooks/useAsyncResource.js';
import apiClient from '../../services/apiClient.js';
import { chartCurrencyTick, chartDateLabel, formatMoney } from '../../utils/formatters.js';

const chartAxisProps = {
  orientation: 'left',
  width: 96,
  tickMargin: 12,
  tickLine: false,
};

export default function Dashboard() {
  const { loading, error, data } = useAsyncResource(async () => (await apiClient.get('/api/admin/dashboard')).data.data, [], { pollMs: 10000, keepPreviousData: true });

  if (loading) return <SkeletonGrid />;

  if (error) {
    return (
      <section className="page">
        <div>
          <h1 className="text-3xl font-black">داشبورد مدیریت</h1>
          <p className="text-slate-500">در دریافت اطلاعات داشبورد مشکلی پیش آمد.</p>
        </div>
        <div className="card text-rose-600">{error.message || 'ارتباط با سرور برقرار نشد.'}</div>
      </section>
    );
  }

  const stats = [
    ['کاربران', data.total_users, 'زنده'],
    ['فروشندگان', data.total_sellers, 'زنده'],
    ['محصولات در انتظار', data.pending_products, 'زنده'],
    ['درآمد شرکت', `${Number(data.company_income || 0).toLocaleString('fa-IR')} تومان`, 'زنده'],
  ];

  const chartData = data.charts?.length ? data.charts : [{ name: 'امروز', sales: 0, orders: 0 }];

  return (
    <section className="page">
      <div>
        <h1 className="text-3xl font-black">داشبورد مدیریت</h1>
        <p className="text-slate-500">نمای زنده از کاربران، فروشندگان، محصولات و درآمد.</p>
      </div>

      <div className="grid-auto">{stats.map((item) => <StatCard key={item[0]} label={item[0]} value={item[1]} delta={item[2]} />)}</div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="card xl:col-span-2">
          <h2 className="mb-4 font-black">نمودار فروش</h2>
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="adminSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#635bff" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#635bff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" tickFormatter={chartDateLabel} />
                <YAxis {...chartAxisProps} tickFormatter={chartCurrencyTick} />
                <Tooltip formatter={(value) => [formatMoney(value), 'فروش']} labelFormatter={(label) => `بازه: ${label}`} />
                <Area type="monotone" dataKey="sales" stroke="#635bff" fill="url(#adminSales)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h2 className="mb-4 font-black">تعداد سفارش‌ها</h2>
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData}>
                <XAxis dataKey="name" tickFormatter={chartDateLabel} hide />
                <YAxis {...chartAxisProps} />
                <Tooltip formatter={(value) => [`${Number(value || 0).toLocaleString('fa-IR')} سفارش`, 'تعداد سفارش‌ها']} labelFormatter={(label) => `بازه: ${label}`} />
                <Bar dataKey="orders" fill="#22d3ee" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  );
}
