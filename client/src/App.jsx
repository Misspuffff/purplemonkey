import { useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { useCamera } from './hooks/useCamera';
import { useMediaPipe } from './hooks/useMediaPipe';
import { useFaceMesh } from './hooks/useFaceMesh';
import { useAppStore } from './store/instrumentStore';
import { GranularEngine } from './audio-engine/GranularEngine.js';
import './App.css';

// ── Hand skeleton drawing constants ───────────────────────────────────────────

const HAND_COLORS = ['#00ff88', '#ff4488'];

const CONNECTIONS = [
  [0, 1],  [1, 2],   [2, 3],   [3, 4],
  [0, 5],  [5, 6],   [6, 7],   [7, 8],
  [5, 9],  [9, 10],  [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17],[17, 18], [18, 19], [19, 20],
  [0, 17],
];

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const { videoRef }             = useCamera();
  const { landmarks }            = useMediaPipe(videoRef);
  const { detectFrame, isReady } = useFaceMesh();
  const canvasRef                = useRef(null);
  const frameCountRef            = useRef(0);
  const faceResultRef            = useRef(null);
  const granularEngineRef        = useRef(null);

  const isActive  = useAppStore((s) => s.isActive);
  const setActive = useAppStore((s) => s.setActive);

  // ── Granular engine lifecycle ──────────────────────────────────────────────
  useEffect(() => {
    if (!isActive) return;
    const engine = new GranularEngine();
    granularEngineRef.current = engine;
    engine.start();
    return () => {
      engine.dispose();
      granularEngineRef.current = null;
    };
  }, [isActive]);

  // ── RAF draw loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const video  = videoRef.current;
    console.log('[App] RAF effect: canvas=', !!canvas, 'video=', !!video);
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    let rafId;

    function draw() {
      rafId = requestAnimationFrame(draw);

      // Log on the very first draw call so we know the RAF started.
      if (frameCountRef.current === 0) {
        console.log('[App] draw() first call');
      }

      // Sync canvas to video dimensions.
      if (video.videoWidth > 0) {
        if (canvas.width  !== video.videoWidth)  canvas.width  = video.videoWidth;
        if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
      }
      const w = canvas.width;
      const h = canvas.height;

      frameCountRef.current += 1;

      // ── Face inference (called every frame, result stored in ref) ──────────
      faceResultRef.current = detectFrame(video, performance.now());

      // Drive granular audio engine with latest face data.
      if (granularEngineRef.current) {
        const face = faceResultRef.current;
        granularEngineRef.current.update(face?.blendshapes, face?.headPose);
      }

      // Log blendshapes every 60 frames to confirm they move with your face.
      if (frameCountRef.current % 60 === 0) {
        const face = faceResultRef.current;
        console.log('[face blendshapes]', face ? face.blendshapes : 'no face detected');
        console.log('[face headPose]',    face ? face.headPose    : null);
      }

      if (w === 0 || h === 0) return;

      // Mirror-draw video frame.
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, w, h);
      ctx.restore();

      // Hand skeleton + landmark dots.
      landmarks.forEach((handLandmarks, handIndex) => {
        const color = HAND_COLORS[handIndex % HAND_COLORS.length];

        ctx.strokeStyle = color;
        ctx.lineWidth   = 2;
        CONNECTIONS.forEach(([a, b]) => {
          const ptA = handLandmarks[a];
          const ptB = handLandmarks[b];
          if (!ptA || !ptB) return;
          ctx.beginPath();
          ctx.moveTo((1 - ptA.x) * w, ptA.y * h);
          ctx.lineTo((1 - ptB.x) * w, ptB.y * h);
          ctx.stroke();
        });

        handLandmarks.forEach((pt) => {
          ctx.beginPath();
          ctx.arc((1 - pt.x) * w, pt.y * h, 5, 0, Math.PI * 2);
          ctx.fillStyle   = color;
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth   = 1.5;
          ctx.stroke();
        });
      });
    }

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [landmarks, videoRef, detectFrame]);

  // ── Start handler ──────────────────────────────────────────────────────────
  async function handleStart() {
    await Tone.start();
    setActive(true);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      <video ref={videoRef} autoPlay playsInline muted style={{ display: 'none' }} />
      <canvas ref={canvasRef} className="camera-canvas" />
      {!isActive && (
        <button className="start-btn" onClick={handleStart}>
          Start
        </button>
      )}
    </div>
  );
}
