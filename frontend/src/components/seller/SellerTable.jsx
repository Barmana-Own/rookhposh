import EmptyState from '../ui/EmptyState';

export default function SellerTable({ columns, rows, page, pageSize = 5, onPageChange, actions, pagination, loading, error, onRetry, emptyTitle }) {
  const totalPages = pagination?.totalPages || Math.max(1, Math.ceil(rows.length / pageSize));
  const visibleRows = pagination ? rows : rows.slice((page - 1) * pageSize, page * pageSize);

  if (loading) return <div role="status" className="card text-sm text-slate-500">در حال دریافت اطلاعات…</div>;
  if (error) return <div role="alert" className="card space-y-3 text-sm"><p>{error.message || 'دریافت اطلاعات انجام نشد.'}</p><button className="btn-soft" onClick={onRetry}>تلاش مجدد</button></div>;

  if (!rows.length) {
    if (pagination?.total > 0 && page > 1) return <div className="card space-y-3"><p>صفحه انتخاب‌شده خالی است.</p><button className="btn-soft" onClick={() => onPageChange(1)}>بازگشت به صفحه اول</button></div>;
    return <EmptyState title={emptyTitle || 'نتیجه‌ای برای نمایش وجود ندارد'} description="فیلتر یا عبارت جستجو را تغییر دهید." />;
  }

  return (
    <div className="card overflow-hidden p-0">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] text-right text-sm">
          <thead className="bg-slate-50/80 text-slate-500 dark:bg-slate-800/80 dark:text-slate-300">
            <tr>{columns.map((column) => <th key={column.key} className="px-5 py-4 font-black">{column.label}</th>)}{actions && <th className="px-5 py-4 font-black">عملیات</th>}</tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 transition hover:bg-indigo-500/5 dark:border-slate-800">
                {columns.map((column) => <td key={column.key} className="max-w-sm break-words px-5 py-4">{column.render ? column.render(row) : row[column.key]}</td>)}
                {actions && <td className="px-5 py-4">{actions(row)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 p-3 md:hidden">
        {visibleRows.map((row) => (
          <article key={row.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white/75 p-4 dark:border-slate-700 dark:bg-slate-900/70">
            {columns.map((column) => (
              <div className="grid grid-cols-[minmax(6rem,35%)_1fr] items-start gap-3 text-sm" key={column.key}>
                <span className="font-black text-slate-500 dark:text-slate-400">{column.label}</span>
                <div className="min-w-0 break-words font-bold">{column.render ? column.render(row) : row[column.key]}</div>
              </div>
            ))}
            {actions ? <div className="border-t border-slate-200 pt-3 dark:border-slate-700">{actions(row)}</div> : null}
          </article>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 text-sm dark:border-slate-800">
        <span className="text-slate-500">صفحه {page} از {totalPages}</span>
        <div className="flex gap-2">
          <button className="btn-soft" disabled={page === 1} onClick={() => onPageChange(page - 1)}>قبلی</button>
          <button className="btn-soft" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>بعدی</button>
        </div>
      </div>
    </div>
  );
}
