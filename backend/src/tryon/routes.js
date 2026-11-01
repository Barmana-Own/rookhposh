const express = require('express');
const pool = require('../config/database');
const ApiError = require('../utils/apiError');
const { principal, requireAdmin, sameOrigin, assertId } = require('./identity');
const store = require('./jobStore');
const service = require('./service');
const providers = require('./providers');
const { worker } = require('./worker');

const run = (action) => async (req, res, next) => {
  try { await action(req, res); } catch (error) {
    if (error.code === 'TRYON_ALREADY_ACTIVE') res.status(409).json({ success: false, code: error.code, message: error.message, job_id: error.jobId });
    else next(error);
  }
};
const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
const router = express.Router();
router.use((req, res, next) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? sameOrigin(req, res, next) : next());
router.use(principal());
router.get('/history', run(async (req, res) => ok(res, await service.history(req.tryonOwner, req.query))));
router.get('/by-request/:key', run(async (req, res) => {
  const key = store.requestKey(req.params.key);
  const [[job]] = await pool.query('SELECT * FROM virtual_tryon_jobs WHERE owner_hash=? AND request_key=? AND deleted_at IS NULL', [req.tryonOwner.hash, key]);
  if (!job) throw new ApiError(404, 'عملیات پیدا نشد.');
  ok(res, await store.dto(job));
}));
router.get('/jobs/:id', run(async (req, res) => ok(res, await service.readJob(assertId(req.params.id), req.tryonOwner))));
router.post('/jobs/:id/retry', sameOrigin, run(async (req, res) => {
  const job = await store.retry(assertId(req.params.id), req.tryonOwner, req.body?.request_key);
  ok(res, await store.dto(job), 202); worker.wake();
}));
router.delete('/jobs/:id', sameOrigin, run(async (req, res) => ok(res, await service.erase(assertId(req.params.id), req.tryonOwner))));
router.get('/jobs/:id/images/:kind', run(async (req, res) => {
  // Cached legacy pages can send an account header for this browser's visitor-owned generation.
  try { await store.owned(req.params.id, req.tryonOwner); }
  catch (error) {
    if (error.status !== 404 || !req.tryonAccount) throw error;
    const visitorJob = await store.owned(req.params.id, req.tryonVisitor);
    if (visitorJob.owner_kind !== 'visitor') throw error;
    req.tryonOwner = req.tryonVisitor;
  }
  await service.sendImage(req, res);
}));

const storeRouter = express.Router();
storeRouter.post('/:slug/products/:productId/pro/jobs', sameOrigin, principal(), run(async (req, res) => {
  const job = await service.start(req);
  ok(res, await store.dto(job), 202); worker.wake();
}));
// Preserve the original URLs/envelopes through the same owner/job/credit boundary.
storeRouter.post('/:slug/products/:productId/pro/upload', sameOrigin, principal({ legacyVisitor: true }),
  run(async (req, res) => ok(res, await service.legacyUpload(req))));
storeRouter.post('/:slug/products/:productId/pro/use', sameOrigin, principal({ legacyVisitor: true }),
  run(async (req, res) => ok(res, await service.legacyUse(req))));
storeRouter.get('/:slug/products/:productId/pro/history', principal({ legacyVisitor: true }), run(async (req, res) => {
  const { product } = await service.publicProduct(req.params.slug, req.params.productId);
  const [rows] = await pool.query(
    "SELECT * FROM virtual_tryon_jobs WHERE owner_hash=? AND product_id=? AND status='completed' AND deleted_at IS NULL ORDER BY completed_at DESC,id DESC LIMIT 20",
    [req.tryonOwner.hash, product.id],
  );
  const items = [];
  for (const row of rows) {
    const value = await store.dto(row);
    items.push({ id: row.usage_id || row.id, job_id: row.id, product_id: row.product_id, product_title: row.product_title,
      description: 'پرو آنلاین برای ' + row.product_title, created_at: row.completed_at,
      input_image: value.images.input?.url, product_image: value.images.product?.url, output_image: value.images.output?.url });
  }
  ok(res, items);
}));

const legacyRouter = express.Router();
legacyRouter.use(sameOrigin, principal({ legacyVisitor: true }));
for (const endpoint of ['/try-on', '/m1', '/m2']) legacyRouter.post(endpoint, run(service.legacyGenerate));

const legacyOutput = [principal(), run(async (req, res) => {
  if (typeof req.query.url !== 'string' || req.query.url.length > 4096) throw new ApiError(400, 'آدرس تصویر معتبر نیست.');
  const [[job]] = await pool.query(
    'SELECT j.id FROM virtual_tryon_jobs j JOIN pro_usages p ON p.id=j.legacy_usage_id WHERE j.owner_hash=? AND p.output_image=? AND j.deleted_at IS NULL LIMIT 1',
    [req.tryonOwner.hash, req.query.url],
  );
  if (!job) throw new ApiError(404, 'تصویر پیدا نشد.');
  req.params = { id: job.id, kind: 'output' };
  await service.sendImage(req, res);
})];

const adminRouter = express.Router();
adminRouter.use(requireAdmin);
adminRouter.get('/jobs', run(async (req, res) => {
  await providers.audit(req.tryonAdmin.id, 'jobs.list_viewed', null);
  ok(res, await store.adminList(req.query));
}));
adminRouter.get('/jobs/:id', run(async (req, res) => ok(res, await service.readJob(assertId(req.params.id), null, req.tryonAdmin.id))));
adminRouter.get('/jobs/:id/images/:kind', run(async (req, res) => service.sendImage(req, res, { adminId: req.tryonAdmin.id })));
adminRouter.get('/providers', run(async (req, res) => ok(res, await providers.list())));
adminRouter.put('/providers/:id', sameOrigin, run(async (req, res) => ok(res, await providers.save(Number(req.params.id), req.body || {}, req.tryonAdmin.id))));
adminRouter.post('/providers/:id/test', sameOrigin, run(async (req, res) => ok(res, await providers.connectionTest(Number(req.params.id), req.tryonAdmin.id))));

module.exports = { router, storeRouter, adminRouter, legacyRouter, legacyOutput, run };
