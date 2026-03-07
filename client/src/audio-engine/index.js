/**
 * audio-engine/index.js
 *
 * AudioEngine
 * ───────────
 * Manages one Tone.js Sampler per drum zone.  Each Sampler wraps a single
 * audio buffer loaded from /samples/{zone}/{file}.
 *
 * Design notes
 * ────────────
 * • We use Tone.Sampler (not Tone.Player) as requested.  Because Sampler
 *   expects a note-keyed URL map, we key every buffer to "C4" — one note per
 *   instrument — and trigger it with triggerAttackRelease("C4", …).
 *   This lets us pass a Tone velocity (0–1) directly for dynamics.
 *
 * • The AudioContext is suspended until the first user gesture.  We call
 *   Tone.start() inside trigger() on first use; subsequent calls are no-ops.
 *
 * • Each Sampler is routed through a Tone.Volume node so the per-zone dB
 *   offset from DRUM_MAP is applied before hitting the master output.
 *
 * • load() is async but trigger() is synchronous (fire-and-forget).  Calls
 *   arriving before all buffers are ready are silently dropped — the engine
 *   reports its ready state via the `ready` promise.
 *
 * Usage
 * ─────
 *   const engine = new AudioEngine();
 *   await engine.load();           // preload all buffers
 *   engine.trigger(gestureEvent);  // call on every GestureEvent
 *   engine.dispose();              // cleanup on unmount
 */

import * as Tone from 'tone';
import { DRUM_MAP, DRUM_ZONES } from './instruments/drums.js';

/**
 * How quickly (seconds) a sample fades after triggerRelease is called.
 * Short enough to feel like a crisp lift, long enough not to click.
 */
const RELEASE_TIME = 0.15;

// Base URL for sample files (Vite serves public/ at the root).
const SAMPLES_BASE = '/samples';

export class AudioEngine {
  /** @type {Record<string, Tone.Sampler>} */
  #samplers = {};

  /** @type {Record<string, Tone.Volume>} */
  #volumes = {};

  /** @type {boolean} */
  #toneStarted = false;

  /** @type {boolean} */
  #loaded = false;

  /**
   * Resolves when all samplers have finished loading their buffers.
   * @type {Promise<void>}
   */
  ready;

  constructor() {
    this.ready = this.#buildSamplers();
  }

  // ── Private ──────────────────────────────────────────────────────────────

  /**
   * Instantiate one Sampler per zone, wire through a Volume node, connect to
   * the master output, and wait for all buffers to load.
   * @returns {Promise<void>}
   */
  async #buildSamplers() {
    const loadPromises = DRUM_ZONES.map((zone) => {
      const { files, volume: dbGain } = DRUM_MAP[zone];
      const filename = files[0]; // primary sample

      return new Promise((resolve, reject) => {
        // Volume node for per-zone dB offset.
        const vol = new Tone.Volume(dbGain).toDestination();
        this.#volumes[zone] = vol;

        // Sampler keyed to C4 — one buffer, triggered at a single pitch.
        // attack:0 ensures the sample starts immediately on triggerAttack.
        // release controls the fade-out applied when triggerRelease is called.
        const sampler = new Tone.Sampler(
          { C4: `${SAMPLES_BASE}/${zone}/${filename}` },
          {
            onload: () => resolve(),
            onerror: (err) => {
              console.warn(`[AudioEngine] Failed to load sample for "${zone}":`, err);
              resolve(); // non-fatal — engine still functions for other zones
            },
            baseUrl: '',
            attack:  0,
            release: RELEASE_TIME,
          },
        ).connect(vol);

        this.#samplers[zone] = sampler;
      });
    });

    await Promise.all(loadPromises);
    this.#loaded = true;
    console.log('[AudioEngine] All samplers ready.');
  }

  /**
   * Ensure the AudioContext is running (browsers require a user gesture).
   * Safe to call repeatedly — Tone.start() is idempotent after the first call.
   */
  async #ensureToneStarted() {
    if (!this.#toneStarted) {
      await Tone.start();
      this.#toneStarted = true;
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Explicitly preload all buffers.  Awaiting this before the first trigger
   * avoids the ~100 ms decode stutter on the very first hit.
   *
   * Calling load() is optional — the constructor already starts loading;
   * this just gives callers a convenient await point.
   *
   * @returns {Promise<void>}
   */
  load() {
    return this.ready;
  }

  /**
   * Start playing a drum zone.  The note sustains until release() is called
   * or the sample's natural decay ends, whichever comes first.
   *
   * @param {{ zone: string, velocity: number }} event
   */
  trigger(event) {
    const { zone, velocity } = event;
    const sampler = this.#samplers[zone];
    if (!sampler || !this.#loaded) return;

    this.#ensureToneStarted().then(() => {
      const vel = Math.max(0.01, Math.min(1, velocity));
      sampler.triggerAttack('C4', Tone.now(), vel);
    });
  }

  /**
   * Release (fade out) the sample for the given zone.
   * Called when the hand leaves the zone after a strike.
   *
   * @param {string} zone  — drum zone name matching a key in DRUM_MAP
   */
  release(zone) {
    const sampler = this.#samplers[zone];
    if (!sampler || !this.#loaded) return;

    this.#ensureToneStarted().then(() => {
      sampler.triggerRelease('C4', Tone.now());
    });
  }

  /**
   * Release all Tone.js resources.  Call when the component unmounts.
   */
  dispose() {
    for (const zone of DRUM_ZONES) {
      this.#samplers[zone]?.dispose();
      this.#volumes[zone]?.dispose();
    }
    this.#samplers = {};
    this.#volumes  = {};
    this.#loaded   = false;
    console.log('[AudioEngine] Disposed.');
  }
}
