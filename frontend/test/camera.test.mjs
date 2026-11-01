import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cameraModeLabel,
  getActiveCameraFacingMode,
  describeCameraError,
  getNextCameraFacingMode,
  requestCameraStream,
  shouldShowBodyGuide,
} from '../src/utils/camera.js';

function createStream(facingMode) {
  const stopped = [];
  const track = {
    getSettings: () => ({ facingMode }),
    stop: () => stopped.push(true),
  };
  return {
    getVideoTracks: () => [track],
    getTracks: () => [track],
    stopped,
  };
}

test('switches between selfie and rear camera modes', () => {
  assert.equal(getNextCameraFacingMode('user'), 'environment');
  assert.equal(getNextCameraFacingMode('environment'), 'user');
  assert.equal(cameraModeLabel('user'), 'سلفی');
  assert.equal(cameraModeLabel('environment'), 'پشتی');
});

test('requests the requested facing mode with an exact constraint', async () => {
  const stream = createStream('environment');
  const calls = [];
  const mediaDevices = {
    getUserMedia: async (constraints) => {
      calls.push(constraints);
      return stream;
    },
  };

  const result = await requestCameraStream(mediaDevices, 'environment');

  assert.equal(result, stream);
  assert.deepEqual(calls, [{ audio: false, video: { facingMode: { exact: 'environment' } } }]);
});

test('falls back to an ideal constraint when exact facing mode is unsupported', async () => {
  const stream = createStream('user');
  const calls = [];
  const mediaDevices = {
    getUserMedia: async (constraints) => {
      calls.push(constraints);
      if (calls.length === 1) {
        const error = new Error('constraint unavailable');
        error.name = 'OverconstrainedError';
        throw error;
      }
      return stream;
    },
  };

  await assert.rejects(() => requestCameraStream(mediaDevices, 'environment'), /دوربین پشتی/);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], { audio: false, video: { facingMode: { ideal: 'environment' } } });
  assert.deepEqual(stream.stopped, [true]);
});

test('localizes permission and availability failures', () => {
  assert.match(describeCameraError({ name: 'NotAllowedError' }, 'environment'), /اجازه دسترسی/);
  assert.match(describeCameraError({ name: 'NotFoundError' }, 'environment'), /دوربین پشتی/);
});

test('uses actual camera settings instead of a request or misleading device label', () => {
  const stream = createStream('user');
  stream.getVideoTracks()[0].label = 'Back Camera';
  assert.equal(getActiveCameraFacingMode(stream), 'user');
  stream.getVideoTracks()[0].getSettings = () => ({ facingMode: 'left' });
  assert.equal(getActiveCameraFacingMode(stream), null);
  assert.equal(getActiveCameraFacingMode(createStream('environment')), 'environment');
  assert.equal(getActiveCameraFacingMode(createStream(undefined)), null);
});

test('identifies the actual deviceId only when its camera label is unambiguous', () => {
  const stream = createStream(undefined);
  stream.getVideoTracks()[0].getSettings = () => ({ deviceId: 'selected-device' });
  assert.equal(getActiveCameraFacingMode(stream, [{ kind: 'videoinput', deviceId: 'selected-device', label: 'Back Camera' }]), 'environment');
  assert.equal(getActiveCameraFacingMode(stream, [{ kind: 'videoinput', deviceId: 'other-device', label: 'Back Camera' }]), null);
  stream.getVideoTracks()[0].label = 'Front and Back Camera';
  assert.equal(getActiveCameraFacingMode(stream), null);
});

test('does not identify ended, absent or unreadable tracks as a rear camera', () => {
  const stream = createStream('environment');
  stream.getVideoTracks()[0].readyState = 'ended';
  assert.equal(getActiveCameraFacingMode(stream), null);
  assert.equal(getActiveCameraFacingMode(null), null);
  stream.getVideoTracks()[0].readyState = 'live';
  stream.getVideoTracks()[0].getSettings = () => { throw new Error('Unavailable settings'); };
  assert.equal(getActiveCameraFacingMode(stream), null);
});

test('requires an open, ready, confirmed rear preview and no acquisition or capture', () => {
  const ready = { isOpen: true, ready: true, activeFacingMode: 'environment', busy: false, isCapturing: false };
  assert.equal(shouldShowBodyGuide(ready), true);
  for (const change of [{ isOpen: false }, { ready: false }, { activeFacingMode: null }, { activeFacingMode: 'user' }, { busy: true }, { isCapturing: true }]) {
    assert.equal(shouldShowBodyGuide({ ...ready, ...change }), false);
  }
  assert.equal(shouldShowBodyGuide({ ...ready, activeFacingMode: null, requestedFacingMode: 'environment' }), false);
});

test('honors explicit device selection without falling back to a different device', async () => {
  const calls = [];
  const stream = createStream('environment');
  const devices = { getUserMedia: async (constraints) => { calls.push(constraints); return stream; } };
  assert.equal(await requestCameraStream(devices, 'environment', { deviceId: 'rear-camera' }), stream);
  assert.deepEqual(calls[0].video, { deviceId: { exact: 'rear-camera' }, facingMode: { ideal: 'environment' } });
  calls.length = 0;
  devices.getUserMedia = async (constraints) => { calls.push(constraints); throw Object.assign(new Error('Unavailable'), { name: 'OverconstrainedError' }); };
  await assert.rejects(requestCameraStream(devices, 'environment', { deviceId: 'missing-camera' }));
  assert.equal(calls.length, 1);
});

test('releases all tracks when a request returns no usable video', async () => {
  let stopped = 0;
  const stream = { getVideoTracks: () => [], getTracks: () => [{ stop: () => { stopped += 1; } }] };
  await assert.rejects(requestCameraStream({ getUserMedia: async () => stream }, 'environment'), { name: 'NotFoundError' });
  assert.equal(stopped, 1);
});
