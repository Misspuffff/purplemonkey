/**
 * gesture-engine/piano.js
 *
 * Virtual piano gesture detector.
 *
 * Keyboard layout (drawn by App.jsx on the canvas)
 * ─────────────────────────────────────────────────
 * The keyboard occupies the bottom third of the canvas (y ∈ [2/3, 1]).
 * The "trigger line" is at y = KB_TOP (the top edge of the keyboard strip).
 * 24 notes (C3–B4, 14 white keys) are laid out horizontally across the full
 * canvas width.
 *
 * Detection logic (per fingertip, per frame)
 * ──────────────────────────────────────────
 * Fingertips tracked: landmarks 8 (index), 12 (middle), 16 (ring), 20 (pinky).
 *
 * State machine per finger slot (handIndex × fingertipIdx):
 *
 *   IDLE ──[tip enters keyboard zone with vy > THRESHOLD]──▶ ACTIVE(note)
 *                                                               │
 *   ACTIVE ──[tip moves above keyboard line]──────────────────▶ IDLE
 *               └──(emits NOTE_OFF)
 *
 * On IDLE→ACTIVE transition:   emit  { type:'NOTE_ON',  note, velocity }
 * On ACTIVE→IDLE transition:   emit  { type:'NOTE_OFF', note }
 *
 * Multiple fingers can be active simultaneously (chords).
 *
 * Coordinate conventions
 * ──────────────────────
 * All landmark x/y are in MediaPipe normalised space [0,1].
 * x is mirrored (1-x) before use so it matches the canvas display.
 * y increases downward; KB_TOP ≈ 0.667 (top of bottom-third strip).
 */

import { calcVelocity } from './velocity.js';
import {
  KEYBOARD_NOTES,
  BLACK_KEYS,
  WHITE_KEY_COUNT,
  WHITE_KEY_INDEX,
} from '../audio-engine/instruments/piano.js';

// ── Layout constants (must match drawPianoOverlay in App.jsx) ─────────────────

/**
 * Normalised Y of the top edge of the keyboard strip.
 * 0.58 places the trigger line roughly at mid-torso height in a typical
 * webcam view — right where hands naturally hover when resting on a desk.
 * (Was 2/3 ≈ 0.667, which pushed the keyboard too low.)
 */
export const KB_TOP = 0.58;

/** Normalised Y of the bottom edge (= 1, i.e. bottom of the canvas). */
export const KB_BOTTOM = 1;

/**
 * Normalised Y of the top of the "aim band" — 14% above the trigger line.
 * If the WRIST rises above this, the whole hand has clearly left the play area
 * and all active notes for that hand are force-released immediately.
 */
export const KB_AIM_TOP = KB_TOP - 0.14;

// ── Detection tuning ──────────────────────────────────────────────────────────

/**
 * Minimum downward fingertip vy (nu/s) to register a key press.
 * 0.20 catches gentle taps; the hysteresis entry zone (KB_ENTRY below)
 * prevents slow drift from false-triggering at this lower threshold.
 */
export const PIANO_STRIKE_THRESHOLD = 0.20;

/**
 * How far below KB_TOP (in normalised units) the fingertip must be when
 * the strike is detected.  Prevents a slow drift right at the boundary
 * from triggering at the lower threshold — the finger must commit slightly
 * into the zone before a NOTE_ON fires.
 */
const KB_ENTRY_MARGIN = 0.015; // ~1% of canvas height below trigger line

/**
 * Velocity at which output velocity saturates to 1.0.
 * Tighter window so moderate strikes produce a clearly audible velocity.
 */
const MAX_VY = 2.0;

/**
 * The NOTE_OFF logic uses THREE independent mechanisms.  A note releases
 * as soon as ANY of these is true:
 *
 *  1. exitedZone   — fingertip y has risen back near or above KB_TOP
 *                    (position-based; primary release for both taps AND holds).
 *  2. liftedInZone — fingertip is still deep in the zone but moving upward
 *                    faster than RELEASE_THRESHOLD (velocity-based; catches
 *                    sharp reversals mid-zone from quick taps).
 *  3. heldTooLong  — finger has been ACTIVE longer than MAX_HOLD_MS with no
 *                    position-based release (timeout safety net for stuck notes).
 *
 * RELEASE_THRESHOLD: -0.30 nu/s upward.
 *   • Natural hand tremor while holding a key produces jitter of ~±0.1–0.2 nu/s
 *     at 30 fps.  At -0.12 that jitter caused false releases during long holds.
 *   • -0.30 requires a clear intentional reversal, not tremor.
 *   • Gentle lifts are still caught by exitedZone (finger rises near KB_TOP).
 */
