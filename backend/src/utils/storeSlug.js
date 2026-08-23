function slugifyStoreName(value, fallback = 'store') {
  const normalized = String(value || '').normalize('NFKC').trim().toLowerCase();
  const slug = normalized
    .replace(/[\s_]+/gu, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function isLegacyStoreSlug(value) {
  return /^\d{6,}(?:-seller)?$/u.test(String(value || '').trim());
}

module.exports = { slugifyStoreName, isLegacyStoreSlug };
