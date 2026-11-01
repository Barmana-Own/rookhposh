import { useCallback, useEffect, useRef, useState } from 'react';
import { createCameraSession, initialCameraState } from '../utils/cameraSession.js';

export function useCameraCapture() {
  const videoRef = useRef(null);
  const sessionRef = useRef(null);
  const [state, setState] = useState(initialCameraState);

  useEffect(() => {
    const session = createCameraSession(navigator.mediaDevices, setState);
    sessionRef.current = session;
    return () => {
      sessionRef.current = null;
      session.dispose();
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    let active = true;
    video.srcObject = state.stream;
    if (state.stream) {
      video.play()?.catch(() => {
        if (active) sessionRef.current?.videoError(state.stream);
      });
    }
    return () => { active = false; video.srcObject = null; };
  }, [state.isOpen, state.stream]);

  const open = useCallback(() => sessionRef.current?.open(), []);
  const close = useCallback(() => sessionRef.current?.close(), []);
  const switchCamera = useCallback(() => sessionRef.current?.switchCamera(), []);
  const videoReady = useCallback(() => sessionRef.current?.videoReady(videoRef.current), []);
  const videoNotReady = useCallback(() => sessionRef.current?.videoNotReady(), []);
  const videoError = useCallback(() => sessionRef.current?.videoError(), []);
  const capture = useCallback((onCapture) => sessionRef.current?.capture(videoRef.current, onCapture), []);
  return { ...state, videoRef, open, close, switchCamera, videoReady, videoNotReady, videoError, capture };
}
