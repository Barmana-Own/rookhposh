import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cameraModeLabel,
  describeCameraError,
  getNextCameraFacingMode,
  requestCameraStream,
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