const RELEASE_THRESHOLD = -0.30;

/**
 * Maximum time a note can stay ACTIVE before force-releasing.
 * 4000 ms allows musical holds (sustained chords, drones) while still
 * catching truly stuck notes (finger left frame without clean exit).
 * (Was 500 ms — too short for any intentional hold.)
 */
const MAX_HOLD_MS = 4000;

/**
 * Minimum ms between NOTE_ON events for the same finger.
 * 120 ms: fast enough for quick repeated taps, long enough to stop jitter.
 */
const FINGER_COOLDOWN_MS = 120;

/** Fingertip landmark indices. */
const FINGERTIPS = [8, 12, 16, 20]; // index, middle, ring, pinky

// ── Per-finger state ──────────────────────────────────────────────────────────

// Key: `${handIndex}:${tipIdx}` → note string | null (null = IDLE)
const fingerState = {};

// Key: `${handIndex}:${tipIdx}` → DOMHighResTimeStamp of last NOTE_ON
const fingerLastOn = {};

// Key: `${handIndex}:${tipIdx}` → DOMHighResTimeStamp when current ACTIVE note began
// Used to force-release notes that stick longer than MAX_HOLD_MS.
const fingerHeldSince = {};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Given a mirrored normalised x ∈ [0,1], return the note name of the key
 * directly under that horizontal position.
 *
 * The 14 white keys span the full width.  Black keys sit between white keys
 * at fixed offsets matching standard piano layout.
 *
 * @param {number} nx  mirrored normalised x
 * @returns {string}   note name, e.g. 'C4'
 */
