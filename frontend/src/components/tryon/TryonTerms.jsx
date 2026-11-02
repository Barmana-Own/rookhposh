import AccessibleModal from '../ui/AccessibleModal.jsx';

export default function TryonTerms({ terms, busy, error, onAccept, onClose, returnFocusRef }) {
  return (
    <AccessibleModal open={Boolean(terms)} title={terms?.title || 'قوانین استفاده از پرو آنلاین'}
      description="برای شروع، قوانین پرو آنلاین را تأیید کنید. این تأیید برای استفاده‌های بعدی در همین مرورگر ذخیره می‌شود."
      busy={busy} onClose={onClose} returnFocusRef={returnFocusRef}>
      <ul className="list-inside list-disc space-y-3 text-sm leading-8 text-slate-600 dark:text-slate-300">
        {terms?.paragraphs.map((paragraph) => <li key={paragraph}>{paragraph}</li>)}
      </ul>
      {error && <p role="alert" className="mt-4 text-sm text-rose-600">{error}</p>}
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className="btn-primary justify-center" onClick={onAccept} disabled={busy}>
          {busy ? 'در حال ثبت تأیید...' : 'پذیرش قوانین و ساخت خروجی'}
        </button>
        <button type="button" className="btn-soft" onClick={onClose} disabled={busy}>انصراف</button>
      </div>
    </AccessibleModal>
  );
}
