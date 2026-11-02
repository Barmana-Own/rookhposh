import { ExternalLink, Star } from 'lucide-react';
import { getProductImage } from '../../utils/productImage.js';
import { faNumber } from '../../utils/tryon.js';
import PublicImage from './PublicImage.jsx';

export default function StoreProductCard({ product, slug }) {
  return (
    <a className="public-product-card" href={`/stores/${encodeURIComponent(slug)}/products/${product.id}`}
      target="_blank" rel="noopener noreferrer" aria-label={`مشاهده محصول ${product.title} (در تب جدید)`}>
      <div className="public-product-card-image"><PublicImage src={getProductImage(product)} alt={product.title} /></div>
      <h3>{product.title}</h3>
      <p className="public-product-description">{product.description || 'محصول آماده برای پرو آنلاین'}</p>
      {Number(product.avg_rating) > 0 && <span className="public-rating"><Star size={14} aria-hidden="true" />{faNumber(product.avg_rating)} امتیاز</span>}
      <span className="public-button public-button--outline">
        <ExternalLink size={18} aria-hidden="true" />مشاهده محصول
      </span>
    </a>
  );
}
