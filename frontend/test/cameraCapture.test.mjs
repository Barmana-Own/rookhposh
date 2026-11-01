import assert from 'node:assert/strict';
import { Blob } from 'node:buffer';
import test from 'node:test';
import { captureCameraFrame } from '../src/utils/camera.js';

test('captures only the original video at its native dimensions with the existing JPEG contract', async () => {
  const actualVideo = { readyState: 2, videoWidth: 1920, videoHeight: 1080 };
  const drawn = [];
  const canvas = {
    getContext: () => ({ drawImage: (...args) => drawn.push(args) }),
    toBlob: (callback, type, quality) => {
      assert.equal(type, 'image/jpeg');
      assert.equal(quality, 0.92);
      callback(new Blob([new Uint8Array([255, 216, 255, 217])], { type }));
    },
  };
  const file = await captureCameraFrame(actualVideo, () => canvas);
  assert.equal(canvas.width, 1920);
  assert.equal(canvas.height, 1080);
  assert.deepEqual(drawn, [[actualVideo, 0, 0, 1920, 1080]]);
  assert.equal(file.name, 'camera-photo.jpg');
  assert.equal(file.type, 'image/jpeg');
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), new Uint8Array([255, 216, 255, 217]));
});

test('portrait frames preserve portrait resolution instead of CSS preview size', async () => {
  const canvas = { getContext: () => ({ drawImage: () => {} }), toBlob: (fn) => fn(new Blob(['frame'])) };
  await captureCameraFrame({ readyState: 2, videoWidth: 1080, videoHeight: 1920, clientWidth: 240, clientHeight: 427 }, () => canvas);
  assert.equal(canvas.width, 1080);
  assert.equal(canvas.height, 1920);
});

test('does not allocate a canvas for a video without decoded pixels', async () => {
  for (const video of [null, { readyState: 1, videoWidth: 640, videoHeight: 480 }, { readyState: 2, videoWidth: 0, videoHeight: 480 }]) {
    await assert.rejects(captureCameraFrame(video, () => assert.fail('video is not ready')), /آماده/);
  }
});

test('reports unavailable canvas context and failed JPEG encoding', async () => {
  const video = { readyState: 2, videoWidth: 640, videoHeight: 480 };
  await assert.rejects(captureCameraFrame(video, () => ({ getContext: () => null })), /ثبت تصویر/);
  await assert.rejects(captureCameraFrame(video, () => ({ getContext: () => ({ drawImage: () => {} }), toBlob: (fn) => fn(null) })), /ثبت تصویر/);
});
