import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import test from 'node:test';
import { createCameraSession } from '../src/utils/cameraSession.js';
import { shouldShowBodyGuide } from '../src/utils/camera.js';

function stream(mode, settings = {}) {
  const listeners = new Map();
  const track = {
    readyState: 'live', stopCalls: 0, label: '',
    getSettings: () => ({ facingMode: mode, ...settings }),
    stop() { this.stopCalls += 1; this.readyState = 'ended'; },
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
  };
  return { track, listeners, getVideoTracks: () => [track], getTracks: () => [track] };
}
const video = (source) => ({ srcObject: source, readyState: 2, videoWidth: 1920, videoHeight: 1080 });
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup(capture) {
  const streams = [];
  const states = [];
  const media = { getUserMedia: async ({ video: constraints }) => {
    const source = stream(constraints.facingMode.exact || constraints.facingMode.ideal);
    streams.push(source);
    return source;
  } };
  const session = createCameraSession(media, (state) => states.push(state), capture);
  return { session, streams, states, media };
}

test('opens front, waits for rear video, and hides the guide immediately when switching back', async () => {
  const { session, streams } = setup();
  await session.open();
  session.videoReady(video(streams[0]));
  assert.equal(shouldShowBodyGuide(session.getState()), false);
  await session.switchCamera();
  assert.equal(shouldShowBodyGuide(session.getState()), false);
  assert.equal(streams[0].track.readyState, 'ended');
  session.videoReady(video(streams[1]));
  assert.equal(shouldShowBodyGuide(session.getState()), true);
  const switching = session.switchCamera();
  assert.equal(shouldShowBodyGuide(session.getState()), false);
  await switching;
  session.videoReady(video(streams[2]));
  assert.equal(session.getState().activeFacingMode, 'user');
  assert.equal(shouldShowBodyGuide(session.getState()), false);
  session.dispose();
});

test('repeated switches keep at most one active track and remove ended listeners', async () => {
  const { session, streams } = setup();
  await session.open();
  for (let i = 0; i < 20; i += 1) {
    await session.switchCamera();
    assert.equal(streams.filter((s) => s.track.readyState === 'live').length, 1);
    assert.equal(streams.slice(0, -1).every((s) => s.listeners.size === 0 && s.track.stopCalls === 1), true);
  }
  session.close();
  assert.equal(streams.every((s) => s.track.readyState === 'ended' && s.listeners.size === 0), true);
});

test('does not issue duplicate camera requests while an acquisition is pending', async () => {
  const pending = deferred();
  let calls = 0;
  const session = createCameraSession({ getUserMedia: () => { calls += 1; return pending.promise; } }, () => {});
  const opening = session.open();
  await session.open();
  await session.switchCamera();
  assert.equal(calls, 1);
  pending.resolve(stream('user'));
  await opening;
  session.dispose();
});

test('close during permission acquisition discards the late stream and never reopens the modal', async () => {
  const pending = deferred();
  const source = stream('user');
  const session = createCameraSession({ getUserMedia: () => pending.promise }, () => {});
  const opening = session.open();
  session.close();
  assert.equal(session.getState().isOpen, false);
  assert.equal(await session.open(), false);
  pending.resolve(source);
  await opening;
  assert.equal(source.track.stopCalls, 1);
  assert.equal(session.getState().stream, null);
  assert.equal(session.getState().isOpen, false);
  assert.equal(session.getState().busy, false);
});

test('disposal during acquisition frees late tracks without notifying an unmounted view', async () => {
  const pending = deferred();
  const states = [];
  const source = stream('user');
  const session = createCameraSession({ getUserMedia: () => pending.promise }, (state) => states.push(state));
  const opening = session.open();
  session.dispose();
  const count = states.length;
  pending.resolve(source);
  await opening;
  assert.equal(states.length, count);
  assert.equal(source.track.stopCalls, 1);
});

test('close releases an acquired stream immediately while device enumeration is still pending', async () => {
  const enumeration = deferred();
  const source = stream(undefined, { deviceId: 'unknown-device' });
  const session = createCameraSession({ getUserMedia: async () => source, enumerateDevices: () => enumeration.promise }, () => {});
  const opening = session.open();
  await Promise.resolve();
  await Promise.resolve();
  session.close();
  assert.equal(source.track.readyState, 'ended');
  enumeration.resolve([]);
  await opening;
  assert.equal(source.track.stopCalls, 1);
  assert.equal(session.getState().isOpen, false);
});

