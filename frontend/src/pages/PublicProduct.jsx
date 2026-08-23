import { Camera, CheckCircle2, Download, ImagePlus, LogIn, RefreshCw, Sparkles, Store, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import apiClient from '../services/apiClient.js';
import { publicApi } from '../services/publicApi.js';
import { userApi } from '../services/user/userApi.js';
import { readImageAsDataUrl } from '../utils/file.js';
import { getProductImage, getProductImages } from '../utils/productImage.js';
import { getProductFeatures } from '../utils/productFeatures.js';
import { downloadProOutput, getProOutputSource } from '../utils/proOutput.js';
import { preparePersonImage } from '../utils/personImage.js';
import { toPersianMessage } from '../utils/errorMessages.js';

function detectImageMime(bytes, fallback = 'image/jpeg') {
  if (bytes.length >= 12
    && bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50) return 'image/webp';
  if (bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  return fallback || 'image/jpeg';
}

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

function dataUrlToFile(dataUrl, filename) {
  const [metadata, encoded] = dataUrl.split(',');
  const declaredMime = metadata.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const mime = detectImageMime(bytes, declaredMime);
  return new File([bytes], withImageExtension(filename, mime), { type: mime });
}

async function imageSourceToFile(source, filename) {
  if (!source) return null;
  if (source.startsWith('data:')) return dataUrlToFile(source, filename);
  const response = await fetch(source);
  if (!response.ok) throw new Error('تصویر محصول قابل دریافت نیست.');
  const blob = await response.blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mime = detectImageMime(bytes, response.headers.get('content-type') || blob.type || 'image/jpeg');
  return new File([bytes], withImageExtension(filename, mime), { type: mime });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('خواندن تصویر خروجی ناموفق بود.'));
    reader.readAsDataURL(blob);
  });
}

function findProImageSource(payload) {
  if (typeof payload === 'string') {
    return /^(https?:\/\/|data:image\/|blob:)/i.test(payload.trim()) ? payload.trim() : '';
  }
  if (!payload || typeof payload !== 'object') return '';

  const keys = ['image_url', 'imageUrl', 'output_image', 'outputImage', 'result_url', 'resultUrl', 'url', 'image', 'result', 'output', 'data', 'link'];
  for (const key of keys) {
    const source = findProImageSource(payload[key]);
    if (source) return source;
  }
  return '';
}

function readProError(payload, fallback) {
  if (typeof payload === 'string' && payload.trim()) return toPersianMessage(payload.trim(), fallback);
  if (!payload || typeof payload !== 'object') return fallback;
  if (typeof payload.detail === 'string') return toPersianMessage(payload.detail, fallback);
  if (typeof payload.message === 'string') return toPersianMessage(payload.message, fallback);
  if (typeof payload.error === 'string') return toPersianMessage(payload.error, fallback);
  if (Array.isArray(payload.errors) && payload.errors[0]) {
    return typeof payload.errors[0] === 'string'
      ? toPersianMessage(payload.errors[0], fallback)
      : toPersianMessage(payload.errors[0].message, fallback);
  }
  return fallback;
}

async function readProResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.startsWith('image/')) {
    return blobToDataUrl(await response.blob());
  }

  const rawBody = await response.text();
  let body = rawBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    // Some provider versions return the output URL as plain text.
  }

  if (!response.ok) {
    throw new Error(readProError(body, 'ساخت خروجی پرو آنلاین ناموفق بود.'));
  }

  if (body?.success === false || ['error', 'failed', 'failure'].includes(String(body?.status || '').toLowerCase())) {
    throw new Error(readProError(body, 'ساخت خروجی پرو آنلاین ناموفق بود.'));
  }

  const source = findProImageSource(body);
  if (!source) throw new Error('پاسخ API تصویر خروجی نداشت.');
  const proxiedSource = getProOutputSource(source);
  if (proxiedSource !== source) {
    const imageResponse = await fetch(proxiedSource, { cache: 'no-store' });
    if (!imageResponse.ok) throw new Error('دریافت تصویر خروجی پرو آنلاین ناموفق بود.');
    return blobToDataUrl(await imageResponse.blob());
  }
  return source;
}

