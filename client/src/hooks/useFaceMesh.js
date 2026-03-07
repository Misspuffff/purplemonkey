/**
 * useFaceMesh.js
 *
 * Initialises a MediaPipe FaceLandmarker (Tasks Vision API) once, async.
 * Does NOT drive its own camera loop — instead exposes detectFrame() to be
 * called manually each RAF frame by the caller.
 *
 * Returns
 * ───────
 *   isReady      – true once the landmarker has finished loading
 *   detectFrame  – (videoElement, timestampMs) => result | null
 *
 * detectFrame return value (or null when no face is detected):
 *   {
 *     blendshapes: { jawOpen, browInnerUp, eyesClosed, mouthSmile }  // 0–1
 *     headPose:    { yaw, pitch, roll }                               // -1 to 1
 *     landmarks:   Array<{x,y,z}>                                    // 478 pts
 *   }
 *
 * Head-pose conventions
 * ─────────────────────
 *   yaw   > 0  → face turned right in image
 *   pitch > 0  → face tilted up
 *   roll  > 0  → head tilted clockwise
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';

export function useFaceMesh() {
  const landmarkerRef = useRef(null);
  const [isReady, setIsReady] = useState(false);

  // ── Initialise once on mount ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        console.log('[useFaceMesh] loading FaceLandmarker via Tasks Vision API…');

        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
        );

        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU',
          },
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
          runningMode: 'VIDEO',
          numFaces: 1,
        });

        if (cancelled) {
          landmarker.close();
          return;
        }

        landmarkerRef.current = landmarker;
        setIsReady(true);
        console.log('[useFaceMesh] FaceLandmarker ready');
      } catch (err) {
        console.error('[useFaceMesh] init error:', err);
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
  const detectFrame = useCallback((videoElement, timestampMs) => {
    if (!landmarkerRef.current || !videoElement) return null;
    // Video must have valid dimensions and an active stream before we pass it
    // to the landmarker — avoids "ROI width/height > 0" WASM errors.
    if (videoElement.readyState < 2 || videoElement.videoWidth === 0) return null;

    const result = landmarkerRef.current.detectForVideo(videoElement, timestampMs);

    if (!result.faceLandmarks || result.faceLandmarks.length === 0) return null;

    // ── Blendshape extraction ──────────────────────────────────────────────
    const get = (name) =>
      result.faceBlendshapes[0].categories.find((c) => c.categoryName === name)?.score ?? 0;

    const blendshapes = {
      jawOpen:     get('jawOpen'),
      browInnerUp: get('browInnerUp'),
      eyesClosed:  (get('eyeBlinkLeft') + get('eyeBlinkRight')) / 2,
      mouthSmile:  (get('mouthSmileLeft') + get('mouthSmileRight')) / 2,
    };

    // ── Head pose from FacialTransformationMatrix (column-major 4×4) ───────
    const m = result.facialTransformationMatrixes[0].data; // flat 16-element array
    const headPose = {
      yaw:   Math.atan2(m[8], m[10]) / Math.PI,
      pitch: Math.atan2(-m[9], Math.sqrt(m[8] ** 2 + m[10] ** 2)) / (Math.PI / 2),
      roll:  Math.atan2(m[1], m[5]) / Math.PI,
    };

    return {
      blendshapes,
      headPose,
      landmarks: result.faceLandmarks[0], // raw 478-point pass-through
    };
  }, []);

  return { detectFrame, isReady };
}
