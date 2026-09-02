import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, WalletCards } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import { faDateTime, formatMoney } from '../../utils/formatters.js';

function DashedLine() {
  return <div className="w-full border-t-2 border-dashed border-slate-200" />;
}

function Barcode({ value }) {
  const bars = useMemo(() => {
    const seed = String(value || '000000').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return Array.from({ length: 58 }, (_, index) => ({ width: ((seed + index * 7) % 5) > 2 ? 3 : 1.6 }));
  }, [value]);

  let x = 12;
  return (
    <div className="flex flex-col items-center py-2">
      <svg width="250" height="72" viewBox="0 0 250 72" className="fill-current text-slate-950" aria-label={`barcode ${value}`}>
        {bars.map((bar, index) => {
          const current = x;
          x += bar.width + 1.5;
          return <rect key={index} x={current} y="10" width={bar.width} height="52" rx="0.5" />;
        })}
      </svg>
      <p className="mt-2 text-sm tracking-[0.35em] text-slate-500" dir="ltr">{value}</p>
    </div>
  );
}

function ConfettiExplosion() {
  const colors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#8b5cf6', '#06b6d4'];
  return (
    <>
      <style>{`
        @keyframes receiptFall {
          0% { transform: translateY(-12vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
      <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
        {Array.from({ length: 70 }).map((_, index) => (
          <span
            key={index}
            className="absolute h-3 w-2 rounded-sm"
            style={{
              left: `${(index * 37) % 100}%`,
              top: `${-20 - (index % 10)}%`,
              backgroundColor: colors[index % colors.length],
              animation: `receiptFall ${2.4 + (index % 8) * 0.18}s ${(index % 12) * 0.08}s linear forwards`,
            }}
          />
        ))}
      </div>
    </>
  );
}

export default function TicketConfirmationCard({
  ticketId,
  amount,
  date,
  cardHolder = 'Marketplace',
  last4Digits = '0000',
  barcodeValue,
  title = 'پرداخت موفق بود',
  description = 'رسید شما با موفقیت صادر شد.',
  onDownload,
  className,
}) {
  const [showConfetti, setShowConfetti] = useState(true);
  const id = ticketId || 'TX-000000';
  const barcode = barcodeValue || String(id).replace(/\D/g, '').padEnd(14, '0').slice(0, 14);

  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(false), 4500);
    return () => clearTimeout(timer);
  }, [id]);

  return (
    <>
      {showConfetti ? <ConfettiExplosion /> : null}
      <div
        className={cn(
          'relative z-[61] w-full max-w-sm rounded-[2rem] bg-white text-slate-950 shadow-2xl shadow-slate-300/50',
          'animate-in fade-in-0 zoom-in-95 duration-500',
          className,
        )}
        dir="rtl"
      >
        <div className="flex flex-col items-center p-8 text-center">
          <div className="rounded-full bg-slate-100 p-4">
            <CheckCircle2 className="h-12 w-12 text-slate-950" />
          </div>
          <h1 className="mt-5 text-2xl font-black">{title}</h1>
          <p className="mt-2 text-sm text-slate-500">{description}</p>
        </div>

        <div className="space-y-6 px-8 pb-8">
          <DashedLine />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500">شناسه رسید</p>
              <p className="font-mono font-bold">{id}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">مبلغ</p>
              <p className="text-lg font-black">{formatMoney(amount)}</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-slate-500">تاریخ و زمان</p>
            <p className="font-bold">{faDateTime(date || new Date())}</p>
          </div>

          <div className="flex items-center gap-4 rounded-2xl bg-slate-50 p-4">
            <WalletCards className="h-8 w-8 text-rose-500" />
            <div>
              <p className="font-black">{cardHolder}</p>
              <p className="font-mono text-sm tracking-wider text-slate-500">•••• {last4Digits}</p>
            </div>
          </div>

          <DashedLine />
          <Barcode value={barcode} />

          {onDownload ? (
            <button
              type="button"
              className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 text-sm font-black text-white transition hover:bg-slate-800"
              onClick={() => onDownload({ ticketId: id, amount, date, cardHolder, barcodeValue: barcode })}
            >
              <Download size={16} />
              دانلود رسید PNG
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
