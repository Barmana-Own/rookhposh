import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compressImageDataUrl,
  getDataUrlByteLength,
  getImageCompressionDimensions,
  normalizeImageCompressionOptions,
} from '../src/utils/file.js';

test('keeps image proportions while applying the maximum side', () => {
  assert.deepEqual(getImageCompressionDimensions(4000, 3000, 1600), { width: 1600, height: 1200 });
  assert.deepEqual(getImageCompressionDimensions(800, 1200, 1600), { width: 800, height: 1200 });
});

test('normalizes compression limits and quality values', () => {
  assert.deepEqual(normalizeImageCompressionOptions({
    maxSide: 1200,
    maxBytes: 900000,
    initialQuality: 0.8,
    minQuality: 0.5,
    qualityStep: 0.1,
    minSide: 600,
    maxAttempts: 5,
  }), {
    maxSide: 1200,
    maxBytes: 900000,
    initialQuality: 0.8,
    minQuality: 0.5,
    qualityStep: 0.1,
    minSide: 600,
    maxAttempts: 5,
  });
});

test('estimates decoded bytes from a base64 data URL', () => {
  assert.equal(getDataUrlByteLength('data:image/jpeg;base64,YWJj'), 3);
  assert.equal(getDataUrlByteLength('not-an-image'), 0);
});

test('falls back to the original image when browser canvas APIs are unavailable', async () => {
  const source = 'data:image/jpeg;base64,YWJj';
  assert.equal(await compressImageDataUrl(source), source);
});
