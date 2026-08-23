import { useEffect, useState } from 'react';
import { AuthorFormCard } from '../../../components/ui/author-form-card.jsx';
import UserConfirmDialog from '../../../components/user/UserConfirmDialog';
import UserPageHeader from '../../../components/user/UserPageHeader';
import UserToast from '../../../components/user/UserToast';
import { useUser } from '../../../contexts/UserContext';
import { userApi } from '../../../services/user/userApi';
import { readFileAsDataUrl } from '../../../utils/file';

const emptyForm = {
  fullname: '',
  email: '',
  mobile: '',
  avatar: '',
  province: '',
  city: '',
  address: '',
  postal_code: '',
  national_code: '',
};

function TextField({ label, className = '', ...props }) {
  return (
    <label className={`block space-y-2 ${className}`}>
      <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{label}</span>
      <input className="input w-full" {...props} />
    </label>
  );
}

export default function UserProfile() {
  const { showToast } = useUser();
  const [form, setForm] = useState(emptyForm);
  const [initialProfile, setInitialProfile] = useState(emptyForm);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    userApi.getProfile().then((profile) => {
      const nextForm = {
        fullname: profile.fullname || '',
        email: profile.email || '',
        mobile: profile.mobile || '',
        avatar: profile.avatar || '',
        province: profile.province || '',
        city: profile.city || '',
        address: profile.address || '',
        postal_code: profile.postal_code || '',
        national_code: profile.national_code || '',
      };
      setForm(nextForm);
      setInitialProfile(nextForm);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const profile = await userApi.updateProfile(form);
      const nextForm = {
        fullname: profile.fullname || '',
        email: profile.email || '',
        mobile: profile.mobile || '',
        avatar: profile.avatar || '',
        province: profile.province || '',
        city: profile.city || '',
        address: profile.address || '',
        postal_code: profile.postal_code || '',
        national_code: profile.national_code || '',
      };
      setForm(nextForm);
      setInitialProfile(nextForm);
      setConfirm(false);
      showToast('پروفایل با موفقیت ذخیره شد.');
    } catch {
      showToast('ذخیره پروفایل انجام نشد.');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatar = async (file) => {
    const avatar = await readFileAsDataUrl(file);
    setForm((current) => ({ ...current, avatar }));
    return avatar;
  };

  const handleProfileCardSubmit = ({ name, title, imageUrl }) => {
    setForm((current) => ({
      ...current,
      fullname: name,
      email: title,
      avatar: imageUrl || current.avatar,
    }));
    setConfirm(true);
  };

  return (
    <section className="page">
      <UserPageHeader title="پروفایل" description="مشاهده و ویرایش اطلاعات حساب کاربری، تصویر پروفایل و نشانی مشتری." />

      <div className="grid gap-6">
        <AuthorFormCard
          key={`${initialProfile.fullname}-${initialProfile.email}-${initialProfile.avatar || ''}`}
          className="max-w-none"
          initialData={{
            name: form.fullname,
            title: form.email,
            imageUrl: form.avatar,
          }}
          heading="اطلاعات کاربری"
          nameLabel="نام و نام خانوادگی"
          namePlaceholder="مثلا آرش کریمی"
          titleLabel="ایمیل"
          titlePlaceholder="example@gmail.com"
          titleHelp="ایمیل حساب کاربری شما از اینجا قابل ویرایش است."
          saving={saving}
          onImageSelect={handleAvatar}
          onCancel={() => setForm(initialProfile)}
          onSubmit={handleProfileCardSubmit}
        />

        <div className="card grid gap-4 md:grid-cols-2">
          <TextField label="شماره موبایل" value={form.mobile} placeholder="09120000000" onChange={(event) => setForm({ ...form, mobile: event.target.value })} />
          <TextField label="کد ملی" value={form.national_code} placeholder="0012345678" onChange={(event) => setForm({ ...form, national_code: event.target.value })} />
          <TextField label="استان" value={form.province} placeholder="تهران" onChange={(event) => setForm({ ...form, province: event.target.value })} />
          <TextField label="شهر" value={form.city} placeholder="تهران" onChange={(event) => setForm({ ...form, city: event.target.value })} />
          <TextField label="کد پستی" value={form.postal_code} placeholder="1234567890" onChange={(event) => setForm({ ...form, postal_code: event.target.value })} />
          <TextField label="آدرس کامل" className="md:col-span-2" value={form.address} placeholder="خیابان، پلاک، واحد" onChange={(event) => setForm({ ...form, address: event.target.value })} />
          <button className="btn-primary md:col-span-2" disabled={saving} onClick={() => setConfirm(true)}>
            {saving ? 'در حال ذخیره...' : 'ذخیره همه تغییرات'}
          </button>
        </div>
      </div>

      <UserConfirmDialog
        open={confirm}
        title="تایید ویرایش پروفایل"
        description="آیا تغییرات پروفایل ثبت شود؟"
        onCancel={() => setConfirm(false)}
        onConfirm={save}
      />
      <UserToast />
    </section>
  );
}
