import { Shirt } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DEFAULT_PRODUCT_IMAGE } from '../../utils/productImage.js';
import { publicImageProps } from '../../utils/publicMedia.js';

export default function PublicImage({ src, alt, className = '', fallback, loading = 'lazy', onLoad, profile = 'product', decorative = false, retryable = false }) {
  const [failedSource, setFailedSource] = useState(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (failedSource !== src) return undefined;
    const retry = () => { setFailedSource(null); setRevision(value => value + 1); };
    globalThis.addEventListener?.('online', retry);
    return () => globalThis.removeEventListener?.('online', retry);
  }, [failedSource, src]);
  if (!src || src === DEFAULT_PRODUCT_IMAGE || failedSource === src) {
    return (
      <div className={`${className} public-image-fallback`} role={retryable && failedSource === src ? 'group' : 'img'} aria-hidden={decorative || undefined} aria-label={`${alt}؛ تصویر در دسترس نیست`}>
        {fallback || <><Shirt size={42} aria-hidden="true" /><span>تصویر در دسترس نیست</span></>}
        {retryable && src && src !== DEFAULT_PRODUCT_IMAGE && !decorative && failedSource === src && <button type="button" className="public-image-retry" onClick={() => { setFailedSource(null); setRevision(value => value + 1); }}>تلاش مجدد دریافت تصویر</button>}
      </div>
    );
  }
  return <img key={src + ':' + revision} {...publicImageProps(src, profile)} alt={alt} aria-hidden={decorative || undefined} className={className} loading={loading} decoding="async" onLoad={onLoad} onError={() => setFailedSource(src)} />;
}