test('unknown camera metadata remains usable without a rear guide', async () => {
  const sources = [];
  const session = createCameraSession({ getUserMedia: async () => { const source = stream(undefined); sources.push(source); return source; } }, () => {});
  await session.open();
  await session.switchCamera();
  session.videoReady(video(sources[1]));
  assert.equal(session.getState().ready, true);
  assert.equal(session.getState().activeFacingMode, null);
  assert.equal(shouldShowBodyGuide(session.getState()), false);
  session.dispose();
});

test('a track ending during device enumeration reports a safe error and releases remaining tracks', async () => {
  const enumeration = deferred();
  const source = stream(undefined);
  const companion = { readyState: 'live', stop() { this.readyState = 'ended'; } };
  source.getTracks = () => [source.track, companion];
  const session = createCameraSession({ getUserMedia: async () => source, enumerateDevices: () => enumeration.promise }, () => {});
  const opening = session.open();
  await Promise.resolve();
  await Promise.resolve();
  source.track.readyState = 'ended';
  enumeration.resolve([]);
  assert.equal(await opening, false);
  assert.match(session.getState().error, /اتصال دوربین قطع شد/);
  assert.equal(session.getState().stream, null);
  assert.equal(session.getState().busy, false);
  assert.equal(companion.readyState, 'ended');
  assert.equal(source.listeners.size, 0);
  session.dispose();
});

test('a confirmed deviceId can identify rear direction when facingMode is omitted', async () => {
  const front = stream('user');
  const rear = stream(undefined, { deviceId: 'actual-rear' });
  let calls = 0;
  const session = createCameraSession({ getUserMedia: async () => calls++ === 0 ? front : rear,
    enumerateDevices: async () => [{ kind: 'videoinput', deviceId: 'actual-rear', label: 'Back Camera' }],
  }, () => {});
  await session.open();
  await session.switchCamera();
  session.videoReady(video(rear));
  assert.equal(shouldShowBodyGuide(session.getState()), true);
  session.dispose();
});

test('failed rear selection releases the wrong fallback and restores the real front camera', async () => {
  const first = stream('user');
  const wrong = stream('user');
  const restored = stream('user');
  let calls = 0;
  const session = createCameraSession({ getUserMedia: async () => {
    calls += 1;
    if (calls === 1) return first;
    if (calls === 2) throw Object.assign(new Error('Unavailable rear'), { name: 'OverconstrainedError' });
    return calls === 3 ? wrong : restored;
  } }, () => {});
  await session.open();
  assert.equal(await session.switchCamera(), false);
  assert.equal(first.track.readyState, 'ended');
  assert.equal(wrong.track.readyState, 'ended');
  assert.equal(session.getState().stream, restored);
  session.videoReady(video(restored));
  assert.match(session.getState().error, /پشتی/);
  assert.equal(shouldShowBodyGuide(session.getState()), false);
  session.dispose();
});

test('permission denial is localized, does not retry, and leaves capture disabled', async () => {
  let calls = 0;
  const session = createCameraSession({ getUserMedia: async () => { calls += 1; throw Object.assign(new Error('Denied'), { name: 'NotAllowedError' }); } }, () => {});
  await session.open();
  assert.equal(calls, 1);
  assert.match(session.getState().error, /اجازه/);
  assert.equal(session.getState().ready, false);
  assert.equal(await session.capture(video(null), () => assert.fail('must not capture')), false);
  await session.switchCamera();
  assert.equal(calls, 2, 'do not try restoring a camera that was never acquired');
  session.dispose();
});

test('reopening after a rear session always requests front, including a subsequent permission failure', async () => {
  const { session, media } = setup();
  await session.open();
  await session.switchCamera();
  session.close();
  media.getUserMedia = async () => { throw Object.assign(new Error('Denied'), { name: 'NotAllowedError' }); };
  await session.open();
  assert.equal(session.getState().requestedFacingMode, 'user');
  assert.equal(session.getState().activeFacingMode, null);
  assert.equal(shouldShowBodyGuide(session.getState()), false);
  session.dispose();
});

test('an unavailable browser exposes a usable close path and a camera error', async () => {
  const session = createCameraSession(undefined, () => {});
  await session.open();
  assert.match(session.getState().error, /دوربینی/);
  assert.equal(session.getState().busy, false);
  session.close();
  assert.equal(session.getState().isOpen, false);
  assert.equal(await session.switchCamera(), false);
});

