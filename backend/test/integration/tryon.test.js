const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { pool, sharp, fixture, appServer, browser, waitJob, resetProviders, ensureRuntimeSchema } = require('../helpers/tryonFixture');
const { createWorker } = require('../../src/tryon/worker');
const { ProviderFailure } = require('../../src/tryon/providerClient');
const store = require('../../src/tryon/jobStore');
let app, worker;
before(async () => {
  await ensureRuntimeSchema();
  const preserved=await fixture();
  const [[old]]=await pool.query('SELECT title,images FROM products WHERE id=?',[preserved.productId]);
  assert.equal((await require('../../src/database/rollbackTryon').rollbackTryon(pool,{execute:true})).executed,true);
  const [[after]]=await pool.query('SELECT title,images FROM products WHERE id=?',[preserved.productId]);
  assert.deepEqual(after,old);
  await ensureRuntimeSchema(); await ensureRuntimeSchema(); app=await appServer();
});
beforeEach(resetProviders);
after(async () => { worker?.stop(); await app?.close(); await pool.end(); });
const startPath = (f) => '/api/stores/' + f.slug + '/products/' + f.productId + '/pro/jobs';
const newWorker = (generate) => { worker?.stop(); worker = createWorker({ providerClient: { generate } }); worker.start(); return worker; };

test('migration is repeatable, public history has secure session isolation and downloads contain exact image bytes', async () => {
  const f = await fixture();
  let calls = 0;
  newWorker(async () => { calls += 1; return { bytes: f.output }; });
  const a = await browser(app.base, null, '198.18.0.10').ready(), b = await browser(app.base, null, '198.18.0.10').ready();
  const key = 'qa-identical-request-0001';
  const [first, repeated] = await Promise.all([a.json(startPath(f), { method: 'POST', body: f.payload(key) }), a.json(startPath(f), { method: 'POST', body: f.payload(key) })]);
  assert.equal(first.status, 202, JSON.stringify(first)); assert.equal(repeated.status, 202, JSON.stringify(repeated));
  assert.equal(first.data.id, repeated.data.id);
  const job = await waitJob(a, first.data.id);
  assert.equal(job.status, 'completed', JSON.stringify(job)); assert.equal(job.progress, 100); assert.equal(calls, 1);
  assert.equal((await a.json('/api/tryon/history')).data.latest.id, job.id);
  assert.equal((await b.json('/api/tryon/history')).data.latest, null);
  for (const kind of ['input', 'product', 'output']) {
    assert.equal((await b.request('/api/tryon/jobs/' + job.id + '/images/' + kind)).status, 404);
  }
  const payer = browser(app.base, f.token(f.seller));
  assert.equal((await payer.request('/api/tryon/jobs/' + job.id + '/images/output')).status, 404);
  const file = await a.request('/api/tryon/jobs/' + job.id + '/images/output?download=1');
  assert.equal(file.status, 200); assert.match(file.headers.get('content-disposition'), /^attachment; filename="rookhposh-tryon-.*\.png"$/);
  assert.equal(file.headers.get('content-type'), 'image/png'); assert.match(file.headers.get('cache-control'), /no-store/);
  const bytes = Buffer.from(await file.arrayBuffer()); assert.ok(bytes.equals(f.output));
  assert.equal((await sharp(bytes).metadata()).width, 72);
  const [[count]] = await pool.query('SELECT COUNT(*) AS total,MIN(amount) AS amount FROM pro_usages WHERE tryon_job_id=?', [job.id]);
  assert.equal(count.total, 1); assert.equal(Number(count.amount), 0);
});

test('real queued stages are indeterminate during AI and the last store token cannot be overspent', async () => {
  const f = await fixture({ credits: 1 });
  let finish, calls = 0;
  const gate = new Promise((resolve) => { finish = resolve; });
  newWorker(async () => { calls += 1; await gate; return { bytes: f.output }; });
  const a = await browser(app.base).ready(), b = await browser(app.base).ready();
  try {
    const attempts = await Promise.all([a.json(startPath(f), { method: 'POST', body: f.payload() }), b.json(startPath(f), { method: 'POST', body: f.payload() })]);
    assert.deepEqual(attempts.map((x) => x.status).sort(), [202, 402]);
    const accepted = attempts.find((x) => x.status === 202);
    const owner = attempts[0].status === 202 ? a : b;
    const running = await waitJob(owner, accepted.data.id, ['processing']);
    assert.equal(running.progress, null); assert.equal(running.indeterminate, true);
    finish();
    assert.equal((await waitJob(owner, accepted.data.id)).status, 'completed'); assert.equal(calls, 1);
  } finally { finish(); }
});

