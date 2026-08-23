import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import StatCard from '../../../components/ui/StatCard';
import SkeletonGrid from '../../../components/ui/Skeleton';
import SellerPageHeader from '../../../components/seller/SellerPageHeader';
import { useAsyncResource } from '../../../hooks/useAsyncResource';
import { sellerApi } from '../../../services/seller/sellerApi';
import { chartCurrencyTick, chartDateLabel, formatMoney } from '../../../utils/formatters';

const chartAxisProps = {
  orientation: 'left',
  width: 96,
  tickMargin: 12,
  tickLine: false,
};

export default function SellerDashboard() {
  const { loading, error, data } = useAsyncResource(() => sellerApi.getDashboard());

  if (loading) return <SkeletonGrid />;

  if (error) {
    return (
      <section className="page">
        <SellerPageHeader title="داشبورد فروشنده" description="در دریافت اطلاعات داشبورد مشکلی پیش آمد." />
        <div className="card text-rose-600">{error.message || 'ارتباط با سرور برقرار نشد.'}</div>
      </section>
    );
  }

  const chartData = data.charts?.length ? data.charts : [{ name: 'امروز', sales: 0, orders: 0 }];

  return (
    <section className="page">
      <SellerPageHeader title="داشبورد فروشنده" description="نمای کامل فروش، درآمد، سفارش‌ها، مشتریان و وضعیت تایید محصولات فروشگاه شما." />
      <div className="grid-auto">{data.stats.map((item) => <StatCard key={item.label} label={item.label} value={item.value} delta={item.delta} />)}</div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="card">
          <h2 className="mb-4 font-black">نمودار فروش</h2>
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="sellerSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#635bff" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#635bff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" tickFormatter={chartDateLabel} />
                <YAxis {...chartAxisProps} tickFormatter={chartCurrencyTick} />
                <Tooltip formatter={(value) => [formatMoney(value), 'فروش']} labelFormatter={(label) => `بازه: ${label}`} />
                <Area type="monotone" dataKey="sales" stroke="#635bff" fill="url(#sellerSales)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h2 className="mb-4 font-black">نمودار سفارش‌ها</h2>
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData}>
                <XAxis dataKey="name" tickFormatter={chartDateLabel} />
                <YAxis {...chartAxisProps} />
                <Tooltip formatter={(value) => [`${Number(value || 0).toLocaleString('fa-IR')} سفارش`, 'تعداد سفارش‌ها']} labelFormatter={(label) => `بازه: ${label}`} />
                <Bar dataKey="orders" fill="#22d3ee" radius={[12, 12, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  );
}