test('ready events from an old stream and undecoded video cannot enable capture', async () => {
  const { session, streams } = setup();
  await session.open();
  await session.switchCamera();
  session.videoReady(video(streams[0]));
  assert.equal(session.getState().ready, false);
  session.videoReady({ ...video(streams[1]), readyState: 1 });
  assert.equal(session.getState().ready, false);
  session.videoReady(video(streams[1]));
  assert.equal(session.getState().ready, true);
  session.videoNotReady();
  assert.equal(shouldShowBodyGuide(session.getState()), false);
  session.videoReady(video(streams[1]));
  assert.equal(shouldShowBodyGuide(session.getState()), true);
  session.dispose();
});

test('a track ending or video playback failure disables the guide and releases resources', async () => {
  const { session, streams } = setup();
  await session.open();
  await session.switchCamera();
  session.videoReady(video(streams[1]));
  streams[1].listeners.get('ended')();
  assert.equal(shouldShowBodyGuide(session.getState()), false);
  assert.equal(streams[1].track.readyState, 'ended');
  assert.match(session.getState().error, /قطع/);
  await session.switchCamera();
  session.videoError(streams.at(-1));
  assert.equal(streams.at(-1).track.readyState, 'ended');
  assert.equal(session.getState().ready, false);
  session.dispose();
});

test('capture hides the guide, preserves the File contract and closes the camera once', async () => {
  const file = new File(['jpeg'], 'camera-photo.jpg', { type: 'image/jpeg' });
  let delivered;
  const { session, streams } = setup(async () => {
    assert.equal(shouldShowBodyGuide(session.getState()), false);
    return file;
  });
  await session.open();
  await session.switchCamera();
  session.videoReady(video(streams[1]));
  assert.equal(await session.capture(video(streams[1]), async (value) => { delivered = value; }), true);
  assert.equal(delivered, file);
  assert.equal(session.getState().isOpen, false);
  assert.equal(streams[1].track.stopCalls, 1);
  await session.open();
  assert.equal(session.getState().activeFacingMode, 'user');
  assert.equal(session.getState().ready, false);
  session.dispose();
});

test('duplicate shutter or switch actions cannot overlap a pending capture', async () => {
  const pending = deferred();
  let delivered = 0;
  const { session, streams } = setup(() => pending.promise);
  await session.open();
  session.videoReady(video(streams[0]));
  const capturing = session.capture(video(streams[0]), () => { delivered += 1; });
  assert.equal(await session.capture(video(streams[0]), () => { delivered += 1; }), false);
  assert.equal(await session.switchCamera(), false);
  assert.equal(streams.length, 1);
  pending.resolve(new File(['jpeg'], 'camera-photo.jpg', { type: 'image/jpeg' }));
  await capturing;
  assert.equal(delivered, 1);
});

test('close during capture discards the late image without invoking the try-on image callback', async () => {
  const pending = deferred();
  const { session, streams } = setup(() => pending.promise);
  await session.open();
  session.videoReady(video(streams[0]));
  const capturing = session.capture(video(streams[0]), () => assert.fail('stale photo must not be selected'));
  session.close();
  pending.resolve(new File(['jpeg'], 'camera-photo.jpg', { type: 'image/jpeg' }));
  assert.equal(await capturing, false);
  assert.equal(session.getState().isOpen, false);
});

test('a capture encoding error preserves the active camera for retry', async () => {
  const { session, streams } = setup(async () => { throw new Error('ثبت تصویر ناموفق بود.'); });
  await session.open();
  session.videoReady(video(streams[0]));
  assert.equal(await session.capture(video(streams[0]), () => {}), false);
  assert.equal(session.getState().isCapturing, false);
  assert.equal(session.getState().stream, streams[0]);
  assert.match(session.getState().error, /ثبت تصویر/);
  session.dispose();
});

test('cancel during image processing cannot replace the image or close a newly reopened camera', async () => {
  const processing = deferred();
  let delivered = 0;
  const { session, streams } = setup(async () => new File(['jpeg'], 'camera-photo.jpg', { type: 'image/jpeg' }));
  await session.open();
  session.videoReady(video(streams[0]));
  const capturing = session.capture(video(streams[0]), async (_file, isCurrent) => {
    await processing.promise;
    if (isCurrent()) delivered += 1;
  });
  await Promise.resolve();
  session.close();
  await session.open();
  processing.resolve();
  assert.equal(await capturing, false);
  assert.equal(delivered, 0);
  assert.equal(session.getState().stream, streams[1]);
  assert.equal(session.getState().isOpen, true);
  session.dispose();
});
