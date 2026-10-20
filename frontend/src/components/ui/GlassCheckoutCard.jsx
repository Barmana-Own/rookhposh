import { useState } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, Landmark, ReceiptText, Wallet } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import { Button } from './button.jsx';
import { Card } from './card.jsx';
import FileDropzone from './FileDropzone.jsx';
import { formatMoney, moneyInWords } from '../../utils/formatters.js';

const methods = [
  { value: 'wallet', label: 'کیف پول', icon: Wallet },
  { value: 'bank_transfer', label: 'واریز حساب', icon: Landmark },
  { value: 'direct_gateway', label: 'درگاه مستقیم', icon: CreditCard },
];

function fileToPayload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, dataUrl: reader.result });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function GlassCheckoutCard({
  amount = 0,
  title = 'جزئیات پرداخت',
  description = 'پرداخت خود را با یکی از روش‌های زیر کامل کنید.',
  bankInfo,
  allowWallet = true,
  onSubmit,
  submitLabel,
  className,
}) {
  const [paymentMethod, setPaymentMethod] = useState(allowWallet ? 'wallet' : 'direct_gateway');
  const [receipt, setReceipt] = useState(null);
  const [requestId] = useState(() => crypto.randomUUID());
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      await onSubmit?.({
        payment_method: paymentMethod,
        receipt,
        request_id: requestId,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={cn('w-full max-w-[430px]', className)}
      dir="rtl"
    >
      <Card className="overflow-hidden rounded-[2rem] border-slate-200 bg-white shadow-2xl shadow-slate-900/15">
        <div className="p-6">
          <div className="mb-6">
            <h3 className="text-xl font-black text-slate-950">{title}</h3>
            <p className="mt-2 text-sm leading-7 text-slate-500">{description}</p>
          </div>

          <div className={cn('mb-6 grid gap-2', allowWallet ? 'grid-cols-3' : 'grid-cols-2')}>
            {methods.filter((method) => allowWallet || method.value !== 'wallet').map((method) => {
              const Icon = method.icon;
              return (
                <button
                  type="button"
                  key={method.value}
                  onClick={() => setPaymentMethod(method.value)}
                  className={cn(
                    'flex h-16 flex-col items-center justify-center gap-1 rounded-2xl border border-slate-200 bg-white text-xs font-bold text-slate-600 transition hover:bg-slate-50',
                    paymentMethod === method.value && 'border-slate-950 bg-slate-100 text-slate-950',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {method.label}
                </button>
              );
            })}
          </div>

          {paymentMethod === 'direct_gateway' ? (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-600">
              برای پرداخت به صفحه امن امیدپی در شاپرک منتقل می‌شوید. اطلاعات کارت را فقط در همان صفحه وارد کنید.
            </div>
          ) : null}

          {paymentMethod === 'bank_transfer' ? (
            <div className="space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm leading-8 text-slate-700">
                <div className="font-black text-slate-950">مشخصات واریز</div>
                <div>بانک: {bankInfo?.bank_name || 'ملت'}</div>
                <div>شماره کارت: {bankInfo?.card_number || '0000-0000-0000-0000'}</div>
                <div>شبا: {bankInfo?.iban || 'IR000000000000000000000000'}</div>
                <div>به نام: {bankInfo?.account_holder || 'مدیریت مارکت‌پلیس'}</div>
              </div>
              <FileDropzone
                label="آپلود رسید پرداخت"
                helper="رسید بانکی یا تصویر پرداخت را اینجا بکشید و رها کنید."
                accept="image/*,.pdf"
                multiple={false}
                fileName={receipt?.name || ''}
                onSelect={async (file) => setReceipt(await fileToPayload(file))}
              />
            </div>
          ) : null}

          {paymentMethod === 'wallet' ? (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-600">
              مبلغ از موجودی کیف پول شما کسر می‌شود. اگر موجودی کافی نباشد، ابتدا کیف پول را شارژ کنید.
            </div>
          ) : null}

          <div className="mt-6 rounded-3xl bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-slate-500">مبلغ قابل پرداخت</span>
              <strong className="text-xl font-black text-indigo-600">{formatMoney(amount)}</strong>
            </div>
            <p className="mt-2 text-xs font-bold text-slate-500">{moneyInWords(amount)}</p>
          </div>

          <Button
            type="button"
            className="mt-6 h-12 w-full rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/15 hover:bg-slate-800"
            onClick={submit}
            disabled={loading || (paymentMethod === 'bank_transfer' && !receipt)}
          >
            {loading ? 'در حال ثبت...' : submitLabel || `پرداخت ${formatMoney(amount)}`}
          </Button>

          <p className="mt-4 text-center text-xs text-slate-500">
            <ReceiptText className="ml-1 inline-block h-3 w-3" />
            پرداخت امن است و رسید بعد از ثبت نمایش داده می‌شود.
          </p>
        </div>
      </Card>
    </motion.div>
  );
}
