import { useEffect, useRef } from 'react';

/**
 * useCamera
 *
 * Requests webcam access and attaches the MediaStream to a <video> element.
 *
 * @returns {{ videoRef: React.RefObject<HTMLVideoElement> }}
 */
export function useCamera() {
  const videoRef = useRef(null);

  useEffect(() => {
    let stream = null;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Play is needed on some browsers even when autoplay is set.
          videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        console.error('[useCamera] Could not access webcam:', err);
      }
    }

    startCamera();

    return () => {
      // Stop all tracks on unmount to release the camera.
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, []);

  return { videoRef };
}
