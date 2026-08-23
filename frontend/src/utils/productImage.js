export const DEFAULT_PRODUCT_IMAGE = '/images/products/white-tshirt.png';

function isUsableImage(value) {
  if (typeof value !== 'string' || !value.trim()) return false;

  // Old demo rows used 1x1 transparent data URLs as placeholders.
  if (value.startsWith('data:image/') && value.length < 4000) return false;
  return true;
}

export function getProductImages(product) {
  const pendingChanges = product?.pending_changes || product?.pendingChanges || null;
  const hasPendingImages = Array.isArray(pendingChanges?.images) && pendingChanges.images.length > 0;
  const source = hasPendingImages ? pendingChanges.images : product?.images;
  const images = Array.isArray(source) ? source : source ? [source] : [];
  return [...new Set(images.filter(isUsableImage))];
}

export function getProductImage(product) {
  return getProductImages(product)[0] || DEFAULT_PRODUCT_IMAGE;
}
