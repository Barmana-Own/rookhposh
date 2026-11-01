import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useRef } from 'react';

export default function AccessibleModal({ open, onClose, title, description, children, wide = false, busy = false }) {
  const returnFocus = useRef(null);
  return (
    <Dialog.Root open={open} onOpenChange={(value) => { if (!value && !busy) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm" />
        <Dialog.Content dir="rtl" onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}
          onOpenAutoFocus={() => { returnFocus.current = document.activeElement; }}
          onCloseAutoFocus={(event) => { event.preventDefault(); const target = returnFocus.current?.isConnected ? returnFocus.current : document.querySelector('main button:not([disabled]), main a[href]'); target?.focus?.({ preventScroll: true }); }}
          onInteractOutside={(event) => { if (busy) event.preventDefault(); }}
          className={`glass fixed left-1/2 top-1/2 z-[60] max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl p-5 text-slate-950 outline-none dark:text-white sm:p-6 ${wide ? 'max-w-5xl' : 'max-w-xl'}`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <Dialog.Title className="text-xl font-black">{title}</Dialog.Title>
            <Dialog.Close className="btn-soft shrink-0 p-2" disabled={busy} aria-label="بستن"><X size={18} /></Dialog.Close>
          </div>
          <Dialog.Description className={description ? 'mb-4 text-sm leading-7 text-slate-500' : 'sr-only'}>{description || title}</Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
