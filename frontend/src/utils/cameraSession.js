import { captureCameraFrame, describeCameraError, getActiveCameraFacingMode, getNextCameraFacingMode, requestCameraStream, stopCameraStream } from './camera.js';

export const initialCameraState = {
  isOpen: false, busy: false, ready: false, isCapturing: false,
  requestedFacingMode: 'user', activeFacingMode: null, stream: null, error: '',
};

// Owns the existing getUserMedia stream across switches and close/reopen operations.
export function createCameraSession(mediaDevices, onChange, captureFrame = captureCameraFrame) {
  let state = { ...initialCameraState };
  let generation = 0;
  let pending = false;
  let disposed = false;
  let ownedStream = null;
  let devices = [];
  let removeTrackListeners = () => {};
  const update = (patch) => {
    state = { ...state, ...patch };
    if (!disposed) onChange(state);
  };
  const release = () => {
    removeTrackListeners();
    removeTrackListeners = () => {};
    stopCameraStream(ownedStream);
    ownedStream = null;
    state = { ...state, stream: null, ready: false, activeFacingMode: null };
  };
  const isCurrent = (id) => !disposed && state.isOpen && generation === id;

  async function acquire(mode, id) {
    const stream = await requestCameraStream(mediaDevices, mode);
    if (!isCurrent(id)) {
      stopCameraStream(stream);
      return false;
    }
    // Own the track even while device metadata is still being resolved.
    ownedStream = stream;
    if (!getActiveCameraFacingMode(stream) && mediaDevices.enumerateDevices) {
      try {
        devices = await mediaDevices.enumerateDevices();
      } catch {
        devices = []; // A usable stream may still have an unknown camera direction.
      }
    }
    if (!isCurrent(id)) {
      stopCameraStream(stream);
      return false;
    }
    const actualMode = getActiveCameraFacingMode(stream, devices);
    if (actualMode && actualMode !== mode) {
      release();
      const error = new Error(`دوربین ${mode === 'environment' ? 'پشتی' : 'سلفی'} در این دستگاه پیدا نشد.`);
      error.name = 'OverconstrainedError';
      throw error;
    }
    const track = stream.getVideoTracks().find((item) => item.readyState !== 'ended');
    if (!track) throw new Error('اتصال دوربین قطع شد؛ دوباره دوربین را باز کنید یا از روش آپلود استفاده کنید.');
    const ended = () => {
      if (state.stream !== stream || disposed) return;
      generation += 1;
      release();
      update({ isCapturing: false, error: 'اتصال دوربین قطع شد؛ دوباره دوربین را باز کنید یا از روش آپلود استفاده کنید.' });
    };
    track.addEventListener?.('ended', ended);
    removeTrackListeners = () => track.removeEventListener?.('ended', ended);
    update({ stream, requestedFacingMode: mode, activeFacingMode: actualMode, ready: false });
    return true;
  }

  async function start(mode, restoreMode = null) {
    if (disposed || pending || state.isCapturing) return false;
    const id = ++generation;
    pending = true;
    release();
    update({ isOpen: true, busy: true, requestedFacingMode: mode, error: '' });
    try {
      if (!mediaDevices?.getUserMedia) throw new Error('دوربینی در این دستگاه یا مرورگر پیدا نشد؛ از روش آپلود استفاده کنید.');
      return await acquire(mode, id);
    } catch (error) {
      if (!isCurrent(id)) return false;
      release();
      const message = describeCameraError(error, mode);
      if (restoreMode) {
        try {
          await acquire(restoreMode, id);
        } catch {
          if (isCurrent(id)) release();
        }
      }
      if (isCurrent(id)) update({ error: message });
      return false;
    } finally {
      pending = false;
      if (!disposed) update({ busy: false });
    }
  }

  function close() {
    generation += 1;
    release();
    update({ isOpen: false, ready: false, isCapturing: false, busy: pending, error: '' });
  }

  return {
    getState: () => state,
    open: () => state.isOpen ? false : start('user'),
    switchCamera: () => {
      if (!state.isOpen) return false;
      const previous = state.activeFacingMode || state.requestedFacingMode;
      return start(getNextCameraFacingMode(previous), state.stream ? previous : null);
    },
    close,
    dispose: () => { disposed = true; close(); },
    videoNotReady: () => { if (!disposed && state.ready) update({ ready: false }); },
    videoError: (stream) => {
      if (disposed || !state.isOpen || state.busy || !state.stream || (stream && state.stream !== stream)) return;
      generation += 1;
      release();
      update({ isCapturing: false, error: 'نمایش تصویر دوربین ممکن نیست؛ دوربین را دوباره باز کنید یا از روش آپلود استفاده کنید.' });
    },
    videoReady: (video) => {
      if (!disposed && state.isOpen && !state.busy && video?.srcObject === state.stream
          && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0
          && state.stream?.getVideoTracks().some((track) => track.readyState !== 'ended')) {
        update({ ready: true, activeFacingMode: getActiveCameraFacingMode(state.stream, devices) });
      }
    },
    async capture(video, onCapture) {
      if (!state.isOpen || !state.ready || state.busy || state.isCapturing || video?.srcObject !== state.stream) return false;
      const id = generation;
      update({ isCapturing: true, error: '' });
      try {
        const file = await captureFrame(video);
        if (!isCurrent(id)) return false;
        await onCapture(file, () => isCurrent(id));
        if (!isCurrent(id)) return false;
        close();
        return true;
      } catch (error) {
        if (isCurrent(id)) update({ error: describeCameraError(error, state.requestedFacingMode) });
        return false;
      } finally {
        if (isCurrent(id)) update({ isCapturing: false });
      }
    },
  };
}
