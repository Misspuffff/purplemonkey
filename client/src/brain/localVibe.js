/**
 * brain/localVibe.js
 *
 * Offline "vibe → patch" — used when no Anthropic key is configured.
 *
 * It is a lexicon, not a language model: each known word nudges the patch
 * (darker, faster, wetter…) and may contribute colours. Starting point is the
 * preset whose name/tagline shares the most words with the prompt, so even
 * unknown words land somewhere sensible. Deterministic: same words, same patch.
 *
 * Claude does this far better (it understands "a lighthouse in fog" without a
 * lexicon entry), which is why the UI labels which brain answered.
 */

import { PRESETS } from '../scene/presets.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Each entry: partial nudges. Numbers are *added* (pitch/bpm/kickTune in their
// own units, everything else 0–1). Strings/arrays replace.
const LEXICON = {
  dark:      { drone: { brightness: -0.3, pitch: -3 }, visuals: { colors: ['#1b1036', '#5a2bff'] } },
  deep:      { drone: { pitch: -5, density: 0.15 }, drums: { kickLength: 0.25, kickTune: -3 } },
  underwater:{ drone: { brightness: -0.35, space: 0.35, density: 0.3 }, bpm: -20, visuals: { treatment: 'duotone', particles: 'rings', colors: ['#2fa8ff', '#7affe0'] } },
  ocean:     { drone: { space: 0.3, density: 0.25 }, visuals: { particles: 'rings', colors: ['#1e6fff', '#8ff0ff'] } },
  rain:      { drone: { density: 0.2 }, visuals: { grain: 0.3, colors: ['#6f8bff', '#c8d6ff'] } },
  slow:      { bpm: -22, drone: { motion: -0.2 } },
  calm:      { bpm: -15, drone: { brightness: -0.1 }, visuals: { glitch: -0.4 } },
  sad:       { drone: { pitch: -2, brightness: -0.2 }, bpm: -12, visuals: { colors: ['#4b6cb7', '#9aa9d6'] } },
  dreamy:    { drone: { space: 0.3, density: 0.25 }, visuals: { treatment: 'ghost', trails: 0.3, colors: ['#c79bff', '#ffd1f0'] } },
  space:     { drone: { space: 0.4, pitch: -2 }, visuals: { particles: 'embers', colors: ['#7b5cff', '#00e5ff'] } },
  cathedral: { drone: { space: 0.45, density: 0.3, pitch: -5 }, drums: { kickLength: 0.3 } },
  bright:    { drone: { brightness: 0.35 }, drums: { snareTone: 0.25, metalTone: 0.25 } },
  happy:     { drone: { brightness: 0.25, pitch: 4 }, bpm: 10, visuals: { particles: 'petals', colors: ['#ffd23f', '#ff7eb6'] } },
  fast:      { bpm: 25, drums: { kickLength: -0.2 }, drone: { motion: 0.2 } },
  rave:      { bpm: 30, drone: { brightness: 0.35 }, drums: { kickLength: -0.15 }, visuals: { glitch: 0.4, treatment: 'mono', particles: 'shards', colors: ['#ff2bd6', '#f6ff00'] } },
  techno:    { bpm: 25, drums: { kickTune: -2, swing: -0.2 }, visuals: { treatment: 'mono', colors: ['#ffffff', '#ff3b3b'] } },
  angry:     { bpm: 20, drone: { brightness: 0.25 }, drums: { snareTone: 0.3 }, visuals: { glitch: 0.5, colors: ['#ff2a2a', '#ff9a00'] } },
  glitch:    { visuals: { glitch: 0.5, grain: 0.2, particles: 'shards' } },
  soft:      { drums: { snareTone: -0.3, metalTone: -0.2 }, visuals: { glitch: -0.4, particles: 'petals' } },
  warm:      { drone: { brightness: -0.1 }, visuals: { treatment: 'thermal', particles: 'embers', colors: ['#ff7a1a', '#ffd27a'] } },
  fire:      { drone: { brightness: 0.15 }, visuals: { treatment: 'thermal', particles: 'embers', colors: ['#ff3d00', '#ffb300'] } },
  ice:       { drone: { brightness: 0.25, space: 0.2 }, drums: { metalTone: 0.3 }, visuals: { treatment: 'duotone', colors: ['#9be7ff', '#ffffff'] } },
  forest:    { drone: { pitch: -2, density: 0.15 }, visuals: { particles: 'petals', colors: ['#2ecc71', '#d4ff8a'] } },
  sunset:    { drone: { brightness: 0.05 }, visuals: { colors: ['#ff6b6b', '#ffb86b'] } },
  night:     { drone: { brightness: -0.2 }, visuals: { colors: ['#3a47ff', '#00ff88'] } },
  retro:     { drone: { density: -0.2 }, visuals: { grain: 0.35, colors: ['#ff71ce', '#01cdfe'] } },
  cyberpunk: { bpm: 15, visuals: { glitch: 0.4, colors: ['#00f0ff', '#ff00a0'] } },
  swing:     { drums: { swing: 0.4 } },
  jazz:      { drums: { swing: 0.45, snareTone: -0.2 }, bpm: -10, visuals: { colors: ['#ffb000', '#7fd1ff'] } },
  ghost:     { visuals: { treatment: 'ghost', trails: 0.3 } },
  noir:      { visuals: { treatment: 'mono', colors: ['#ffffff', '#c0c0c0'] }, drone: { brightness: -0.15 } },
};