test('account ownership ignores body-assigned identities and admin reads are fresh-authorized and audited', async () => {
  const f = await fixture();
  newWorker(async () => ({ bytes: f.output }));
  const a = await browser(app.base, f.token(f.customer)).ready(), b = await browser(app.base, f.token(f.otherCustomer)).ready();
  const created = await a.json(startPath(f), { method: 'POST', body: { ...f.payload(), user_id: f.otherCustomer.id, amount: 900000, owner_hash: 'f'.repeat(64) } });
  assert.equal(created.status, 202, JSON.stringify(created));
  const job = await waitJob(a, created.data.id);
  assert.equal((await b.json('/api/tryon/jobs/' + job.id)).status, 404);
  const [[row]] = await pool.query('SELECT user_id FROM virtual_tryon_jobs WHERE id=?', [job.id]); assert.equal(Number(row.user_id), f.customer.id);
  const admin = browser(app.base, f.token(f.admin));
  const detail = await admin.json('/api/admin/tryon/jobs/' + job.id);
  assert.equal(detail.status, 200); assert.equal(detail.data.user_id, f.customer.id);
  assert.equal(detail.data.device, null); assert.equal(detail.data.network, null);
  const [[events]] = await pool.query("SELECT COUNT(*) AS total FROM virtual_tryon_audit WHERE actor_id=? AND target_id=? AND action='job.details_viewed'", [f.admin.id, job.id]);
  assert.equal(events.total, 1);
  await pool.query("UPDATE users SET status='blocked' WHERE id=?", [f.admin.id]);
  assert.equal((await admin.json('/api/admin/tryon/jobs/' + job.id)).status, 403);
});

test('sequential failover reaches second then third provider without charging more than one store token', async () => {
  const f = await fixture(); const order = [];
  for (const id of [2, 3]) await pool.query("INSERT INTO virtual_tryon_providers(id,name,adapter,endpoint,enabled,priority) VALUES(?,?,'multipart',?,1,?) ON DUPLICATE KEY UPDATE enabled=1,cooldown_until=NULL",
    [id, 'QA provider ' + id, 'https://provider' + id + '.example/try-on', id]);
  newWorker(async (provider) => { order.push(provider.id); if (provider.id < 3) throw new ProviderFailure('PROVIDER_HTTP_503', { recoverable: true }); return { bytes: f.output }; });
  const a = await browser(app.base).ready();
  const created = await a.json(startPath(f), { method: 'POST', body: f.payload() });
  const job = await waitJob(a, created.data.id);
  assert.equal(job.status, 'completed', JSON.stringify(job)); assert.deepEqual(order, [1, 2, 3]);
  const [[row]] = await pool.query('SELECT COUNT(*) AS total FROM pro_usages WHERE tryon_job_id=?', [job.id]); assert.equal(row.total, 1);
});

test('all-provider failures release reservations, while uncertain timeouts and safety refusals never fail over', async () => {
  const f = await fixture();
  const a = await browser(app.base).ready();
  let calls = 0;
  newWorker(async () => { calls++; throw new ProviderFailure('PROVIDER_NETWORK', { recoverable: true }); });
  const request = await a.json(startPath(f), { method: 'POST', body: f.payload() });
  let job = await waitJob(a, request.data.id);
  assert.equal(job.status, 'failed'); assert.equal(job.retryable, true);
  const [[reservation]] = await pool.query('SELECT credit_reserved FROM virtual_tryon_jobs WHERE id=?', [job.id]); assert.equal(reservation.credit_reserved, 0);
  newWorker(async () => { calls++; throw new ProviderFailure('PROVIDER_TIMEOUT', { recoverable: false, uncertain: true }); });
  assert.equal((await a.json('/api/tryon/jobs/' + job.id + '/retry', { method: 'POST', body: { request_key: 'qa-retry-timeout-00001' } })).status, 202);
  job = await waitJob(a, job.id); assert.equal(job.status, 'timed_out'); assert.equal(job.retryable, false); assert.equal(job.needs_reconciliation, true);
  assert.equal((await a.json('/api/tryon/jobs/' + job.id + '/retry', { method: 'POST', body: { request_key: 'qa-retry-timeout-00002' } })).status, 409);
  const b = await browser(app.base).ready(); const order = [];
  await resetProviders();
  newWorker(async (provider) => { order.push(provider.id); throw new ProviderFailure('SAFETY_REJECTED'); });
  const rejected = await b.json(startPath(f), { method: 'POST', body: f.payload() });
  const safety = await waitJob(b, rejected.data.id); assert.equal(safety.status, 'failed'); assert.equal(safety.retryable, false); assert.deepEqual(order, [1]);
  assert.ok(calls >= 2);
});

