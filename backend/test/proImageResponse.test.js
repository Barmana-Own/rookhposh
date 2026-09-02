const assert = require('node:assert/strict');
const test = require('node:test');

const {
  decodeImageCandidate,
  selectFinalImageCandidate,
} = require('../src/utils/proImageResponse');

const maskUrl = 'https://kwai-kolors-kolors-virtual-try-on.hf.space/files/mask.png';
const finalUrl = 'https://kwai-kolors-kolors-virtual-try-on.hf.space/files/final.webp';

test('selects the explicit final output instead of an earlier mask URL', () => {
  const candidate = selectFinalImageCandidate({
    success: true,
    image_url: maskUrl,
    output_image: finalUrl,
  });

  assert.equal(candidate?.source, finalUrl);
  assert.equal(candidate?.kind, 'url');
});

test('selects a result item from multi-output arrays and rejects mask-only responses', () => {
  const candidate = selectFinalImageCandidate({
    data: [
      { type: 'segmentation_mask', url: maskUrl },
      { type: 'final_result', url: finalUrl },
    ],
  });

  assert.equal(candidate?.source, finalUrl);
  assert.equal(selectFinalImageCandidate({ mask_image: maskUrl }), null);
});

test('decodes the live provider image_base64 shape and trusts the binary signature over a wrong MIME hint', () => {
  const webpBytes = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
  ]);
  const candidate = selectFinalImageCandidate({
    success: true,
    image_base64: webpBytes.toString('base64'),
    content_type: 'image/png',
  });
  const decoded = decodeImageCandidate(candidate);

  assert.equal(candidate?.path, 'image_base64');
  assert.equal(decoded?.mimeType, 'image/webp');
  assert.deepEqual(decoded?.bytes, webpBytes);
});
