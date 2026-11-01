import { useMemo, useRef, useState } from 'react';
import AdminPagination from '../../components/admin/AdminPagination.jsx';
import AccessibleModal from '../../components/ui/AccessibleModal.jsx';
import ProductReviewDetail from '../../components/admin/ProductReviewDetail.jsx';
import RejectionReasons from '../../components/admin/RejectionReasons.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { useAsyncResource } from '../../hooks/useAsyncResource.js';
import apiClient from '../../services/apiClient.js';
import { formatMoney } from '../../utils/formatters.js';
import { getProductImage, getProductImages } from '../../utils/productImage.js';

const tabs = [
  ['pending', 'در انتظار بررسی'],
  ['active', 'تایید شده'],
  ['rejected', 'رد شده'],
];

const statusLabel = {
  pending: 'در انتظار بررسی',
  active: 'تایید شده',
  rejected: 'رد شده',
};

function ProductGallery({ row }) {
  const images = getProductImages(row);
  const imageCount = row.pending_changes?.image_count || row.image_count || images.length || 1;
  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2 rtl:space-x-reverse">
        {(images.length ? images : [getProductImage(row)]).slice(0, 4).map((image, index) => (
          <img key={`${image}-${index}`} src={image} alt={`${row.title} مدل ${index + 1}`} loading="lazy" decoding="async" className="h-12 w-12 rounded-xl border-2 border-white bg-white object-contain dark:border-slate-900" />
        ))}
      </div>
      <span className="text-xs font-bold text-slate-500">{imageCount} مدل</span>
    </div>
  );
}

function displayProduct(row) {
  return row.pending_changes ? { ...row, ...row.pending_changes, original_title: row.title } : row;
}

export default function Products() {
  const [tab, setTab] = useState('pending');
  const [page, setPage] = useState(1);
  const { data: response, reload, updateData } = useAsyncResource(
    async () => {
      const params = new URLSearchParams({ status: tab, page: String(page), limit: '25' });
      return (await apiClient.get(`/api/admin/products?${params.toString()}`)).data.data;
    },
    [tab, page],
    { pollMs: 4000, keepPreviousData: true },
  );
  const [detailId, setDetailId] = useState(null);
  const dialogTrigger = useRef(null);
  const [reasonSettings, setReasonSettings] = useState(false);

  const rows = useMemo(() => (Array.isArray(response) ? response : response?.items || []), [response]);
  const pagination = Array.isArray(response) ? null : response?.pagination;

  const removeReviewedRow = (id) => {
    const total = Math.max(0, Number(pagination?.total || 0) - 1);
    const totalPages = pagination ? Math.max(1, Math.ceil(total / pagination.pageSize)) : page;
    if (page > totalPages) setPage(totalPages);
    updateData((current) => {
      if (!current || Array.isArray(current)) return current;
      const items = (current.items || []).filter((item) => Number(item.id) !== Number(id));
      return {
        ...current,
        items,
        pagination: current.pagination
          ? { ...current.pagination, total, totalPages }
          : current.pagination,
      };
    });
  };

  return (
    <section className="page">
      <div>
        <h1 className="text-3xl font-black">مدیریت محصولات</h1>
        <p className="text-slate-500">صف بررسی به‌صورت صفحه‌ای و زنده بارگذاری می‌شود؛ نتیجه تایید یا رد بدون رفرش دستی اعمال می‌شود.</p>
      </div>


      <button className="btn-soft self-start" onClick={(event) => { dialogTrigger.current = event.currentTarget; setReasonSettings(true); }}>مدیریت دلایل رد محصول</button>
      <div className="card flex flex-wrap gap-2">
        {tabs.map(([value, label]) => (
          <button key={value} onClick={() => { setTab(value); setPage(1); }} className={tab === value ? 'btn-primary' : 'btn-soft'}>
            {label}
          </button>
        ))}
      </div>

      <DataTable
        rows={rows}
        columns={[
          { key: 'image', label: 'لباس و مدل‌ها', render: (row) => <ProductGallery row={row} /> },
          { key: 'title', label: 'محصول', render: (row) => displayProduct(row).title },
          { key: 'seller_name', label: 'فروشگاه' },
          { key: 'price_toman', label: 'قیمت', render: (row) => formatMoney(displayProduct(row).price || row.price_toman || 0) },
          { key: 'description', label: 'توضیحات', render: (row) => displayProduct(row).description },
          {
            key: 'status',
            label: 'وضعیت',
            render: (row) => (
              <div className="flex flex-wrap gap-2">
                <span>{statusLabel[row.status] || row.status}</span>
                {row.pending_changes && <span className="badge bg-amber-500/10 text-amber-600">ویرایش منتظر تایید</span>}
              </div>
            ),
          },
        ]}
        renderActions={(row) => <button className="btn-soft" onClick={(event) => { dialogTrigger.current = event.currentTarget; setDetailId(row.id); }}>جزئیات</button>}
      />

      <AdminPagination pagination={pagination} onPageChange={setPage} />

      <AccessibleModal returnFocusRef={dialogTrigger} open={Boolean(detailId)} onClose={() => setDetailId(null)} title="بررسی جزئیات محصول" wide>
        {detailId && <ProductReviewDetail key={detailId} id={detailId} onReviewed={(id) => { if (tab === 'pending') removeReviewedRow(id); reload(); }} />}
      </AccessibleModal>
      <AccessibleModal returnFocusRef={dialogTrigger} open={reasonSettings} onClose={() => setReasonSettings(false)} title="مدیریت دلایل رد محصول" wide><RejectionReasons /></AccessibleModal>
    </section>
  );
}
