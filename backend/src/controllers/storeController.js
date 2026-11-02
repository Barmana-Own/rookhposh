const db = require('../repositories/dbStore');
const asyncHandler = require('../utils/asyncHandler');
const { toNumber } = require('../utils/number');
const ApiError = require('../utils/apiError');
const media = require('../services/publicMedia');
const { performance } = require('node:perf_hooks');

function clientIp(req) {
  const value = req.ips?.at(-1) || req.ip || req.socket.remoteAddress || '';
  return value.replace(/^::ffff:/, '').slice(0, 64);
}

async function publicProduct(slug, productId) {
  const store = await db.getStoreBySlug(slug);
  const products = store ? await db.listProducts({ sellerId: store.seller_id, productId, status: 'active', includePendingChanges: false }) : [];
  const product = products.find((item) => toNumber(item.id) === toNumber(productId));
  if (!store || !product || product.publish_status !== 'active') {
    const error = new Error('محصول عمومی پیدا نشد.');
    error.status = 404;
    throw error;
  }
  return product;
}

exports.publicStore = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const started = performance.now();
  const pageView = req.query.view === 'page';
  if (req.query.view !== undefined && !pageView) throw new ApiError(400, 'نمای فروشگاه معتبر نیست.');
  const id = req.query.productId;
  if (id !== undefined && (typeof id !== 'string' || !/^[1-9][0-9]{0,14}$/.test(id) || !Number.isSafeInteger(Number(id)))) throw new ApiError(400, 'شناسه محصول معتبر نیست.');
  const data = await db.getStoreBySlug(req.params.slug);
  if (!data) throw new ApiError(404, 'فروشگاه موردنظر یافت نشد');
  const products = await db.listProducts({ sellerId: data.seller_id, productId: id, status: 'active', includePendingChanges: false });
  if (id && !products.length) throw new ApiError(404, 'محصول عمومی پیدا نشد.');
  let output = { ...data, products };
  if (pageView) {
    const root = '/api/stores/' + encodeURIComponent(data.slug) + '/media';
    const pick = (value, keys) => Object.fromEntries(keys.map(key => [key, value[key]]));
    output = {
      ...pick(data, ['id', 'seller_id', 'slug', 'store_name', 'description', 'contact_phone', 'status']),
      banner: media.reference(data.banner, root + '/banner'), logo: media.reference(data.logo, root + '/logo'),
      products: products.map(product => ({
        ...pick(product, ['id', 'seller_id', 'title', 'description', 'features', 'price', 'price_toman', 'status', 'publish_status', 'avg_rating', 'review_count', 'created_at', 'updated_at']),
        images: product.images.map((source, index) => media.reference(source, root + '/products/' + product.id + '/' + index)),
      })),
    };
  }
  // Revalidate publication on every read; no shared stale catalogue or session cache.
  res.set({ 'Cache-Control': 'no-store', 'Server-Timing': 'public_read;dur=' + (performance.now() - started).toFixed(1) });
  res.json({ success: true, data: output });
});

exports.publicMedia = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { kind, productId, index } = req.params;
  const width = req.query.w, expectedVersion = req.query.v;
  if ((width !== undefined && (typeof width !== 'string' || !/^(160|320|640|960|1280)$/.test(width)))
      || (expectedVersion !== undefined && (typeof expectedVersion !== 'string' || !/^[a-f0-9]{24}$/.test(expectedVersion)))) throw new ApiError(400, 'درخواست تصویر معتبر نیست.');
  if (productId !== undefined && (!/^[1-9][0-9]{0,14}$/.test(productId) || !/^[0-9]{1,3}$/.test(index))) throw new ApiError(404, 'تصویر عمومی پیدا نشد.');
  const shop = await db.getStoreBySlug(req.params.slug);
  if (!shop) throw new ApiError(404, 'تصویر عمومی پیدا نشد.');
  let source;
  if (productId) {
    const [product] = await db.listProducts({ sellerId: shop.seller_id, productId, status: 'active', includePendingChanges: false });
    source = product?.images?.[Number(index)];
  } else if (kind === 'banner' || kind === 'logo') source = shop[kind];
  else throw new ApiError(404, 'تصویر عمومی پیدا نشد.');
  const webp = String(req.headers.accept || '').toLowerCase().includes('image/webp') && Boolean(req.accepts('image/webp'));
  const image = await media.render(source, { width, expectedVersion, webp });
  res.vary('Accept');
  res.set({ 'Content-Type': image.mime, 'Cache-Control': 'public, no-cache, must-revalidate', ETag: image.etag,
    'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'cross-origin',
    'X-Image-Width': String(image.width), 'X-Image-Height': String(image.height) });
  if (req.fresh) return res.status(304).end();
  res.set('Content-Length', String(image.bytes.length)); res.end(image.bytes);
});

exports.publicProQuota = asyncHandler(async (req, res) => {
  const product = await publicProduct(req.params.slug, req.params.productId);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data: await db.getPublicProQuota(clientIp(req), product.seller_id) });
});

exports.publicProHistory = asyncHandler(async (req, res) => {
  const product = await publicProduct(req.params.slug, req.params.productId);
  res.json({ success: true, data: await db.listPublicProUsages(clientIp(req), product.id) });
});

exports.publicUploadProImage = asyncHandler(async (req, res) => {
  const product = await publicProduct(req.params.slug, req.params.productId);
  res.json({
    success: true,
    data: await db.createProUpload({
      ...(req.body || {}),
      user_id: null,
      product_id: product.id,
      ip_address: clientIp(req),
    }),
  });
});

exports.publicUsePro = asyncHandler(async (req, res) => {
  const product = await publicProduct(req.params.slug, req.params.productId);
  res.json({
    success: true,
    data: await db.createPublicProUsage({
      ...(req.body || {}),
      product_id: product.id,
      client_ip: clientIp(req),
    }),
  });
});
