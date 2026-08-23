import { Plus, Settings2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import MultipleSelector from '../../components/ui/multiselect.jsx';
import PricingSection from '../../components/ui/PricingSection.jsx';
import { useAsyncResource } from '../../hooks/useAsyncResource.js';
import apiClient from '../../services/apiClient.js';
import { formatMoney, formatNumberInput, moneyInWords, onlyDigits } from '../../utils/formatters.js';

const tabs = [
  ['user', 'پکیج‌های کاربر'],
  ['seller', 'پکیج‌های فروشنده'],
];

const statusLabel = {
  active: 'فعال',
  inactive: 'غیرفعال',
};

const packageFeatureOptions = [
  { value: 'پشتیبانی سریع', label: 'پشتیبانی سریع' },
  { value: 'گزارش پیشرفته', label: 'گزارش پیشرفته' },
  { value: 'نمایش ویژه', label: 'نمایش ویژه' },
  { value: 'QR اختصاصی', label: 'QR اختصاصی' },
  { value: 'اولویت پشتیبانی', label: 'اولویت پشتیبانی' },
  { value: 'سرویس پرو', label: 'سرویس پرو' },
  { value: 'گزارش مالی', label: 'گزارش مالی' },
  { value: 'جایگاه ویژه', label: 'جایگاه ویژه' },
  { value: 'اعتبار ویژه', label: 'اعتبار ویژه' },
  { value: 'گزارش کامل', label: 'گزارش کامل' },
];

const defaultForm = {
  id: null,
  title: '',
  description: '',
  price: '',
  duration_days: '30',
  pro_requests_count: '0',
  monthly_pro_request_limit: '0',
  features: [],
  role_type: 'user',
  status: 'active',
};

function WhiteInput({ ...props }) {
  return (
    <input
      {...props}
      className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
    />
  );
}

function WhiteTextarea({ className = '', ...props }) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 ${className}`}
    />
  );
}

function WhiteSelect(props) {
  return (
    <select
      {...props}
      className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
    />
  );
}

function PriceHint({ value }) {
  return (
    <div className="text-xs font-bold text-slate-500">
      {onlyDigits(value) ? `${formatMoney(onlyDigits(value))} - ${moneyInWords(value)}` : 'مبلغ را به تومان وارد کنید.'}
    </div>
  );
}

function PackageModal({ open, form, onChange, onClose, onSubmit, saving }) {
  if (!open) return null;

  const selectedFeatures = (form.features || []).map((item) => ({ value: item, label: item }));

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-4">
      <div className="flex min-h-full items-center justify-center">
        <div className="w-full max-w-4xl rounded-[2rem] bg-white p-6 shadow-2xl ring-1 ring-slate-200">
          <div className="mb-6 text-right">
            <h3 className="text-2xl font-black text-slate-950">{form.id ? 'ویرایش پکیج' : 'افزودن پکیج جدید'}</h3>
            <p className="mt-2 text-sm leading-7 text-slate-500">
              طراحی این بخش به‌صورت تک‌استفاده با همان حس سفید و مینیمال پرامپت جدید پیاده‌سازی شده است.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <WhiteInput value={form.title} onChange={(event) => onChange('title', event.target.value)} placeholder="عنوان پکیج" />

            <WhiteSelect value={form.role_type} onChange={(event) => onChange('role_type', event.target.value)}>
              <option value="user">پکیج کاربر</option>
              <option value="seller">پکیج فروشنده</option>
            </WhiteSelect>

            <div className="space-y-2">
              <WhiteInput
                value={form.price}
                onChange={(event) => onChange('price', formatNumberInput(event.target.value))}
                placeholder="قیمت (تومان)"
                inputMode="numeric"
              />
              <PriceHint value={form.price} />
            </div>

            <WhiteInput
              value={form.duration_days}
              onChange={(event) => onChange('duration_days', formatNumberInput(event.target.value))}
              placeholder="مدت اعتبار (روز)"
              inputMode="numeric"
            />

            <WhiteInput
              value={form.pro_requests_count}
              onChange={(event) => onChange('pro_requests_count', formatNumberInput(event.target.value))}
              placeholder="تعداد مجاز درخواست پرو"
              inputMode="numeric"
            />

            <WhiteInput
              value={form.monthly_pro_request_limit}
              onChange={(event) => onChange('monthly_pro_request_limit', formatNumberInput(event.target.value))}
              placeholder="سقف ماهانه درخواست پرو"
              inputMode="numeric"
            />

            <WhiteSelect value={form.status} onChange={(event) => onChange('status', event.target.value)}>
              <option value="active">فعال</option>
              <option value="inactive">غیرفعال</option>
            </WhiteSelect>

            <div className="space-y-3 md:col-span-2">
              <div className="text-sm font-medium text-slate-700">ویژگی‌ها و خدمات پکیج</div>
              <div className="w-full max-w-[500px]">
                <MultipleSelector
                  value={selectedFeatures}
                  options={packageFeatureOptions}
                  placeholder="Select Rick and Morty characters"
                  hideClearAllButton
                  hidePlaceholderWhenSelected
                  creatable
                  emptyIndicator={<p className="text-center text-sm">موردی پیدا نشد.</p>}
                  onChange={(options) => onChange('features', options.map((option) => option.value))}
                />
              </div>
            </div>

            <WhiteTextarea
              className="min-h-28 md:col-span-2"
              value={form.description}
              onChange={(event) => onChange('description', event.target.value)}
              placeholder="توضیحات پکیج"
            />
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
              onClick={onClose}
            >
              انصراف
            </button>
            <button
              type="button"
              className="rounded-full bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-500 disabled:opacity-60"
              disabled={saving || !form.title.trim() || !String(form.price).trim()}
              onClick={onSubmit}
            >
              {saving ? 'در حال ذخیره...' : form.id ? 'ذخیره تغییرات' : 'ثبت پکیج'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminPackages() {
  const [tab, setTab] = useState('user');
  const [refreshKey, setRefreshKey] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [toggleItem, setToggleItem] = useState(null);
  const [tokenPriceInput, setTokenPriceInput] = useState('');
  const [tokenSaving, setTokenSaving] = useState(false);

  const { data = [] } = useAsyncResource(async () => (await apiClient.get('/api/admin/packages')).data.data, [refreshKey]);
  const { data: settings } = useAsyncResource(async () => (await apiClient.get('/api/admin/packages/settings')).data.data, [refreshKey]);

  const rows = useMemo(
    () =>
      data
        .filter((item) => item.role_type === tab)
        .map((item, index) => ({
          id: item.id,
          badge: tab === 'seller' ? `فروشنده ${index + 1}` : `کاربر ${index + 1}`,
          title: item.title,
          price: Number(item.price || 0),
          periodLabel: `${Number(item.duration_days || 0).toLocaleString('fa-IR')} روز اعتبار`,
          description: item.description || 'این بسته هنوز توضیح تکمیلی ندارد.',
          features: item.features?.length ? item.features : ['بدون ویژگی ثبت‌شده'],
          proCount: Number(item.pro_requests_count || 0).toLocaleString('fa-IR'),
          monthlyLimit: Number(item.monthly_pro_request_limit || 0).toLocaleString('fa-IR'),
          status: item.status,
          statusLabel: statusLabel[item.status] || item.status,
          featured: index === 1 || (index === 0 && data.filter((plan) => plan.role_type === tab).length === 1),
          raw: item,
        })),
    [data, tab],
  );

  const flash = (text) => {
    setNotice(text);
    setTimeout(() => setNotice(''), 2400);
  };

  const openCreate = () => {
    setForm({ ...defaultForm, role_type: tab });
    setIsModalOpen(true);
  };

  const openEdit = (item) => {
    setForm({
      id: item.id,
      title: item.title || '',
      description: item.description || '',
      price: formatNumberInput(item.price || ''),
      duration_days: String(item.duration_days || 30),
      pro_requests_count: formatNumberInput(item.pro_requests_count || ''),
      monthly_pro_request_limit: formatNumberInput(item.monthly_pro_request_limit || ''),
      features: item.features || [],
      role_type: item.role_type || tab,
      status: item.status || 'active',
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setForm(defaultForm);
  };

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      price: Number(onlyDigits(form.price) || 0),
      duration_days: Number(onlyDigits(form.duration_days) || 30),
      pro_requests_count: Number(onlyDigits(form.pro_requests_count) || 0),
      monthly_pro_request_limit: Number(onlyDigits(form.monthly_pro_request_limit) || 0),
      role_type: form.role_type,
      status: form.status,
      features: form.features,
    };

    try {
      if (form.id) {
        await apiClient.patch(`/api/admin/packages/${form.id}`, payload);
        flash('پکیج با موفقیت به‌روزرسانی شد.');
      } else {
        await apiClient.post('/api/admin/packages', payload);
        flash('پکیج جدید با موفقیت ساخته شد.');
      }
      closeModal();
      setRefreshKey((key) => key + 1);
    } catch (error) {
      flash(error.message || 'ثبت یا ویرایش پکیج انجام نشد.');
    } finally {
      setSaving(false);
    }
  };

  const saveTokenPrice = async () => {
    setTokenSaving(true);
    try {
      await apiClient.patch('/api/admin/packages/settings', {
        token_price: Number(onlyDigits(tokenPriceInput || settings?.token_price || 0) || 0),
      });
      flash('قیمت هر توکن ذخیره شد.');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      flash(error.message || 'ذخیره قیمت توکن انجام نشد.');
    } finally {
      setTokenSaving(false);
    }
  };

  const toggleStatus = async () => {
    if (!toggleItem) return;
    try {
      await apiClient.patch(`/api/admin/packages/${toggleItem.id}`, {
        status: toggleItem.status === 'active' ? 'inactive' : 'active',
      });
      flash(toggleItem.status === 'active' ? 'پکیج غیرفعال شد.' : 'پکیج فعال شد.');
      setToggleItem(null);
      setRefreshKey((key) => key + 1);
    } catch (error) {
      flash(error.message || 'تغییر وضعیت پکیج انجام نشد.');
    }
  };

  const tokenPriceValue = tokenPriceInput || formatNumberInput(settings?.token_price || '');

  return (
    <section className="space-y-8">
      <div className="rounded-[2rem] bg-white px-6 py-8 shadow-sm ring-1 ring-slate-200/80 sm:px-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-black text-slate-950">مدیریت پکیج‌ها</h1>
            <p className="mt-3 text-base leading-8 text-slate-500">
              بسته‌های اشتراک کاربر و فروشنده را از این صفحه مدیریت کنید. فرم ساخت و ویرایش به دیزاین تک‌استفاده جدید نزدیک شده و بخش انتخاب خدمات هم جایگزین textarea قدیمی شده است.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {tabs.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`rounded-full px-5 py-3 text-sm font-bold transition ${
                  tab === value
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}

            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
              onClick={openCreate}
            >
              <Plus size={16} />
              افزودن پکیج
            </button>
          </div>
        </div>
      </div>

      {notice ? (
        <div className="rounded-[1.5rem] border border-emerald-200 bg-white px-5 py-4 text-sm font-bold text-emerald-700 shadow-sm">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <PricingSection
          title={tab === 'seller' ? 'پکیج‌های فروشنده' : 'پکیج‌های کاربر'}
          description={
            tab === 'seller'
              ? 'بسته‌های مخصوص فروشندگان، با تمرکز روی ابزارهای تجاری، درخواست‌های پرو و امکانات توسعه فروشگاه.'
              : 'بسته‌های کاربری برای خرید سرویس، درخواست‌های پرو و استفاده بهتر از امکانات مارکت‌پلیس.'
          }
          plans={rows}
          actionLabel="ویرایش پکیج"
          onAction={openEdit}
        />

        <div className="space-y-6">
          <div className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200/80">
            <div className="mb-5 flex items-center gap-2 text-slate-900">
              <Settings2 size={18} className="text-indigo-500" />
              <h2 className="font-black">تنظیم قیمت هر توکن</h2>
            </div>
            <div className="space-y-3">
              <WhiteInput
                value={tokenPriceValue}
                onChange={(event) => setTokenPriceInput(formatNumberInput(event.target.value))}
                placeholder="قیمت هر توکن"
                inputMode="numeric"
              />
              <PriceHint value={tokenPriceValue} />
              <button
                type="button"
                className="w-full rounded-full bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-500 disabled:opacity-60"
                disabled={tokenSaving}
                onClick={saveTokenPrice}
              >
                {tokenSaving ? 'در حال ذخیره...' : 'ذخیره قیمت توکن'}
              </button>
            </div>
          </div>

          {rows.length > 0 ? (
            <div className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200/80">
              <h2 className="mb-4 font-black text-slate-950">مدیریت سریع وضعیت</h2>
              <div className="space-y-3">
                {rows.map((row) => (
                  <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div>
                      <div className="font-bold text-slate-900">{row.title}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {row.statusLabel} - {row.periodLabel}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                        row.status === 'active'
                          ? 'bg-rose-50 text-rose-600 hover:bg-rose-100'
                          : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                      onClick={() => setToggleItem(row.raw)}
                    >
                      {row.status === 'active' ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState title="هنوز پکیجی ثبت نشده است" description="برای این نقش هنوز پکیجی ساخته نشده. از دکمه افزودن پکیج استفاده کنید." />
          )}
        </div>
      </div>

      <PackageModal open={isModalOpen} form={form} onChange={setField} onClose={closeModal} onSubmit={submit} saving={saving} />

      <ConfirmDialog
        open={Boolean(toggleItem)}
        title={toggleItem?.status === 'active' ? 'غیرفعال‌سازی پکیج' : 'فعال‌سازی پکیج'}
        onClose={() => setToggleItem(null)}
        onConfirm={toggleStatus}
      />
    </section>
  );
}
