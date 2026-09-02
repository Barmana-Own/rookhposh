import { ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils.js';
import { DEFAULT_PRODUCT_IMAGE } from '../../utils/productImage.js';

export default function ProductCard2({
  className = '',
  imageUrl = DEFAULT_PRODUCT_IMAGE,
  name,
  tagline,
  offerText = 'پرو آنلاین',
  cta = 'مشاهده و پرو آنلاین',
  href = '#',
}) {
  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'group relative flex min-h-[420px] w-full flex-col items-center justify-start overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-950 shadow-2xl shadow-indigo-200/30 transition-colors duration-300 hover:border-indigo-300 hover:bg-slate-50 dark:border-white/10 dark:bg-[#171717] dark:text-white dark:shadow-black/30 dark:hover:border-amber-400/45 dark:hover:bg-[#1d1d1d]',
        className,
      )}
      whileHover={{ y: -5 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
    >
      <div className="relative mb-5 flex h-44 w-full items-center justify-center">
        <img
          src={imageUrl || DEFAULT_PRODUCT_IMAGE}
          alt={name}
          onError={(event) => {
            if (event.currentTarget.src.endsWith(DEFAULT_PRODUCT_IMAGE)) return;
            event.currentTarget.src = DEFAULT_PRODUCT_IMAGE;
          }}
          className="h-full w-full object-contain transition-opacity duration-300 group-hover:opacity-95"
        />
      </div>

      <div className="flex flex-grow flex-col items-center gap-2">
        <h3 className="line-clamp-2 text-lg font-black leading-8">{name}</h3>
        <p className="line-clamp-2 min-h-12 text-sm leading-6 text-slate-500 dark:text-slate-300">
          {tagline || 'آماده برای سرویس پرو آنلاین'}
        </p>
      </div>

      <div className="mt-4 rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-indigo-600 dark:bg-white/10 dark:text-amber-300">
        {offerText}
      </div>

      <span className="mt-5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 transition group-hover:border-indigo-300 group-hover:text-indigo-600 dark:border-white/10 dark:bg-black/30 dark:text-white dark:group-hover:border-amber-400/50 dark:group-hover:text-amber-300">
        {cta}
        <ExternalLink size={14} />
      </span>
    </motion.a>
  );
}
