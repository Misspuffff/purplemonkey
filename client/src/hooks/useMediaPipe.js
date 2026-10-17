/**
 * useMediaPipe
 *
 * Initialises a MediaPipe HandLandmarker (Tasks Vision API) once, async.
 * Uses the same WASM runtime as useFaceMesh — no WASM conflict.
 * Does NOT drive its own camera loop; exposes detectHands() to be called
 * manually each RAF frame by the caller.
 *
 * @returns {{ detectHands: (videoElement, timestampMs) => Array<Array<{x,y,z}>>, isReady: boolean }}
 *   detectHands returns one entry per detected hand (up to 2), each an array
 *   of 21 normalised landmark points ({ x, y, z }). Returns [] when no hands
 *   are visible or the landmarker is not yet ready.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { HandLandmarker } from '@mediapipe/tasks-vision';
import { getVisionFileset } from './visionFileset.js';

export function useMediaPipe() {
  const landmarkerRef = useRef(null);
  const [isReady, setIsReady] = useState(false);

  // ── Initialise once on mount ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {

        const vision = await getVisionFileset();

        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.7,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        if (cancelled) {
          landmarker.close();
          return;
        }

        landmarkerRef.current = landmarker;
        setIsReady(true);
      } catch (err) {
        console.error('[useMediaPipe] init error:', err);
      }
    }

    init();

    return () => {
      cancelled = true;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, []);

  // ── Per-frame detection — called manually in the RAF loop ─────────────────
  const detectHands = useCallback((videoElement, timestampMs) => {
    if (!landmarkerRef.current || !videoElement) return [];
    if (videoElement.readyState < 2 || videoElement.videoWidth === 0) return [];

    const result = landmarkerRef.current.detectForVideo(videoElement, timestampMs);
    // result.landmarks: NormalizedLandmark[][] — same {x,y,z} shape as the old
    // @mediapipe/hands results.multiHandLandmarks, so downstream code is unchanged.
    return result.landmarks ?? [];
  }, []);

  return { detectHands, isReady };
}
