import { ShoppingBag } from 'lucide-react';
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { usePublicStore } from '../hooks/usePublicStore.js';
import PublicPageState, { PublicRecovery } from '../components/public/PublicPageState.jsx';
import PublicStoreHero from '../components/public/PublicStoreHero.jsx';
import StoreProductCard from '../components/public/StoreProductCard.jsx';
import '../components/public/public-page.css';

export default function PublicStore() {
  const { slug } = useParams();
  const resource = usePublicStore(slug);
  const { data: store } = resource;
  const products = useMemo(() => store?.products || [], [store]);
  if (!store) return <PublicPageState resource={resource} />;
  return (
    <main dir="rtl" className="public-page public-page--store">
      <div className="public-container">
        <PublicRecovery resource={resource} inline />
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
