import { Camera, CheckCircle2, ImagePlus, RefreshCw, Sparkles, Store, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import apiClient from '../services/apiClient.js';
import { publicApi } from '../services/publicApi.js';
import TryOnNotice from '../components/ui/TryOnNotice.jsx';
import { compressImageFile } from '../utils/file.js';
import { getProductImage, getProductImages } from '../utils/productImage.js';
import { getProductFeatures } from '../utils/productFeatures.js';
import { shouldShowBodyGuide } from '../utils/camera.js';
import { useCameraCapture } from '../hooks/useCameraCapture.js';
import BodyScanGuide from '../components/camera/BodyScanGuide.jsx';
import { proQuotaMessage } from '../utils/proQuota.js';
import { useTryon } from '../hooks/useTryon.js';
import TryonProgress from '../components/tryon/TryonProgress.jsx';
import TryonHistory from '../components/tryon/TryonHistory.jsx';
import PrivateImage from '../components/tryon/PrivateImage.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';

function withImageExtension(filename, mime) {
  const extension = {
    'image/webp': 'webp',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/avif': 'avif',
  }[mime] || 'jpg';
  return `${filename.replace(/\.[^.]+$/, '')}.${extension}`;
}

export default function PublicProduct() {
  const { token } = useAuth();
  return <ProductTryonPage key={token || 'visitor'} />;
}

function ProductTryonPage() {
  const { slug, productId } = useParams();
  const uploadInputRef = useRef(null);
  const [store, setStore] = useState(null);
  const [error, setError] = useState('');
  const [userImage, setUserImage] = useState('');
  const [fileName, setFileName] = useState('');
  const [imageProcessing, setImageProcessing] = useState(false);
  const tryon = useTryon();
  const saving = tryon.busy;
  const [processingConsent, setProcessingConsent] = useState(false);
  const [diagnosticsConsent, setDiagnosticsConsent] = useState(false);
  const [quota, setQuota] = useState(null);
  const [selectedProductImage, setSelectedProductImage] = useState('');
  const camera = useCameraCapture();
  const { videoRef: cameraVideoRef, isOpen: cameraOpen, busy: cameraBusy,
    requestedFacingMode, activeFacingMode, error: cameraError } = camera;
  const cameraFacingMode = activeFacingMode || requestedFacingMode;
  const showBodyGuide = shouldShowBodyGuide(camera);
  const imageSelectionIdRef = useRef(0);
  const closeCamera = camera.close;

  useEffect(() => {
    const controller = new AbortController();
    apiClient
      .get(`/api/stores/${slug}`, { signal: controller.signal })
      .then((response) => { if (!controller.signal.aborted) { setStore(response.data.data); if (!response.data.data) setError('فروشگاه پیدا نشد.'); } })
      .catch((fetchError) => { if (!controller.signal.aborted) setError(fetchError.message); });
    return () => controller.abort();
  }, [slug]);

  const product = useMemo(
    () => store?.products?.find((item) => Number(item.id) === Number(productId)),
    [store, productId],
  );
  const productImages = getProductImages(product);
  const productImage = (selectedProductImage && productImages.includes(selectedProductImage))
    ? selectedProductImage
    : Number(tryon.job?.product_id) === Number(product?.id) && saving && productImages[tryon.job?.image_index]
      ? productImages[tryon.job.image_index] : productImages[0] || getProductImage(product);
  const productFeatures = getProductFeatures(product);
  const visibleProductFeatures = productFeatures.length
    ? productFeatures
    : ['مناسب پرو آنلاین', 'انتخاب مدل لباس', 'خروجی باکیفیت'];

  useEffect(() => {
    if (!product?.id) return undefined;
    let mounted = true;
    publicApi.getProQuota(slug, product.id)
      .then((value) => { if (mounted) setQuota(value); })
      .catch(() => { if (mounted) setQuota(null); });
    return () => { mounted = false; };
  }, [slug, product?.id, tryon.job?.status]);

  const selectImage = async (file, isSelectionCurrent = () => true) => {
    if (saving) throw new Error('تا پایان عملیات جاری، تصویر ورودی را تغییر ندهید.');
    if (!file || (file.type && !file.type.startsWith('image/'))) {
      throw new Error('لطفاً یک فایل تصویری انتخاب کنید.');
    }
    const selectionId = imageSelectionIdRef.current + 1;
    imageSelectionIdRef.current = selectionId;
    setImageProcessing(true);
    try {
      const dataUrl = await compressImageFile(file);
      if (selectionId !== imageSelectionIdRef.current || !isSelectionCurrent()) return;
      const mime = dataUrl.match(/^data:([^;]+);/i)?.[1] || file.type || 'image/jpeg';
      setUserImage(dataUrl);
      setFileName(withImageExtension(file.name || 'person.jpg', mime));
      if (!selectedProductImage && Number(tryon.job?.product_id) === Number(product?.id) && productImages[tryon.job.image_index]) setSelectedProductImage(productImages[tryon.job.image_index]);
      tryon.reset();
      setError('');
    } finally {
      if (selectionId === imageSelectionIdRef.current) setImageProcessing(false);
    }
  };

  const handleImageInput = async (event) => {
    const [file] = Array.from(event.target.files || []);
    event.target.value = '';
    if (!file) return;
    try {
      await selectImage(file);
    } catch (selectionError) {
      setError(selectionError.message || 'انتخاب تصویر ناموفق بود.');
    }
  };

  const openCamera = () => {
    setError('');
    return camera.open();
  };
  const switchCamera = camera.switchCamera;
  const captureCameraImage = () => camera.capture(selectImage);

  const runPro = () => {
    if (!product || !userImage || saving || imageProcessing) return;
    setError('');
    void tryon.start({
      slug, productId: product.id, image: userImage,
      imageIndex: Math.max(0, productImages.indexOf(productImage)), processingConsent, diagnosticsConsent,
    });
  };

  if (error && !store) {
    return <main dir="rtl" className="grid min-h-screen place-items-center bg-[#eef2ff] p-6 text-rose-600 dark:bg-slate-950 dark:text-rose-300">{error}</main>;
  }

  if (!store) {
    return <main dir="rtl" className="grid min-h-screen place-items-center bg-[#eef2ff] p-6 font-black text-slate-950 dark:bg-slate-950 dark:text-white">در حال دریافت محصول...</main>;
  }

  if (!product) {
    return <main dir="rtl" className="grid min-h-screen place-items-center bg-[#eef2ff] p-6 font-black text-slate-950 dark:bg-slate-950 dark:text-white">محصول پیدا نشد.</main>;
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen overflow-x-hidden bg-[#eef2ff] bg-[radial-gradient(circle_at_top_left,_rgba(99,91,255,.18),transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(34,211,238,.16),transparent_35%)] p-4 text-slate-950 dark:bg-slate-950 dark:text-white"
    >
      <section className="mx-auto w-full min-w-0 max-w-6xl space-y-6">
        <div className="overflow-hidden rounded-[2rem] border border-white/60 bg-white/80 p-4 shadow-2xl shadow-indigo-500/15 backdrop-blur-xl dark:border-white/10 dark:bg-[#171717] dark:shadow-black/40 sm:p-5">
          <div className="relative flex h-44 items-center justify-center overflow-hidden rounded-[1.5rem] border border-white/70 bg-white/85 sm:h-52 dark:border-white/10 dark:bg-slate-900/80">
            {store.banner ? (
              <img src={store.banner} alt={`بنر ${store.store_name}`} className="h-full w-full object-contain" />
            ) : <div className="absolute inset-0 bg-slate-50 dark:bg-slate-900" />}
          </div>
          <div className="flex flex-col items-center gap-4 px-2 py-5 text-center text-slate-950 dark:text-white sm:flex-row sm:text-right">
            <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-[1.5rem] bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100 dark:bg-white/10 dark:text-amber-300 dark:ring-white/10 sm:h-20 sm:w-20">
              {store.logo ? <img src={store.logo} alt={store.store_name} className="h-full w-full bg-white object-contain" /> : <Store size={34} />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-indigo-600 dark:text-amber-300">پیش‌نمایش از دید کاربر</p>
              <h1 className="mt-2 break-words text-2xl font-black sm:text-4xl">{store.store_name}</h1>
              <p className="mt-2 max-w-2xl break-words leading-8 text-slate-600 dark:text-slate-300">{store.description || 'توضیحی برای فروشگاه ثبت نشده است.'}</p>
            </div>
          </div>
        </div>

        <div className="grid min-w-0 gap-6 lg:grid-cols-[380px_1fr]">
          <aside className="min-w-0 rounded-[2rem] border border-white/60 bg-white/75 p-5 shadow-2xl shadow-indigo-200/25 backdrop-blur-xl dark:border-white/10 dark:bg-[#171717] dark:shadow-black/30">
            {productImage ? (
              <img src={productImage} alt={product.title} className="h-80 w-full rounded-[1.5rem] object-contain" />
            ) : (
              <div className="grid h-80 place-items-center rounded-[1.5rem] bg-slate-100 text-slate-400 dark:bg-slate-950 dark:text-slate-500">
                <ImagePlus size={42} />
              </div>
            )}
            <h2 className="mt-5 text-center text-2xl font-black">{product.title}</h2>
            <p className="mt-1 text-center text-sm text-slate-500 dark:text-slate-400">{product.avg_rating ? `${product.avg_rating} امتیاز` : 'بدون امتیاز'}</p>
            {visibleProductFeatures.length > 0 ? (
              <div className="mt-4 grid grid-cols-1 justify-items-center gap-2 sm:grid-cols-2" aria-label="ویژگی‌های محصول">
                {visibleProductFeatures.map((feature) => (
                  <span
                    key={feature}
                    className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300"
                  >
                    <CheckCircle2 size={14} aria-hidden="true" />
                    {feature}
                  </span>
                ))}
              </div>
            ) : null}
            {productImages.length > 1 ? (
              <div className="mt-5 space-y-3">
                <p className="text-sm font-black">مدل لباس انتخابی برای پرو</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {productImages.map((image, index) => (
                    <button
                      type="button"
                      key={`${image}-${index}`}
                      className={`overflow-hidden rounded-2xl border-2 bg-white p-1 transition ${productImage === image ? 'border-indigo-500 ring-4 ring-indigo-500/10' : 'border-slate-200 hover:border-indigo-300 dark:border-white/10'}`}
                      onClick={() => {
                        setSelectedProductImage(image);
                        tryon.reset();
                      }}
                      disabled={saving || imageProcessing}
                      aria-label={`انتخاب مدل ${index + 1}`}
                    >
                      <img src={image} alt={`مدل ${index + 1}`} className="h-20 w-full rounded-xl bg-white object-contain" />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>

          <section className="min-w-0 rounded-[2rem] border border-white/60 bg-white/75 p-4 shadow-2xl shadow-indigo-200/25 backdrop-blur-xl sm:p-6 dark:border-white/10 dark:bg-[#171717] dark:shadow-black/30">
            <h2 className="text-2xl font-black">پرو آنلاین محصول</h2>
            <p className="mt-2 leading-8 text-slate-600 dark:text-slate-300">
              محصول انتخابی ثابت است. تصویر خود را آپلود کنید یا با گوشی عکس بگیرید تا خروجی پرو آنلاین ساخته شود.
            </p>
            <TryOnNotice className="mt-4" />

            <div className="mt-6 grid min-w-0 gap-4">
              <label className="space-y-2">
                <span className="text-sm font-bold text-slate-600 dark:text-slate-300">محصول انتخابی</span>
                <input className="input bg-white/80 text-center text-slate-950 dark:border-white/10 dark:bg-black/30 dark:text-white" value={product.title} readOnly />
              </label>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-600 dark:text-slate-300">تصویر کاربر</span>
                  {fileName ? <span className="max-w-full truncate text-xs text-slate-500 dark:text-slate-400">{fileName}</span> : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-4 text-center font-black text-indigo-700 transition hover:border-indigo-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-indigo-400/20 dark:bg-indigo-500/10 dark:text-indigo-200"
                    onClick={openCamera}
                    disabled={cameraBusy || imageProcessing || saving}
                  >
                    <Camera size={22} aria-hidden="true" />
                    <span>{cameraBusy ? 'در حال آماده‌سازی دوربین...' : 'گرفتن عکس'}</span>
                    <span className="text-xs font-medium text-indigo-600/75 dark:text-indigo-200/70">دریافت مجوز و استفاده از دوربین</span>
                  </button>
                  <button
                    type="button"
                    className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-4 text-center font-black text-slate-700 transition hover:border-indigo-400 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-black/20 dark:text-slate-200 dark:hover:text-indigo-200"
                    onClick={() => uploadInputRef.current?.click()}
                    disabled={imageProcessing || saving}
                  >
                    <Upload size={22} aria-hidden="true" />
                    <span>آپلود عکس</span>
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">انتخاب از دستگاه</span>
                  </button>
                </div>
                <input ref={uploadInputRef} className="sr-only" aria-label="فایل تصویر شخص" disabled={saving} type="file" accept="image/*" onChange={handleImageInput} />
                {imageProcessing ? <p className="rounded-xl bg-indigo-50 px-3 py-2 text-center text-xs font-bold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-200">در حال فشرده‌سازی تصویر برای ارسال امن و سریع...</p> : null}
                {userImage ? (
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/70 p-3 dark:border-white/10 dark:bg-black/20">
                    <img src={userImage} alt="تصویر انتخاب‌شده کاربر" className="max-h-80 w-full rounded-xl object-contain" />
                    <p className="mt-2 text-center text-xs font-bold text-slate-500 dark:text-slate-400">تصویر فشرده و برای ساخت پرو آنلاین آماده است.</p>
                  </div>
                ) : saving && Number(tryon.job?.product_id) === Number(product.id) && tryon.job?.images?.input ? (
                  <div className="flex h-80 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white/70 p-3 dark:border-white/10 dark:bg-black/20"><PrivateImage asset={tryon.job.images.input} alt="تصویر ورودی عملیات در حال پردازش" className="max-h-full w-full object-contain" /></div>
                ) : (
                  <p className="rounded-2xl bg-slate-50 px-4 py-3 text-center text-sm text-slate-500 dark:bg-white/5 dark:text-slate-400">برای شروع، گرفتن عکس یا آپلود عکس را انتخاب کنید.</p>
                )}
              </div>


              <div className="space-y-3 text-xs leading-7 text-slate-500">
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-2 accent-indigo-600" checked={processingConsent} onChange={(event) => setProcessingConsent(event.target.checked)} disabled={saving} />
                  <span>با پردازش عکس برای پرو و نگهداری خصوصی سوابق موافقم. می‌توانم عکس‌های هر مورد را از سوابق خود حذف کنم. سوابق ناشناس به همین مرورگر وابسته‌اند.</span>
                </label>
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-2 accent-indigo-600" checked={diagnosticsConsent} onChange={(event) => setDiagnosticsConsent(event.target.checked)} disabled={saving} />
                  <span>اختیاری: برای رفع اشکال، اطلاعات پایه مرورگر، اندازه صفحه و IP این عملیات حداکثر ۷ روز فقط برای مدیریت نگهداری شود.</span>
                </label>
              </div>

              <div className="flex min-h-[76px] w-full items-center justify-center" data-testid="tryon-action-slot">
                {saving || tryon.job?.status === 'completed' ? <TryonProgress job={tryon.progressJob} /> : tryon.job?.retryable ? (
                  <button type="button" className="btn-primary justify-center" onClick={tryon.retry} disabled={imageProcessing}>
                    <RefreshCw size={18} />تلاش مجدد
                  </button>
                ) : (
                  <button type="button" className="btn-primary justify-center" onClick={runPro}
                    disabled={imageProcessing || !userImage || !processingConsent || !tryon.ready || Boolean(tryon.job?.needs_reconciliation)}>
                    <Sparkles size={18} />{tryon.error && !tryon.job ? 'تلاش مجدد' : 'ساخت خروجی پرو'}
                  </button>
                )}
              </div>
              <div className="min-h-[84px]" aria-live="polite">
                {(error || tryon.error || tryon.job?.error_message) ? (
                  <div role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-center text-sm font-bold text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
                    <p>{error || tryon.error || tryon.job?.error_message}</p>
                    {tryon.job && <p className="mt-1 break-all text-xs">شناسه عملیات: {tryon.job.id}</p>}
                  </div>
                ) : tryon.job?.status === 'completed' ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                    <p>خروجی با موفقیت ذخیره شد.</p><button type="button" className="btn-soft" onClick={tryon.reset}>پرو جدید</button>
                  </div>
                ) : saving ? <p className="text-center text-xs text-slate-500">پرو {tryon.job?.product_title ? '«' + tryon.job.product_title + '»' : 'جاری'} بدون ثبت درخواست تکراری پیگیری می‌شود.</p> : null}
                {tryon.job && !saving && ['failed', 'timed_out'].includes(tryon.job.status) && !tryon.job.needs_reconciliation && (
                  <button className="mt-2 text-xs font-bold text-indigo-600 underline" onClick={tryon.reset}>انتخاب ورودی و شروع فرایند جدید</button>
                )}
              </div>
              {quota && (
                <div className="rounded-2xl bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-200">
                  {saving ? 'پرو آنلاین برای شما رایگان است؛ وضعیت همین درخواست در بالا نمایش داده می‌شود.' : proQuotaMessage(quota)}
                </div>
              )}
              <TryonHistory key={tryon.owner || 'visitor'} latest={tryon.latest} history={tryon.history} error={tryon.historyError}
                onPage={tryon.loadHistory} onDeleted={() => { tryon.reset(); void tryon.loadHistory(); }} />
            </div>
          </section>
        </div>

        {cameraOpen ? (
          <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/75 p-4" role="dialog" aria-modal="true" aria-label="گرفتن عکس با دوربین">
            <div className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-[2rem] bg-white p-4 text-slate-950 shadow-2xl dark:bg-[#171717] dark:text-white sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-lg font-black">گرفتن عکس با دوربین</h3>
                <button type="button" className="btn-soft shrink-0" onClick={closeCamera} aria-label="بستن دوربین">
                  <X size={18} />
                </button>
              </div>
              {cameraError ? (
                <div role="alert" aria-live="assertive" className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 text-center text-sm font-bold text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
                  {cameraError}
                </div>
              ) : null}
              <div role="status" className="mb-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-center text-sm text-sky-950 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-100">
                <p className="font-black">راهنمای ثبت عکس</p>
                <p className="mt-1 text-xs leading-6">لطفاً دوربین را صاف و در جهت درست نگه دارید و آن را کج یا برعکس نگیرید.</p>
                {showBodyGuide ? (
                  <p className="mt-1 text-xs leading-6">تمام بدن را داخل قالب آبی قرار دهید، دست‌ها را ۴۵ درجه باز کنید و پاها را کمی از هم فاصله دهید.</p>
                ) : null}
                {camera.ready && !activeFacingMode ? <p className="mt-1 text-xs leading-6">نوع دوربین در این مرورگر مشخص نیست؛ قالب فقط برای دوربین پشتیِ تأییدشده نمایش داده می‌شود.</p> : null}
              </div>
              <div className="relative overflow-hidden rounded-2xl bg-slate-950">
                <div className="relative mx-auto w-fit max-w-full">
                  <video
                    ref={cameraVideoRef}
                    className="block h-auto max-h-[65vh] max-w-full object-contain"
                    autoPlay
                    playsInline
                    muted
                    onLoadedData={camera.videoReady}
                    onCanPlay={camera.videoReady}
                    onPlaying={camera.videoReady}
                    onWaiting={camera.videoNotReady}
                    onEmptied={camera.videoNotReady}
                    onPause={camera.videoNotReady}
                    onError={camera.videoError}
                    aria-label={cameraFacingMode === 'environment' && activeFacingMode === 'environment' ? 'نمای دوربین پشتی و راهنمای حالت ایستادن' : activeFacingMode === 'user' ? 'نمای دوربین سلفی' : 'پیش‌نمایش دوربین'}
                  />
                  {showBodyGuide ? <BodyScanGuide /> : null}
                </div>
              </div>
              {showBodyGuide ? <p className="mt-2 text-center text-xs leading-6 text-slate-500">۱ متر فقط فاصلهٔ شروع است و اندازه‌گیری نمی‌شود؛ اگر تمام بدن داخل قالب نیست، فاصله را بیشتر کنید.</p> : null}
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  className="btn-soft justify-center"
                  onClick={switchCamera}
                  disabled={cameraBusy || camera.isCapturing}
                  aria-label={cameraFacingMode === 'user' ? 'استفاده از دوربین پشتی' : 'استفاده از دوربین سلفی'}
                >
                  <RefreshCw size={17} />
                  {cameraBusy ? 'در حال تعویض دوربین...' : cameraFacingMode === 'user' ? 'دوربین پشتی' : 'دوربین سلفی'}
                </button>
                <button type="button" className="btn-primary justify-center" onClick={captureCameraImage} disabled={!camera.ready || cameraBusy || camera.isCapturing}>
                  <Camera size={18} />
                  ثبت عکس
                </button>
                <button type="button" className="btn-soft" onClick={closeCamera}>انصراف</button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
