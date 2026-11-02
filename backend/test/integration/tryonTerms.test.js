const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { pool, fixture, appServer, browser, waitJob, resetProviders, ensureRuntimeSchema } = require('../helpers/tryonFixture');
const { createWorker } = require('../../src/tryon/worker');
const { VERSION } = require('../../src/tryon/terms');
const { rollbackTryonTerms, ensureTryonTerms } = require('../../src/database/tryonTermsSchema');
let app, worker;
before(async () => {
  await ensureRuntimeSchema(); await resetProviders();
  const f = await fixture();
  worker = createWorker({ providerClient: { generate: async () => ({ bytes: f.output }) } });
  app = await appServer(); worker.start();
});
after(async () => { await worker?.stop(); await app?.close(); await pool.end(); });
const startPath = (f) => '/api/stores/' + f.slug + '/products/' + f.productId + '/pro/jobs';
const payload = (f) => { const value = f.payload(); delete value.processing_consent; return value; };
const accept = (client, extra = {}) => client.json('/api/tryon/terms', { method: 'POST', body: { version: VERSION, accepted: true, ...extra } });

test('first-use terms are required before guest processing and rejection has no job, files or debit', async () => {
  const f = await fixture(), guest = await browser(app.base).ready();
  const terms = await guest.json('/api/tryon/terms');
  assert.equal(terms.status, 200); assert.equal(terms.data.required, true);
  assert.equal(terms.data.version, VERSION); assert.ok(terms.data.paragraphs.length);
  const rejected = await guest.json(startPath(f), { method: 'POST', body: payload(f) });
  assert.equal(rejected.status, 428);
  const [[row]] = await pool.query('SELECT COUNT(*) AS total FROM virtual_tryon_jobs WHERE product_id=?', [f.productId]);
  assert.equal(row.total, 0); assert.equal((await guest.json('/api/tryon/history')).data.active_job, null);
});

test('acceptance is idempotent, survives later requests and authorizes one private job without diagnostics', async () => {
  const f = await fixture(), guest = await browser(app.base).ready();
  assert.equal((await accept(guest)).data.required, false);
  const [[receipt]] = await pool.query('SELECT owner_hash,accepted_at FROM virtual_tryon_terms_acceptances ORDER BY accepted_at DESC LIMIT 1');
  assert.deepEqual(await Promise.all([accept(guest), accept(guest)]).then(rows => rows.map(r => r.status)), [200, 200]);
  const [[unchanged]] = await pool.query('SELECT accepted_at FROM virtual_tryon_terms_acceptances WHERE owner_hash=?', [receipt.owner_hash]);
  assert.deepEqual(unchanged.accepted_at, receipt.accepted_at);
  assert.equal((await guest.json('/api/tryon/terms')).data.required, false);
  const input = payload(f);
  const jobs = await Promise.all([guest.json(startPath(f), { method: 'POST', body: input }), guest.json(startPath(f), { method: 'POST', body: input })]);
  assert.deepEqual(jobs.map(r => r.status), [202, 202]); assert.equal(jobs[0].data.id, jobs[1].data.id);
  const job = await waitJob(guest, jobs[0].data.id); assert.equal(job.status, 'completed');
  const [[row]] = await pool.query('SELECT privacy_version,processing_consent_at,diagnostics_consent,network_ciphertext,device_json FROM virtual_tryon_jobs WHERE id=?', [job.id]);
  assert.equal(row.privacy_version, VERSION); assert.deepEqual(row.processing_consent_at, receipt.accepted_at);
  assert.equal(row.diagnostics_consent, 0); assert.equal(row.network_ciphertext, null); assert.equal(row.device_json, null);
  const file = await guest.request('/api/tryon/jobs/' + job.id + '/images/output?download=1');
  assert.equal(file.status, 200); assert.match(file.headers.get('content-disposition'), /^attachment/);
});

