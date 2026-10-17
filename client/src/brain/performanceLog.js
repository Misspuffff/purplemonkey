/**
 * claude/performanceLog.js
 *
 * Remembers what the performer just did so the jam partner can respond to it.
 *
 * The RAF loop calls logHit() on every strike/swipe and sampleFace() every
 * frame; the jam loop calls snapshot() every few bars. Plain mutable object,
 * no React state — it is written at 60 fps.
 */

const WINDOW_MS = 16000; // how far back the partner "listens"
const MAX_HITS  = 64;

export function createPerformanceLog() {
  return {
    hits: [],                                   // { at, drum, v, hand }
    face: { jawOpen: 0, browInnerUp: 0, eyesClosed: 0, mouthSmile: 0, n: 0 },
  };
}

export function logHit(log, drum, velocity, hand) {
  log.hits.push({ at: performance.now(), drum, v: velocity, hand });
  if (log.hits.length > MAX_HITS) log.hits.shift();
}

export function sampleFace(log, sf) {
  const f = log.face;
  f.jawOpen += sf.jawOpen; f.browInnerUp += sf.browInnerUp;
  f.eyesClosed += sf.eyesClosed; f.mouthSmile += sf.mouthSmile;
  f.n++;
}

const r2 = (v) => Math.round(v * 100) / 100;

/**
 * Compact summary for /api/jam. Hit times are seconds *before now* (negative),
 * which is easier for Claude to reason about than absolute timestamps.
 * Resets the face average so each call describes only the latest stretch.
 */
export function snapshot(log, { scene, loop }) {
  const now  = performance.now();
  const hits = log.hits
    .filter((h) => now - h.at <= WINDOW_MS)
    .map((h) => ({ t: r2((h.at - now) / 1000), drum: h.drum, v: r2(h.v), hand: h.hand }));

  const f = log.face;
  const n = Math.max(1, f.n);
  const face = {
    jawOpen: r2(f.jawOpen / n), browInnerUp: r2(f.browInnerUp / n),
    eyesClosed: r2(f.eyesClosed / n), mouthSmile: r2(f.mouthSmile / n),
  };
  log.face = { jawOpen: 0, browInnerUp: 0, eyesClosed: 0, mouthSmile: 0, n: 0 };

  return { windowSeconds: WINDOW_MS / 1000, hits, face, scene, loop };
}
