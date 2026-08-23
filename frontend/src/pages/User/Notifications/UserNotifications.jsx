import { useEffect, useState } from 'react';
import UserPageHeader from '../../../components/user/UserPageHeader';
import UserToast from '../../../components/user/UserToast';
import { useUser } from '../../../contexts/UserContext';
import { userApi } from '../../../services/user/userApi';

export default function UserNotifications() {
  const { showToast } = useUser();
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    userApi.getNotifications().then(setNotifications);
  }, []);

  const readAll = async () => {
    await userApi.readNotifications();
    setNotifications((items) => items.map((item) => ({ ...item, unread: false })));
    showToast('همه اعلان‌ها خوانده شد.');
  };

  return (
    <section className="page">
      <UserPageHeader title="اعلان‌ها" description="مرکز اعلان‌های مالی، خریدها، سرویس‌ها و تیکت‌های شما." action={<button className="btn-primary" onClick={readAll}>خواندن همه</button>} />
      <div className="grid gap-3">
        {notifications.map((item) => (
          <article key={item.id} className="card flex items-start justify-between gap-4">
            <div>
              <h3 className="font-black">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-500">{item.body}</p>
            </div>
            {item.unread && <span className="badge bg-cyan-500/10 text-cyan-600">جدید</span>}
          </article>
        ))}
      </div>
      <UserToast />
    </section>
  );
}
