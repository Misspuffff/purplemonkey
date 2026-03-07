/**
 * velocity.js
 *
 * Pure utility for computing per-landmark velocity vectors between two
 * consecutive MediaPipe hand landmark frames.
 *
 * Landmark coordinates are in MediaPipe's normalised space:
 *   x, y ∈ [0, 1]  (origin top-left of the camera frame)
 *   z     – depth relative to the wrist; smaller = closer to camera
 *
 * Velocity units are normalised-units / second (nu/s).
 */

/**
 * calcVelocity
 *
 * @param {Array<{x: number, y: number, z: number}>} currentLandmarks
 *   The 21 landmark points from the latest frame.
 * @param {Array<{x: number, y: number, z: number}>} prevLandmarks
 *   The 21 landmark points from the previous frame.
 * @param {number} deltaMs
 *   Elapsed time between the two frames in milliseconds (must be > 0).
 *
 * @returns {Array<{vx: number, vy: number, vz: number}>}
 *   One velocity vector per landmark, in normalised units per second.
 *   Returns an empty array if either input is empty/mismatched or deltaMs ≤ 0.
 */
export function calcVelocity(currentLandmarks, prevLandmarks, deltaMs) {
  if (
    !currentLandmarks?.length ||
    !prevLandmarks?.length ||
    currentLandmarks.length !== prevLandmarks.length ||
    deltaMs <= 0
  ) {
    return [];
  }

  const dtSec = deltaMs / 1000;

  return currentLandmarks.map((cur, i) => {
    const prev = prevLandmarks[i];
    return {
      vx: (cur.x - prev.x) / dtSec,
      vy: (cur.y - prev.y) / dtSec,
      vz: (cur.z - prev.z) / dtSec,
    };
  });
}
