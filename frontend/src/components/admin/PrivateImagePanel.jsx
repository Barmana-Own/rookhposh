import { Download, Maximize2 } from 'lucide-react';
import { useState } from 'react';
import PrivateImage from '../tryon/PrivateImage.jsx';
import { downloadProOutput } from '../../utils/proOutput.js';
import { faNumber } from '../../utils/tryon.js';

export default function PrivateImagePanel({ asset, title }) {
  const [large, setLarge] = useState(false);
  const [metadata, setMetadata] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const download = async () => {
    if (busy || !asset?.url) return;
    setBusy(true); setError('');
    try { await downloadProOutput(asset.url + (asset.url.includes('?') ? '&' : '?') + 'download=1'); }
    catch (failure) { setError(failure.message || 'دانلود انجام نشد.'); }
    finally { setBusy(false); }
  };
  const width = asset?.width || metadata?.width;
  const height = asset?.height || metadata?.height;
  return (
    <figure className={'min-w-0 space-y-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-700 ' + (large ? 'col-span-full' : '')}>
      <figcaption className="font-black">{title}</figcaption>
      <div className={'flex items-center justify-center overflow-hidden rounded-xl bg-white ' + (large ? 'h-[65vh]' : 'h-56')}>
        <PrivateImage asset={asset} alt={title} onMetadata={setMetadata} className="h-full max-h-full w-full object-contain" />
      </div>
      <p className="break-words text-xs text-slate-500">
        {width && height ? faNumber(width) + ' × ' + faNumber(height) + ' پیکسل' : 'ابعاد نامشخص'}
        {' · '}{asset?.mime || metadata?.mime || 'فرمت نامشخص'}
        {' · '}{asset?.byte_size || metadata?.byte_size ? faNumber(Math.ceil((asset?.byte_size || metadata?.byte_size) / 1024)) + ' کیلوبایت' : 'حجم نامشخص'}
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="btn-soft" disabled={!asset?.url} aria-expanded={large} onClick={() => setLarge(!large)}><Maximize2 size={16} />{large ? 'اندازه معمول' : 'بزرگ‌نمایی'}</button>
        <button className="btn-soft" disabled={!asset?.url || busy} onClick={download}><Download size={16} />{busy ? 'در حال دریافت...' : 'دانلود تصویر'}</button>
      </div>
      {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
    </figure>
  );
}
