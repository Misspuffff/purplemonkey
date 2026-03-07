/**
 * audio-engine/instruments/piano.js
 *
 * Sample map for the piano Tone.Sampler — 2 octaves, C3–B4.
 *
 * Tone.Sampler interpolates pitch between provided samples, so we only need
 * one sample per octave boundary to cover the full range with acceptable
 * quality.  Providing C3, F#3, C4, F#4, and B4 gives ≤6 semitones of
 * stretch at any point, which is imperceptible for short sustain.
 *
 * Sample files live in /samples/piano/ and should be named to match the
 * keys below (e.g. C3.mp3, Fs3.mp3 …).  We use the Tone.js convention of
 * writing sharps as the note letter followed by 's' (Fs = F#).
 *
 * Dropping in samples
 * ────────────────────
 * Place .mp3 (or .wav/.ogg) files in client/public/samples/piano/.
 * A recommended free source: https://tonejs.github.io/audio/salamander/
 * (Salamander Grand Piano — CC-BY licence).
 * Download: A0.mp3 C1.mp3 … through to C8.mp3 — or just the subset below.
 */

/** @typedef {Record<string, string>} NoteFileMap  note-name → filename */

/**
 * Sparse set of sampled notes covering C3–B4.
 * Tone.Sampler will pitch-shift to fill the gaps.
 *
 * @type {NoteFileMap}
 */
export const PIANO_SAMPLES = {
  C3:   'C3.mp3',
  'F#3': 'F#3.mp3',
  C4:   'C4.mp3',
  'F#4': 'F#4.mp3',
  B4:   'B4.wav',
};

/**
 * All 24 notes in two octaves (C3–B4), in ascending order.
 * Used by the gesture engine to map horizontal position → note name.
 *
 * @type {string[]}
 */
export const KEYBOARD_NOTES = [
  'C3','C#3','D3','D#3','E3','F3','F#3','G3','G#3','A3','A#3','B3',
  'C4','C#4','D4','D#4','E4','F4','F#4','G4','G#4','A4','A#4','B4',
];

/** Notes that are black keys (sharps/flats). */
export const BLACK_KEYS = new Set([
  'C#3','D#3','F#3','G#3','A#3',
  'C#4','D#4','F#4','G#4','A#4',
]);

/** Number of white keys across the 2-octave range (7 per octave × 2). */
export const WHITE_KEY_COUNT = 14;

/**
 * Map each note name to its white-key index (0-based).
 * Used to compute horizontal pixel positions for key drawing and hit-testing.
 *
 * @type {Record<string, number>}
 */
export const WHITE_KEY_INDEX = (() => {
  const map = {};
  let wi = 0;
  for (const note of KEYBOARD_NOTES) {
    if (!BLACK_KEYS.has(note)) {
      map[note] = wi++;
    }
  }
  return map;
})();
