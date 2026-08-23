export default function ConfirmDialog({ open, title, onClose, onConfirm, busy = false }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
      <div className="glass w-full max-w-md rounded-3xl p-6">
        <h3 className="text-xl font-black">{title}</h3>
        <p className="mt-2 text-sm text-slate-500">این عملیات قابل بازبینی است. آیا ادامه می‌دهید؟</p>
        <div className="mt-6 flex gap-3">
          <button className="btn-primary" disabled={busy} onClick={onConfirm}>{busy ? 'در حال ثبت...' : 'تایید'}</button>
          <button className="btn-soft" disabled={busy} onClick={onClose}>انصراف</button>
        </div>
      </div>
    </div>
  );
}
