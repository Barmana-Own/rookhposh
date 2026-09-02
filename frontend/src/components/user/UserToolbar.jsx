import { Filter, Search } from 'lucide-react';
export default function UserToolbar({ search, onSearch, filter, onFilter, filters }) {
  return <div className="card flex flex-col gap-3 md:flex-row"><label className="flex flex-1 items-center gap-2 rounded-2xl bg-white/70 px-4 py-3 dark:bg-slate-950/60"><Search size={18} className="text-slate-400" /><input className="w-full bg-transparent text-sm outline-none" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="جستجو..." /></label><label className="flex min-w-56 items-center gap-2 rounded-2xl bg-white/70 px-4 py-3 dark:bg-slate-950/60"><Filter size={18} className="text-slate-400" /><select className="w-full bg-transparent text-sm outline-none" value={filter} onChange={(event) => onFilter(event.target.value)}>{filters.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div>;
}

