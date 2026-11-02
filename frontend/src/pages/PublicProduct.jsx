import { Camera, CheckCircle2, Info, RefreshCw, Shirt, Sparkles, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePublicStore } from '../hooks/usePublicStore.js';
import PublicPageState, { PublicRecovery } from '../components/public/PublicPageState.jsx';
import { publicApi } from '../services/publicApi.js';
import TryOnNotice from '../components/ui/TryOnNotice.jsx';
import AccessibleModal from '../components/ui/AccessibleModal.jsx';
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
import TryonTerms from '../components/tryon/TryonTerms.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import PublicStoreHero from '../components/public/PublicStoreHero.jsx';
import SelectedProductPanel from '../components/public/SelectedProductPanel.jsx';
import TryonEmptyState from '../components/tryon/TryonEmptyState.jsx';
import '../components/public/public-page.css';

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
  const startButtonRef = useRef(null);
  const cameraButtonRef = useRef(null);
  const storeResource = usePublicStore(slug, productId);
  const store = storeResource.data;
  const [error, setError] = useState('');
  const [userImage, setUserImage] = useState('');
  const [fileName, setFileName] = useState('');
  const [imageProcessing, setImageProcessing] = useState(false);
  const tryon = useTryon();
  const saving = tryon.busy;
  const [quota, setQuota] = useState(null);
  const [quotaState, setQuotaState] = useState({ loading: false, error: '' });
  const [quotaRevision, setQuotaRevision] = useState(0);
  const [selectedProductImage, setSelectedProductImage] = useState('');
  const camera = useCameraCapture();
  const { videoRef: cameraVideoRef, isOpen: cameraOpen, busy: cameraBusy,
    requestedFacingMode, activeFacingMode, error: cameraError } = camera;
  const cameraFacingMode = activeFacingMode || requestedFacingMode;
  const showBodyGuide = shouldShowBodyGuide(camera);
  const imageSelectionIdRef = useRef(0);
  const closeCamera = camera.close;

  const product = useMemo(
    () => store?.products?.find((item) => Number(item.id) === Number(productId)),
    [store, productId],
  );
  const productImages = getProductImages(product);
  const productImage = (selectedProductImage && productImages.includes(selectedProductImage))
    ? selectedProductImage
    : Number(tryon.job?.product_id) === Number(product?.id) && productImages[tryon.job?.image_index]
      ? productImages[tryon.job.image_index] : productImages[0] || getProductImage(product);
  const productFeatures = getProductFeatures(product);

  useEffect(() => {
    if (!product?.id || storeResource.offline) return undefined;
    let mounted = true;
    publicApi.getProQuota(slug, product.id)
      .then((value) => { if (mounted) { setQuota(value); setQuotaState({ loading: false, error: '' }); } })
      .catch((requestError) => { if (mounted) setQuotaState({ loading: false, error: requestError.message || 'دریافت اعتبار فروشگاه کامل نشد.' }); });
    return () => { mounted = false; };
  }, [slug, product?.id, tryon.job?.status, storeResource.offline, quotaRevision]);

  const selectImage = async (file, isSelectionCurrent = () => true) => {
    if (saving || tryon.checkingTerms) throw new Error('تا پایان عملیات جاری، تصویر ورودی را تغییر ندهید.');
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
    if (cameraBusy || imageProcessing || saving || tryon.checkingTerms) return false;
    setError('');
    return camera.open();
  };
  const switchCamera = camera.switchCamera;
  const captureCameraImage = () => camera.capture(selectImage);

  const runPro = (acceptTermsVersion) => {
    if (!product || !userImage || saving || imageProcessing || tryon.checkingTerms) return;
    setError('');
    void tryon.start({
      slug, productId: product.id, image: userImage,
      imageIndex: Math.max(0, productImages.indexOf(productImage)), acceptTermsVersion,
    });
  };

  if (!store) return <PublicPageState resource={storeResource} product />;

  if (!product) {
    return <main dir="rtl" className="public-page"><div className="public-state public-surface">محصول پیدا نشد.</div></main>;
  }

  return (
    <main dir="rtl" className="public-page public-page--tryon">
      <section className="public-container">
        <PublicRecovery resource={storeResource} product inline />
        <PublicStoreHero store={store} compact />
        <div className="public-tryon-layout">
          <SelectedProductPanel product={product} image={productImage} images={productImages} features={productFeatures}
            disabled={saving || imageProcessing || tryon.checkingTerms}
            onSelect={(image) => { setSelectedProductImage(image); tryon.reset(); }} />
          <section className="public-tryon-form public-surface" aria-labelledby="public-tryon-title">
            <div className="public-form-heading">
              <span className="public-form-icon"><Shirt size={25} aria-hidden="true" /></span>
              <h2 id="public-tryon-title">پرو آنلاین محصول</h2>
            </div>
            <p className="public-form-description">محصول انتخابی ثابت است. تصویر خود را آپلود کنید یا با دوربین عکس بگیرید تا خروجی پرو آنلاین ساخته شود.</p>
            <TryOnNotice className="public-tryon-notice" />
            <div className="public-tryon-fields">
              <dl className="public-fixed-product"><dt>محصول انتخابی</dt><dd>{product.title}</dd></dl>
              <div className="public-image-selection">
                <div className="public-upload-label"><span>تصویر کاربر</span>{fileName && <span className="public-file-name" title={fileName}>{fileName}</span>}</div>
                <div className="public-upload-options">
                  <button ref={cameraButtonRef} type="button" className="public-upload-option public-upload-option--camera" onClick={openCamera}
                    aria-busy={cameraBusy} aria-disabled={cameraBusy || imageProcessing || saving || tryon.checkingTerms}
                    disabled={cameraBusy && cameraOpen || imageProcessing || saving || tryon.checkingTerms}>
                    <Camera size={26} aria-hidden="true" />
                    <b>{cameraBusy ? 'در حال آماده‌سازی دوربین...' : 'گرفتن عکس'}</b>
                    <span>دریافت مجوز و استفاده از دوربین</span>
                  </button>
                  <button type="button" className="public-upload-option" onClick={() => uploadInputRef.current?.click()}
                    disabled={imageProcessing || saving || tryon.checkingTerms}>
                    <Upload size={25} aria-hidden="true" /><b>آپلود عکس</b><span>انتخاب از دستگاه</span>
                  </button>
                </div>
                <input ref={uploadInputRef} className="sr-only" aria-label="فایل تصویر شخص" disabled={saving || tryon.checkingTerms} type="file" accept="image/*" onChange={handleImageInput} />
                {imageProcessing && <p role="status" className="text-center text-xs text-indigo-600">در حال فشرده‌سازی تصویر برای ارسال امن و سریع...</p>}
                {userImage ? (
                  <figure className="public-person-preview">
                    <img src={userImage} alt="تصویر انتخاب‌شده کاربر" />
                    <figcaption>تصویر آماده است و می‌توانید پرو آنلاین را شروع کنید.</figcaption>
                  </figure>
                ) : Number(tryon.job?.product_id) === Number(product.id) && tryon.job?.images?.input ? (
                  <div className="public-person-preview public-person-preview--active"><PrivateImage asset={tryon.job.images.input} alt={saving ? 'تصویر ورودی عملیات در حال پردازش' : 'تصویر ورودی این پرو'} className="max-h-full w-full object-contain" /></div>
                ) : <TryonEmptyState input />}
              </div>
              <div className="public-action-slot" data-testid="tryon-action-slot">
                {saving || tryon.job?.status === 'completed' ? <TryonProgress job={tryon.progressJob} /> : tryon.job?.retryable ? (
                  <button type="button" className="btn-primary" onClick={tryon.retry} disabled={imageProcessing}><RefreshCw size={18} aria-hidden="true" />تلاش مجدد</button>
                ) : (
                  <button ref={startButtonRef} type="button" className="btn-primary" onClick={() => runPro()}
                    disabled={imageProcessing || !userImage || tryon.checkingTerms || !tryon.ready || Boolean(tryon.job?.needs_reconciliation)}>
                    <Sparkles size={19} aria-hidden="true" />{tryon.checkingTerms ? 'در حال بررسی...' : tryon.error && !tryon.job ? 'تلاش مجدد' : 'ساخت خروجی پرو'}
                  </button>
                )}
              </div>
              <div className="public-operation-feedback" aria-live="polite">
                {tryon.reconnecting && <div role="status" className="public-operation-connection">
                  <p>{tryon.pendingRequestKey ? 'وضعیت دریافت درخواست هنوز مشخص نیست؛ همان شناسه پیگیری می‌شود.' : 'در انتظار اتصال مجدد؛ همان عملیات در سرور پیگیری می‌شود.'}</p>
                  {tryon.pendingRequestKey && <button type="button" className="public-button public-button--outline" onClick={tryon.retryPending} disabled={tryon.sending}>پیگیری و تلاش مجدد همین درخواست</button>}
                </div>}
                {(error || tryon.error || !tryon.busy && tryon.job?.error_message) ? (
                  <div role="alert" className="public-operation-error">
                    <p>{error || tryon.error || tryon.job?.error_message}</p>
                    {tryon.job && <p className="public-operation-id">شناسه عملیات: {tryon.job.id}</p>}
                    {tryon.trackingStopped && <button type="button" className="public-button public-button--outline" onClick={tryon.retryTracking}>تلاش مجدد پیگیری عملیات</button>}
                  </div>
                ) : tryon.job?.status === 'completed' ? (
                  <div className="public-success"><p><CheckCircle2 size={29} aria-hidden="true" />خروجی با موفقیت ذخیره شد.</p><button type="button" className="btn-soft" onClick={tryon.reset}>پرو جدید</button></div>
                ) : saving ? <p>پرو {tryon.job?.product_title ? '«' + tryon.job.product_title + '»' : 'جاری'} بدون ثبت درخواست تکراری پیگیری می‌شود.</p> : null}
                {tryon.job && !saving && ['failed', 'timed_out'].includes(tryon.job.status) && !tryon.job.needs_reconciliation && (
                  <button className="public-operation-reset" onClick={tryon.reset}>انتخاب ورودی و شروع فرایند جدید</button>
                )}
              </div>
              {quota && <div className="public-credit-notice"><Info size={19} aria-hidden="true" /><p>{saving ? 'پرو آنلاین برای شما رایگان است؛ وضعیت همین درخواست در بالا نمایش داده می‌شود.' : proQuotaMessage(quota)}</p></div>}
              {(quotaState.loading || !quota && !quotaState.error && !storeResource.offline) && <p role="status" className="public-independent-error">در حال دریافت اعتبار فروشگاه...</p>}
              {quotaState.error && <p role="status" className="public-independent-error">وضعیت اعتبار فروشگاه به‌روز نشد. <button type="button" onClick={() => { setQuotaState({ loading: true, error: '' }); setQuotaRevision(value => value + 1); }} disabled={quotaState.loading}>تلاش مجدد دریافت اعتبار</button></p>}
              <TryonHistory key={tryon.owner || 'visitor'} latest={tryon.latest} history={tryon.history} error={tryon.historyError} onPage={tryon.loadHistory} />
            </div>
          </section>
        </div>

        <TryonTerms terms={tryon.terms} busy={tryon.checkingTerms} error={tryon.error}
          onAccept={() => runPro(tryon.terms.version)} onClose={tryon.dismissTerms} returnFocusRef={startButtonRef} />

        <AccessibleModal open={cameraOpen} onClose={closeCamera} title="گرفتن عکس با دوربین" closeLabel="بستن دوربین" returnFocusRef={cameraButtonRef}>
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
        </AccessibleModal>
      </section>
    </main>
  );
}
