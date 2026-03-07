/**
 * audio-engine/instruments/drums.js
 *
 * Maps every drum zone name to one or more sample file names that live under
 * /samples/{zone}/.  AudioEngine will resolve these at runtime using the
 * configured baseUrl for each zone.
 *
 * Adding a new sample
 * ───────────────────
 * 1. Drop the file into  client/public/samples/{zone}/
 * 2. Add its filename to the array below.
 * AudioEngine always plays `files[0]`; additional entries are reserved for
 * round-robin / random selection in future.
 *
 * Supported formats: .wav  .mp3  .ogg  .flac
 * (Tone.js picks whichever the browser supports via its buffer loading.)
 */

/** @typedef {'kick'|'snare'|'hihat'|'crash'} DrumZone */

/**
 * Per-zone sample configuration.
 *
 * @type {Record<DrumZone, {
 *   files: string[],          // filenames inside /samples/{zone}/
 *   volume: number,           // default dB gain (0 = unity)
 * }>}
 */
export const DRUM_MAP = {
  kick: {
    files: ['kick.wav'],
    volume: 2,           // kick benefits from a slight boost
  },
  snare: {
    files: ['snare.wav'],
    volume: 0,
  },
  hihat: {
    files: ['hihat.wav'],
    volume: -3,          // hi-hats are typically quieter in a mix
  },
  crash: {
    files: ['crash.wav'],
    volume: -2,
  },
};

/** Ordered list of all zones — useful for iteration. */
export const DRUM_ZONES = /** @type {DrumZone[]} */ (Object.keys(DRUM_MAP));
