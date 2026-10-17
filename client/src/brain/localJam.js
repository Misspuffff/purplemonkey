/**
 * brain/localJam.js
 *
 * Offline jam partner — used when no Anthropic key is configured.
 * Same input (performance snapshot) and output ({ comment, pattern, scene })
 * as /api/jam, so useJamPartner can swap brains transparently.
 *
 * A few musical rules rather than a model:
 *   • Tempo   — if the performer's kicks/snares are regular, estimate their
 *               BPM from the median gap and drift toward it.
 *   • Space   — leave rests on the steps where the performer is hitting; fill
 *               the gaps (call and response).
 *   • Energy  — more hits → busier hats; no hits → sparse and inviting.
 *   • Evolve  — mutate one or two steps of the current loop each call so it
 *               never sits still for long.
 */

const BARS_HEARD = 16; // snapshot window is 16 s
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function estimateBpm(hits, currentBpm) {
  const ts = hits.filter((h) => h.drum !== 'metal').map((h) => h.t).sort((a, b) => a - b);
  if (ts.length < 4) return null;
  const gaps = ts.slice(1).map((t, i) => t - ts[i]).filter((g) => g > 0.15 && g < 2).sort((a, b) => a - b);
  if (gaps.length < 3) return null;
  let bpm = 60 / gaps[Math.floor(gaps.length / 2)];
  // Fold into a sensible range near the current tempo (they may play halves/doubles)
  while (bpm < 70) bpm *= 2;
  while (bpm > 160) bpm /= 2;
  return Math.abs(bpm - currentBpm) > 6 ? bpm : null;
}

/** Which 16th steps the performer is landing on (by phase within a bar). */
function performerSteps(hits, bpm) {
  const stepSec = 60 / bpm / 4;
  const counts = new Array(16).fill(0);
  hits.forEach((h) => { counts[((Math.round(-h.t / stepSec) % 16) + 16) % 16]++; });
  return counts;
}

export function localJam(perf) {
  const { hits, scene, loop } = perf;
  const bpm = scene.bpm;
  const density = hits.length / BARS_HEARD;             // hits per second
  const busy = performerSteps(hits, bpm);
  const theirKicks = hits.filter((h) => h.drum === 'kick').length;
  const p = structuredClone(loop);

  // Energy → hats
  const hatEvery = density > 1.5 ? 1 : density > 0.6 ? 2 : 4;
  p.hat = p.hat.map((_, i) => (i % hatEvery === (hatEvery > 1 ? hatEvery / 2 : 0) ? (i % 4 === 2 ? 2 : 1) : 0));

  // Call and response: step aside where they hit, answer in the gaps
  for (let i = 0; i < 16; i++) {
    if (busy[i] >= 2) { p.kick[i] = 0; p.snare[i] = 0; }
  }
  if (theirKicks > 3) {
    p.kick = p.kick.map((v, i) => (i % 8 === 0 ? 0 : v));      // they own the downbeats
    p.bass = p.bass.map((v, i) => (i % 4 === 2 ? pick([1, 3, 5]) : 0));
  } else if (p.kick.every((v) => !v)) {
    p.kick[0] = 3;
  }

  // Evolve: flip one or two steps
  for (let n = 0; n < 1 + (Math.random() < 0.5); n++) {
    const lane = pick(['kick', 'snare', 'bass']);
    const i = Math.floor(Math.random() * 16);
    p[lane][i] = p[lane][i] ? 0 : lane === 'bass' ? pick([1, 2, 3, 4, 5]) : pick([1, 2]);
  }

  const newBpm = estimateBpm(hits, bpm);
  const next = newBpm ? { ...scene, bpm: Math.round(bpm + (newBpm - bpm) * 0.5) } : null;

  let comment;
  if (!hits.length) comment = pick(['leaving room for you', 'sparse groove, your move', 'waiting on your first hit']);
  else if (next) comment = `following you to ${next.bpm} bpm`;
  else if (theirKicks > 3) comment = pick(['you take the kicks, i’ll hold the bass', 'stepping off the downbeat']);
  else if (density > 1.5) comment = pick(['busy hands, busier hats', 'matching your energy']);
  else comment = pick(['answering in the gaps', 'nudging the loop forward', 'small change, same pocket']);

  return { comment, pattern: p, scene: next };
}
