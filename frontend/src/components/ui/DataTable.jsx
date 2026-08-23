export default function DataTable({ columns, rows, renderActions }) {
  const value = (column, row) => (column.render ? column.render(row) : row[column.key]);

  return (
    <div className="card overflow-hidden p-0">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] text-right text-sm">
          <thead className="bg-slate-50/80 text-slate-500 dark:bg-slate-800/70">
            <tr>
              {columns.map((column) => <th className="px-5 py-4 font-bold" key={column.key}>{column.label}</th>)}
              {renderActions && <th className="px-5 py-4">عملیات</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr className="border-t border-slate-100 dark:border-slate-800" key={row.id || row.email || index}>
                {columns.map((column) => <td className="px-5 py-4" key={column.key}>{value(column, row)}</td>)}
                {renderActions && <td className="px-5 py-4">{renderActions(row)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 p-3 md:hidden">
        {rows.map((row, index) => (
          <article className="space-y-3 rounded-2xl border border-slate-200 bg-white/75 p-4 dark:border-slate-700 dark:bg-slate-900/70" key={row.id || row.email || index}>
            {columns.map((column) => (
              <div className="grid grid-cols-[minmax(6rem,35%)_1fr] items-start gap-3 text-sm" key={column.key}>
                <span className="font-black text-slate-500 dark:text-slate-400">{column.label}</span>
                <div className="min-w-0 break-words font-bold">{value(column, row)}</div>
              </div>
            ))}
            {renderActions ? <div className="border-t border-slate-200 pt-3 dark:border-slate-700">{renderActions(row)}</div> : null}
          </article>
        ))}
      </div>
    </div>
  );
}
