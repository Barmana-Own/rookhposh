import { Filter, Search } from 'lucide-react';

export default function SellerToolbar({ search, onSearch, filter, onFilter, filters = [] }) {
  return (
    <div className="card flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <label className="flex flex-1 items-center gap-2 rounded-2xl bg-white/70 px-4 py-3 text-sm shadow-sm dark:bg-slate-950/60">
        <Search size={18} className="text-slate-400" />
        <input value={search} onChange={(event) => onSearch(event.target.value)} className="w-full bg-transparent outline-none" placeholder="جستجو..." />
      </label>
      <label className="flex min-w-56 items-center gap-2 rounded-2xl bg-white/70 px-4 py-3 text-sm shadow-sm dark:bg-slate-950/60">
        <Filter size={18} className="text-slate-400" />
        <select value={filter} onChange={(event) => onFilter(event.target.value)} className="w-full bg-transparent outline-none">
          {filters.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
    </div>
  );
}