test('same-IP visitors cannot reuse acceptance, forged owners or cross-origin acceptance', async () => {
  const a = await browser(app.base, null, '198.18.5.10').ready(), b = await browser(app.base, null, '198.18.5.10').ready();
  await accept(a);
  assert.equal((await b.json('/api/tryon/terms')).data.required, true);
  assert.equal((await b.json('/api/tryon/terms', { method: 'POST', body: { version: VERSION, accepted: true }, headers: { origin: 'https://untrusted.example' } })).status, 403);
  assert.equal((await b.json('/api/tryon/terms', { method: 'POST', body: { version: VERSION, accepted: true }, headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  for (const input of [{ accepted: false }, { version: 'old' }, { accepted: 'true' }]) assert.equal((await accept(b, input)).status, 400);
  assert.equal((await b.json('/api/tryon/terms')).data.required, true);
  await accept(b, { owner_hash: 'f'.repeat(64), user_id: 1 });
  const [[forged]] = await pool.query('SELECT COUNT(*) AS total FROM virtual_tryon_terms_acceptances WHERE owner_hash=?', ['f'.repeat(64)]);
  assert.equal(forged.total, 0);
});

test('registered accounts use registration policy without inventing an explicit consent timestamp', async () => {
  const f = await fixture(), account = await browser(app.base, f.token(f.customer)).ready();
  assert.equal((await account.json('/api/tryon/terms')).data.required, false);
  const started = await account.json(startPath(f), { method: 'POST', body: payload(f) }); assert.equal(started.status, 202);
  const job = await waitJob(account, started.data.id); assert.equal(job.status, 'completed');
  const [[row]] = await pool.query('SELECT user_id,owner_hash,processing_consent_at,privacy_version FROM virtual_tryon_jobs WHERE id=?', [job.id]);
  assert.equal(Number(row.user_id), f.customer.id); assert.equal(row.processing_consent_at, null);
  assert.equal(row.privacy_version, 'registration-policy-2026-11-01');
  const [[count]] = await pool.query('SELECT COUNT(*) AS total FROM virtual_tryon_terms_acceptances WHERE owner_hash=?', [row.owner_hash]); assert.equal(count.total, 0);
  const guest = browser(app.base, null); assert.equal((await guest.json('/api/tryon/terms')).data.required, true);
  await pool.query("UPDATE users SET status='blocked' WHERE id=?", [f.customer.id]);
  assert.equal((await account.json('/api/tryon/terms')).status, 403);
});

test('expiry and session revocation require a fresh first-use agreement; old explicit clients still work', async () => {
  const f = await fixture(), guest = await browser(app.base).ready(); await accept(guest);
  const started = await guest.json(startPath(f), { method: 'POST', body: payload(f) }); await waitJob(guest, started.data.id);
  const [[job]] = await pool.query('SELECT owner_hash FROM virtual_tryon_jobs WHERE id=?', [started.data.id]);
  await pool.query('UPDATE virtual_tryon_terms_acceptances SET expires_at=DATE_SUB(NOW(),INTERVAL 1 DAY) WHERE owner_hash=?', [job.owner_hash]);
  assert.equal((await guest.json('/api/tryon/terms')).data.required, true);
  assert.equal((await guest.json(startPath(f), { method: 'POST', body: payload(f) })).status, 428);
  await accept(guest); assert.equal((await guest.json('/api/tryon/terms')).data.required, false);
  assert.equal((await guest.json('/api/tryon/session/revoke', { method: 'POST', body: {} })).status, 200);
  assert.equal((await guest.json('/api/tryon/terms')).data.required, true);
  const legacy = await guest.json(startPath(f), { method: 'POST', body: f.payload() }); assert.equal(legacy.status, 202);
  await waitJob(guest, legacy.data.id);
});

test('terms migration repeats without modifying receipts and rollback preserves live acceptances', async () => {
  const before = (await pool.query('SELECT * FROM virtual_tryon_terms_acceptances ORDER BY owner_hash'))[0];
  await ensureTryonTerms(pool); await ensureTryonTerms(pool);
  assert.deepEqual((await pool.query('SELECT * FROM virtual_tryon_terms_acceptances ORDER BY owner_hash'))[0], before);
  await assert.rejects(rollbackTryonTerms(pool, { execute: true }), /retain terms acceptance/);
});
