/**
 * masterBus.js
 *
 * Shared Tone.js output bus. All audio engines connect here rather than
 * directly to Tone.Destination, so we get a single -3 dB limiter across
 * the full mix (granular + percussive + jam partner).
 *
 * Also exposes:
 *   • meter              — 0–1 level, read each frame for audio-reactive visuals
 *   • getRecordingStream — a MediaStream of the mix, for the recorder
 *
 * Instantiated at module load time — safe because Tone.js suspends the
 * AudioContext until Tone.start() is called by the user gesture.
 */

import * as Tone from 'tone';

export const masterBus = new Tone.Limiter(-3).toDestination();

export const meter = new Tone.Meter({ normalRange: true, smoothing: 0.85 });
masterBus.connect(meter);

let recordingDest = null;

/** Lazily tap the master bus into a MediaStream (once per page). */
export function getRecordingStream() {
  if (!recordingDest) {
    recordingDest = Tone.getContext().rawContext.createMediaStreamDestination();
    masterBus.connect(recordingDest);
  }
  return recordingDest.stream;
}
