import { ArrowUpRight } from 'lucide-react';
export default function UserMetricCard({ label, value, helper }) {
  return <article className="card"><div className="flex items-center justify-between"><p className="text-sm text-slate-500 dark:text-slate-400">{label}</p><span className="rounded-2xl bg-cyan-500/10 p-2 text-cyan-500"><ArrowUpRight size={18} /></span></div><strong className="mt-4 block text-3xl font-black">{value}</strong><p className="mt-2 text-xs text-emerald-500">{helper}</p></article>;
}