const words = (s) => s.toLowerCase().match(/[a-z]+/g) ?? [];
const FILLER = new Set(['a', 'an', 'the', 'at', 'of', 'in', 'on', 'with', 'and', 'but', 'like', 'some', 'very', 'make', 'it', 'more', 'my', 'me', 'to']);
const titleCase = (ws) => ws.filter((w) => !FILLER.has(w)).slice(0, 3)
  .map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

function hashHue(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
}

function hslHex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** @returns {import('../scene/presets.js').Scene} */
export function localVibe(prompt) {
  const ws = words(prompt);

  // Base: preset sharing the most words, else the default
  const score = (p) => words(`${p.name} ${p.tagline}`).filter((w) => ws.includes(w)).length;
  const base = [...PRESETS].sort((a, b) => score(b) - score(a))[0];
  const scene = structuredClone(base);
  const colors = [];
  let hits = 0;

  for (const w of ws) {
    const entry = LEXICON[w] ?? LEXICON[w.replace(/(y|s|er|ing)$/, '')];
    if (!entry) continue;
    hits++;
    if (entry.bpm) scene.bpm += entry.bpm;
    for (const section of ['drone', 'drums']) {
      for (const [k, v] of Object.entries(entry[section] ?? {})) scene[section][k] += v;
    }
    const v = entry.visuals ?? {};
    for (const k of ['glitch', 'grain', 'trails']) if (v[k]) scene.visuals[k] += v[k];
    if (v.treatment) scene.visuals.videoTreatment = v.treatment;
    if (v.particles) scene.visuals.particleStyle = v.particles;
    if (v.colors) colors.push(...v.colors);
  }

  // Colours: from the lexicon, else derived from the prompt's hash
  const hue = hashHue(prompt);
  const [primary = hslHex(hue, 0.95, 0.6), accent = hslHex((hue + 150) % 360, 0.95, 0.65)] = colors;
  scene.visuals.palette = [hslHex(hue, 0.5, 0.05), primary, accent];

  // Clamp everything back into range
  scene.bpm = Math.max(60, Math.min(170, scene.bpm));
  scene.drone.pitch = Math.max(-12, Math.min(12, scene.drone.pitch));
  scene.drums.kickTune = Math.max(-12, Math.min(12, scene.drums.kickTune));
  for (const k of ['brightness', 'space', 'density', 'motion']) scene.drone[k] = clamp01(scene.drone[k]);
  for (const k of ['kickLength', 'snareTone', 'metalTone', 'swing']) scene.drums[k] = clamp01(scene.drums[k]);
  for (const k of ['glitch', 'grain', 'trails']) scene.visuals[k] = clamp01(scene.visuals[k]);

  scene.name = titleCase(ws) || base.name;
  scene.tagline = hits
    ? `local patch · ${hits} mood word${hits > 1 ? 's' : ''} understood`
    : `local patch · riffing on ${base.name}`;
  return scene;
}