function noteAtX(nx) {
  // Which white-key slot is the finger over?
  const whiteSlot = nx * WHITE_KEY_COUNT; // 0 … 14

  // Walk notes in order; for each white key check if a black key between
  // this white key and the previous one captures the position.
  // Black keys occupy the right 60% of the gap between adjacent white keys
  // (piano convention: black key centered on the join, ±30% of white width).
  const whiteWidth = 1 / WHITE_KEY_COUNT;

  for (const note of KEYBOARD_NOTES) {
    if (BLACK_KEYS.has(note)) continue;
    const wi = WHITE_KEY_INDEX[note];
    const leftEdge  = wi * whiteWidth;
    const rightEdge = leftEdge + whiteWidth;
    const noteIdx   = KEYBOARD_NOTES.indexOf(note);

    // Check the black key to the right of this white key (if any).
    const nextNote = KEYBOARD_NOTES[noteIdx + 1];
    if (nextNote && BLACK_KEYS.has(nextNote)) {
      const blackCenter = rightEdge;
      const blackHalf   = whiteWidth * 0.3;
      if (nx >= blackCenter - blackHalf && nx < blackCenter + blackHalf) {
        return nextNote;
      }
    }

    // Otherwise hit-test the white key body.
    // Shrink edges slightly inward so the white key doesn't steal black key hits.
    const shrink = whiteWidth * 0.15;
    if (nx >= leftEdge + shrink && nx < rightEdge - shrink) {
      return note;
    }
  }

  // Clamp to edge notes if nothing matched (off-screen).
  return nx < 0.5 ? KEYBOARD_NOTES[0] : KEYBOARD_NOTES[KEYBOARD_NOTES.length - 1];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * @typedef {{ type: 'NOTE_ON',  note: string, velocity: number, fingerKey: string }} NoteOnEvent
 * @typedef {{ type: 'NOTE_OFF', note: string, fingerKey: string }} NoteOffEvent
 * @typedef {NoteOnEvent | NoteOffEvent} PianoEvent
 */

/**
 * detectPianoGesture
 *
 * Call once per animation frame per detected hand.
 *
 * @param {Array<{x,y,z}>} landmarks      21 landmarks for this hand (current)
 * @param {Array<{x,y,z}>} prevLandmarks  21 landmarks for this hand (previous)
 * @param {number}          deltaMs        ms elapsed between the two frames
 * @param {number}          handIndex      0 or 1
 *
 * @returns {PianoEvent[]}  Array of NOTE_ON / NOTE_OFF events (may be empty).
 */
export function detectPianoGesture(landmarks, prevLandmarks, deltaMs, handIndex = 0) {
  if (!landmarks?.length || !prevLandmarks?.length || deltaMs <= 0) return [];

  // ── Wrist-based hand-exit: if the wrist rises above the aim band top, the
  // whole hand has left the play zone — force-release all active notes and
  // return early (no new notes while the hand is above the play area).
  const wrist = landmarks[0];
  if (wrist && wrist.y < KB_AIM_TOP) {
    const cutEvents = [];
    FINGERTIPS.forEach((tipIdx) => {
      const key  = `${handIndex}:${tipIdx}`;
      const note = fingerState[key] ?? null;
      if (note !== null) {
        cutEvents.push({ type: 'NOTE_OFF', note, fingerKey: key });
        fingerState[key] = null;
        delete fingerHeldSince[key];
      }
    });
    return cutEvents;
  }

  const velocities = calcVelocity(landmarks, prevLandmarks, deltaMs);
  if (!velocities.length) return [];

  const events = [];

  FINGERTIPS.forEach((tipIdx) => {
    const key     = `${handIndex}:${tipIdx}`;
    const tip     = landmarks[tipIdx];
    const tipVel  = velocities[tipIdx];

    if (!tip || !tipVel) return;

    // Mirror x to match the canvas display.
    const nx = 1 - tip.x;
    const ny = tip.y;

    // inKeyboard: finger is below the trigger line.
    const inKeyboard = ny >= KB_TOP && ny <= KB_BOTTOM;

    // committedEntry: finger is far enough below KB_TOP that slow drift
    // won't false-trigger at the lower PIANO_STRIKE_THRESHOLD.
    const committedEntry = ny >= KB_TOP + KB_ENTRY_MARGIN;

    // nearTopEdge: finger has risen back close to the trigger line — used to
    // fire NOTE_OFF slightly before the finger fully exits, so releases feel
    // crisp rather than delayed.
    const nearTopEdge = ny < KB_TOP + KB_ENTRY_MARGIN;

    const currentNote = fingerState[key] ?? null;
    const now = performance.now();

    if (currentNote === null) {
      // IDLE — fire NOTE_ON when finger has committed into the zone with
      // enough downward velocity to be intentional.
      if (committedEntry && tipVel.vy > PIANO_STRIKE_THRESHOLD) {
        const lastOn = fingerLastOn[key] ?? 0;
        if (now - lastOn < FINGER_COOLDOWN_MS) return;

        const note = noteAtX(nx);
        fingerState[key]     = note;
        fingerLastOn[key]    = now;
        fingerHeldSince[key] = now;

        const rawVel   = Math.min(1, (tipVel.vy - PIANO_STRIKE_THRESHOLD) / (MAX_VY - PIANO_STRIKE_THRESHOLD));
        const velocity = Math.max(0.05, Math.round(rawVel * 1000) / 1000);

        events.push({ type: 'NOTE_ON', note, velocity, fingerKey: key });
      }
    } else {
      // ACTIVE — release as soon as ANY condition is met:
      //   a) exitedZone:   finger has risen above or very near KB_TOP (position).
      //   b) liftedInZone: clear upward velocity while still in zone (velocity).
      //   c) heldTooLong:  timeout safety net — prevents permanent stuck notes.
      const exitedZone   = !inKeyboard || nearTopEdge;
      const liftedInZone = inKeyboard && !nearTopEdge && tipVel.vy < RELEASE_THRESHOLD;
      const heldTooLong  = (now - (fingerHeldSince[key] ?? now)) > MAX_HOLD_MS;

      if (exitedZone || liftedInZone || heldTooLong) {
        events.push({ type: 'NOTE_OFF', note: currentNote, fingerKey: key });
        fingerState[key]     = null;
        delete fingerHeldSince[key];
      }
    }
  });

  return events;
}

/**
 * resetPianoState
 *
 * Force all fingers to IDLE.  Call when switching away from the piano
 * instrument so stale NOTE_ON state doesn't linger.
 *
 * @param {(note: string) => void} releaseCallback  called for every active note
 */
export function resetPianoState(releaseCallback) {
  for (const [key, note] of Object.entries(fingerState)) {
    if (note !== null) {
      releaseCallback?.(note);
      fingerState[key] = null;
    }
  }
  // Clear all per-finger timestamps so the next session starts fresh.
  for (const key of Object.keys(fingerLastOn))    delete fingerLastOn[key];
  for (const key of Object.keys(fingerHeldSince)) delete fingerHeldSince[key];
}
