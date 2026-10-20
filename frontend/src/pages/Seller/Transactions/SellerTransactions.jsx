import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import SellerDrawer from '../../../components/seller/SellerDrawer';
import SellerPageHeader from '../../../components/seller/SellerPageHeader';
import SellerTable from '../../../components/seller/SellerTable';
import SellerToolbar from '../../../components/seller/SellerToolbar';
import { useAsyncResource } from '../../../hooks/useAsyncResource';
import { sellerApi } from '../../../services/seller/sellerApi';

export default function SellerTransactions() {
  const { data = [] } = useAsyncResource(() => sellerApi.getTransactions());
  const [tab, setTab] = useState('financial');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [transaction, setTransaction] = useState(null);

  const rows = useMemo(() => {
    const source = data.filter((item) => (tab === 'pro' ? item.type === 'pro_usage' : item.type !== 'pro_usage'));
    return source.filter((item) => `${item.id} ${item.title}`.includes(search));
  }, [data, search, tab]);

  return (
    <section className="page">
      <SellerPageHeader title="تراکنش‌ها" description="گزارش مالی فروشگاه و گزارش مصرف توکن‌های پرو توسط مشتریان." />
      <div className="card flex gap-2">
        <button className={tab === 'financial' ? 'btn-primary' : 'btn-soft'} onClick={() => setTab('financial')}>مالی</button>
        <button className={tab === 'pro' ? 'btn-primary' : 'btn-soft'} onClick={() => setTab('pro')}>مصرف توکن پرو</button>
      </div>
      <SellerToolbar search={search} onSearch={setSearch} filter="all" onFilter={() => {}} filters={[{ value: 'all', label: 'همه تراکنش‌ها' }]} />
      <SellerTable
        page={page}
        onPageChange={setPage}
        rows={rows}
        columns={[
          { key: 'id', label: 'شناسه' },
          { key: 'title', label: tab === 'pro' ? 'درخواست پرو' : 'عنوان' },
          { key: 'amount', label: 'مبلغ' },
          { key: 'status', label: 'وضعیت' },
          { key: 'date', label: 'تاریخ' },
        ]}
        actions={(row) => <button className="btn-soft" onClick={() => setTransaction(row)}>جزئیات</button>}
      />

      <SellerDrawer open={Boolean(transaction)} title="جزئیات تراکنش" onClose={() => setTransaction(null)}>
        {transaction ? (
          <div className="space-y-3 text-sm">
            <p><b>عنوان:</b> {transaction.title}</p>
            <p><b>مبلغ:</b> {transaction.amount}</p>
            <p><b>وضعیت:</b> {transaction.status}</p>
            <p><b>تاریخ:</b> {transaction.date}</p>
            {/^[a-f0-9]{32}$/.test(transaction.details?.gateway_payment_id || '') ? (
              <Link className="btn-soft" to={`/payments/result/${transaction.details.gateway_payment_id}`}>پیگیری پرداخت درگاه</Link>
            ) : null}
            {transaction.details?.buyer_fullname ? <p><b>نام خریدار:</b> {transaction.details.buyer_fullname}</p> : null}
            {transaction.details?.buyer_mobile ? <p><b>شماره تماس:</b> {transaction.details.buyer_mobile}</p> : null}
            {transaction.details?.product_title ? <p><b>محصول:</b> {transaction.details.product_title}</p> : null}
            {transaction.details?.province ? <p><b>استان / شهر:</b> {transaction.details.province} - {transaction.details.city}</p> : null}
            {transaction.details?.address ? <p><b>آدرس:</b> {transaction.details.address}</p> : null}
            {transaction.details?.postal_code ? <p><b>کد پستی:</b> {transaction.details.postal_code}</p> : null}
            {transaction.details?.national_code ? <p><b>کد ملی:</b> {transaction.details.national_code}</p> : null}
          </div>
        ) : null}
      </SellerDrawer>
    </section>
  );
}
