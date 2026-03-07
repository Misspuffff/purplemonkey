/**
 * GranularEngine.js
 *
 * Face-driven granular synthesizer built on Tone.GrainPlayer.
 * Loaded with /samples/ambientwub.wav, routed:
 *   GrainPlayer → Reverb → Filter(highshelf) → Destination
 *
 * Call update(expressions, headPose) every RAF frame with values from useFaceMesh.
 *
 * Smoothing notes
 * ───────────────
 * Tone Signals (filter.frequency, filter.gain, reverb.wet) use .rampTo(value, 0.1)
 * for zipper-free transitions.  GrainPlayer properties (grainSize, overlap, detune,
 * playbackRate) are plain numbers in Tone.js v15 — they use per-frame EMA smoothing
 * (alpha ≈ 0.15, ~0.1 s time-constant at 60 fps) instead.
 *
 * Parameter mappings
 * ──────────────────
 *   jawOpen (0–1)      → grainSize  0.05–2.0 s
 *                      → filter.frequency  80–12000 hz
 *   browInnerUp (0–1)  → reverb.wet  0.0–1.0
 *                      → detune base  0–700 cents
 *   eyesClosed (0–1)   → overlap  0.05–0.95
 *                      → reverb.decay  0.3–12 s  (throttled, not a Signal)
 *   mouthSmile (0–1)   → filter.gain (highshelf)  0–24 dB
 *   headYaw (-1–1)     → playbackRate  0.5–2.0
 *   headPitch (-1–1)   → detune offset  -400–+400 cents  (additive with browInnerUp)
 */

import * as Tone from 'tone';

const lerp  = (a, b, t) => a + (b - a) * t;
const RAMP  = 0.1;   // seconds — for Tone Signal rampTo calls
const ALPHA = 0.15;  // EMA coefficient for plain-number properties (~0.1 s at 60 fps)

export class GranularEngine {
  #player         = null;
  #reverb         = null;
  #filter         = null;
  #running        = false;
  #loaded         = false;
  #startRequested = false;

  // Reverb.decay is not a Tone Signal — throttle IR rebuilds to ~once / 2 s
  #frameCount = 0;
  #lastDecay  = -1;

  // Current smoothed values for GrainPlayer plain-number properties
  #smooth = { grainSize: 0.1, overlap: 0.1, detune: 0, playbackRate: 1 };

  constructor() {
    // ── Signal chain (built back-to-front for easy connect()) ─────────────
    this.#filter = new Tone.Filter({
      type:      'highshelf',
      frequency: 200,
      gain:      0,
    }).toDestination();

    this.#reverb = new Tone.Reverb({
      decay:    0.5,
      wet:      0.1,
      preDelay: 0.01,
    }).connect(this.#filter);

    this.#player = new Tone.GrainPlayer({
      url:          '/samples/ambientwub.wav',
      loop:         true,
      grainSize:    0.1,
      overlap:      0.1,
      detune:       0,
      playbackRate: 1,
      onload: () => {
        this.#loaded = true;
        console.log('[GranularEngine] buffer loaded');
        if (this.#startRequested) this.#doStart();
      },
      onerror: (err) => console.error('[GranularEngine] buffer error:', err),
    }).connect(this.#reverb);
  }

  // ── Private ───────────────────────────────────────────────────────────────

  #doStart() {
    this.#player.start();
    this.#running = true;
    console.log('[GranularEngine] started');
  }

  // ── Public API ────────────────────────────────────────────────────────────

  start() {
    if (Tone.context.state !== 'running') {
      console.warn('[GranularEngine] start() called but AudioContext not running');
      return;
    }
    if (this.#running) return;

    if (this.#loaded) {
      this.#doStart();
    } else {
      // Buffer still loading — defer until onload fires
      this.#startRequested = true;
      console.log('[GranularEngine] start() deferred until buffer loads');
    }
  }

  stop() {
    if (!this.#running) return;
    this.#player.stop();
    this.#running = false;
    console.log('[GranularEngine] stopped');
  }

  /**
   * Drive all synthesis parameters from the current face frame.
   * Safe to call when no face is detected (null values default to 0).
   *
   * @param {{ jawOpen, browInnerUp, eyesClosed, mouthSmile } | null} expressions
   * @param {{ yaw, pitch, roll } | null} headPose
   */
  update(expressions, headPose) {
    if (Tone.context.state !== 'running' || !this.#running) return;

    const jawOpen     = expressions?.jawOpen     ?? 0;
    const browInnerUp = expressions?.browInnerUp ?? 0;
    const eyesClosed  = expressions?.eyesClosed  ?? 0;
    const mouthSmile  = expressions?.mouthSmile  ?? 0;
    const yaw         = headPose?.yaw            ?? 0;
    const pitch       = headPose?.pitch          ?? 0;

    // ── jawOpen → grainSize (EMA) + filter cutoff (Signal) ───────────────
    const s = this.#smooth;
    s.grainSize        += (lerp(0.05, 2.0, jawOpen) - s.grainSize) * ALPHA;
    this.#player.grainSize = s.grainSize;
    this.#filter.frequency.rampTo(lerp(80, 12000, jawOpen), RAMP);

    // ── browInnerUp → reverb wet (Signal) + detune base (EMA) ────────────
    this.#reverb.wet.rampTo(lerp(0.0, 1.0, browInnerUp), RAMP);
    const detuneTarget   = lerp(0, 700, browInnerUp) + lerp(-400, 400, (pitch + 1) / 2);
    s.detune            += (detuneTarget - s.detune) * ALPHA;
    this.#player.detune  = s.detune;

    // ── eyesClosed → overlap (EMA) + reverb decay (throttled) ────────────
    s.overlap            += (lerp(0.05, 0.95, eyesClosed) - s.overlap) * ALPHA;
    this.#player.overlap  = s.overlap;

    this.#frameCount++;
    const targetDecay = lerp(0.3, 12, eyesClosed);
    if (this.#frameCount % 60 === 0 && Math.abs(targetDecay - this.#lastDecay) > 0.3) {
      this.#reverb.decay = targetDecay;
      this.#reverb.generate().catch(() => {});
      this.#lastDecay = targetDecay;
    }

    // ── mouthSmile → highshelf gain (Signal) ──────────────────────────────
    this.#filter.gain.rampTo(lerp(0, 24, mouthSmile), RAMP);

    // ── headYaw → playbackRate (EMA) ─────────────────────────────────────
    s.playbackRate            += (lerp(0.5, 2.0, (yaw + 1) / 2) - s.playbackRate) * ALPHA;
    this.#player.playbackRate  = s.playbackRate;
  }

  dispose() {
    this.stop();
    this.#player?.dispose();
    this.#reverb?.dispose();
    this.#filter?.dispose();
    this.#player = null;
    this.#reverb = null;
    this.#filter = null;
    console.log('[GranularEngine] disposed');
  }
}
