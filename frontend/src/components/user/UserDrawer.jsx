import { X } from 'lucide-react';
import { useEffect } from 'react';

export default function UserDrawer({ open, title, children, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <div className={`fixed inset-0 z-[80] ${open ? '' : 'pointer-events-none'}`}>
      <div className={`absolute inset-0 bg-slate-950/40 transition ${open ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />
      <aside className={`absolute left-0 top-0 flex h-dvh w-full max-w-md flex-col overflow-hidden glass p-6 transition duration-300 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="mb-6 flex shrink-0 items-center justify-between">
          <h3 className="text-xl font-black">{title}</h3>
          <button className="btn-soft" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          {children}
        </div>
      </aside>
    </div>
  );
}
