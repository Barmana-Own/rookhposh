export default function SellerToast({ message }) {
  if (!message) return null;
  return <div className="fixed bottom-5 left-5 z-50 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-2xl dark:bg-white dark:text-slate-950">{message}</div>;
}

