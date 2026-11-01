import test from 'node:test';
import assert from 'node:assert/strict';
import { imageDownloadName, newerOutput, realProgress } from '../src/utils/tryon.js';

test('progress only reports verified milestones and never a fabricated AI percentage', () => {
  assert.equal(realProgress({status:'processing',progress:47}),null);
  assert.equal(realProgress({status:'saving',progress:100}),99);
  assert.equal(realProgress({status:'completed',progress:25}),100);
  assert.equal(realProgress({status:'validating',progress:25}),25);
  assert.equal(realProgress({status:'saving',progress:null}),null);
});
test('last successful output has a deterministic completion-time and ID order', () => {
  const a={id:'aaa',completed_at:'2026-11-01T12:00:00Z'},b={id:'bbb',completed_at:'2026-11-01T12:00:00Z'};
  assert.equal(newerOutput(a,b),b); assert.equal(newerOutput(b,a),b);
  assert.equal(newerOutput(a,{...a,id:'ccc',completed_at:'2026-11-01T11:00:00Z'}),a);
});
test('download extension follows actual bytes and rejects non-image payloads', () => {
  assert.equal(imageDownloadName('rookhposh-output.jpg','image/png'),'rookhposh-output.png');
  assert.equal(imageDownloadName('../../unsafe.webp','image/jpeg'),'unsafe.jpg');
  assert.throws(()=>imageDownloadName('output.png','text/html'));
});
