function splitFeatureText(value) {
  return String(value || '')
    .split(/[\n,،;؛|•]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeProductFeatures(value) {
  const source = Array.isArray(value) ? value : splitFeatureText(value);
  return [...new Set(
    source
      .flatMap((item) => (Array.isArray(item) ? item : [item]))
      .flatMap((item) => splitFeatureText(item))
      .map((item) => String(item || '').trim())
      .filter(Boolean),
  )].slice(0, 8);
}

export function getProductFeatures(product) {
  const pendingChanges = product?.pending_changes || product?.pendingChanges || null;
  const rawFeatures = pendingChanges?.features ?? product?.features;
  const features = normalizeProductFeatures(rawFeatures);
  return features.length ? features : normalizeProductFeatures(product?.description);
}
