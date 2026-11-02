const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const media = require('../src/services/publicMedia');
const { jobTiming } = require('../src/tryon/performance');

test('public variants preserve original bytes, dimensions and alpha without touching private storage', async () => {
  const bytes = await sharp({ create: { width: 400, height: 600, channels: 4, background: '#33415588' } }).png().toBuffer();
  const source = 'data:image/png;base64,' + bytes.toString('base64');
  const original = await media.render(source);
  assert.deepEqual(original.bytes, bytes); assert.equal(original.mime, 'image/png');
  const variants = await Promise.all(Array.from({ length: 20 }, () => media.render(source, { width: '160', webp: true })));
  assert.ok(variants.every(value => value === variants[0]));
  const metadata = await sharp(variants[0].bytes).metadata();
  assert.equal(metadata.format, 'webp'); assert.equal(metadata.width, 160); assert.equal(metadata.height, 240); assert.equal(metadata.hasAlpha, true);
  assert.equal(media.reference('/actual.jpg', '/media'), '/actual.jpg');
  assert.match(media.reference(source, '/media'), /^\/media\?v=[a-f0-9]{24}$/);
});

test('public image rendering rejects arbitrary URLs, corrupt files, stale versions and unbounded sizes', async () => {
  await assert.rejects(media.render('https://127.0.0.1/private'), error => error.status === 404);
  await assert.rejects(media.render('data:image/png;base64,AAAA'), error => error.status === 400);
  const bytes = await sharp({ create: { width: 12, height: 16, channels: 3, background: 'blue' } }).png().toBuffer();
  const source = 'data:image/png;base64,' + bytes.toString('base64');
  await assert.rejects(media.render(source, { width: 50000 }), error => error.status === 400);
  await assert.rejects(media.render(source, { expectedVersion: '0'.repeat(24) }), error => error.status === 404);
});

test('job diagnostics contain only an operation ID, bounded codes and numeric stage durations', async () => {
  let observed;
  const timing = jobTiming({ id: 'a'.repeat(32), image: 'PRIVATE_IMAGE', cookie: 'PRIVATE_COOKIE' }, event => { observed = event; });
  await timing.measure('provider_round_trip', async () => true);
  timing.failed({ code: 'PROVIDER_NETWORK', message: 'PRIVATE_API_KEY' }); timing.finish();
  assert.equal(observed.job_id, 'a'.repeat(32)); assert.equal(observed.error_code, 'PROVIDER_NETWORK');
  assert.ok(observed.stages_ms.provider_round_trip >= 0);
  assert.ok(!JSON.stringify(observed).includes('PRIVATE_'));
});
