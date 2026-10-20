import { X } from 'lucide-react';
import GlassCheckoutCard from '../ui/GlassCheckoutCard.jsx';
import TicketConfirmationCard from '../ui/TicketConfirmationCard.jsx';
import { faDateTime, formatMoney } from '../../utils/formatters.js';
import { toPersianMessage } from '../../utils/errorMessages.js';

function downloadReceipt(receipt) {
  const width = 900;
  const height = 1300;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.font = 'bold 54px Tahoma, Arial';
  ctx.fillText('رسید پرداخت موفق', width / 2, 130);

  ctx.font = '28px Tahoma, Arial';
  ctx.fillStyle = '#64748b';
  ctx.fillText('رسید شما با موفقیت صادر شد.', width / 2, 180);

  ctx.setLineDash([18, 12]);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(120, 260);
  ctx.lineTo(width - 120, 260);
  ctx.stroke();
  ctx.setLineDash([]);

  const rows = [
    ['شناسه رسید', receipt.ticketId],
    ['مبلغ', formatMoney(receipt.amount)],
    ['تاریخ', faDateTime(receipt.date || new Date())],
    ['مرکز پرداخت', receipt.cardHolder || 'Marketplace Center'],
    ['بارکد', receipt.barcodeValue],
  ];

  ctx.textAlign = 'right';
  rows.forEach(([label, value], index) => {
    const y = 340 + index * 86;
    ctx.font = '24px Tahoma, Arial';
    ctx.fillStyle = '#64748b';
    ctx.fillText(label, width - 140, y);
    ctx.font = 'bold 30px Tahoma, Arial';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(String(value), width - 140, y + 38);
  });

  ctx.setLineDash([18, 12]);
  ctx.strokeStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.moveTo(120, 820);
  ctx.lineTo(width - 120, 820);
  ctx.stroke();
  ctx.setLineDash([]);

  const barcode = String(receipt.barcodeValue || receipt.ticketId || '00000000000000').padEnd(14, '0').slice(0, 14);
  let x = 170;
  for (let index = 0; index < 78; index += 1) {
    const widthBar = ((barcode.charCodeAt(index % barcode.length) + index * 5) % 4) + 2;
    ctx.fillStyle = '#020617';
    ctx.fillRect(x, 900, widthBar, 120);
    x += widthBar + 4;
  }

  ctx.textAlign = 'center';
  ctx.font = '28px monospace';
  ctx.fillStyle = '#64748b';
  ctx.fillText(barcode.split('').join(' '), width / 2, 1085);

  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = `receipt-${receipt.ticketId}.png`;
  link.click();
}

export default function PaymentModal({
  open,
  amount,
  title,
  description,
  result,
  error,
  bankInfo,
  allowWallet = true,
  onSubmit,
  onClose,
}) {
  if (!open) return null;

  return (
    <div dir="rtl" className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-sm">
      <div className="flex min-h-full items-center justify-center">
        <div className="relative w-full max-w-[430px]">
          <button
            type="button"
            className="absolute left-3 top-3 z-[62] flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg transition hover:bg-slate-100"
            onClick={onClose}
            aria-label="بستن"
            title="بستن"
          >
            <X size={18} />
          </button>

          {result ? (
            <div className="flex justify-center">
              <TicketConfirmationCard
                ticketId={result.transaction_id || result.id}
                amount={result.amount || amount}
                date={result.created_at || new Date()}
                cardHolder={result.card_holder || 'Marketplace Center'}
                last4Digits={String(result.last4 || result.transaction_id || '0000').slice(-4)}
                barcodeValue={String(result.transaction_id || result.id || '00000000000000').padEnd(14, '0').slice(0, 14)}
                title={result.status === 'pending' ? 'درخواست پرداخت ثبت شد' : 'پرداخت موفق بود'}
                description={
                  result.status === 'pending'
                    ? 'بعد از تایید رسید توسط ادمین، عملیات تکمیل می‌شود.'
                    : 'رسید شما با موفقیت صادر شد.'
                }
                onDownload={downloadReceipt}
                className="max-w-[430px]"
              />
            </div>
          ) : (
            <GlassCheckoutCard
              amount={amount}
              title={title}
              description={description}
              bankInfo={bankInfo}
              allowWallet={allowWallet}
              onSubmit={onSubmit}
            />
          )}

          {error ? (
            <div className="mx-auto mt-4 max-w-[430px] rounded-2xl border border-rose-200 bg-white px-4 py-3 text-center text-sm font-bold text-rose-600">
              {toPersianMessage(error, 'پرداخت انجام نشد. لطفاً دوباره تلاش کنید.')}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
