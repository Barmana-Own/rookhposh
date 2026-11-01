const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { pool, fixture, appServer, browser, ensureRuntimeSchema } = require('../helpers/tryonFixture');
let app;
before(async () => { await ensureRuntimeSchema(); app = await appServer(); });
after(async () => { await app?.close(); await pool.end(); });

test('review requires a current details token, valid rejection reason and comment; replay has one decision/notification', async () => {
  const f = await fixture();
  await pool.query("UPDATE products SET status='pending' WHERE id=?", [f.productId]);
  const admin = browser(app.base, f.token(f.admin));
  assert.equal((await admin.json('/api/admin/products/' + f.productId + '/approve', { method: 'PATCH', body: {} })).status, 409);
  const detail = (await admin.json('/api/admin/products/' + f.productId + '/review')).data;
  const other = detail.reasons.find((row) => row.code === 'other');
  const body = { review_token: detail.review_token, revision: detail.revision, reason_id: other.id, comment: '' };
  assert.equal((await admin.json('/api/admin/products/' + f.productId + '/reject', { method: 'PATCH', body })).status, 400);
  body.comment = 'QA supplemental reason';
  assert.equal((await admin.json('/api/admin/products/' + f.productId + '/reject', { method: 'PATCH', body })).status, 200);
  assert.equal((await admin.json('/api/admin/products/' + f.productId + '/reject', { method: 'PATCH', body })).data.replayed, true);
  await pool.query('UPDATE product_rejection_reasons SET active=0 WHERE id=?',[other.id]);
  assert.equal((await admin.json('/api/admin/products/' + f.productId + '/reject', { method: 'PATCH', body })).data.replayed, true);
  await pool.query('UPDATE product_rejection_reasons SET active=1 WHERE id=?',[other.id]);
  const [[row]] = await pool.query('SELECT COUNT(*) AS total FROM product_review_decisions WHERE product_id=?', [f.productId]); assert.equal(row.total, 1);
  const [[product]] = await pool.query('SELECT status,reject_reason_id,reject_comment,reviewed_by,reviewed_at FROM products WHERE id=?', [f.productId]);
  assert.equal(product.status, 'rejected'); assert.equal(product.reject_comment, body.comment); assert.equal(product.reviewed_by, f.admin.id); assert.ok(product.reviewed_at);
  const seller = browser(app.base, f.token(f.seller)); assert.equal((await seller.json('/api/admin/products/' + f.productId + '/approve', { method: 'PATCH', body })).status, 403);
});

