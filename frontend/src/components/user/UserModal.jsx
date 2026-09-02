import { X } from 'lucide-react';

export default function UserModal({ open, title, children, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 p-3 sm:p-4">
      <div className="flex min-h-full items-center justify-center">
        <div className="glass flex max-h-[calc(100vh-1.5rem)] w-full max-w-2xl flex-col rounded-[2rem] p-4 sm:max-h-[calc(100vh-2rem)] sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-white/50 pb-4 dark:border-white/10">
            <h3 className="text-lg font-black sm:text-xl">{title}</h3>
            <button type="button" className="btn-soft shrink-0" onClick={onClose} aria-label="بستن">
              <X size={18} />
            </button>
          </div>

          <div className="overflow-y-auto pr-1">{children}</div>
        </div>
      </div>
    </div>
  );
}
