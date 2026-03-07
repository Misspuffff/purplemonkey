import { useEffect, useRef, useState } from 'react';
import { Hands } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';

/**
 * useMediaPipe
 *
 * Initialises a MediaPipe Hands instance, feeds every camera frame through
 * inference, and keeps the latest landmarks in state.
 *
 * @param {React.RefObject<HTMLVideoElement>} videoRef  – live webcam feed
 * @returns {{ landmarks: Array<Array<{x,y,z}>> }}
 *   landmarks – one entry per detected hand; each entry is an array of 21
 *               normalised landmark points ({ x, y, z }).
 */
export function useMediaPipe(videoRef) {
  const [landmarks, setLandmarks] = useState([]);
  const handsRef = useRef(null);
  const cameraRef = useRef(null);

  useEffect(() => {
    if (!videoRef?.current) return;

    // ── 1. Initialise MediaPipe Hands ─────────────────────────────────────
    const hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`,
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,   // 0 = lite, 1 = full
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5,
    });

    hands.onResults((results) => {
      // results.multiHandLandmarks is an array (one entry per hand) of arrays
      // of 21 {x, y, z} objects, or undefined when no hands are visible.
      setLandmarks(results.multiHandLandmarks ?? []);
    });

    handsRef.current = hands;

    // ── 2. Drive inference with @mediapipe/camera_utils ───────────────────
    // Camera calls hands.send() on every animation frame automatically.
    const camera = new Camera(videoRef.current, {
      onFrame: async () => {
        if (handsRef.current && videoRef.current) {
          await handsRef.current.send({ image: videoRef.current });
        }
      },
      // Mirror the resolution from useCamera for consistency.
      width: 1280,
      height: 720,
    });

    camera.start().catch((err) => {
      console.error('[useMediaPipe] Camera start error:', err);
    });

    cameraRef.current = camera;

    return () => {
      // Tear down on unmount.
      cameraRef.current?.stop();
      handsRef.current?.close();
    };
  }, [videoRef]);

  return { landmarks };
}
