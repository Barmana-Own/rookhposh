const { pool, fixture, ensureRuntimeSchema, sharp } = require('./tryonFixture');
const express = require('express');
const path = require('node:path');
const fs = require('node:fs/promises');
const { createWorker } = require('../../src/tryon/worker');
const { ProviderFailure } = require('../../src/tryon/providerClient');

async function main() {
  await ensureRuntimeSchema();
  const f = await fixture({ credits: 100 });
  f.output = await sharp(f.output).webp({ quality: 90 }).toBuffer();
  const pending = await fixture({ credits: 10 });
  await pool.query("UPDATE products SET status='pending' WHERE id=?", [pending.productId]);
  let mode = 'success', calls = 0, hold = false, release = null;
  const worker = createWorker({ providerClient: { generate: async () => {
    calls++;
    if (hold) await new Promise((resolve) => { release = resolve; });
    else await new Promise((resolve) => setTimeout(resolve, 1800));
    if (mode === 'failure') throw new ProviderFailure('PROVIDER_NETWORK', { recoverable: true });
    if (mode === 'safety') throw new ProviderFailure('SAFETY_REJECTED');
    return { bytes: f.output, requestId: 'e2e-controlled-' + calls };
  } } });
  const app = express();
  app.use('/_fixture', express.json());
  app.get('/_fixture/state', (_req, res) => res.json({ calls, mode }));
  app.post('/_fixture/mode', (req, res) => {
    if (!['success', 'failure', 'safety'].includes(req.body.mode)) return res.sendStatus(400);
    mode = req.body.mode; release?.(); release = null; hold = false; res.json({ mode });
  });
  app.post('/_fixture/hold', (_req, res) => { hold = true; res.json({ hold }); });
  app.post('/_fixture/release', (_req, res) => { hold = false; release?.(); release = null; res.json({ hold }); });
  const backend = require('../../src/app');
  app.use((req, res, next) => /^\/(?:api|pro-api|health)(?:\/|$)/.test(req.path) ? backend(req, res, next) : next());
  const frontend = path.resolve(__dirname, '../../../frontend/dist');
  app.use(express.static(frontend));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(frontend, 'index.html')));
  const server = app.listen(Number(process.env.E2E_PORT || 18731), '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  worker.start();
  await fs.writeFile(process.env.E2E_METADATA, JSON.stringify({
    publicPath: '/stores/' + f.slug + '/products/' + f.productId,
    admin: { username: f.admin.username, password: f.password, token: f.token(f.admin) },
    seller: { token: f.token(pending.seller) }, customer: { token: f.token(f.customer) },
    pendingProduct: { id: pending.productId, title: 'QA garment ' + pending.slug.slice('qa-shop-'.length) },
    input: f.input.toString('base64'), output: f.output.toString('base64'), outputFormat: 'webp',
  }), { mode: 0o600 });
  console.log('E2E_READY');
  let closing = false;
  const close = async () => {
    if (closing) return; closing = true;
    release?.(); await worker.stop();
    await new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); });
    await pool.end();
  };
  process.once('SIGTERM', () => { void close(); });
  process.once('SIGINT', () => { void close(); });
}
main().catch((error) => { console.error(error.code || error.message); process.exitCode = 1; });
