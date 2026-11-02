import { ShoppingBag } from 'lucide-react';
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useAsyncResource } from '../hooks/useAsyncResource.js';
import apiClient from '../services/apiClient.js';
import PublicStoreHero from '../components/public/PublicStoreHero.jsx';
import StoreProductCard from '../components/public/StoreProductCard.jsx';
import '../components/public/public-page.css';

export default function PublicStore() {
  const { slug } = useParams();
  const { data: store, loading, error, reload } = useAsyncResource(
    async () => (await apiClient.get('/api/stores/' + encodeURIComponent(slug))).data.data,
    [slug],
  );
  const products = useMemo(() => store?.products || [], [store]);
  if (loading) return <main dir="rtl" className="public-page"><div className="public-state public-surface" role="status">در حال دریافت فروشگاه...</div></main>;
  if (error || !store) {
    const missing = error?.status === 404 || (!error && !store);
    return <main dir="rtl" className="public-page">
      <section className="public-state public-surface">
        <h1>{missing ? 'فروشگاه موردنظر یافت نشد' : error?.status === 0 ? 'ارتباط با سرور برقرار نشد' : 'دریافت فروشگاه موقتاً ممکن نیست'}</h1>
        <p>{missing ? 'آدرس فروشگاه را بررسی کنید یا به صفحه اصلی رخ‌پوش برگردید.' : 'لطفاً اتصال خود را بررسی کنید و دوباره تلاش کنید.'}</p>
        <div className="public-state-actions">
          {!missing && <button className="btn-primary" onClick={reload}>تلاش مجدد</button>}
          <a className="public-button public-button--outline" href="https://rookhposh.ir">بازگشت به صفحه اصلی</a>
        </div>
      </section>
    </main>;
  }
  return (
    <main dir="rtl" className="public-page public-page--store">
      <div className="public-container">
        <PublicStoreHero store={store} />
        <section className="public-catalog" aria-labelledby="public-products-title">
          <div className="public-section-heading">
            <span className="public-heading-icon"><ShoppingBag size={27} aria-hidden="true" /></span>
            <div className="public-section-title"><h2 id="public-products-title">محصولات فروشگاه</h2></div>
            <p>هر محصول در یک تب جدید باز می‌شود و از همان‌جا پرو آنلاین انجام می‌شود.</p>
          </div>
          <div className="public-product-grid">
            {products.map(product => <StoreProductCard key={product.id} product={product} slug={slug} />)}
          </div>
          {!products.length && <div className="public-state public-surface"><ShoppingBag size={30} className="mx-auto mb-3" aria-hidden="true" />محصول فعالی برای این فروشگاه ثبت نشده است.</div>}
        </section>
      </div>
    </main>
  );
}
