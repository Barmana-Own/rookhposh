import { RefreshCw, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';

export function PublicRecovery({ resource, product = false, inline = false }) {
  const { error, offline, loading, refreshing, reload, retryAt } = resource;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!retryAt || retryAt <= Date.now()) return undefined;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(retryAt - Date.now() + 10, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [retryAt, now]);
  if (!error && !offline && !refreshing) return null;
  const status = Number(error?.status || 0);
  const missing = status === 404;
  const Heading = inline ? 'h2' : 'h1';
  let title = offline ? 'اتصال اینترنت قطع است' : 'ارتباط با سرور برقرار نشد';
  let message = 'دریافت اطلاعات کامل نشد؛ اتصال خود را بررسی کنید و دوباره تلاش کنید.';
  if (missing) { title = product ? 'محصول موردنظر یافت نشد' : 'فروشگاه موردنظر یافت نشد'; message = 'ممکن است این مورد حذف یا غیرفعال شده باشد؛ آدرس را بررسی کنید.'; }
  else if (status === 400 || status === 422) { title = 'آدرس درخواست معتبر نیست'; message = 'آدرس صفحه و اطلاعات درخواست را بررسی کنید.'; }
  else if (status === 401 || status === 403) { title = 'دسترسی به این بخش مجاز نیست'; message = 'اجازه مشاهده این اطلاعات وجود ندارد.'; }
  else if (status === 429) { title = 'تعداد درخواست‌ها بیش از حد مجاز است'; message = 'پس از پایان مهلت اعلام‌شده دوباره تلاش کنید.'; }
  else if ([500, 502, 503].includes(status)) { title = 'سرویس موقتاً در دسترس نیست'; message = 'اطلاعات آماده حفظ شده‌اند؛ کمی بعد دوباره تلاش کنید.'; }
  else if (status === 504) { title = 'مهلت پاسخ درگاه سرور تمام شد'; message = 'دریافت اطلاعات را دوباره امتحان کنید.'; }
  if (refreshing) { title = 'در حال بازیابی اطلاعات...'; message = 'محتوای دریافت‌شده همچنان در دسترس است.'; }
  return <section data-testid="public-recovery" role={error ? 'alert' : 'status'} className={'public-recovery public-surface' + (inline ? ' public-recovery--inline' : '')}>
    <WifiOff size={25} aria-hidden="true" /><div><Heading>{title}</Heading><p>{message}</p></div>
    {!missing && ![400, 401, 403, 422].includes(status) && <button type="button" className="public-button public-button--outline" onClick={reload}
      disabled={loading || refreshing || offline || now < retryAt}><RefreshCw size={17} aria-hidden="true" />تلاش مجدد</button>}
    {!inline && <a className="public-button public-button--outline" href="https://rookhposh.ir">بازگشت به صفحه اصلی</a>}
  </section>;
}

export default function PublicPageState({ resource, product = false }) {
  const loading = resource.loading;
  return <main dir="rtl" className={'public-page ' + (product ? 'public-page--tryon' : 'public-page--store')} aria-busy={loading}>
    <div className="public-container">
      <div aria-hidden="true" className={'public-hero' + (product ? ' public-hero--compact' : '') + (loading ? ' public-loading-shell' : ' public-loading-shell public-loading-shell--stopped')}>
        <div className="public-hero-banner public-placeholder" />
        <div className="public-store-identity"><div className="public-store-logo public-placeholder" /><div className="public-placeholder public-placeholder--title" /></div>
      </div>
      {loading ? <>
        <p role="status" className="sr-only">{product ? 'در حال دریافت اطلاعات محصول...' : 'در حال دریافت اطلاعات فروشگاه...'}</p>
        {!product && <div aria-hidden="true" className="public-catalog public-section-heading"><div className="public-heading-icon public-placeholder" /><div className="public-placeholder public-placeholder--title" /><div className="public-placeholder public-placeholder--line" /></div>}
        <div aria-hidden="true" className={product ? 'public-tryon-layout public-loading-shell' : 'public-product-grid public-loading-shell'}>
          {Array.from({ length: product ? 2 : 4 }, (_, index) => <div key={index} className="public-surface public-placeholder-card"><div className="public-placeholder public-placeholder--image" /><div className="public-placeholder public-placeholder--title" /><div className="public-placeholder public-placeholder--line" /></div>)}
        </div>
      </> : <PublicRecovery resource={resource} product={product} />}
    </div>
  </main>;
}