test('legacy anonymous records are preserved without assigning their images to a matching IP visitor', async () => {
  const f = await fixture();
  const [old] = await pool.query("INSERT INTO pro_usages(product_id,amount,status,description,input_image,product_image,output_image,ip_address) VALUES(?,0,'success','QA old',?,?,?,'127.0.0.1')",
    [f.productId, f.dataUrl(f.input), f.dataUrl(f.cloth, 'image/jpeg'), f.dataUrl(f.output)]);
  await ensureRuntimeSchema();
  const a = await browser(app.base, null, '127.0.0.1').ready();
  assert.equal((await a.json('/api/stores/' + f.slug + '/products/' + f.productId + '/pro/history')).data.length, 0);
  const [[legacy]] = await pool.query('SELECT id,owner_kind FROM virtual_tryon_jobs WHERE legacy_usage_id=?', [old.insertId]); assert.equal(legacy.owner_kind, 'legacy');
  assert.equal((await a.json('/api/tryon/jobs/' + legacy.id)).status, 404);
  const admin = browser(app.base, f.token(f.admin)); const detail = await admin.json('/api/admin/tryon/jobs/' + legacy.id); assert.equal(detail.status, 200);
  assert.equal(detail.data.user_id, null); assert.ok(detail.data.images.output);
  const [[preserved]] = await pool.query('SELECT output_image FROM pro_usages WHERE id=?', [old.insertId]); assert.equal(preserved.output_image, f.dataUrl(f.output));
});

test('private output is recoverable after a saving interruption without another provider call', async () => {
  const f = await fixture(); let calls = 0;
  newWorker(async () => { calls++; return { bytes: f.output }; });
  const a = await browser(app.base).ready();
  const created = await a.json(startPath(f), { method: 'POST', body: f.payload() });
  const done = await waitJob(a, created.data.id); assert.equal(done.status, 'completed');
  assert.equal((await store.finalize({ ...(await store.raw(done.id)), lock_token: '0'.repeat(32) })).id, done.id);
  assert.equal(calls, 1);
});

test('legacy aliases cannot bypass ownership, output validation or store accounting', async () => {
  const f=await fixture(); let calls=0;
  newWorker(async()=>{calls++;return {bytes:f.output};});
  const a=await browser(app.base).ready(),b=await browser(app.base).ready();
  const uploaded=await a.json('/api/stores/'+f.slug+'/products/'+f.productId+'/pro/upload',{method:'POST',body:{image:f.dataUrl(f.input),user_id:f.otherCustomer.id}});
  assert.equal(uploaded.status,200);
  const use='/api/stores/'+f.slug+'/products/'+f.productId+'/pro/use';
  assert.equal((await b.json(use,{method:'POST',body:{upload_id:uploaded.data.id,output_image:f.dataUrl(f.output)}})).status,409);
  for(const endpoint of ['try-on','m1','m2']) {
    const form=new FormData(); form.append('person',new Blob([f.input],{type:'image/png'}),'person.png'); form.append('cloth',new Blob([f.cloth],{type:'image/jpeg'}),'cloth.jpg');
    assert.equal((await b.request('/pro-api/'+endpoint,{method:'POST',body:form})).status,409);
  }
  assert.equal(calls,0);
  assert.equal((await b.request('/api/pro-output?url='+encodeURIComponent('http://91.107.232.169:6000/private.png'))).status,404);
  const form=new FormData(); form.append('person',new Blob([f.input],{type:'image/png'}),'person.png');form.append('cloth',new Blob([f.cloth],{type:'image/jpeg'}),'cloth.jpg');
  const generation=await a.request('/pro-api/try-on',{method:'POST',body:form});
  assert.equal(generation.status,200); assert.ok(Buffer.from(await generation.arrayBuffer()).equals(f.output));
  const first=await a.json(use,{method:'POST',body:{upload_id:uploaded.data.id,output_image:'https://attacker.example/fake.png'}});
  const repeat=await a.json(use,{method:'POST',body:{upload_id:uploaded.data.id}});
  assert.equal(first.status,200);assert.equal(repeat.status,200);assert.equal(first.data.id,repeat.data.id);assert.equal(calls,1);
  const [[count]]=await pool.query('SELECT COUNT(*) AS total FROM pro_usages WHERE tryon_job_id=?',[first.data.job_id]);assert.equal(count.total,1);
});

