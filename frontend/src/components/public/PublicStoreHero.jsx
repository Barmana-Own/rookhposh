import { Eye, Phone, Store } from 'lucide-react';
import { useState } from 'react';
import PublicImage from './PublicImage.jsx';
import PublicWaves from './PublicWaves.jsx';

export default function PublicStoreHero({ store, compact = false }) {
  const BadgeIcon = compact ? Eye : Store;
  const [bannerShape, setBannerShape] = useState(null);
  const contained = bannerShape?.source === store.banner && bannerShape.aspect < 4.5;
  return (
    <header className={`public-hero${compact ? ' public-hero--compact' : ''}${contained ? ' public-hero--contained' : ''}`}>
      <div className="public-hero-banner">
        <PublicWaves brand />
        {contained && <img className="public-hero-banner-edges" src={store.banner} alt="" aria-hidden="true" decoding="async" />}
        <PublicImage src={store.banner} alt={`بنر ${store.store_name}`} loading="eager"
          onLoad={(event) => setBannerShape({ source: store.banner, aspect: event.currentTarget.naturalWidth / event.currentTarget.naturalHeight })}
          className="public-hero-banner-image" fallback={<PublicWaves brand />} />
      </div>
      <div className="public-store-identity">
        <PublicWaves className="public-identity-waves" />
        <div className="public-store-logo">
          <PublicImage src={store.logo} alt={`نشان ${store.store_name}`} loading="eager"
            fallback={<Store size={38} aria-hidden="true" />} />
        </div>
        <div className="public-store-details">
          <span className="public-store-badge"><BadgeIcon size={17} aria-hidden="true" />{compact ? 'پیش‌نمایش از دید کاربر' : 'فروشگاه عمومی'}</span>
          <h1>{store.store_name}</h1>
          <p className="public-store-description" title={store.description || undefined}>{store.description || 'توضیحی برای فروشگاه ثبت نشده است.'}</p>
          {store.contact_phone && <a href={`tel:${store.contact_phone}`} dir="ltr" className="public-store-phone"><Phone size={14} aria-hidden="true" />{store.contact_phone}</a>}
        </div>
      </div>
    </header>
  );
}
