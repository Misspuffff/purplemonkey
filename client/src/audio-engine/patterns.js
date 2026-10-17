/**
 * audio-engine/patterns.js
 *
 * Step-sequencer pattern shape shared by the JamEngine, the store, the studio
 * grid and Claude's /api/jam replies: 16 sixteenth-note steps per lane.
 *   kick/snare/hat : 0 = rest, 1–3 = soft/medium/hard
 *   bass           : 0 = rest, 1–7 = minor-pentatonic degree over the drone root
 */

export const LANES = [
  { key: 'kick',  label: 'KICK',  max: 3 },
  { key: 'snare', label: 'SNARE', max: 3 },
  { key: 'hat',   label: 'HAT',   max: 3 },
  { key: 'bass',  label: 'BASS',  max: 7 },
];

/** A sparse, inviting groove — the sequencer's default and the jam opener. */
export const STARTER_PATTERN = {
  kick:  [3,0,0,0, 0,0,0,0, 2,0,0,0, 0,0,0,0],
  snare: [0,0,0,0, 2,0,0,0, 0,0,0,0, 2,0,0,1],
  hat:   [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
  bass:  [1,0,0,0, 0,0,0,0, 0,0,3,0, 0,0,0,0],
};
