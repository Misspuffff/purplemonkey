/**
 * GranularEngine.js
 *
 * Face-driven granular synthesizer built on Tone.GrainPlayer.
 * Loaded with /samples/ambientwub.wav, routed:
 *   GrainPlayer → Reverb → Lowpass → Highshelf → masterBus
 *
 * Two layers of control
 * ─────────────────────
 *   applyScene(drone)   — the Scene sets the *base* character (pitch, brightness,
 *                         space, density, how much head motion matters).
 *   update(face, pose)  — every RAF frame, the face plays *within* that character.
 *
 * Smoothing notes
 * ───────────────
 * Every parameter — Tone Signals (filter frequency/gain, reverb wet) and the
 * GrainPlayer's plain-number properties — uses per-frame EMA smoothing
 * (alpha ≈ 0.15, ~0.1 s time-constant at 60 fps) and is then written directly.
 * Scheduling a fresh .rampTo() every frame piles up overlapping automation
 * events; if the audio clock stalls (background tab) Tone interpolates between
 * events at the same instant and throws on NaN.
 *
 * Parameter mappings  (scene values in brackets)
 * ──────────────────
 *   jawOpen       → grainSize 0.05–2.0 s, lowpass opens from [brightness] floor to 18 kHz
 *   browInnerUp   → reverb wet from [space] floor to 1.0, detune +0–700 cents
 *   eyesClosed    → overlap from [density] floor to 0.95, reverb decay 0.3–12 s
 *   mouthSmile    → highshelf shimmer, added on top of [brightness] tilt
 *   headYaw       → playbackRate 2^(yaw × [motion])
 *   headPitch     → detune ±400 cents × [motion]
 *   [pitch]       → base transposition in semitones
 */

import * as Tone from 'tone';
import { masterBus } from './masterBus.js';
import { DEFAULT_SCENE } from '../scene/presets.js';

const lerp  = (a, b, t) => a + (b - a) * t;
const ALPHA = 0.15;  // EMA coefficient for plain-number properties (~0.1 s at 60 fps)

export class GranularEngine {
  #player         = null;
  #reverb         = null;
  #lowpass        = null;
  #shelf          = null;
  #running        = false;
  #loaded         = false;
  #startRequested = false;
  #drone          = DEFAULT_SCENE.drone;

  // Reverb.decay is not a Tone Signal — throttle IR rebuilds to ~once / 2 s
  #frameCount = 0;
  #lastDecay  = -1;

  // Current smoothed values for GrainPlayer plain-number properties
  #smooth = { grainSize: 0.1, overlap: 0.1, detune: 0, playbackRate: 1, cutoff: 2000, wet: 0.1, shelf: 0 };

  constructor() {
    // ── Signal chain (built back-to-front for easy connect()) ─────────────
    this.#shelf   = new Tone.Filter({ type: 'highshelf', frequency: 3000, gain: 0 }).connect(masterBus);
    this.#lowpass = new Tone.Filter({ type: 'lowpass', frequency: 2000, Q: 0.7 }).connect(this.#shelf);

    this.#reverb = new Tone.Reverb({
      decay:    0.5,
      wet:      0.1,
      preDelay: 0.01,
    }).connect(this.#lowpass);

    this.#player = new Tone.GrainPlayer({
      url:          '/samples/ambientwub.wav',
      loop:         true,
      grainSize:    0.1,
      overlap:      0.1,
      detune:       0,
      playbackRate: 1,
      onload: () => {
        this.#loaded = true;
        if (this.#startRequested) this.#doStart();
      },
      onerror: (err) => console.error('[GranularEngine] buffer error:', err),
    }).connect(this.#reverb);
  }

  // ── Private ───────────────────────────────────────────────────────────────

  #doStart() {
    this.#player.start();
    this.#running = true;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  start() {
    if (Tone.getContext().state !== 'running') {
      console.warn('[GranularEngine] start() called but AudioContext not running');
      return;
    }
    if (this.#running) return;

    if (this.#loaded) this.#doStart();
    else this.#startRequested = true; // buffer still loading — defer until onload
  }

  stop() {
    if (!this.#running) return;
    this.#player.stop();
    this.#running = false;
  }

  /** Set the drone's base character from a Scene. Face control continues on top. */
  applyScene(drone) {
    this.#drone = drone;
  }

  /**
   * Drive all synthesis parameters from the current face frame.
   * Safe to call when no face is detected (null values default to 0).
   *
   * @param {{ jawOpen, browInnerUp, eyesClosed, mouthSmile } | null} expressions
   * @param {{ yaw, pitch, roll } | null} headPose
   */
  update(expressions, headPose) {
    if (Tone.getContext().state !== 'running' || !this.#running) return;

    const jawOpen     = expressions?.jawOpen     ?? 0;
    const browInnerUp = expressions?.browInnerUp ?? 0;
    const eyesClosed  = expressions?.eyesClosed  ?? 0;
    const mouthSmile  = expressions?.mouthSmile  ?? 0;
    const yaw         = headPose?.yaw            ?? 0;
    const pitch       = headPose?.pitch          ?? 0;
    const d           = this.#drone;
    const s           = this.#smooth;

    // ── jawOpen → grainSize (EMA) + lowpass opening (Signal) ─────────────
    s.grainSize           += (lerp(0.05, 2.0, jawOpen) - s.grainSize) * ALPHA;
    this.#player.grainSize = s.grainSize;
    const cutoffFloor      = lerp(250, 3500, d.brightness);
    s.cutoff              += (cutoffFloor * Math.pow(18000 / cutoffFloor, jawOpen) - s.cutoff) * ALPHA;
    this.#lowpass.frequency.value = s.cutoff;

    // ── browInnerUp → reverb wet (Signal) + detune (EMA) ─────────────────
    s.wet                 += (lerp(d.space * 0.7, 1.0, browInnerUp) - s.wet) * ALPHA;
    this.#reverb.wet.value = s.wet;
    const detuneTarget = d.pitch * 100
      + lerp(0, 700, browInnerUp)
      + lerp(-400, 400, (pitch + 1) / 2) * d.motion;
    s.detune            += (detuneTarget - s.detune) * ALPHA;
    this.#player.detune  = s.detune;

    // ── eyesClosed → overlap (EMA) + reverb decay (throttled) ────────────
    s.overlap            += (lerp(lerp(0.05, 0.6, d.density), 0.95, eyesClosed) - s.overlap) * ALPHA;
    this.#player.overlap  = s.overlap;

    this.#frameCount++;
    const targetDecay = lerp(0.3 + d.space * 3, 12, eyesClosed);
    if (this.#frameCount % 60 === 0 && Math.abs(targetDecay - this.#lastDecay) > 0.3) {
      this.#reverb.decay = targetDecay;
      this.#reverb.generate().catch(() => {});
      this.#lastDecay = targetDecay;
    }

    // ── brightness tilt + mouthSmile shimmer → highshelf gain (Signal) ───
    s.shelf               += (lerp(-9, 6, d.brightness) + lerp(0, 18, mouthSmile) - s.shelf) * ALPHA;
    this.#shelf.gain.value = s.shelf;

    // ── headYaw → playbackRate (EMA), centred on 1× ──────────────────────
    s.playbackRate            += (Math.pow(2, yaw * d.motion) - s.playbackRate) * ALPHA;
    this.#player.playbackRate  = s.playbackRate;
  }

  dispose() {
    this.stop();
    this.#player?.dispose();
    this.#reverb?.dispose();
    this.#lowpass?.dispose();
    this.#shelf?.dispose();
    this.#player = this.#reverb = this.#lowpass = this.#shelf = null;
  }
}
