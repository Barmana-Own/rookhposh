import { Lock, Save } from 'lucide-react';
import { useState } from 'react';
import SellerPageHeader from '../../../components/seller/SellerPageHeader';
import SellerToast from '../../../components/seller/SellerToast';
import FileDropzone from '../../../components/ui/FileDropzone.jsx';
import { useAsyncResource } from '../../../hooks/useAsyncResource';
import { sellerApi } from '../../../services/seller/sellerApi';
import { readFileAsDataUrl } from '../../../utils/file';

export default function SellerStoreProfile() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { data: store } = useAsyncResource(() => sellerApi.getStore(), [refreshKey]);
  const [form, setForm] = useState({});
  const [logoName, setLogoName] = useState('');
  const [bannerName, setBannerName] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const notify = (message) => {
    setToast(message);
    setTimeout(() => setToast(''), 2200);
  };

  const currentStore = {
    store_name: store?.store_name || 'فروشگاه من',
    description: form.description ?? store?.description ?? '',
    logo: form.logo ?? store?.logo ?? '',
    banner: form.banner ?? store?.banner ?? '',
  };

  const selectLogo = async (file) => {
    const logo = await readFileAsDataUrl(file);
    setForm((current) => ({ ...current, logo }));
    setLogoName(file.name);
  };

  const selectBanner = async (file) => {
    const banner = await readFileAsDataUrl(file);
    setForm((current) => ({ ...current, banner }));
    setBannerName(file.name);
  };

  const saveStore = async () => {
    setSaving(true);
    try {
      await sellerApi.updateStore({
        description: currentStore.description,
        logo: currentStore.logo,
        banner: currentStore.banner,
      });
      setForm({});
      setLogoName('');
      setBannerName('');
      setRefreshKey((key) => key + 1);
      notify('پروفایل فروشگاه ذخیره شد.');
    } catch {
      notify('ذخیره پروفایل فروشگاه انجام نشد.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="page">
      <SellerPageHeader title="پروفایل فروشگاه" description="اطلاعات اصلی فروشگاه، لوگو و بنر را در این بخش مدیریت کنید." />

      <div className="card space-y-5 bg-white">
        <div>
          <h3 className="text-xl font-black">اطلاعات فروشگاه</h3>
          <p className="mt-2 text-sm text-slate-500">نام فروشگاه قفل است؛ توضیحات، لوگو و بنر قابل ویرایش هستند.</p>
        </div>

        <div className="grid gap-4">
          <label className="space-y-2">
            <span className="flex items-center gap-2 text-sm font-bold text-slate-600">
              نام فروشگاه
              <Lock size={14} className="text-slate-400" />
            </span>
            <input className="input w-full cursor-not-allowed bg-slate-50 text-slate-500" value={currentStore.store_name} readOnly />
            <span className="block text-xs font-bold text-slate-400">نام فروشگاه بعد از ثبت قابل تغییر نیست.</span>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-bold text-slate-600">توضیحات فروشگاه</span>
            <textarea
              className="input min-h-36 w-full"
              value={currentStore.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="توضیح کوتاه درباره فروشگاه، خدمات و مزیت های شما..."
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <FileDropzone image accept="image/*" fileName={logoName} preview={currentStore.logo} label="لوگوی فروشگاه" helper="لوگوی فروشگاه را بکشید و رها کنید یا فایل را انتخاب کنید." onSelect={selectLogo} />
          <FileDropzone image accept="image/*" fileName={bannerName} preview={currentStore.banner} label="بنر فروشگاه" helper="بنر فروشگاه جایگزین هدر صفحه عمومی می شود." onSelect={selectBanner} />
        </div>

        <button className="btn-primary w-full" onClick={saveStore} disabled={saving}>
          <Save size={18} />
          {saving ? 'در حال ذخیره...' : 'ذخیره پروفایل فروشگاه'}
        </button>
      </div>

      <SellerToast message={toast} />
    </section>
  );
}
