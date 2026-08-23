import { Download, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import UserDrawer from '../../../components/user/UserDrawer';
import UserModal from '../../../components/user/UserModal';
import UserPageHeader from '../../../components/user/UserPageHeader';
import UserTable from '../../../components/user/UserTable';
import UserToolbar from '../../../components/user/UserToolbar';
import { useUser } from '../../../contexts/UserContext';
import { useAsyncResource } from '../../../hooks/useAsyncResource';
import { userApi } from '../../../services/user/userApi';
import { downloadBlob } from '../../../utils/downloadBlob';
import { downloadProOutput, getProOutputSource } from '../../../utils/proOutput.js';

const filters = [
  { value: 'all', label: 'همه وضعیت‌ها' },
  { value: 'پرداخت شده', label: 'پرداخت شده' },
  { value: 'ناموفق', label: 'ناموفق' },
  { value: 'در انتظار', label: 'در انتظار' },
];

export default function UserTransactions() {
  const { showToast } = useUser();
  const [refreshKey, setRefreshKey] = useState(0);
  const { loading, error, data } = useAsyncResource(() => userApi.getTransactions(), [refreshKey]);
  const [tab, setTab] = useState('financial');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [transaction, setTransaction] = useState(null);
  const [reviewItem, setReviewItem] = useState(null);
  const [review, setReview] = useState({ rating: 5, comment: '' });

  const rows = useMemo(() => {
    const source = data?.[tab] || [];
    return source.filter((item) => (filter === 'all' || item.status === filter) && `${item.id} ${item.title}`.includes(search));
  }, [data, tab, filter, search]);

  const exportExcel = async () => {
    const blob = await userApi.exportTransactions(tab);
    downloadBlob(blob, `user-${tab}-transactions.xlsx`);
  };

  const submitReview = async () => {
    await userApi.reviewProduct(reviewItem.productId, review);
    setReviewItem(null);
    setReview({ rating: 5, comment: '' });
    setRefreshKey((key) => key + 1);
    showToast('نظر شما برای محصول ثبت شد.');
  };

  return (
    <section className="page">
      <UserPageHeader
        title="تراکنش‌ها"
        description="گزارش مالی و گزارش مصرف توکن‌های پرو را جداگانه مشاهده کنید."
        action={<button className="btn-primary" onClick={exportExcel}>خروجی Excel</button>}
      />
      <div className="card flex gap-2">
        <button className={tab === 'financial' ? 'btn-primary' : 'btn-soft'} onClick={() => setTab('financial')}>مالی</button>
        <button className={tab === 'services' ? 'btn-primary' : 'btn-soft'} onClick={() => setTab('services')}>مصرف توکن پرو</button>
      </div>
      <UserToolbar search={search} onSearch={setSearch} filter={filter} onFilter={setFilter} filters={filters} />
      <UserTable
        loading={loading}
        error={error}
        page={page}
        onPageChange={setPage}
        rows={rows}
        columns={[
          { key: 'id', label: 'شناسه' },
          { key: 'title', label: tab === 'services' ? 'درخواست پرو' : 'عنوان' },
          { key: 'amount', label: 'مبلغ' },
          { key: 'status', label: 'وضعیت' },
          { key: 'date', label: 'تاریخ' },
        ]}
        actions={(row) => (
          <div className="flex flex-wrap gap-2">
            <button className="btn-soft" onClick={() => setTransaction(row)}>جزئیات</button>
            {row.type === 'product_purchase' && row.productId && !row.reviewed ? (
              <button className="btn-primary" onClick={() => setReviewItem(row)}>ثبت نظر</button>
            ) : null}
          </div>
        )}
      />

      <UserDrawer open={Boolean(transaction)} title="جزئیات تراکنش" onClose={() => setTransaction(null)}>
        {transaction ? (
          <div className="space-y-4 text-sm">
            <p><b>شناسه:</b> {transaction.id}</p>
            <p><b>عنوان:</b> {transaction.title}</p>
            <p><b>مبلغ:</b> {transaction.amount}</p>
            <p><b>وضعیت:</b> {transaction.status}</p>
            <p><b>تاریخ:</b> {transaction.date}</p>
            {transaction.details?.product_title ? <p><b>محصول:</b> {transaction.details.product_title}</p> : null}
            {transaction.details?.seller_name ? <p><b>فروشنده:</b> {transaction.details.seller_name}</p> : null}
            {transaction.details?.store_name ? <p><b>فروشگاه:</b> {transaction.details.store_name}</p> : null}
            {transaction.details?.province ? <p><b>استان / شهر:</b> {transaction.details.province} - {transaction.details.city}</p> : null}
            {transaction.details?.address ? <p><b>آدرس:</b> {transaction.details.address}</p> : null}
            {transaction.details?.postal_code ? <p><b>کد پستی:</b> {transaction.details.postal_code}</p> : null}
            {transaction.details?.national_code ? <p><b>کد ملی:</b> {transaction.details.national_code}</p> : null}
            {transaction.details?.output_image ? (
              <div className="rounded-3xl bg-slate-50 p-3">
                <img src={getProOutputSource(transaction.details.output_image)} alt="خروجی پرو" className="max-h-72 w-full rounded-2xl object-contain" />
                <button className="btn-soft mt-3" onClick={() => downloadProOutput(transaction.details.output_image, `pro-output-${transaction.id}.png`).catch((downloadError) => showToast(downloadError.message))}>
                  <Download size={16} />
                  دانلود خروجی پرو
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </UserDrawer>

      <UserModal open={Boolean(reviewItem)} title="ثبت نظر برای محصول" onClose={() => setReviewItem(null)}>
        {reviewItem ? (
          <div className="grid gap-4">
            <div className="rounded-3xl bg-slate-100 p-4 text-sm dark:bg-slate-800">
              <p className="font-black">{reviewItem.details?.product_title || reviewItem.title}</p>
              <p className="mt-2 text-slate-500">شماره سفارش: {reviewItem.id}</p>
            </div>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} type="button" className="text-amber-500" onClick={() => setReview({ ...review, rating: value })}>
                  <Star size={24} className={value <= review.rating ? 'fill-current' : ''} />
                </button>
              ))}
            </div>
            <textarea className="input min-h-32" value={review.comment} onChange={(event) => setReview({ ...review, comment: event.target.value })} placeholder="تجربه خرید خود را بنویسید..." />
            <button className="btn-primary" onClick={submitReview}>ثبت امتیاز و نظر</button>
          </div>
        ) : null}
      </UserModal>
    </section>
  );
}
