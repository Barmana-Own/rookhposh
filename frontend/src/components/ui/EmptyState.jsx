import{Inbox}from'lucide-react';export default function EmptyState({title='داده‌ای یافت نشد',description='با تغییر فیلترها دوباره تلاش کنید.'}){return <div className="card flex flex-col items-center py-14 text-center"><Inbox className="text-slate-400" size={42}/><h3 className="mt-4 text-lg font-black">{title}</h3><p className="mt-2 text-sm text-slate-500">{description}</p></div>}

