/**
 * audio-engine/PianoEngine.js
 *
 * One Tone.Sampler that covers all 24 notes in C3–B4.
 * Tone interpolates pitch from the sparse sample set in PIANO_SAMPLES.
 *
 * Interface matches AudioEngine so App.jsx can call the same
 * load() / trigger(evt) / release(note) / dispose() pattern.
 *
 * trigger() handles NOTE_ON   — calls sampler.triggerAttack(note, now, vel)
 * release() handles NOTE_OFF  — calls sampler.triggerRelease(note, now)
 */

import * as Tone from 'tone';
import { PIANO_SAMPLES } from './instruments/piano.js';

const SAMPLES_BASE = '/samples/piano';

export class PianoEngine {
  /** @type {Tone.Sampler | null} */
  #sampler = null;

  /** @type {Tone.Reverb | null} */
  #reverb = null;

  /** @type {boolean} */
  #toneStarted = false;

  /** @type {boolean} */
  #loaded = false;

  /** @type {Promise<void>} */
  ready;

  constructor() {
    this.ready = this.#build();
  }

  async #build() {
    // Light reverb — gives piano samples space without being muddy.
    this.#reverb = new Tone.Reverb({ decay: 1.8, wet: 0.25 }).toDestination();
    await this.#reverb.ready; // Reverb needs a moment to generate its IR

    return new Promise((resolve) => {
      // Build the urls map: { 'C3': '/samples/piano/C3.mp3', … }
      const urls = Object.fromEntries(
        Object.entries(PIANO_SAMPLES).map(([note, file]) => [
          note,
          `${SAMPLES_BASE}/${file}`,
        ]),
      );

      console.log('[PianoEngine] Loading samples:', urls);

      this.#sampler = new Tone.Sampler(urls, {
        onload: () => {
          this.#loaded = true;
          console.log('[PianoEngine] Sampler ready ✓');
          resolve();
        },
        onerror: (err) => {
          // Mark loaded anyway so trigger() isn't silently blocked —
          // samples that did load will still play.
          this.#loaded = true;
          console.warn('[PianoEngine] Sample load error (partial load):', err);
          resolve();
        },
        baseUrl: '',
        attack: 0.005,
        release: 1.2,
      }).connect(this.#reverb);
    });
  }

  async #ensureToneStarted() {
    if (!this.#toneStarted) {
      await Tone.start();
      this.#toneStarted = true;
    }
  }

  load() {
    return this.ready;
  }

  /**
   * Handle a NOTE_ON gesture event.
   * @param {{ type: 'NOTE_ON', note: string, velocity: number }} event
   */
  trigger(event) {
    if (event.type !== 'NOTE_ON') return;
    if (!this.#loaded || !this.#sampler) {
      console.warn('[PianoEngine] trigger() called before ready — loaded:', this.#loaded);
      return;
    }

    this.#ensureToneStarted().then(() => {
      const vel = Math.max(0.01, Math.min(1, event.velocity));
      console.log('[PianoEngine] triggerAttack', event.note, vel.toFixed(3));
      this.#sampler.triggerAttack(event.note, Tone.now(), vel);
    });
  }

  /**
   * Handle a NOTE_OFF gesture event — release a sustained note.
   * @param {string} note  e.g. 'C4'
   */
  release(note) {
    if (!this.#loaded || !this.#sampler) return;

    this.#ensureToneStarted().then(() => {
      this.#sampler.triggerRelease(note, Tone.now());
    });
  }

  dispose() {
    this.#sampler?.dispose();
    this.#reverb?.dispose();
    this.#sampler = null;
    this.#reverb  = null;
    this.#loaded  = false;
    console.log('[PianoEngine] Disposed.');
  }
}
