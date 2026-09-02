import { LogIn, Phone, Store } from 'lucide-react';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ProductCard2 from '../components/ui/ProductCard2.jsx';
import apiClient from '../services/apiClient.js';
import { getProductImage } from '../utils/productImage.js';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 100, damping: 12 },
  },
};

export default function PublicStore() {
  const { slug } = useParams();
  const [store, setStore] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient
      .get(`/api/stores/${slug}`)
      .then((response) => setStore(response.data.data))
      .catch((fetchError) => setError(fetchError.message));
  }, [slug]);

  const products = useMemo(() => store?.products || [], [store]);

  if (error) {
    return <main dir="rtl" className="grid min-h-screen place-items-center bg-[#eef2ff] p-6 text-rose-600 dark:bg-slate-950 dark:text-rose-300">{error}</main>;
  }

  if (!store) {
    return <main dir="rtl" className="grid min-h-screen place-items-center bg-[#eef2ff] p-6 font-black text-slate-950 dark:bg-slate-950 dark:text-white">در حال دریافت فروشگاه...</main>;
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#eef2ff] bg-[radial-gradient(circle_at_top_left,_rgba(99,91,255,.18),transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(34,211,238,.16),transparent_35%)] text-slate-950 dark:bg-slate-950 dark:text-white"
    >
      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="relative">
          <div className="relative flex h-44 items-center justify-center overflow-hidden rounded-[2rem] border border-white/70 bg-white/85 shadow-2xl shadow-indigo-500/15 sm:h-52 dark:border-white/10 dark:bg-slate-900/80 dark:shadow-black/40">
            {store.banner ? (
              <img
                src={store.banner}
                alt={`بنر ${store.store_name}`}
                className="h-full w-full object-contain"
              />
            ) : <div className="absolute inset-0 bg-slate-50 dark:bg-slate-900" />}
          </div>

          <div className="relative z-10 mx-2 -mt-8 rounded-[1.75rem] border border-white/70 bg-white/95 p-5 text-slate-950 shadow-xl shadow-indigo-200/30 backdrop-blur-xl dark:border-white/10 dark:bg-[#171717]/95 dark:text-white dark:shadow-black/30 sm:mx-6 sm:p-6">
            <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-right">
              <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-[1.5rem] bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100 dark:bg-white/10 dark:text-amber-300 dark:ring-white/10">
                {store.logo ? <img src={store.logo} alt={store.store_name} className="h-full w-full bg-white object-contain" /> : <Store size={36} />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-indigo-600 dark:text-amber-300">فروشگاه عمومی</p>
                <h1 className="mt-1 break-words text-2xl font-black sm:text-3xl">{store.store_name}</h1>
                <p className="mt-2 max-w-3xl break-words leading-7 text-slate-600 dark:text-slate-300">
                  {store.description || 'توضیحی برای فروشگاه ثبت نشده است.'}
                </p>
                {store.contact_phone ? (
                  <a
                    href={`tel:${store.contact_phone}`}
                    dir="ltr"
                    className="mt-3 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-2 text-sm font-bold text-indigo-700 transition hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/20"
                  >
                    <Phone size={16} aria-hidden="true" />
                    {store.contact_phone}
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 flex justify-end">
          <Link
            className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-4 py-2 text-sm font-bold text-slate-700 shadow-soft backdrop-blur-xl transition hover:border-indigo-300 hover:text-indigo-600 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:border-amber-400/50 dark:hover:text-amber-300"
            to={`/login?store=${slug}`}
          >
            <LogIn size={17} />
            ورود یا ثبت‌نام با این فروشگاه
          </Link>
        </div>

        <section className="py-14">
          <div className="mb-12 text-center">
            <h2 className="text-4xl font-black tracking-normal text-indigo-600 dark:text-[#F5A623]">محصولات فروشگاه</h2>
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              هر محصول در یک تب جدید باز می‌شود و از همان‌جا پرو آنلاین انجام می‌شود.
            </p>
          </div>

          <motion.div
            className="grid grid-cols-1 gap-6 pb-4 sm:grid-cols-2 lg:grid-cols-4"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {products.map((product) => (
              <motion.div key={product.id} variants={itemVariants} className="min-w-0">
                <ProductCard2
                  imageUrl={getProductImage(product)}
                  name={product.title}
                  tagline={product.description || 'محصول آماده برای پرو آنلاین'}
                  offerText={product.avg_rating ? `${product.avg_rating} امتیاز` : 'بدون امتیاز'}
                  cta="مشاهده صفحه محصول"
                  href={`/stores/${slug}/products/${product.id}`}
                />
              </motion.div>
            ))}
          </motion.div>

          {!products.length ? (
            <div className="mx-auto max-w-2xl rounded-3xl border border-white/60 bg-white/70 p-10 text-center font-bold text-slate-500 shadow-soft backdrop-blur-xl dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
              محصول فعالی برای این فروشگاه ثبت نشده است.
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
