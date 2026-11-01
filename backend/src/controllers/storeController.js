const db = require('../repositories/dbStore');
const asyncHandler = require('../utils/asyncHandler');
const { toNumber } = require('../utils/number');

function clientIp(req) {
  const value = req.ips?.at(-1) || req.ip || req.socket.remoteAddress || '';
  return value.replace(/^::ffff:/, '').slice(0, 64);
}

async function publicProduct(slug, productId) {
  const store = await db.getStoreBySlug(slug);
  const products = store ? await db.listProducts({ sellerId: store.seller_id, status: 'active' }) : [];
  const product = products.find((item) => toNumber(item.id) === toNumber(productId));
  if (!store || !product || product.publish_status !== 'active') {
    const error = new Error('محصول عمومی پیدا نشد.');
    error.status = 404;
    throw error;
  }
  return product;
}

exports.publicStore = asyncHandler(async (req, res) => {
  const data = await db.getStoreBySlug(req.params.slug);
  res.json({ success: true, data: data ? { ...data, products: await db.listProducts({ sellerId: data.seller_id, status: 'active' }) } : null });
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
