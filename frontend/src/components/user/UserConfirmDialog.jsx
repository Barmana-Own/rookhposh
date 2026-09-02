export default function UserConfirmDialog({ open, title, description, onCancel, onConfirm }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
      <div className="glass w-full max-w-md rounded-[2rem] p-6">
        <h3 className="text-xl font-black">{title}</h3>
        <p className="mt-3 text-sm leading-7 text-slate-500">{description}</p>
        <div className="mt-6 flex gap-3">
          <button className="btn-primary" onClick={onConfirm}>تایید</button>
          <button className="btn-soft" onClick={onCancel}>انصراف</button>
        </div>
      </div>
    </div>
  );
}
