export function getNextCameraFacingMode(facingMode) {
  return facingMode === 'user' ? 'environment' : 'user';
}

export function cameraModeLabel(facingMode) {
  return facingMode === 'environment' ? 'پشتی' : 'سلفی';
}

export function describeCameraError(cameraException, facingMode) {
  const cameraName = cameraModeLabel(facingMode);
  const cameraErrorName = cameraException?.name;
  if (cameraErrorName === 'NotFoundError' || cameraErrorName === 'OverconstrainedError') {
    return `دوربین ${cameraName} در این دستگاه پیدا نشد؛ از روش آپلود استفاده کنید.`;
  }
  if (cameraErrorName === 'NotAllowedError' || cameraErrorName === 'SecurityError') {
    return 'اجازه دسترسی به دوربین داده نشد؛ از روش آپلود استفاده کنید.';
  }
  if (cameraErrorName === 'NotReadableError') {
    return 'دوربین توسط برنامه دیگری در حال استفاده است؛ از روش آپلود استفاده کنید.';
  }
  if (cameraErrorName === 'Error' && cameraException?.message) return cameraException.message;
  return `باز کردن دوربین ${cameraName} ناموفق بود؛ از روش آپلود استفاده کنید.`;
}

export function stopCameraStream(stream) {
  stream?.getTracks?.().forEach((track) => { if (track.readyState !== 'ended') track.stop(); });
}

export function getActiveCameraFacingMode(stream, devices = []) {
  const track = stream?.getVideoTracks?.().find((item) => item.readyState !== 'ended');
  if (!track) return null;
  let settings;
  try {
    settings = track.getSettings?.() || {};
  } catch {
    return null;
  }
  if (settings.facingMode) return ['user', 'environment'].includes(settings.facingMode) ? settings.facingMode : null;
  // Labels must describe the actual track/device, never the requested constraint.
  const device = settings.deviceId && devices.find((item) => item.kind === 'videoinput' && item.deviceId === settings.deviceId);
  const label = String(device?.label || track.label || '');
  const rear = /\b(rear|back|environment|world)\b|پشتی/iu.test(label);
  const front = /\b(front|user|selfie|facetime)\b|جلو|سلفی/iu.test(label);
  return rear === front ? null : rear ? 'environment' : 'user';
}

export function shouldShowBodyGuide({ isOpen, activeFacingMode, ready, busy, isCapturing }) {
  return Boolean(isOpen && activeFacingMode === 'environment' && ready && !busy && !isCapturing);
}

export async function requestCameraStream(mediaDevices, facingMode, { deviceId } = {}) {
  const exactConstraints = {
    audio: false,
    video: deviceId
      ? { deviceId: { exact: deviceId }, facingMode: { ideal: facingMode } }
      : { facingMode: { exact: facingMode } },
  };
  let stream;
  try {
    stream = await mediaDevices.getUserMedia(exactConstraints);
  } catch (cameraException) {
    if (deviceId || !['NotFoundError', 'OverconstrainedError', 'TypeError'].includes(cameraException?.name)) {
      throw cameraException;
    }
    stream = await mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: facingMode } },
    });
  }

  const videoTrack = stream.getVideoTracks?.().find((track) => track.readyState !== 'ended');
  if (!videoTrack) {
    stopCameraStream(stream);
    const unavailable = new Error(`دوربین ${cameraModeLabel(facingMode)} در این دستگاه پیدا نشد.`);
    unavailable.name = 'NotFoundError';
    throw unavailable;
  }
  const actualFacingMode = getActiveCameraFacingMode(stream);
  if (actualFacingMode && actualFacingMode !== facingMode) {
    stopCameraStream(stream);
    const modeError = new Error(`دوربین ${cameraModeLabel(facingMode)} در این دستگاه پیدا نشد.`);
    modeError.name = 'OverconstrainedError';
    throw modeError;
  }
  return stream;
}

export async function captureCameraFrame(video, createCanvas = () => document.createElement('canvas')) {
  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
    throw new Error('دوربین هنوز آماده نشده است؛ چند لحظه بعد دوباره تلاش کنید.');
  }
  const canvas = createCanvas();
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('ثبت تصویر از دوربین ممکن نیست؛ از روش آپلود استفاده کنید.');
  // Only the original video frame is painted. DOM/SVG guides never enter this canvas.
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error('ثبت تصویر از دوربین ناموفق بود؛ از روش آپلود استفاده کنید.');
  return new File([blob], 'camera-photo.jpg', { type: 'image/jpeg' });
}
