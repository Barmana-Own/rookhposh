import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';

import {
  getFinalProImageSource,
  selectFinalImageCandidate,
} from '../src/utils/proResponse.js';

const maskUrl = 'https://kwai-kolors-kolors-virtual-try-on.hf.space/files/mask.png';
const finalUrl = 'https://kwai-kolors-kolors-virtual-try-on.hf.space/files/final.webp';

test('prefers explicit final output fields over mask fields regardless of object order', () => {
  const source = getFinalProImageSource({
    image_url: maskUrl,
    output_image: finalUrl,
  });

  assert.equal(source, finalUrl);
});

test('uses result metadata in multi-output arrays and never returns a mask-only image', () => {
  assert.equal(getFinalProImageSource({
    outputs: [
      { kind: 'mask', url: maskUrl },
      { kind: 'result', url: finalUrl },
    ],
  }), finalUrl);
  assert.equal(getFinalProImageSource({ segmentation_mask: maskUrl }), '');
});

test('supports nested arrays rather than failing with a missing-output error', () => {
  assert.equal(getFinalProImageSource({ data: [{ output: [{ url: finalUrl }] }] }), finalUrl);
});

test('converts the live image_base64 response to a renderable data URL using its real signature', () => {
  const webpBytes = Uint8Array.from([
    0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
  ]);
  const imageBase64 = Buffer.from(webpBytes).toString('base64');
  const source = getFinalProImageSource({
    success: true,
    image_base64: imageBase64,
    content_type: 'image/png',
  });

  assert.equal(source, `data:image/webp;base64,${imageBase64}`);
  assert.equal(selectFinalImageCandidate({ input_image: finalUrl }), null);
});
