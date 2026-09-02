import StatCard from '../../../components/ui/StatCard';
import SkeletonGrid from '../../../components/ui/Skeleton';
import SellerPageHeader from '../../../components/seller/SellerPageHeader';
import { useAsyncResource } from '../../../hooks/useAsyncResource';
import { sellerApi } from '../../../services/seller/sellerApi';

export default function SellerDashboard() {
  const { loading, error, data } = useAsyncResource(() => sellerApi.getDashboard());

  if (loading) return <SkeletonGrid />;

  if (error) {
    return (
      <section className="page">
        <SellerPageHeader title="داشبورد فروشگاه" description="در دریافت اطلاعات داشبورد مشکلی پیش آمد." />
        <div className="card text-rose-600">{error.message || 'ارتباط با سرور برقرار نشد.'}</div>
      </section>
    );
  }

  return (
    <section className="page">
      <SellerPageHeader title="داشبورد فروشگاه" description="مدیریت محصولات، تراکنش‌ها و وضعیت تایید محصولات فروشگاه شما." />
      <div className="grid-auto">{data.stats.map((item) => <StatCard key={item.label} label={item.label} value={item.value} delta={item.delta} showTrendIcon={false} />)}</div>
    </section>
  );
}
