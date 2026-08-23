import { CheckCircle2, ImagePlus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import SellerDrawer from '../../../components/seller/SellerDrawer';
import SellerModal from '../../../components/seller/SellerModal';
import SellerPageHeader from '../../../components/seller/SellerPageHeader';
import SellerTable from '../../../components/seller/SellerTable';
import SellerToast from '../../../components/seller/SellerToast';
import SellerToolbar from '../../../components/seller/SellerToolbar';
import FileDropzone from '../../../components/ui/FileDropzone.jsx';
import { useAsyncResource } from '../../../hooks/useAsyncResource';
import { sellerApi } from '../../../services/seller/sellerApi';
import { readImageAsDataUrl } from '../../../utils/file';
import { getProductImage, getProductImages } from '../../../utils/productImage';
import { getProductFeatures, normalizeProductFeatures } from '../../../utils/productFeatures.js';

const filters = [
  { value: 'active', label: 'محصولات فعال' },
  { value: 'rejected', label: 'محصولات رد شده' },
  { value: 'pending', label: 'در انتظار بررسی' },
];

const statusLabel = {
  active: 'تایید شده',
  pending: 'در انتظار بررسی',
  rejected: 'رد شده',
};

const emptyForm = { id: null, title: '', description: '', images: [] };

function ProductGallery({ product, className = '' }) {
  const images = getProductImages(product);
  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`}>
      <div className="flex min-w-0 -space-x-2 rtl:space-x-reverse">
        {(images.length ? images : [getProductImage(product)]).slice(0, 4).map((image, index) => (
          <img key={`${image}-${index}`} src={image} alt={`${product.title} ${index + 1}`} className="h-14 w-14 rounded-2xl border-2 border-white object-cover shadow-sm dark:border-slate-900" />
        ))}
      </div>
      <span className="whitespace-nowrap text-xs font-black text-slate-500 dark:text-slate-400">{images.length || 1} مدل</span>
    </div>
  );
}

export default function SellerProducts() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { loading, data = [] } = useAsyncResource(() => sellerApi.getProducts(), [refreshKey]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('active');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);
  const [drawerProduct, setDrawerProduct] = useState(null);
  const [qr, setQr] = useState(null);
  const [toast, setToast] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [imageNames, setImageNames] = useState([]);
  const [features, setFeatures] = useState([]);
  const [featureInput, setFeatureInput] = useState('');

  const rows = useMemo(
    () =>
      data.filter((item) => {
        const matchesFilter = item.status === filter;
        const source = `${item.title} ${item.statusLabel || ''} ${item.publishLabel || ''}`;
        return matchesFilter && source.includes(search);
      }),
    [data, filter, search],
  );

  const notify = (message) => {
    setToast(message);
    setTimeout(() => setToast(''), 2200);
  };

  const openCreate = () => {
    setForm(emptyForm);
    setImageNames([]);
    setFeatures([]);
    setFeatureInput('');
    setModal(true);
  };

  const openEdit = (product) => {
    const draft = product.pendingChanges || {};
    const draftImages = Array.isArray(draft.images) && draft.images.length > 0 ? draft.images : getProductImages(product);
    const draftFeatures = normalizeProductFeatures(draft.features ?? product.features);
    setForm({
      id: product.id,
      title: draft.title || product.title,
      description: draft.description ?? product.description ?? '',
      images: draftImages,
    });
    setImageNames(draftImages.map((_, index) => `image-${index + 1}`));
    setFeatures(draftFeatures);
    setFeatureInput('');
    setModal(true);
  };

  const handleImages = async (files) => {
    const imageFiles = files.filter((file) => file.type?.startsWith('image/'));
    const prepared = await Promise.all(imageFiles.map(async (file) => ({ name: file.name, src: await readImageAsDataUrl(file) })));
    setForm((current) => ({ ...current, images: [...current.images, ...prepared.map((item) => item.src)] }));
    setImageNames((current) => [...current, ...prepared.map((item) => item.name)]);
  };

  const removeImage = (index) => {
    setForm((current) => ({ ...current, images: current.images.filter((_, imageIndex) => imageIndex !== index) }));
    setImageNames((current) => current.filter((_, imageIndex) => imageIndex !== index));
  };

  const addFeatures = () => {
    const nextFeatures = normalizeProductFeatures(featureInput);
    if (!nextFeatures.length) return;
    setFeatures((current) => normalizeProductFeatures([...current, ...nextFeatures]));
    setFeatureInput('');
  };

  const removeFeature = (index) => {
    setFeatures((current) => current.filter((_, featureIndex) => featureIndex !== index));
  };

  const submit = async () => {
    const payload = {
      id: form.id,
      title: form.title.trim(),
      description: form.description.trim(),
      features: normalizeProductFeatures([...features, ...normalizeProductFeatures(featureInput)]),
      images: form.images,
      price: 0,
    };

    if (!payload.title.trim()) {
      notify('نام محصول را وارد کنید.');
      return;
    }
    if (!payload.images.length) {
      notify('حداقل یک مدل لباس را انتخاب کنید.');
      return;
    }

    if (form.id) {
      await sellerApi.updateProduct(form.id, payload);
      notify('ویرایش محصول برای بررسی ادمین ارسال شد؛ تا تایید، نسخه قبلی در سایت می‌ماند.');
    } else {
      await sellerApi.createProduct(payload);
      notify('محصول ثبت شد و برای بررسی ادمین ارسال شد.');
    }

    setModal(false);
    setForm(emptyForm);
    setImageNames([]);
    setFeatures([]);
    setFeatureInput('');
    setRefreshKey((key) => key + 1);
  };

  const showQr = async (product) => {
    const response = await sellerApi.getProductQrCode(product.id);
    setQr({ ...response, title: product.title });
  };

  const togglePublish = async (product) => {
    const nextStatus = product.publishStatus === 'inactive' ? 'active' : 'inactive';
    await sellerApi.setProductPublishStatus(product.id, nextStatus);
    notify(nextStatus === 'active' ? 'محصول در سایت فعال شد.' : 'محصول از سایت غیرفعال شد.');
    setRefreshKey((key) => key + 1);
  };

  return (
    <section className="page">
      <SellerPageHeader
        title="محصولات فروشنده"
        description="محصولات تایید شده، در انتظار بررسی و رد شده را مدیریت کنید. ویرایش محصول تایید شده فقط بعد از تایید ادمین روی سایت اعمال می‌شود."
        action={<button className="btn-primary" onClick={openCreate}>افزودن محصول</button>}
      />

      <SellerToolbar search={search} onSearch={setSearch} filter={filter} onFilter={setFilter} filters={filters} />

      {loading ? null : (
        <SellerTable
          page={page}
          onPageChange={setPage}
          rows={rows}
          columns={[
            { key: 'image', label: 'مدل‌ها', render: (row) => <ProductGallery product={row} /> },
            { key: 'title', label: 'محصول' },
            {
              key: 'rating',
              label: 'امتیاز',
              render: (row) => (row.reviewCount ? `${row.rating} از ۵ (${row.reviewCount})` : 'بدون امتیاز'),
            },
            {
              key: 'status',
              label: 'وضعیت تایید',
              render: (row) => (
                <div className="flex flex-wrap gap-2">
                  <span className="badge bg-indigo-500/10 text-indigo-600">{statusLabel[row.status]}</span>
                  {row.hasPendingChanges && <span className="badge bg-amber-500/10 text-amber-600">ویرایش در انتظار تایید</span>}
                </div>
              ),
            },
            {
              key: 'publishStatus',
              label: 'نمایش در سایت',
              render: (row) => (
                <span className={`badge ${row.publishStatus === 'inactive' ? 'bg-slate-500/10 text-slate-600' : 'bg-emerald-500/10 text-emerald-600'}`}>
                  {row.status === 'active' ? row.publishLabel : 'بعد از تایید'}
                </span>
              ),
            },
          ]}
          actions={(row) => (
            <div className="flex flex-wrap gap-2">
              <button className="btn-soft" onClick={() => setDrawerProduct(row)}>جزئیات</button>
              <button className="btn-soft" onClick={() => openEdit(row)}>ویرایش</button>
              {row.status === 'active' && (
                <button className="btn-soft" onClick={() => togglePublish(row)}>
                  {row.publishStatus === 'inactive' ? 'فعال کردن' : 'غیرفعال کردن'}
                </button>
              )}
              <button className="btn-soft" onClick={() => showQr(row)}>QR</button>
            </div>
          )}
        />
      )}

      <SellerModal open={modal} title={form.id ? 'ویرایش محصول' : 'افزودن محصول جدید'} onClose={() => setModal(false)}>
        <div className="grid gap-4">
          <input className="input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="نام محصول" />

          <textarea
            className="input min-h-24 resize-y"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            placeholder="توضیح کوتاه محصول"
          />

          <label className="space-y-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">ویژگی‌های محصول</span>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-black/20">
              {features.length > 0 ? (
                <div className="mb-3 flex flex-wrap gap-2">
                  {features.map((feature, index) => (
                    <span key={`${feature}-${index}`} className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-200">
                      {feature}
                      <button
                        type="button"
                        className="grid h-5 w-5 place-items-center rounded-full text-indigo-500 transition hover:bg-indigo-100 hover:text-rose-600 dark:hover:bg-white/10"
                        onClick={() => removeFeature(index)}
                        aria-label={`حذف ویژگی ${feature}`}
                        title="حذف ویژگی"
                      >
                        <X size={13} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              <input
                className="w-full bg-transparent px-1 py-2 text-sm outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
                value={featureInput}
                onChange={(event) => setFeatureInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addFeatures();
                  }
                }}
                placeholder="ویژگی را بنویسید و Enter بزنید"
                aria-label="افزودن ویژگی محصول"
              />
            </div>
            <span className="block text-xs text-slate-500 dark:text-slate-400">هر ویژگی پس از زدن Enter به‌صورت تگ ذخیره می‌شود؛ برای حذف روی ضربدر بزنید.</span>
          </label>

          <FileDropzone
            accept="image/*"
            image
            multiple
            fileNames={imageNames}
            previewList={form.images}
            label="گالری تصاویر محصول"
            helper="یک یا چند عکس محصول را بکشید و رها کنید یا از سیستم انتخاب کنید."
            onSelectMany={handleImages}
          />

          {form.images.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {form.images.map((image, index) => (
                <div key={`${image}-${index}`} className="relative overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white/70 dark:border-slate-700 dark:bg-slate-900/70">
                  <img src={image} alt={`product-${index + 1}`} className="h-36 w-full object-cover" />
                  <button
                    type="button"
                    className="absolute left-3 top-3 grid h-9 w-9 place-items-center rounded-2xl bg-white/90 text-rose-600 shadow-md dark:bg-slate-950/90"
                    onClick={() => removeImage(index)}
                    aria-label="حذف تصویر"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button className="btn-primary" onClick={submit}>
            {form.id ? 'ذخیره و ارسال برای بررسی' : 'ثبت محصول'}
          </button>
        </div>
      </SellerModal>

      <SellerModal open={Boolean(qr)} title="QR Code محصول" onClose={() => setQr(null)}>
        {qr && (
          <div className="grid gap-4 text-center">
            <img className="mx-auto h-44 w-44 rounded-2xl bg-white p-3" src={qr.qrcode} alt={`QR ${qr.title}`} />
            <p className="break-all text-sm text-slate-500">{qr.url}</p>
          </div>
        )}
      </SellerModal>

      <SellerDrawer open={Boolean(drawerProduct)} title="جزئیات وضعیت محصول" onClose={() => setDrawerProduct(null)}>
        {drawerProduct && (
          <div className="space-y-4 text-sm">
            <ProductGallery product={drawerProduct} />
            {getProductImages(drawerProduct).length > 1 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {getProductImages(drawerProduct).map((image, index) => (
                  <div key={`${image}-${index}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
                    <img src={image} alt={`${drawerProduct.title} مدل ${index + 1}`} className="h-32 w-full rounded-xl object-cover" />
                  </div>
                ))}
              </div>
            ) : <div className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500 dark:bg-slate-800"><ImagePlus size={16} className="ml-2 inline" />یک مدل لباس برای این محصول ثبت شده است.</div>}
            <p><b>محصول:</b> {drawerProduct.title}</p>
            {getProductFeatures(drawerProduct).length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {getProductFeatures(drawerProduct).map((feature) => (
                  <span key={feature} className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 size={14} />
                    {feature}
                  </span>
                ))}
              </div>
            ) : null}
            <p><b>وضعیت تایید:</b> {statusLabel[drawerProduct.status]}</p>
            <p><b>نمایش در سایت:</b> {drawerProduct.status === 'active' ? drawerProduct.publishLabel : 'بعد از تایید'}</p>
            <p><b>امتیاز:</b> {drawerProduct.reviewCount ? `${drawerProduct.rating} از ۵` : 'بدون امتیاز'}</p>
            {drawerProduct.hasPendingChanges && <p className="rounded-2xl bg-amber-50 p-3 font-bold text-amber-700">این محصول ویرایش در انتظار تایید ادمین دارد.</p>}
            <p><b>علت رد:</b> {drawerProduct.rejectionReason || 'برای این محصول علت ردی ثبت نشده است.'}</p>
          </div>
        )}
      </SellerDrawer>

      <SellerToast message={toast} />
    </section>
  );
}
