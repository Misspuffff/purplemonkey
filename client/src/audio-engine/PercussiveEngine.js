/**
 * PercussiveEngine.js
 *
 * The performer's drums, triggered by hand gestures:
 *   strike, lower half of frame → kick   (MembraneSynth)
 *   strike, upper half of frame → snare  (NoiseSynth through a filter + short body)
 *   fast horizontal swipe       → metal  (MetalSynth)
 *
 * Strike velocity (from gesture speed) scales loudness. applyScene() retunes all
 * three voices from the Scene's drum settings.
 * Per-hand debounce prevents rapid re-triggers.
 */

import * as Tone from 'tone';
import { masterBus } from './masterBus.js';
import { DEFAULT_SCENE } from '../scene/presets.js';

const DEBOUNCE_MS = 110;
const lerp = (a, b, t) => a + (b - a) * t;

export class PercussiveEngine {
  #kick      = null;
  #snare     = null;
  #snareBody = null;
  #snareHP   = null;
  #metal     = null;
  #kickNote  = 'C1';
  // Two slots: index 0 = first hand, index 1 = second hand
  #lastTrigger = [0, 0];

  constructor() {
    this.#kick = new Tone.MembraneSynth({
      pitchDecay: 0.3,
      octaves:    4,
      envelope:   { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 },
    }).connect(masterBus);

    this.#snareHP = new Tone.Filter({ type: 'highpass', frequency: 1800 }).connect(masterBus);
    this.#snare = new Tone.NoiseSynth({
      noise:    { type: 'white' },
      envelope: { attack: 0.001, decay: 0.18, sustain: 0 },
      volume:   -4,
    }).connect(this.#snareHP);
    this.#snareBody = new Tone.MembraneSynth({
      pitchDecay: 0.02,
      octaves:    2,
      envelope:   { attack: 0.001, decay: 0.08, sustain: 0 },
      volume:     -8,
    }).connect(masterBus);

    this.#metal = new Tone.MetalSynth({
      envelope:        { attack: 0.001, decay: 0.1, release: 0.01 },
      harmonicity:     5.1,
      modulationIndex: 32,
      resonance:       4000,
      octaves:         1.5,
      volume:          -6,
    }).connect(masterBus);
    this.#metal.frequency.value = 400;

    this.applyScene(DEFAULT_SCENE.drums);
  }

  #debounced(handIndex) {
    const now = performance.now();
    if (now - (this.#lastTrigger[handIndex] ?? 0) < DEBOUNCE_MS) return true;
    this.#lastTrigger[handIndex] = now;
    return false;
  }

  /** Retune all voices from a Scene's drum settings. */
  applyScene(drums) {
    this.#kickNote = Tone.Frequency('C1').transpose(drums.kickTune).toNote();
    this.#kick.set({
      pitchDecay: lerp(0.04, 0.3, drums.kickLength),
      envelope:   { decay: lerp(0.12, 1.0, drums.kickLength) },
    });

    const tone = drums.snareTone;
    this.#snare.set({
      noise:    { type: tone < 0.33 ? 'brown' : tone < 0.66 ? 'pink' : 'white' },
      envelope: { decay: lerp(0.28, 0.12, tone) },
    });
    this.#snareHP.frequency.value = lerp(400, 4000, tone);

    const m = drums.metalTone;
    this.#metal.frequency.value = lerp(150, 700, m);
    this.#metal.set({
      harmonicity: lerp(3.1, 8, m),
      resonance:   lerp(1500, 7000, m),
      envelope:    { decay: lerp(0.45, 0.08, m) },
    });
  }

  /**
   * Strike from a hand. zone comes from gesture-engine/drums.js quadrants:
   * upper zones (hihat/crash) play the snare, lower zones (snare/kick) the kick.
   *
   * @returns {'kick'|'snare'|null}  the drum that played, or null if debounced
   */
  triggerStrike(handIndex, zone, velocity = 0.8) {
    if (this.#debounced(handIndex)) return null;
    const vel  = Math.max(0.2, Math.min(1, velocity));
    const time = Tone.now();
    if (zone === 'hihat' || zone === 'crash') {
      this.#snare.triggerAttackRelease('16n', time, vel);
      this.#snareBody.triggerAttackRelease('G2', '32n', time, vel * 0.8);
      return 'snare';
    }
    this.#kick.triggerAttackRelease(this.#kickNote, '8n', time, vel);
    return 'kick';
  }

  /** @returns {boolean}  true if triggered, false if debounced */
  triggerSwipe(handIndex, velocity = 0.8) {
    if (this.#debounced(handIndex)) return false;
    this.#metal.triggerAttackRelease('8n', Tone.now(), Math.max(0.3, Math.min(1, velocity)));
    return true;
  }

  dispose() {
    [this.#kick, this.#snare, this.#snareBody, this.#snareHP, this.#metal].forEach((n) => n?.dispose());
    this.#kick = this.#snare = this.#snareBody = this.#snareHP = this.#metal = null;
  }
}
