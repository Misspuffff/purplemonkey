/**
 * studio/ticker.js
 *
 * One shared requestAnimationFrame loop for every live readout in the rack
 * (meters, LEDs, knob modulation rings, the sequencer playhead).
 *
 * Subscribers write straight to DOM nodes via refs — no React state — so 60 fps
 * meters cost nothing in re-renders.
 */

import { useEffect, useRef } from 'react';

const subs = new Set();
let rafId = 0;

function tick() {
  subs.forEach((fn) => fn(performance.now()));
  rafId = subs.size ? requestAnimationFrame(tick) : 0;
}

/** Call `fn(now)` every frame while the component is mounted. */
export function useTicker(fn) {
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });

  useEffect(() => {
    const sub = (now) => fnRef.current(now);
    subs.add(sub);
    if (!rafId) rafId = requestAnimationFrame(tick);
    return () => subs.delete(sub);
  }, []);
}

/** 1 right after a hit, fading to 0 over `ms`. */
export const flashLevel = (at, now, ms = 180) => Math.max(0, 1 - (now - (at || 0)) / ms);
