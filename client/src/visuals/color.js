/**
 * visuals/color.js — tiny colour helpers for the canvas renderer.
 *
 * Colours are plain { r, g, b } objects so they can be lerped in place every
 * frame without allocating strings until draw time.
 */

export const lerp  = (a, b, t) => a + (b - a) * t;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export const rgba = (c, a = 1) => `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${a.toFixed(3)})`;

export const mix = (a, b, t) => ({ r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) });

/** Move colour `c` toward `target` in place by factor t (per-frame easing). */
export function easeColor(c, target, t) {
  c.r += (target.r - c.r) * t;
  c.g += (target.g - c.g) * t;
  c.b += (target.b - c.b) * t;
}

export const WHITE = { r: 255, g: 255, b: 255 };