test('an interrupted save recovers the durable output without regenerating or charging twice', async()=>{
  const f=await fixture(); const a=await browser(app.base).ready();
  await worker?.stop();
  const created=await a.json(startPath(f),{method:'POST',body:f.payload()}); assert.equal(created.status,202);
  const job=await store.claim();assert.equal(job.id,created.data.id);
  await store.transition(job,'processing',2,null);
  const [[provider]]=await pool.query('SELECT * FROM virtual_tryon_providers WHERE id=1');
  const attempt=await store.attemptStarted(job,provider);
  const imageStore=require('../../src/tryon/images');
  await imageStore.stage(job.id,f.output,provider,'qa-recovered');
  await pool.query('UPDATE virtual_tryon_jobs SET lease_until=DATE_SUB(NOW(),INTERVAL 2 MINUTE) WHERE id=?',[job.id]);
  let calls=0;newWorker(async()=>{calls++;throw new Error('must not generate');});
  const completed=await waitJob(a,job.id);assert.equal(completed.status,'completed');assert.equal(calls,0);assert.equal(completed.service_name,provider.name);
  const [[row]]=await pool.query('SELECT state,request_id FROM virtual_tryon_attempts WHERE id=?',[attempt]);assert.equal(row.state,'succeeded');assert.equal(row.request_id,'qa-recovered');
  const [[usage]]=await pool.query('SELECT COUNT(*) AS total FROM pro_usages WHERE tryon_job_id=?',[job.id]);assert.equal(usage.total,1);
});

test('provider keys remain encrypted and never return to browser DTOs; device collection expires',async()=>{
  const f=await fixture(); const admin=browser(app.base,f.token(f.admin));
  const secret='qa-private-key-'+require('node:crypto').randomBytes(20).toString('hex');
  const saved=await admin.json('/api/admin/tryon/providers/2',{method:'PUT',body:{name:'QA secondary',adapter:'multipart',endpoint:'https://provider.example/try-on',api_key:secret,enabled:false,priority:2,timeout_seconds:10,retry_limit:0,options:{}}});
  assert.equal(saved.status,200);assert.equal(saved.data.has_api_key,true);assert.ok(!JSON.stringify(saved).includes(secret));
  const listed=await admin.json('/api/admin/tryon/providers');assert.ok(!JSON.stringify(listed).includes(secret));
  const [[privateRow]]=await pool.query('SELECT secret_ciphertext FROM virtual_tryon_providers WHERE id=2');assert.ok(privateRow.secret_ciphertext&&!privateRow.secret_ciphertext.includes(secret));
  const a=await browser(app.base,null,'127.0.0.1').ready();newWorker(async()=>({bytes:f.output}));
  const made=await a.json(startPath(f),{method:'POST',body:{...f.payload(),diagnostics_consent:true,device:{screen_width:390,screen_height:844,viewport_width:390,viewport_height:760,pixel_ratio:3,language:'fa-IR'},ip:'1.1.1.1'}});
  const job=await waitJob(a,made.data.id);
  const detail=await admin.json('/api/admin/tryon/jobs/'+job.id);assert.equal(detail.data.device.screen_width,390);assert.equal(detail.data.network.ip,'127.0.0.1');
  assert.ok(!(await a.json('/api/tryon/jobs/'+job.id)).data.network);
  await pool.query('UPDATE virtual_tryon_jobs SET diagnostics_expires_at=DATE_SUB(NOW(),INTERVAL 1 DAY) WHERE id=?',[job.id]);
  await store.recover();
  const expired=await admin.json('/api/admin/tryon/jobs/'+job.id);assert.equal(expired.data.device,null);assert.equal(expired.data.network,null);
  assert.equal((await a.json('/api/tryon/jobs/'+job.id,{method:'DELETE'})).status,200);
  assert.equal((await a.request('/api/tryon/jobs/'+job.id+'/images/output')).status,404);
  assert.equal((await admin.request('/api/admin/tryon/jobs/'+job.id+'/images/output')).status,404);
});