test('two administrators cannot commit contradictory decisions for one revision', async () => {
  const f = await fixture(); await pool.query("UPDATE products SET status='pending' WHERE id=?", [f.productId]);
  const a = browser(app.base, f.token(f.admin)), b = browser(app.base, f.token(f.otherAdmin));
  const left = (await a.json('/api/admin/products/' + f.productId + '/review')).data;
  const right = (await b.json('/api/admin/products/' + f.productId + '/review')).data;
  const responses = await Promise.all([
    a.json('/api/admin/products/' + f.productId + '/approve', { method: 'PATCH', body: { review_token: left.review_token, revision: left.revision } }),
    b.json('/api/admin/products/' + f.productId + '/reject', { method: 'PATCH', body: { review_token: right.review_token, revision: right.revision, reason_id: right.reasons[0].id } }),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  const [[count]] = await pool.query('SELECT COUNT(*) AS total FROM product_review_decisions WHERE product_id=?', [f.productId]); assert.equal(count.total, 1);
});

test('seller sees structured rejection history, can resubmit, and cannot read another store history',async()=>{
  const f=await fixture();await pool.query("UPDATE products SET status='pending' WHERE id=?",[f.productId]);
  const admin=browser(app.base,f.token(f.admin)),seller=browser(app.base,f.token(f.seller)),other=browser(app.base,f.token(f.otherSeller));
  const detail=(await admin.json('/api/admin/products/'+f.productId+'/review')).data;
  const reason=detail.reasons[0];
  const rejected=await admin.json('/api/admin/products/'+f.productId+'/reject',{method:'PATCH',body:{review_token:detail.review_token,revision:detail.revision,reason_id:reason.id,comment:'QA improve photo'}});
  assert.equal(rejected.status,200);
  const products=await seller.json('/api/seller/products');assert.equal(products.data.find(x=>x.id===f.productId).reject_reason_id,reason.id);
  const history=await seller.json('/api/seller/products/'+f.productId+'/review-history');assert.equal(history.data.items[0].comment,'QA improve photo');
  assert.equal((await other.json('/api/seller/products/'+f.productId+'/review-history')).status,404);
  const edited=await seller.json('/api/seller/products/'+f.productId,{method:'PATCH',body:{title:'QA corrected garment',description:'corrected',images:[f.dataUrl(f.cloth,'image/jpeg')],features:['QA'],price:0}});
  assert.equal(edited.status,200);assert.equal(edited.data.status,'pending');
  const next=(await admin.json('/api/admin/products/'+f.productId+'/review')).data;
  assert.equal((await admin.json('/api/admin/products/'+f.productId+'/approve',{method:'PATCH',body:{review_token:next.review_token,revision:next.revision}})).status,200);
  const completed=await seller.json('/api/seller/products/'+f.productId+'/review-history');assert.deepEqual(completed.data.items.map(x=>x.action),['approved','rejected']);
  const [[notifications]]=await pool.query("SELECT COUNT(*) AS total FROM notifications WHERE user_id=? AND type='product_review' AND related_id=?",[f.seller.id,f.productId]);assert.equal(notifications.total,2);
});

test('rejected edits retain the approved public product and full prior decision snapshot',async()=>{
  const f=await fixture();const seller=browser(app.base,f.token(f.seller)),admin=browser(app.base,f.token(f.admin));
  const [[before]]=await pool.query('SELECT title,images FROM products WHERE id=?',[f.productId]);
  await seller.json('/api/seller/products/'+f.productId,{method:'PATCH',body:{title:'QA proposed edit',images:[f.dataUrl(f.output)],description:'proposal'}});
  const detail=(await admin.json('/api/admin/products/'+f.productId+'/review')).data;
  const image=await admin.request(detail.product.images[0].url+'&download=1');assert.equal(image.status,200);assert.ok(Buffer.from(await image.arrayBuffer()).equals(f.output));
  assert.equal((await seller.request(detail.product.images[0].url)).status,403);
  await admin.json('/api/admin/products/'+f.productId+'/reject',{method:'PATCH',body:{review_token:detail.review_token,revision:detail.revision,reason_id:detail.reasons[0].id}});
  const [[after]]=await pool.query('SELECT title,images,status,review_status FROM products WHERE id=?',[f.productId]);
  assert.equal(after.status,'active');assert.equal(after.review_status,'rejected');assert.equal(after.title,before.title);assert.deepEqual(after.images,before.images);
  const [[decision]]=await pool.query('SELECT snapshot_json FROM product_review_decisions WHERE product_id=?',[f.productId]);assert.match(typeof decision.snapshot_json==='string'?decision.snapshot_json:JSON.stringify(decision.snapshot_json),/QA proposed edit/);
});

test('seller account deletion retains review evidence without restrictive product foreign keys',async()=>{
  const f=await fixture();await pool.query("UPDATE products SET status='pending' WHERE id=?",[f.productId]);
  const admin=browser(app.base,f.token(f.admin));
  const detail=(await admin.json('/api/admin/products/'+f.productId+'/review')).data;
  await admin.json('/api/admin/products/'+f.productId+'/reject',{method:'PATCH',body:{review_token:detail.review_token,revision:detail.revision,reason_id:detail.reasons[0].id}});
  const result=await require('../../src/repositories/dbStore').deleteUser(f.seller.id);assert.equal(result.deleted,true);
  const [[decision]]=await pool.query('SELECT product_id,reason_title,snapshot_json FROM product_review_decisions WHERE actor_id=?',[f.admin.id]);
  assert.equal(decision.product_id,null);assert.ok(decision.reason_title);assert.ok(decision.snapshot_json);
});
