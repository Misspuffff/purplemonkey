/**
 * drums.js
 *
 * Detects drum-strike gestures from MediaPipe hand landmarks.
 *
 * Detection strategy
 * ──────────────────
 * Two landmarks are tracked per hand:
 *   • Wrist (0)       — captures full-arm downward strikes.
 *   • Middle MCP (9)  — captures wrist-rotation flicks where the knuckles
 *                       whip downward while the wrist itself barely moves.
 * A STRIKE fires when max(wristVy, mcpVy) exceeds STRIKE_THRESHOLD.
 *
 * Hold-to-sustain
 * ───────────────
 * After a STRIKE the engine tracks which quadrant the hand occupies.  When
 * the hand leaves that quadrant (or holds longer than MAX_HOLD_MS), a RELEASE
 * event is emitted.  The audio engine uses triggerAttack on STRIKE and
 * triggerRelease on RELEASE, so the sound duration follows the hand gesture:
 *   short tap  → punchy, short sound
 *   held hand  → sustained ring until you lift or move zones
 *
 * Zone mapping  (using wrist X/Y position at the moment of the strike)
 * ───────────────────────────────────────────────────────────────────────
 *     left half   |  right half
 *   ──────────────┼──────────────
 *    upper-left   | upper-right      →  hihat  | crash
 *   ──────────────┼──────────────
 *    lower-left   | lower-right      →  snare  | kick
 *
 * Return value
 * ────────────
 * detectDrumGesture returns DrumEvent[] (may be empty).
 * Event types:
 *   { type:'STRIKE',  hit:true, zone, velocity, handIndex, timestamp }
 *   { type:'RELEASE', zone, handIndex, holdMs, timestamp }
 */

import { calcVelocity } from './velocity.js';

// ── Tuning constants ──────────────────────────────────────────────────────────

/**
 * Minimum effective downward velocity (nu/s) to register a strike.
 * 0.60 catches light taps and quick flicks; the multi-landmark detection
 * below provides the noise immunity that previously required a higher threshold.
 * (Was 0.8 — too high for gentle taps and short flick gestures.)
 */
export const STRIKE_THRESHOLD = 0.60;

/**
 * Velocity at which the output `velocity` saturates to 1.0.
 * Tighter window (was 4.0) so moderate strikes produce clearly audible hits.
 */
const MAX_VY = 2.5;

/**
 * Minimum ms between two strikes on the same hand (prevents double-triggers).
 * 100 ms allows fast rolls/flams while still blocking jitter re-fires.
 * (Was 150 ms.)
 */
const COOLDOWN_MS = 100;

// ── Detection landmarks ───────────────────────────────────────────────────────

/**
 * Wrist landmark — captures full-arm downward strikes.
 */
const WRIST = 0;

/**
 * Middle-finger MCP (knuckle) landmark — captures wrist-rotation flicks where
 * the hand snaps downward but the wrist itself barely translates.  During a
 * flick the MCP moves significantly faster than the wrist, so including it
 * makes light flick gestures reliably detectable.
 */
const MIDDLE_MCP = 9;

// Per-hand cooldown timestamps (keyed by hand index 0 or 1).
const lastStrikeAt = {};

/**
 * Per-hand active hold: the zone that was struck and when.
 * Null means no active hold for that hand.
 * Key: handIndex  Value: { zone: string, startMs: number } | null
 */
const handHold = {};

/**
 * Maximum time (ms) a hold can stay active before auto-releasing.
 * Prevents stuck notes when hands leave the camera frame without a clean exit.
 */
const MAX_HOLD_MS = 2000;

// ── Zone lookup ───────────────────────────────────────────────────────────────

/**
 * Map a wrist position to a drum zone.
 * @param {number} x  normalised x ∈ [0,1]  (0 = left edge of the *mirrored* display)
 * @param {number} y  normalised y ∈ [0,1]  (0 = top edge of camera)
 * @returns {'snare'|'kick'|'hihat'|'crash'}
 */
function zoneForPosition(x, y) {
  const isLeft = x < 0.5;
  const isUpper = y < 0.5;

  if (isLeft && isUpper) return 'hihat';
  if (!isLeft && isUpper) return 'crash';
  if (isLeft && !isUpper) return 'snare';
  return 'kick';
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * @typedef {{ type:'STRIKE', hit:true, zone:string, velocity:number, handIndex:number, timestamp:number }} StrikeEvent
 * @typedef {{ type:'RELEASE', zone:string, handIndex:number, holdMs:number, timestamp:number }} ReleaseEvent
 * @typedef {StrikeEvent|ReleaseEvent} DrumEvent
 */

/**
 * detectDrumGesture
 *
 * Call once per animation frame for each detected hand.
 *
 * @param {Array<{x,y,z}>} landmarks      – current frame's 21 landmarks
 * @param {Array<{x,y,z}>} prevLandmarks  – previous frame's 21 landmarks
 * @param {number}          deltaMs        – ms elapsed since previous frame
 * @param {number}          handIndex      – 0 or 1 (for independent cooldowns)
 *
 * @returns {DrumEvent[]}  Array of STRIKE / RELEASE events (may be empty).
 */
export function detectDrumGesture(landmarks, prevLandmarks, deltaMs, handIndex = 0) {
  if (!landmarks?.length || !prevLandmarks?.length || deltaMs <= 0) return [];

  const velocities = calcVelocity(landmarks, prevLandmarks, deltaMs);
  if (!velocities.length) return [];

  const wristVy  = velocities[WRIST].vy;
  const mcpVy    = velocities[MIDDLE_MCP]?.vy ?? 0;
  const strikeVy = Math.max(wristVy, mcpVy);

  // Wrist position determines zone (mirrored to match canvas display).
  const wrist       = landmarks[WRIST];
  const currentZone = zoneForPosition(1 - wrist.x, wrist.y);

  const now    = performance.now();
  const events = [];

  // ── 1. Check if active hold needs releasing ────────────────────────────
  const hold = handHold[handIndex] ?? null;
  if (hold !== null) {
    const holdMs    = now - hold.startMs;
    const zoneLeft  = currentZone !== hold.zone;
    const expired   = holdMs > MAX_HOLD_MS;

    if (zoneLeft || expired) {
      events.push({ type: 'RELEASE', zone: hold.zone, handIndex, holdMs, timestamp: now });
      handHold[handIndex] = null;
    }
  }

  // ── 2. Check for a new strike ──────────────────────────────────────────
  if (strikeVy >= STRIKE_THRESHOLD) {
    const lastAt = lastStrikeAt[handIndex] ?? 0;
    if (now - lastAt >= COOLDOWN_MS) {
      lastStrikeAt[handIndex] = now;

      // Begin tracking hold for this strike (overwrites if same zone retriggered).
      handHold[handIndex] = { zone: currentZone, startMs: now };

      const rawVel   = (strikeVy - STRIKE_THRESHOLD) / (MAX_VY - STRIKE_THRESHOLD);
      const velocity = Math.max(0.05, Math.min(1, rawVel));

      events.push({
        type: 'STRIKE',
        hit: true,
        zone: currentZone,
        velocity: Math.round(velocity * 1000) / 1000,
        handIndex,
        timestamp: now,
      });
    }
  }

  return events;
}

/**
 * resetDrumState
 *
 * Force all active holds to null.  Call when switching away from drums
 * so stale hold state doesn't carry over to the next session.
 */
export function resetDrumState() {
  for (const key of Object.keys(handHold))     delete handHold[key];
  for (const key of Object.keys(lastStrikeAt)) delete lastStrikeAt[key];
}
