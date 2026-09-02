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

function stopStream(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

export async function requestCameraStream(mediaDevices, facingMode) {
  const exactConstraints = {
    audio: false,
    video: { facingMode: { exact: facingMode } },
  };
  let stream;
  try {
    stream = await mediaDevices.getUserMedia(exactConstraints);
  } catch (cameraException) {
    if (!['NotFoundError', 'OverconstrainedError', 'TypeError'].includes(cameraException?.name)) {
      throw cameraException;
    }
    stream = await mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: facingMode } },
    });
  }

  const videoTrack = stream.getVideoTracks?.()[0];
  const actualFacingMode = videoTrack?.getSettings?.().facingMode;
  if (actualFacingMode && actualFacingMode !== facingMode) {
    stopStream(stream);
    const modeError = new Error(`دوربین ${cameraModeLabel(facingMode)} در این دستگاه پیدا نشد.`);
    modeError.name = 'OverconstrainedError';
    throw modeError;
  }
  return stream;
}
