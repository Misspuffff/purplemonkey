/**
 * JamEngine.js
 *
 * Plays the AI jam partner's loop: one bar of 16 sixteenth-note steps for
 * kick / snare / hat / bass, driven by Tone.Transport.
 *
 * Claude replies arrive at arbitrary times (1–3 s round trips), so new patterns
 * are *queued* and swapped in on step 0 of the next bar — changes always land
 * on the downbeat instead of mid-phrase.
 *
 * The partner's voices sit a few dB under the performer's own drums
 * (PercussiveEngine) so the human stays in front.
 *
 * Visuals read `step` and `lastHits` each frame; both are updated through
 * Tone.Draw so they line up with what you hear, not with when it was scheduled.
 */

import * as Tone from 'tone';
import { masterBus } from './masterBus.js';
import { STARTER_PATTERN } from './patterns.js';

const lerp = (a, b, t) => a + (b - a) * t;
const VEL  = [0, 0.35, 0.65, 1];            // step value 0–3 → velocity
const PENTA = [null, 0, 3, 5, 7, 10, 12, 15]; // bass degree 1–7 → semitones (minor pentatonic)

export class JamEngine {
  /** Current 16th-note step (0–15), or -1 when stopped. Read by the renderer. */
  step = -1;
  /** performance.now() of the partner's most recent hit per voice. */
  lastHits = { kick: 0, snare: 0, hat: 0, bass: 0 };

  #pattern = STARTER_PATTERN;
  #pending = null;
  #running = false; // own flag — Tone's Sequence.state can read 'stopped' while it is firing
  #bassRoot = 'A1';
  #bus; #kick; #snare; #snareHP; #hat; #bass; #seq;

  constructor() {
    this.#bus = new Tone.Volume(-7).connect(masterBus);

    this.#kick = new Tone.MembraneSynth({
      pitchDecay: 0.06, octaves: 5,
      envelope: { attack: 0.001, decay: 0.35, sustain: 0 },
    }).connect(this.#bus);

    this.#snareHP = new Tone.Filter({ type: 'highpass', frequency: 1500 }).connect(this.#bus);
    this.#snare = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.001, decay: 0.14, sustain: 0 },
    }).connect(this.#snareHP);

    this.#hat = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.04, release: 0.01 },
      harmonicity: 5.1, modulationIndex: 40, resonance: 6000, octaves: 1,
      volume: -16,
    }).connect(this.#bus);

    this.#bass = new Tone.MonoSynth({
      oscillator: { type: 'sawtooth' },
      filter: { Q: 2, type: 'lowpass' },
      filterEnvelope: { attack: 0.005, decay: 0.15, sustain: 0.2, baseFrequency: 120, octaves: 2.5 },
      envelope: { attack: 0.005, decay: 0.2, sustain: 0.3, release: 0.15 },
      volume: -10,
    }).connect(this.#bus);

    this.#seq = new Tone.Sequence((time, step) => this.#tick(time, step),
      [...Array(16).keys()], '16n');
  }

  #tick(time, step) {
    if (step === 0 && this.#pending) {
      this.#pattern = this.#pending;
      this.#pending = null;
    }
    const p = this.#pattern;
    const hit = (voice) => Tone.Draw.schedule(() => { this.lastHits[voice] = performance.now(); }, time);

    if (p.kick[step])  { this.#kick.triggerAttackRelease('C1', '8n', time, VEL[p.kick[step]]); hit('kick'); }
    if (p.snare[step]) { this.#snare.triggerAttackRelease('16n', time, VEL[p.snare[step]]); hit('snare'); }
    if (p.hat[step])   { this.#hat.triggerAttackRelease('32n', time, VEL[p.hat[step]]); hit('hat'); }
    if (p.bass[step]) {
      const note = Tone.Frequency(this.#bassRoot).transpose(PENTA[p.bass[step]]).toNote();
      this.#bass.triggerAttackRelease(note, '16n', time, 0.8);
      hit('bass');
    }
    Tone.Draw.schedule(() => { this.step = step; }, time);
  }

  get isPlaying() { return this.#running; }
  get pattern()   { return this.#pending ?? this.#pattern; }

  /**
   * Replace the loop. Claude's patterns are queued for the next downbeat;
   * hand edits on the grid (immediate) apply on the very next step.
   */
  setPattern(pattern, { immediate = false } = {}) {
    if (this.isPlaying && !immediate) this.#pending = pattern;
    else { this.#pattern = pattern; this.#pending = null; }
  }

  /** Follow the Scene's tempo, swing and tuning. */
  applyScene(scene) {
    Tone.getTransport().bpm.value = scene.bpm; // direct — applyScene runs on every knob drag
    Tone.getTransport().swing = scene.drums.swing * 0.6;
    Tone.getTransport().swingSubdivision = '16n';
    this.#bassRoot = Tone.Frequency('A1').transpose(scene.drone.pitch).toNote();
    this.#kick.set({ envelope: { decay: lerp(0.15, 0.8, scene.drums.kickLength) } });
    this.#snareHP.frequency.value = lerp(500, 3500, scene.drums.snareTone);
  }

  start() {
    if (this.#running) return;
    this.#running = true;
    this.#seq.start(0);
    Tone.getTransport().start('+0.05');
  }

  stop() {
    this.#running = false;
    this.#seq.stop();
    Tone.getTransport().stop();
    this.step = -1;
  }

  dispose() {
    this.stop();
    [this.#seq, this.#kick, this.#snare, this.#snareHP, this.#hat, this.#bass, this.#bus]
      .forEach((n) => n?.dispose());
  }
}
