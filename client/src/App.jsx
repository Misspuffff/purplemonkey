import { useCallback, useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import { useCamera } from './hooks/useCamera';
import { useMediaPipe } from './hooks/useMediaPipe';
import { useFaceMesh } from './hooks/useFaceMesh';
import { useRecorder } from './hooks/useRecorder';
import { useAppStore } from './store/instrumentStore';
import { GranularEngine } from './audio-engine/GranularEngine.js';
import { PercussiveEngine } from './audio-engine/PercussiveEngine.js';
import { JamEngine } from './audio-engine/JamEngine.js';
import { meter } from './audio-engine/masterBus.js';
import { detectDrumGesture } from './gesture-engine/drums.js';
import { calcVelocity } from './gesture-engine/velocity.js';
import { Renderer } from './visuals/renderer.js';
import { fetchClaudeStatus } from './brain/api.js';
import { createPerformanceLog, logHit, sampleFace } from './brain/performanceLog.js';
import { useJamPartner, useSequencer } from './brain/useJamPartner.js';
import { DebugPanel } from './components/DebugPanel.jsx';
import { StartScreen } from './components/StartScreen.jsx';
import { Studio } from './components/studio/Studio.jsx';
import './App.css';

// ── Constants ──────────────────────────────────────────────────────────────────

const SWIPE_THRESHOLD = 0.80; // normalized units/sec — horizontal wrist velocity
const SWIPE_MAX       = 2.8;  // velocity at which swipe loudness saturates

// Smoothed face: TOWARD_FACE tracks in ~6 frames; TOWARD_ZERO decays ~1 s at 60 fps.
const TOWARD_FACE = 0.15;
const TOWARD_ZERO = 0.05;
const FACE_KEYS   = ['jawOpen', 'browInnerUp', 'eyesClosed', 'mouthSmile'];

const PAD_KEYS = { z: 'kick', x: 'snare', c: 'metal' };

const isTyping = (e) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const { videoRef, status: cameraStatus } = useCamera();
  const { detectHands, isReady: handsReady } = useMediaPipe();
  const { detectFrame, isReady: faceReady }  = useFaceMesh();
  const canvasRef = useRef(null);
  const inputRef  = useRef(null);

  // All per-frame mutable state lives in refs — no re-renders inside the RAF loop
  const rendererRef      = useRef(null);
  const granularRef      = useRef(null);
  const audioRef         = useRef(null);
  const jamRef           = useRef(null);
  const perfLogRef       = useRef(createPerformanceLog());
  const prevLandmarksRef = useRef([]);   // previous frame (for velocity calc)
  const prevFrameTimeRef = useRef(0);      // first frame's delta is clamped below
  const smoothFaceRef    = useRef({ jawOpen: 0, browInnerUp: 0, eyesClosed: 0, mouthSmile: 0, yaw: 0, pitch: 0 });
  // Written by RAF loop each frame; read by DebugPanel every 100ms via interval.
  const debugRef         = useRef({ face: {}, gestures: [] });
  // Written by RAF loop each frame; read by the studio rack's meters and LEDs.
  const liveRef          = useRef({
    face: { jawOpen: 0, browInnerUp: 0, eyesClosed: 0, mouthSmile: 0, yaw: 0, pitch: 0 },
    level: 0, jam: null,
    hits: { kick: 0, snare: 0, metal: 0 },
    tracking: { face: false, hands: 0 },
  });
  const lastSceneIdRef   = useRef(0);

  const isActive  = useAppStore((s) => s.isActive);
  const setActive = useAppStore((s) => s.setActive);
  const scene     = useAppStore((s) => s.scene);
  const sceneId   = useAppStore((s) => s.sceneId);
  const [showDebug, setShowDebug] = useState(false);
  const [rackHidden, setRackHidden] = useState(false);
  const recorder = useRecorder(canvasRef);

  useJamPartner(jamRef, perfLogRef);

  // ── Is Claude configured on the server? ──────────────────────────────────
  useEffect(() => {
    fetchClaudeStatus().then((ok) => useAppStore.getState().setClaudeAvailable(ok));
  }, []);

  // ── Pads (click / tap / Z X C) — the drums without a camera ─────────────
  const triggerPad = useCallback((drum) => {
    const drums = audioRef.current;
    const canvas = canvasRef.current;
    if (!drums || !canvas) return;
    const PAD_HAND = 2; // own debounce slot, separate from the two tracked hands
    const vel = 0.85;
    const played = drum === 'metal'
      ? (drums.triggerSwipe(PAD_HAND, vel) ? 'metal' : null)
      : drums.triggerStrike(PAD_HAND, drum === 'snare' ? 'hihat' : 'kick', vel);
    if (!played) return;
    const { width: w, height: h } = canvas;
    if (played === 'metal') rendererRef.current?.onSwipe(w / 2, h / 2, Math.random() < 0.5 ? -1 : 1, vel);
    else rendererRef.current?.onStrike(w * (0.3 + Math.random() * 0.4), h * (played === 'kick' ? 0.7 : 0.3), played, vel);
    liveRef.current.hits[played] = performance.now();
    logHit(perfLogRef.current, played, vel, PAD_HAND);
  }, []);

  // ── Keyboard shortcuts (ignored while typing a vibe) ─────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (isTyping(e)) { if (e.key === 'Escape') e.target.blur(); return; }
      if (!useAppStore.getState().isActive) return;
      const k = e.key.toLowerCase();
      const { jam, setJam, seq, setSeq } = useAppStore.getState();
      if (e.target instanceof HTMLButtonElement && (k === ' ' || k === 'enter')) return;
      if (PAD_KEYS[k]) { if (!e.repeat) triggerPad(PAD_KEYS[k]); }
      else if (k === ' ') { e.preventDefault(); setSeq({ playing: !seq.playing }); }
      else if (k === 'd') setShowDebug((v) => !v);
      else if (k === 'h') setRackHidden((v) => !v);
      else if (k === 'r') recorder.toggle();
      else if (k === 'j') setJam({ enabled: !jam.enabled });
      else if (k === '/') { e.preventDefault(); inputRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [recorder, triggerPad]);

  // ── Keep audio unlocked ──────────────────────────────────────────────────
  // Browsers can suspend the AudioContext (iOS interruptions, background tabs);
  // any later click or key press is a valid gesture to resume it.
  useEffect(() => {
    if (!isActive) return;
    const resume = () => { if (Tone.getContext().state !== 'running') Tone.start(); };
    window.addEventListener('pointerdown', resume, true);
    window.addEventListener('keydown', resume, true);
    return () => {
      window.removeEventListener('pointerdown', resume, true);
      window.removeEventListener('keydown', resume, true);
    };
  }, [isActive]);

  // ── Audio engine lifecycle ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isActive) return;

    const granular   = new GranularEngine();
    const percussive = new PercussiveEngine();
    const jam        = new JamEngine();
    granularRef.current = granular;
    audioRef.current    = percussive;
    jamRef.current      = jam;

    const current = useAppStore.getState().scene;
    granular.applyScene(current.drone);
    percussive.applyScene(current.drums);
    jam.applyScene(current);
    granular.start();
    const live = liveRef.current;
    live.jam = jam;

    return () => {
      live.jam = null;
      granular.dispose();
      percussive.dispose();
      jam.dispose();
      granularRef.current = audioRef.current = jamRef.current = null;
    };
  }, [isActive]);

  // Sequencer ↔ JamEngine (declared after engine creation so the engine exists)
  useSequencer(jamRef);

  // ── Scene changes → engines + renderer ───────────────────────────────────
  // Knob tweaks change `scene` but not `sceneId`; only new patches get the title card.
  useEffect(() => {
    granularRef.current?.applyScene(scene.drone);
    audioRef.current?.applyScene(scene.drums);
    jamRef.current?.applyScene(scene);
    const announce = sceneId !== lastSceneIdRef.current;
    lastSceneIdRef.current = sceneId;
    rendererRef.current?.setScene(scene, announce);
  }, [scene, sceneId]);

  // ── Main RAF draw loop ─────────────────────────────────────────────────────
  // Runs once on mount; all per-frame data is read via refs.
  useEffect(() => {
    const canvas = canvasRef.current;
    const video  = videoRef.current;
    if (!canvas || !video) return;

    const renderer = new Renderer(canvas);
    renderer.setScene(useAppStore.getState().scene, false);
    rendererRef.current = renderer;

    let rafId;

    function draw() {
      rafId = requestAnimationFrame(draw);

      const now = performance.now();
      // Clamp deltaMs so a backgrounded tab doesn't produce huge velocity spikes
      const deltaMs = Math.min(now - prevFrameTimeRef.current, 100);
      prevFrameTimeRef.current = now;

      // Sync canvas dimensions to the live video (16:9 placeholder without a camera,
      // so pads and the sequencer still drive the visuals)
      const hasVideo = video.videoWidth > 0;
      const targetW = hasVideo ? video.videoWidth : 1280;
      const targetH = hasVideo ? video.videoHeight : 720;
      if (canvas.width  !== targetW) canvas.width  = targetW;
      if (canvas.height !== targetH) canvas.height = targetH;
      const w = canvas.width;
      const h = canvas.height;

      // ── Face inference + expression smoothing ────────────────────────────
      const face = hasVideo ? detectFrame(video, now) : null;
      const sf   = smoothFaceRef.current;
      if (face) {
        FACE_KEYS.forEach((k) => { sf[k] += (face.blendshapes[k] - sf[k]) * TOWARD_FACE; });
        sf.yaw   += (face.headPose.yaw   - sf.yaw)   * TOWARD_FACE;
        sf.pitch += (face.headPose.pitch - sf.pitch) * TOWARD_FACE;
      } else {
        [...FACE_KEYS, 'yaw', 'pitch'].forEach((k) => { sf[k] *= (1 - TOWARD_ZERO); });
      }

      granularRef.current?.update(sf, sf);
      if (face) sampleFace(perfLogRef.current, sf);
      debugRef.current.face = sf;

      // ── Hand gestures → drums + visuals ──────────────────────────────────
      const hands = hasVideo ? detectHands(video, now) : [];
      const prev  = prevLandmarksRef.current;
      const drums = audioRef.current;

      if (drums && deltaMs > 0) {
        hands.forEach((lm, handIndex) => {
          const prevLm = prev[handIndex];
          if (!prevLm || prevLm.length !== lm.length) return;
          const wrist = lm[0];
          const x = (1 - wrist.x) * w;
          const y = wrist.y * h;

          // Strike — drums.js emits STRIKE with quadrant zone + velocity
          detectDrumGesture(lm, prevLm, deltaMs, handIndex).forEach((evt) => {
            if (evt.type !== 'STRIKE') return;
            const drum = drums.triggerStrike(handIndex, evt.zone, evt.velocity);
            if (!drum) return;
            rendererRef.current.onStrike(x, y, drum, evt.velocity);
            liveRef.current.hits[drum] = now;
            logHit(perfLogRef.current, drum, evt.velocity, handIndex);
            pushDebug(debugRef, drum.toUpperCase(), handIndex, now);
          });

          // Swipe — wrist horizontal velocity past threshold
          const wristVx = calcVelocity(lm, prevLm, deltaMs)[0]?.vx ?? 0;
          if (Math.abs(wristVx) > SWIPE_THRESHOLD) {
            const velocity = Math.min(1, (Math.abs(wristVx) - SWIPE_THRESHOLD) / (SWIPE_MAX - SWIPE_THRESHOLD) + 0.3);
            // Landmarks are unmirrored: +vx in camera space is leftward on screen
            const dir = wristVx > 0 ? -1 : 1;
            if (drums.triggerSwipe(handIndex, velocity)) {
              rendererRef.current.onSwipe(x, y, dir, velocity);
              liveRef.current.hits.metal = now;
              logHit(perfLogRef.current, 'metal', velocity, handIndex);
              pushDebug(debugRef, 'SWIPE', handIndex, now);
            }
          }
        });
      }
      prevLandmarksRef.current = hands;

      // ── Live readouts for the rack ────────────────────────────────────────
      const live = liveRef.current;
      live.face  = sf;
      live.level = audioRef.current ? Number(meter.getValue()) || 0 : 0;
      live.tracking.face  = Boolean(face);
      live.tracking.hands = hands.length;

      // ── Draw ──────────────────────────────────────────────────────────────
      const jam = jamRef.current;
      renderer.draw({
        video: hasVideo ? video : null, now, hands,
        faceLandmarks: face?.landmarks ?? null,
        face: sf,
        level: live.level,
        jam: jam?.isPlaying ? { step: jam.step, lastHits: jam.lastHits } : null,
      });
    }

    rafId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafId);
      rendererRef.current = null;
    };
  }, [videoRef, detectFrame, detectHands]);

  // ── Start handler ──────────────────────────────────────────────────────────
  async function handleStart() {
    await Tone.start();
    setActive(true);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const [, primary, accent] = scene.visuals.palette;
  return (
    <main className={`app ${isActive ? 'is-active' : ''}`} style={{ '--primary': primary, '--accent': accent }}>
      <video ref={videoRef} autoPlay playsInline muted hidden />
      <div className="stage">
        <canvas ref={canvasRef} className="stage__canvas" aria-label="Live camera with visual effects" />
        {isActive && showDebug && <DebugPanel debugRef={debugRef} />}
      </div>
      {isActive ? (
        <Studio
          live={liveRef}
          inputRef={inputRef}
          onPad={triggerPad}
          onToggleRecord={recorder.toggle}
          collapsed={rackHidden}
          onToggleCollapsed={() => setRackHidden((v) => !v)}
        />
      ) : (
        <StartScreen
          cameraStatus={cameraStatus}
          modelsReady={handsReady && faceReady}
          onStart={handleStart}
        />
      )}
    </main>
  );
}

function pushDebug(debugRef, type, hand, t) {
  const dg = debugRef.current.gestures;
  dg.unshift({ type, hand, t });
  if (dg.length > 5) dg.pop();
}
