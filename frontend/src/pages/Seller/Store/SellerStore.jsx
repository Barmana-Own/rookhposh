import { Copy, ExternalLink, QrCode, Share2, Store } from 'lucide-react';
import { useState } from 'react';
import SellerPageHeader from '../../../components/seller/SellerPageHeader';
import SellerToast from '../../../components/seller/SellerToast';
import { useAsyncResource } from '../../../hooks/useAsyncResource';
import { sellerApi } from '../../../services/seller/sellerApi';
import { getProductImage } from '../../../utils/productImage';

const toman = (value = 0) => `${Number(value || 0).toLocaleString('fa-IR')} تومان`;

export default function SellerStore() {
  const { data: store } = useAsyncResource(() => sellerApi.getStore());
  const { data: qr, loading: qrLoading } = useAsyncResource(() => sellerApi.getStoreQrCode());
  const [toast, setToast] = useState('');

  const notify = (message) => {
    setToast(message);
    setTimeout(() => setToast(''), 2200);
  };

  const currentStore = {
    store_name: store?.store_name || 'فروشگاه من',
    description: store?.description || '',
    logo: store?.logo || '',
    banner: store?.banner || '',
    products: store?.products || [],
    slug: store?.slug || '',
  };

  const publicLink = qr?.url || `/stores/${currentStore.slug || ''}`;

  return (
    <section className="page">
      <SellerPageHeader
        title="صفحه فروشگاه"
        description="پیش نمایش صفحه عمومی فروشگاه، محصولات تایید شده، لینک اشتراک گذاری و QR Code پایدار را ببینید."
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="card overflow-hidden p-0">
          <div className="overflow-hidden bg-white p-4 dark:bg-slate-900 sm:p-5">
            <div className="relative flex h-44 items-center justify-center overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-indigo-600 via-violet-600 to-cyan-500 sm:h-52">
              {currentStore.banner ? <img src={currentStore.banner} alt={`بنر ${currentStore.store_name}`} className="h-full w-full object-contain" /> : null}
            </div>
            <div className="flex flex-col items-center gap-4 px-2 py-5 text-center text-slate-950 dark:text-white sm:flex-row sm:text-right">
              <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-[2rem] bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100 dark:bg-white/10 dark:text-amber-300 dark:ring-white/10">
                {currentStore.logo ? <img src={currentStore.logo} alt="لوگوی فروشگاه" className="h-full w-full object-cover" /> : <Store size={42} />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-indigo-600 dark:text-amber-300">پیش نمایش از دید کاربر</p>
                <h2 className="mt-2 break-words text-3xl font-black">{currentStore.store_name}</h2>
                <p className="mt-3 max-w-2xl break-words leading-8 text-slate-600 dark:text-slate-300">{currentStore.description || 'توضیحی برای فروشگاه ثبت نشده است.'}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-6 md:grid-cols-3">
            {(currentStore.products || []).slice(0, 6).map((item) => (
              <article key={item.id} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <img
                  src={getProductImage(item)}
                  alt={item.title}
                  className="mb-4 h-28 w-full rounded-2xl object-cover"
                />
                <h3 className="font-black">{item.title}</h3>
                <p className="mt-2 text-sm text-indigo-500">{toman(item.price || item.price_toman || 0)}</p>
                <p className="mt-1 text-xs text-slate-400">{item.avg_rating ? `${item.avg_rating} از ۵` : 'بدون امتیاز'}</p>
                <a href={`/stores/${currentStore.slug}/products/${item.id}`} target="_blank" rel="noreferrer" className="btn-soft mt-4 w-full">
                  <ExternalLink size={16} />
                  مشاهده صفحه محصول
                </a>
              </article>
            ))}

            {!currentStore.products?.length && (
              <div className="rounded-3xl border border-dashed border-slate-200 p-8 text-center text-sm font-bold text-slate-400 md:col-span-3">
                بعد از تایید محصول توسط ادمین، محصولات فعال اینجا نمایش داده می شوند.
              </div>
            )}
          </div>
        </div>

        <aside className="card h-fit space-y-5">
          <div className="grid aspect-square place-items-center rounded-[2rem] bg-white p-8 dark:bg-slate-950">
            {qr?.qrcode ? (
              <img src={qr.qrcode} alt="کد QR فروشگاه" className="h-full w-full object-contain" />
            ) : qrLoading ? (
              <span className="text-sm font-bold text-slate-400">در حال بارگذاری...</span>
            ) : (
              <QrCode size={120} className="text-slate-300" />
            )}
          </div>
          <div className="rounded-2xl bg-slate-100 p-4 text-left text-sm dark:bg-slate-800">{publicLink}</div>
          <button
            className="btn-primary w-full"
            onClick={() => {
              navigator.clipboard?.writeText(publicLink);
              notify('لینک فروشگاه کپی شد.');
            }}
          >
            <Copy size={18} />
            کپی لینک
          </button>
          <button className="btn-soft w-full" onClick={() => notify('لینک برای اشتراک گذاری آماده است.')}>
            <Share2 size={18} />
            اشتراک گذاری
          </button>
          <a className="btn-soft w-full" href={publicLink} target="_blank" rel="noreferrer">
            <ExternalLink size={18} />
            مشاهده عمومی
          </a>
        </aside>
      </div>

      <SellerToast message={toast} />
    </section>
  );
}
