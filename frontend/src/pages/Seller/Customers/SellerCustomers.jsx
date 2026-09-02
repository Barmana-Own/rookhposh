import { useMemo, useState } from 'react';
import SellerDrawer from '../../../components/seller/SellerDrawer';
import SellerPageHeader from '../../../components/seller/SellerPageHeader';
import SellerTable from '../../../components/seller/SellerTable';
import SellerToolbar from '../../../components/seller/SellerToolbar';
import { useAsyncResource } from '../../../hooks/useAsyncResource';
import { sellerApi } from '../../../services/seller/sellerApi';

export default function SellerCustomers() {
  const { data = [] } = useAsyncResource(() => sellerApi.getCustomers());
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [customer, setCustomer] = useState(null);
  const rows = useMemo(() => data.filter((item) => `${item.name} ${item.email}`.includes(search)), [data, search]);

  return (
    <section className="page">
      <SellerPageHeader title="مشتری‌ها" description="مشتری‌های مرتبط با فروشگاه، آدرس و آخرین خرید ثبت شده." />
      <SellerToolbar search={search} onSearch={setSearch} filter="all" onFilter={() => {}} filters={[{ value: 'all', label: 'همه مشتری‌ها' }]} />
      <SellerTable
        page={page}
        onPageChange={setPage}
        rows={rows}
        columns={[
          { key: 'name', label: 'نام' },
          { key: 'email', label: 'ایمیل' },
          { key: 'customer_mobile', label: 'موبایل' },
          { key: 'orders', label: 'سفارش‌ها' },
          { key: 'status', label: 'وضعیت' },
        ]}
        actions={(row) => <button className="btn-soft" onClick={() => setCustomer(row)}>جزئیات</button>}
      />

      <SellerDrawer open={Boolean(customer)} title="جزئیات مشتری" onClose={() => setCustomer(null)}>
        {customer && (
          <div className="space-y-4 text-sm">
            <p><b>نام:</b> {customer.name}</p>
            <p><b>ایمیل:</b> {customer.email || '-'}</p>
            <p><b>موبایل:</b> {customer.customer_mobile || customer.mobile || '-'}</p>
            <p><b>استان / شهر:</b> {customer.province || '-'} / {customer.city || '-'}</p>
            <p><b>آدرس:</b> {customer.address || '-'}</p>
            <p><b>کد پستی:</b> {customer.postal_code || '-'}</p>
            <p><b>کد ملی:</b> {customer.national_code || '-'}</p>
            <p><b>آخرین محصول:</b> {customer.last_product_title || '-'}</p>
            <p><b>آخرین سفارش:</b> {customer.last_order_id || '-'}</p>
          </div>
        )}
      </SellerDrawer>
    </section>
  );
}
