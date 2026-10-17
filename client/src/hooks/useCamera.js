import { useEffect, useRef, useState } from 'react';

/**
 * useCamera
 *
 * Requests webcam access and attaches the MediaStream to a <video> element.
 *
 * @returns {{
 *   videoRef: React.RefObject<HTMLVideoElement>,
 *   status: 'pending' | 'ready' | 'denied' | 'unavailable',
 * }}
 *   'denied'      — the user (or browser policy) blocked camera access
 *   'unavailable' — no camera, or it's in use by another app
 */
export function useCamera() {
  const videoRef = useRef(null);
  const [status, setStatus] = useState('pending');

  useEffect(() => {
    let stream = null;
    let cancelled = false;
    const video = videoRef.current;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) return;

        if (video) {
          video.srcObject = stream;
          // Play is needed on some browsers even when autoplay is set.
          video.play().catch(() => {});
        }
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setStatus(err?.name === 'NotAllowedError' || err?.name === 'SecurityError' ? 'denied' : 'unavailable');
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      // Stop all tracks on unmount to release the camera.
      stream?.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    };
  }, []);

  return { videoRef, status };
}