test('a saved output stays private until credit finalization succeeds, then retry reuses that output',async()=>{
  const f=await fixture(); const a=await browser(app.base).ready(); await worker?.stop();
  let calls=0,failOnce=true;
  worker=createWorker({providerClient:{generate:async()=>{calls++;return {bytes:f.output};}},
    repository:{...store,finalize:async(job)=>{if(failOnce){failOnce=false;throw new Error('QA finalization interruption');}return store.finalize(job);}}});
  worker.start();
  const made=await a.json(startPath(f),{method:'POST',body:f.payload()});
  const failed=await waitJob(a,made.data.id);assert.equal(failed.status,'failed');assert.equal(failed.error_code,'SAVE_FAILED');
  assert.equal(failed.images.output,undefined);
  assert.equal((await a.request('/api/tryon/jobs/'+failed.id+'/images/output?download=1')).status,409);
  const [[before]]=await pool.query('SELECT COUNT(*) AS total FROM pro_usages WHERE tryon_job_id=?',[failed.id]);assert.equal(before.total,0);
  assert.equal((await a.json('/api/tryon/jobs/'+failed.id+'/retry',{method:'POST',body:{request_key:'qa-save-retry-00000001'}})).status,202);
  const done=await waitJob(a,failed.id);assert.equal(done.status,'completed');assert.ok(done.images.output);assert.equal(calls,1);
});

test('deleting an uncertain timeout does not permit a second generation of identical inputs',async()=>{
  const f=await fixture();const a=await browser(app.base).ready();let calls=0;
  newWorker(async()=>{calls++;throw new ProviderFailure('PROVIDER_TIMEOUT',{uncertain:true});});
  const made=await a.json(startPath(f),{method:'POST',body:f.payload()});
  const timed=await waitJob(a,made.data.id);assert.equal(timed.needs_reconciliation,true);
  assert.equal((await a.json('/api/tryon/jobs/'+timed.id,{method:'DELETE'})).status,200);
  assert.equal((await a.json(startPath(f),{method:'POST',body:f.payload()})).status,409);
  assert.equal(calls,1);
});

test('old account history exposes secure lazy files and both latest and previous downloads remain valid',async()=>{
  const f=await fixture();
  for(let index=0;index<2;index++) await pool.query("INSERT INTO pro_usages(user_id,product_id,amount,status,description,input_image,product_image,output_image,created_at) VALUES(?,?,0,'success','QA legacy owned',?,?,?,DATE_SUB(NOW(),INTERVAL ? DAY))",
    [f.customer.id,f.productId,f.dataUrl(f.input),f.dataUrl(f.cloth,'image/jpeg'),f.dataUrl(f.output),index+1]);
  await ensureRuntimeSchema();
  const a=await browser(app.base,f.token(f.customer)).ready(),b=await browser(app.base,f.token(f.otherCustomer)).ready();
  const history=(await a.json('/api/tryon/history')).data;
  assert.ok(history.latest.images.output);assert.equal(history.items.length,1);assert.ok(history.items[0].images.output);
  for(const job of [history.latest,history.items[0]]) {
    assert.equal((await b.request(job.images.output.url+'?download=1')).status,404);
    const download=await a.request(job.images.output.url+'?download=1');assert.equal(download.status,200);assert.ok(Buffer.from(await download.arrayBuffer()).equals(f.output));
  }
  await assert.rejects(require('../../src/database/rollbackTryon').rollbackTryon(pool,{execute:true}),/Rollback refused/);
});

