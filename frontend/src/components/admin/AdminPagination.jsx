export default function AdminPagination({ pagination, onPageChange }) {
  if (!pagination || pagination.totalPages <= 1) return null;

  const { page, totalPages, total } = pagination;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white/70 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900/60">
      <span className="font-bold text-slate-500">
        صفحه {page.toLocaleString('fa-IR')} از {totalPages.toLocaleString('fa-IR')} ({total.toLocaleString('fa-IR')} مورد)
      </span>
      <div className="flex gap-2">
        <button type="button" className="btn-soft" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>قبلی</button>
        <button type="button" className="btn-soft" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>بعدی</button>
      </div>
    </div>
  );
}
