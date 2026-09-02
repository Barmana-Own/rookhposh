import { Download, Search, Sparkles, Star, Store } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import UserDrawer from '../../../components/user/UserDrawer';
import UserPageHeader from '../../../components/user/UserPageHeader';
import UserTable from '../../../components/user/UserTable';
import UserToast from '../../../components/user/UserToast';
import { useUser } from '../../../contexts/UserContext';
import { useAsyncResource } from '../../../hooks/useAsyncResource';
import { userApi } from '../../../services/user/userApi';
import { downloadProOutput, getProOutputSource } from '../../../utils/proOutput.js';

function ProductImage({ product }) {
  if (!product.image) {
    return <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-xs font-bold text-slate-400">بدون عکس</div>;
  }
  return <img src={product.image} alt={product.title} className="h-14 w-14 rounded-2xl bg-white object-contain" />;
}

function StoreOverview({ store, count }) {
  return (
    <div className="card flex flex-wrap items-center justify-between gap-4">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-600">
          <Store size={14} />
          نمای فروشگاه
        </div>
        <h2 className="text-2xl font-black">{store.storeName || store.seller}</h2>
        <p className="text-sm text-slate-500">در این نما فقط محصولات همین فروشگاه نمایش داده می‌شود. تعداد محصول: {count.toLocaleString('fa-IR')}</p>
      </div>
    </div>
  );
}

export default function UserServices() {
  const { showToast } = useUser();
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const [query, setQuery] = useState(initialQuery);
  const [refreshKey] = useState(0);
  const { loading, error, data } = useAsyncResource(() => userApi.getServices(query), [refreshKey, query]);
  const [service, setService] = useState(null);
  const [selectedStoreSlug, setSelectedStoreSlug] = useState('');

  const allProducts = data?.products || [];
  const visibleProducts = selectedStoreSlug ? allProducts.filter((item) => item.storeSlug === selectedStoreSlug) : allProducts;
  const selectedStore = visibleProducts[0] || allProducts.find((item) => item.storeSlug === selectedStoreSlug) || null;
  const openProductPro = (row) => {
    if (!row?.storeSlug || !row?.id) return;
    window.open(`/stores/${row.storeSlug}/products/${row.id}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <section className="page">
      <UserPageHeader
        title="سرویس‌ها و محصولات"
        description="استفاده از سرویس پرو، جستجو بین محصولات فروشگاه‌ها و ثبت خرید با اطلاعات کامل مشتری."
      />

      <div className="card flex items-center gap-3">
        <Search size={18} className="text-slate-400" />
        <input
          className="w-full bg-transparent outline-none"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="جستجو در نام محصول، توضیحات یا فروشگاه..."
        />
      </div>

      {selectedStore ? (
        <StoreOverview store={selectedStore} count={visibleProducts.length} />
      ) : null}

      <div>
        <h2 className="mb-3 text-xl font-black">{selectedStore ? 'محصولات همین فروشگاه' : 'محصولات فعال فروشگاه‌ها'}</h2>
        <UserTable
          loading={loading}
          error={error}
          page={1}
          onPageChange={() => {}}
          rows={visibleProducts}
          columns={[
            { key: 'image', label: 'عکس', render: (row) => <ProductImage product={row} /> },
            { key: 'id', label: 'شناسه' },
            { key: 'title', label: 'محصول' },
            {
              key: 'seller',
              label: 'فروشگاه',
              render: (row) => (
                <button className="text-right font-bold text-indigo-600 transition hover:text-indigo-500" onClick={() => setSelectedStoreSlug(row.storeSlug || '')}>
                  {row.storeName || row.seller}
                </button>
              ),
            },
            {
              key: 'rating',
              label: 'امتیاز',
              render: (row) => (
                <div className="flex items-center gap-1 text-amber-500">
                  <Star size={14} className="fill-current" />
                  <span>{row.rating ? row.rating.toLocaleString('fa-IR') : 'بدون امتیاز'}</span>
                  {!!row.reviewCount && <span className="text-xs text-slate-400">({row.reviewCount})</span>}
                </div>
              ),
            },
          ]}
          actions={(row) => (
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" onClick={() => openProductPro(row)}>
                <Sparkles size={16} />
                پرو آنلاین
              </button>
            </div>
          )}
        />
      </div>

      <div>
        <h2 className="mb-3 text-xl font-black">سوابق سرویس پرو</h2>
        <UserTable
          loading={loading}
          error={error}
          page={1}
          onPageChange={() => {}}
          rows={data?.services || []}
          columns={[
            { key: 'id', label: 'شناسه' },
            { key: 'title', label: 'سرویس' },
            { key: 'status', label: 'وضعیت' },
            { key: 'expiresAt', label: 'تاریخ' },
            { key: 'usage', label: 'مبلغ' },
          ]}
          actions={(row) => (
            <div className="flex flex-wrap gap-2">
              {row.outputImage ? (
                <button
                  className="btn-soft"
                  onClick={() => downloadProOutput(row.outputImage, `pro-output-${row.id}.png`).catch((downloadError) => showToast(downloadError.message))}
                >
                  <Download size={16} />
                  دانلود
                </button>
              ) : null}
              <button className="btn-soft" onClick={() => setService(row)}>جزئیات</button>
            </div>
          )}
        />
      </div>

      <UserDrawer open={Boolean(service)} title="جزئیات سرویس" onClose={() => setService(null)}>
        {service ? (
          <div className="space-y-4 text-sm">
            <p><b>سرویس:</b> {service.title}</p>
            <p><b>وضعیت:</b> {service.status}</p>
            <p><b>تاریخ:</b> {service.expiresAt}</p>
            <p><b>مبلغ:</b> {service.usage}</p>
            {service.outputImage ? (
              <div className="rounded-3xl bg-slate-50 p-3 dark:bg-slate-800">
                <img src={getProOutputSource(service.outputImage)} alt="خروجی پرو آنلاین" className="max-h-72 w-full rounded-2xl object-contain" />
                <button
                  className="btn-soft mt-3"
                  onClick={() => downloadProOutput(service.outputImage, `pro-output-${service.id}.png`).catch((downloadError) => showToast(downloadError.message))}
                >
                  <Download size={16} />
                  دانلود خروجی پرو
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </UserDrawer>

      <UserToast />
    </section>
  );
}