test('account erasure removes private files and diagnostics while preserving the store consumption ledger',async()=>{
  const f=await fixture();newWorker(async()=>({bytes:f.output}));
  const a=await browser(app.base,f.token(f.customer)).ready();
  const made=await a.json(startPath(f),{method:'POST',body:f.payload()});assert.equal(made.status,202);
  const done=await waitJob(a,made.data.id);assert.equal(done.status,'completed');
  const entitlements=require('../../src/repositories/entitlementStore');
  const before=await entitlements.getSummary(f.seller.id);
  assert.equal((await require('../../src/repositories/dbStore').deleteUser(f.customer.id)).deleted,true);
  await require('../../src/tryon/cleanup').purgeDeleted();
  assert.equal((await store.assets(done.id)).length,0);
  const [[job]]=await pool.query('SELECT deleted_at,images_purged_at,device_json,network_ciphertext FROM virtual_tryon_jobs WHERE id=?',[done.id]);
  assert.ok(job.deleted_at);assert.ok(job.images_purged_at);assert.equal(job.device_json,null);assert.equal(job.network_ciphertext,null);
  const [[usage]]=await pool.query('SELECT user_id,quota_user_id FROM pro_usages WHERE tryon_job_id=?',[done.id]);assert.equal(usage.user_id,null);assert.equal(usage.quota_user_id,f.seller.id);
  assert.equal((await entitlements.getSummary(f.seller.id)).tokens_remaining,before.tokens_remaining);
  assert.equal((await a.request(done.images.output.url)).status,403);
});

test('second-service success stops the chain, and failure of all three services never consumes a store token',async()=>{
  for(const target of [2,null]) {
    await resetProviders();
    const f=await fixture();const a=await browser(app.base).ready();const order=[];
    for(const id of [2,3]) await pool.query("INSERT INTO virtual_tryon_providers(id,name,adapter,endpoint,enabled,priority) VALUES(?,?,'multipart',?,1,?) ON DUPLICATE KEY UPDATE enabled=1,cooldown_until=NULL",[id,'QA provider '+id,'https://provider'+id+'.example/try-on',id]);
    newWorker(async(provider)=>{order.push(provider.id);if(provider.id!==target)throw new ProviderFailure('PROVIDER_HTTP_503',{recoverable:true});return {bytes:f.output};});
    const made=await a.json(startPath(f),{method:'POST',body:f.payload()});assert.equal(made.status,202);
    const done=await waitJob(a,made.data.id);
    assert.deepEqual(order,target===2?[1,2]:[1,2,3]);assert.equal(done.status,target===2?'completed':'failed');
    const [[usage]]=await pool.query('SELECT COUNT(*) AS total FROM pro_usages WHERE tryon_job_id=?',[done.id]);assert.equal(usage.total,target===2?1:0);
  }
});

test('Retry-After delays retries without inventing progress or consuming duplicate credit',async()=>{
  const f=await fixture();const a=await browser(app.base).ready();let calls=0;
  newWorker(async()=>{if(++calls===1)throw new ProviderFailure('RATE_LIMITED',{recoverable:true,retryAfter:2});return {bytes:f.output};});
  const made=await a.json(startPath(f),{method:'POST',body:f.payload()});const failed=await waitJob(a,made.data.id);
  assert.equal(failed.status,'failed');assert.equal(failed.retryable,false);assert.ok(failed.retry_after);
  assert.equal((await a.json('/api/tryon/jobs/'+failed.id+'/retry',{method:'POST',body:{request_key:'qa-retry-after-000001'}})).status,429);
  await new Promise(resolve=>setTimeout(resolve,2100));
  assert.equal((await a.json('/api/tryon/jobs/'+failed.id+'/retry',{method:'POST',body:{request_key:'qa-retry-after-000002'}})).status,202);
  assert.equal((await waitJob(a,failed.id)).status,'completed');
  const [[usage]]=await pool.query('SELECT COUNT(*) AS total FROM pro_usages WHERE tryon_job_id=?',[failed.id]);assert.equal(usage.total,1);
});

