import { CheckCircle2, Shirt, Star } from 'lucide-react';
import { faNumber } from '../../utils/tryon.js';
import PublicImage from './PublicImage.jsx';

export default function SelectedProductPanel({ product, image, images, features, disabled, onSelect }) {
  return (
    <aside className="public-selected-product public-surface" aria-label="محصول انتخاب‌شده برای پرو">
      <div className="public-selected-image"><PublicImage src={image} alt={product.title} loading="eager" /></div>
      <h2>{product.title}</h2>
      <span className="public-rating"><Star size={16} aria-hidden="true" />{Number(product.avg_rating) > 0 ? `${faNumber(product.avg_rating)} امتیاز` : 'بدون امتیاز'}</span>
      {features.length > 0 && <div className="public-product-features" aria-label="ویژگی‌های محصول">
        {features.map(feature => <span key={feature}><CheckCircle2 size={15} aria-hidden="true" />{feature}</span>)}
      </div>}
      {images.length > 1 && <section className="public-garment-selector" aria-label="مدل‌های لباس برای پرو">
        <h3><Shirt size={21} aria-hidden="true" />مدل لباس انتخابی برای پرو</h3>
        <div className="public-garment-thumbnails">
          {images.map((source, index) => <button type="button" key={source}
            className="public-garment-option" aria-pressed={image === source} aria-label={`انتخاب مدل ${faNumber(index + 1)}`}
            disabled={disabled} onClick={() => onSelect(source)}>
            <PublicImage src={source} alt={`مدل ${faNumber(index + 1)} ${product.title}`} />
          </button>)}
        </div>
      </section>}
    </aside>
  );
}