export default function PublicProduct() {
  const { slug, productId } = useParams();
  const { user } = useAuth();
  const cameraInputRef = useRef(null);
  const uploadInputRef = useRef(null);
  const [store, setStore] = useState(null);
  const [error, setError] = useState('');
  const [userImage, setUserImage] = useState('');
  const [fileName, setFileName] = useState('');
  const [output, setOutput] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState('');
  const [quota, setQuota] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedProductImage, setSelectedProductImage] = useState('');

  useEffect(() => {
    apiClient
      .get(`/api/stores/${slug}`)
      .then((response) => setStore(response.data.data))
      .catch((fetchError) => setError(fetchError.message));
  }, [slug]);

  const product = useMemo(
    () => store?.products?.find((item) => Number(item.id) === Number(productId)),
    [store, productId],
  );
  const productImages = getProductImages(product);
  const productImage = (selectedProductImage && productImages.includes(selectedProductImage))
    ? selectedProductImage
    : productImages[0] || getProductImage(product);
  const productFeatures = getProductFeatures(product);
  const visibleProductFeatures = productFeatures.length
    ? productFeatures
    : ['مناسب پرو آنلاین', 'انتخاب مدل لباس', 'خروجی باکیفیت'];

  useEffect(() => {
    if (!product?.id) return undefined;

    let mounted = true;
    const quotaRequest = user ? userApi.getProQuota(product.id) : publicApi.getProQuota(slug, product.id);
    const historyRequest = user
      ? userApi.getServices().then((services) => (services.services || []).filter((item) => Number(item.productId) === Number(product.id)))
      : publicApi.getProHistory(slug, product.id);

    Promise.all([quotaRequest, historyRequest])
      .then(([nextQuota, nextHistory]) => {
        if (!mounted) return;
        setQuota(nextQuota);
        setHistory(nextHistory);
      })
      .catch(() => {
        if (mounted) setQuota(null);
      });
    return () => {
      mounted = false;
    };
  }, [slug, user, product?.id]);

  const selectImage = async (file) => {
    if (!file || (file.type && !file.type.startsWith('image/'))) {
      throw new Error('لطفاً یک فایل تصویری انتخاب کنید.');
    }
    const dataUrl = await readImageAsDataUrl(file);
    setUserImage(dataUrl);
    setFileName(file.name);
    setOutput('');
    setDone('');
    setError('');
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

  const runPro = async () => {
    if (!product || !userImage) return;
    setSaving(true);
    setError('');
    try {
      const currentQuota = user ? await userApi.getProQuota(product.id) : await publicApi.getProQuota(slug, product.id);
      setQuota(currentQuota);
      if (!currentQuota.has_subscription && currentQuota.free_remaining <= 0) {
        throw new Error('سه تجربه رایگان شما تمام شده است. برای ادامه اشتراک بخرید.');
      }
      const uploadedImage = user
        ? await userApi.uploadProImage(product.id, { image: userImage, file_name: fileName || 'person.jpg' })
        : await publicApi.uploadProImage(slug, product.id, { image: userImage, file_name: fileName || 'person.jpg' });
      if (!uploadedImage?.id) throw new Error('ذخیره تصویر شما روی سرور ناموفق بود.');
      const clothFile = await imageSourceToFile(productImage, `product-${product.id}.jpg`);
      if (!clothFile) throw new Error('برای این محصول تصویر ثبت نشده است.');
      const preparedPersonImage = await preparePersonImage(userImage);

      const formData = new FormData();
      formData.append('person', dataUrlToFile(preparedPersonImage, fileName || 'person.jpg'));
      formData.append('cloth', clothFile);
      const providerResponse = await fetch(import.meta.env.VITE_PRO_API_URL || '/pro-api/try-on', {
        method: 'POST',
        body: formData,
      });
      const providerOutput = await readProResponse(providerResponse);
      const result = await (user
        ? userApi.useProService({
          product_id: product.id,
          amount: 0,
          input_image: userImage,
          upload_id: uploadedImage.id,
          product_image: productImage,
          output_image: providerOutput,
          description: `پرو آنلاین برای محصول «${product.title}»`,
        })
        : publicApi.usePro(slug, product.id, {
          product_id: product.id,
          amount: 0,
          input_image: userImage,
          upload_id: uploadedImage.id,
          product_image: productImage,
          output_image: providerOutput,
          description: `پرو آنلاین برای محصول «${product.title}»`,
        }));
      const savedOutput = getProOutputSource(result.output_image || providerOutput);
      setOutput(savedOutput);
      setQuota((current) => ({
        ...(current || currentQuota),
        free_used: result.free_used ?? current?.free_used ?? currentQuota.free_used,
        free_remaining: result.free_remaining ?? current?.free_remaining ?? currentQuota.free_remaining,
        has_subscription: result.has_subscription ?? current?.has_subscription ?? currentQuota.has_subscription,
      }));
      setHistory((current) => [
        {
          id: result.id,
          title: result.description || `پرو آنلاین برای ${product.title}`,
          outputImage: savedOutput,
          productId: product.id,
          expiresAt: new Date().toLocaleDateString('fa-IR'),
        },
        ...current,
      ]);
      setDone(`خروجی پرو آنلاین ذخیره شد. شماره درخواست: ${result.id}`);
    } catch (requestError) {
      setError(requestError.message || 'ثبت درخواست پرو آنلاین ناموفق بود.');
    } finally {
      setSaving(false);
    }
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
          <div className="relative flex h-44 items-center justify-center overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-indigo-600 via-violet-600 to-cyan-500 sm:h-52">
            {store.banner ? (
              <img src={store.banner} alt={`بنر ${store.store_name}`} className="h-full w-full object-contain" />
            ) : (
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,.3),transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(34,211,238,.35),transparent_45%)]" />
            )}
          </div>
          <div className="flex flex-col items-center gap-4 px-2 py-5 text-center text-slate-950 dark:text-white sm:flex-row sm:text-right">
            <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-[1.5rem] bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100 dark:bg-white/10 dark:text-amber-300 dark:ring-white/10 sm:h-20 sm:w-20">
              {store.logo ? <img src={store.logo} alt={store.store_name} className="h-full w-full object-cover" /> : <Store size={34} />}
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
              <div className="mt-4 flex flex-wrap justify-center gap-2" aria-label="ویژگی‌های محصول">
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
                        setOutput('');
                        setDone('');
                      }}
                      aria-label={`انتخاب مدل ${index + 1}`}
                    >
                      <img src={image} alt={`مدل ${index + 1}`} className="h-20 w-full rounded-xl object-cover" />
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
                    className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-4 text-center font-black text-indigo-700 transition hover:border-indigo-400 dark:border-indigo-400/20 dark:bg-indigo-500/10 dark:text-indigo-200"
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    <Camera size={22} aria-hidden="true" />
                    <span>گرفتن عکس</span>
                    <span className="text-xs font-medium text-indigo-600/75 dark:text-indigo-200/70">استفاده از دوربین</span>
                  </button>
                  <button
                    type="button"
                    className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-4 text-center font-black text-slate-700 transition hover:border-indigo-400 hover:text-indigo-700 dark:border-white/10 dark:bg-black/20 dark:text-slate-200 dark:hover:text-indigo-200"
                    onClick={() => uploadInputRef.current?.click()}
                  >
                    <Upload size={22} aria-hidden="true" />
                    <span>آپلود عکس</span>
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">انتخاب از دستگاه</span>
                  </button>
                </div>
                <input ref={cameraInputRef} className="sr-only" type="file" accept="image/*" capture="user" onChange={handleImageInput} />
                <input ref={uploadInputRef} className="sr-only" type="file" accept="image/*" onChange={handleImageInput} />
                {userImage ? (
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/70 p-3 dark:border-white/10 dark:bg-black/20">
                    <img src={userImage} alt="تصویر انتخاب‌شده کاربر" className="max-h-80 w-full rounded-xl object-contain" />
                    <p className="mt-2 text-center text-xs font-bold text-slate-500 dark:text-slate-400">تصویر برای ساخت پرو آنلاین آماده است.</p>
                  </div>
                ) : (
                  <p className="rounded-2xl bg-slate-50 px-4 py-3 text-center text-sm text-slate-500 dark:bg-white/5 dark:text-slate-400">برای شروع، گرفتن عکس یا آپلود عکس را انتخاب کنید.</p>
                )}
              </div>

              {error ? (
                <div role="alert" aria-live="assertive" className="rounded-2xl bg-rose-50 px-4 py-4 text-center text-sm font-bold text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
                  <p>{error}</p>
                  {userImage ? (
                    <button type="button" className="btn-primary mx-auto mt-3 justify-center" onClick={runPro} disabled={saving}>
                      <RefreshCw size={17} />
                      {saving ? 'در حال تلاش...' : 'تلاش مجدد'}
                    </button>
                  ) : null}
                </div>
              ) : null}
              {done ? <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{done}</div> : null}

              <div className="flex flex-wrap justify-center gap-3">
                {!error ? (
                  <button className="btn-primary justify-center" onClick={runPro} disabled={saving || !userImage}>
                    <Sparkles size={18} />
                    {saving ? 'در حال ساخت خروجی...' : 'ساخت خروجی پرو'}
                  </button>
                ) : null}
                {output ? (
                  <button className="btn-soft" onClick={() => downloadProOutput(output, `pro-output-${product.id}.png`).catch((downloadError) => setError(downloadError.message))}>
                    <Download size={18} />
                    دانلود خروجی
                  </button>
                ) : null}
              </div>

              {quota ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-200">
                  <span>
                    {quota.has_subscription
                      ? `اشتراک فعال تا ${new Date(quota.subscription.expires_at).toLocaleDateString('fa-IR')}`
                      : `${Number(quota.free_remaining || 0).toLocaleString('fa-IR')} تجربه رایگان باقی مانده است.`}
                  </span>
                  {!quota.has_subscription && quota.free_remaining <= 0 ? (
                    <Link
                      className="btn-primary"
                      to={user ? '/user/packages' : `/login?next=${encodeURIComponent(`/stores/${slug}/products/${product.id}`)}&store=${slug}`}
                    >
                      <LogIn size={16} />
                      ورود و خرید اشتراک
                    </Link>
                  ) : null}
                </div>
              ) : null}

              {output ? (
                <div className="rounded-[1.75rem] border border-slate-200 bg-white/70 p-3 dark:border-white/10 dark:bg-black/30">
                  <img src={output} alt="خروجی پرو آنلاین" className="max-h-[420px] w-full rounded-[1.25rem] object-contain" />
                </div>
              ) : null}

              {history.length > 0 ? (
                <div className="space-y-3 rounded-[1.75rem] border border-slate-200 bg-white/60 p-4 dark:border-white/10 dark:bg-black/20">
                  <h3 className="font-black">سوابق پرو آنلاین این محصول</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {history.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900">
                        {item.outputImage ? <img src={getProOutputSource(item.outputImage)} alt="خروجی پرو آنلاین" className="h-44 w-full rounded-xl object-contain" /> : null}
                        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span>درخواست #{item.id}</span>
                          {item.outputImage ? (
                            <button className="btn-soft px-3 py-2 text-xs" onClick={() => downloadProOutput(item.outputImage, `pro-output-${item.id}.png`).catch((downloadError) => setError(downloadError.message))}>
                              <Download size={14} />
                              دانلود
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
