import { Shirt } from 'lucide-react';
import { useState } from 'react';
import { DEFAULT_PRODUCT_IMAGE } from '../../utils/productImage.js';

export default function PublicImage({ src, alt, className = '', fallback, loading = 'lazy', onLoad }) {
  const [failedSource, setFailedSource] = useState(null);
  if (!src || src === DEFAULT_PRODUCT_IMAGE || failedSource === src) {
    return (
      <div className={`${className} public-image-fallback`} role="img" aria-label={`${alt}؛ تصویر در دسترس نیست`}>
        {fallback || <><Shirt size={42} aria-hidden="true" /><span>تصویر در دسترس نیست</span></>}
      </div>
    );
  }
  return <img key={src} src={src} alt={alt} className={className} loading={loading} decoding="async" onLoad={onLoad} onError={() => setFailedSource(src)} />;
}
