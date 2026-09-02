import EmptyState from '../ui/EmptyState';
import SkeletonGrid from '../ui/Skeleton';

export default function UserTable({ columns, rows, loading, error, page, onPageChange, pageSize = 5, actions }) {
  if (loading) return <SkeletonGrid />;
  if (error) return <div className="card border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/30">خطا در دریافت داده‌های سرور رخ داد.</div>;
  if (!rows.length) return <EmptyState title="داده‌ای برای نمایش وجود ندارد" description="فیلتر یا جستجو را تغییر دهید." />;

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const visibleRows = rows.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="card overflow-hidden p-0">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] text-right text-sm">
          <thead className="bg-slate-50/80 text-slate-500 dark:bg-slate-800/80">
            <tr>
              {columns.map((column) => <th className="px-5 py-4 font-black" key={column.key}>{column.label}</th>)}
              {actions && <th className="px-5 py-4 font-black">جزئیات</th>}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr className="border-t border-slate-100 transition hover:bg-cyan-500/5 dark:border-slate-800" key={row.id}>
                {columns.map((column) => <td className="px-5 py-4" key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>)}
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
          <button className="btn-soft" disabled={page === totalPages} onClick={() => onPageChange(page + 1)}>بعدی</button>
        </div>
      </div>
    </div>
  );
}