test('malformed compressed bodies are rejected before parsing and leave the application healthy',async()=>{
  const f=await fixture(); const compressed=Buffer.concat([require('node:zlib').gzipSync(Buffer.from('{}')),Buffer.from('trailing-bytes')]);
  for(const [path,type] of [[startPath(f),'application/json'],['/pro-api/try-on','multipart/form-data; boundary=qa'],['/api/payments/omidpay/callback/'+'c'.repeat(32),'application/x-www-form-urlencoded']]) {
    const response=await fetch(app.base+path,{method:'POST',headers:{'content-type':type,'content-encoding':'gzip'},body:compressed});
    assert.equal(response.status,415); await response.arrayBuffer();
    assert.equal((await fetch(app.base+'/health')).status,200);
  }
});

test('an unreadable alternate service key is cooled down and alerted without interrupting the primary',async()=>{
  const f=await fixture();const a=await browser(app.base).ready();const calls=[];
  await pool.query("INSERT INTO virtual_tryon_providers(id,name,adapter,endpoint,enabled,priority,secret_ciphertext) VALUES(2,'QA bad key','multipart','https://provider.example/try-on',1,2,'unreadable') ON DUPLICATE KEY UPDATE enabled=1,secret_ciphertext='unreadable',cooldown_until=NULL,last_error_code=NULL");
  newWorker(async(provider)=>{calls.push(provider.id);return {bytes:f.output};});
  const made=await a.json(startPath(f),{method:'POST',body:f.payload()});assert.equal((await waitJob(a,made.data.id)).status,'completed');assert.deepEqual(calls,[1]);
  const [[provider]]=await pool.query('SELECT last_error_code,cooldown_until FROM virtual_tryon_providers WHERE id=2');assert.equal(provider.last_error_code,'PROVIDER_SECRET');assert.ok(provider.cooldown_until);
  const [[notice]]=await pool.query("SELECT COUNT(*) AS total FROM notifications WHERE user_id=? AND type='tryon_provider'",[f.admin.id]);assert.equal(notice.total,1);
});

test('a storage-stage database interruption retries the durable result without another AI request',async()=>{
  const f=await fixture();const a=await browser(app.base).ready();await worker?.stop();let calls=0,interrupt=true;
  worker=createWorker({providerClient:{generate:async()=>{calls++;return {bytes:f.output};}},
    repository:{...store,transition:async(job,status,stage,progress)=>{if(status==='saving'&&stage===3&&interrupt){interrupt=false;throw new Error('QA saving transition interruption');}return store.transition(job,status,stage,progress);}}});
  worker.start();
  const made=await a.json(startPath(f),{method:'POST',body:f.payload()});const failed=await waitJob(a,made.data.id);
  assert.equal(failed.error_code,'SAVE_FAILED');assert.equal(failed.retryable,true);assert.equal(failed.images.output,undefined);
  assert.equal((await a.json('/api/tryon/jobs/'+failed.id+'/retry',{method:'POST',body:{request_key:'qa-stage-retry-000001'}})).status,202);
  const done=await waitJob(a,failed.id);assert.equal(done.status,'completed');assert.equal(calls,1);
});

test('cross-origin writes never create or replace the private visitor cookie',async()=>{
  const f=await fixture();
  for(const path of [startPath(f),'/api/stores/'+f.slug+'/products/'+f.productId+'/pro/upload','/api/tryon/jobs/'+'a'.repeat(32)+'/retry','/pro-api/try-on']) {
    const response=await fetch(app.base+path,{method:'POST',headers:{origin:'https://untrusted.example','content-type':'application/json'},body:'{}'});
    assert.equal(response.status,403);assert.equal(response.headers.get('set-cookie'),null);await response.arrayBuffer();
  }
});

test('admin provider validation rejects unsafe endpoints with a safe client error and no configuration write',async()=>{
  const f=await fixture();const admin=browser(app.base,f.token(f.admin));
  const input={name:'QA invalid destination',adapter:'multipart',model:'',enabled:false,priority:3,timeout_seconds:10,retry_limit:0,options:{},endpoint:'https://127.0.0.1/metadata'};
  const result=await admin.json('/api/admin/tryon/providers/3',{method:'PUT',body:input});assert.equal(result.status,400);
  const [[row]]=await pool.query('SELECT name FROM virtual_tryon_providers WHERE id=3');assert.notEqual(row?.name,input.name);
});
