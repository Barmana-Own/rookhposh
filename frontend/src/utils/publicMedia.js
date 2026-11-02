import apiClient from '../services/apiClient.js';

const profiles = {
  banner: { widths: [640, 960, 1280], sizes: '(min-width: 1400px) 1360px, 92vw', fallback: 1280 },
  logo: { widths: [160, 320], sizes: '104px', fallback: 160 },
  thumbnail: { widths: [160, 320], sizes: '96px', fallback: 160 },
  product: { widths: [320, 640, 960], sizes: '(min-width: 1200px) 25vw, (min-width: 768px) 45vw, 90vw', fallback: 640 },
};

export function publicImageProps(source, profile = 'product') {
  if (typeof source !== 'string' || !source.startsWith('/api/stores/') || !source.includes('/media/')) return { src: source };
  const settings = profiles[profile] || profiles.product;
  const base = apiClient.defaults.baseURL || globalThis.location?.origin || 'http://localhost';
  const url = new URL(source, base);
  const variant = width => { const next = new URL(url); next.searchParams.set('w', String(width)); return next.href; };
  return { src: variant(settings.fallback), srcSet: settings.widths.map(width => variant(width) + ' ' + width + 'w').join(', '), sizes: settings.sizes };
}
