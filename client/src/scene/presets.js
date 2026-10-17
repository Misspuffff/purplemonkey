/**
 * scene/presets.js
 *
 * Hand-built Scenes. They double as:
 *   • quick-pick chips in the vibe bar (instant, no network)
 *   • the offline fallback when no Anthropic API key is configured
 *
 * Shape matches server/scene.js — keep the two in sync.
 */

/** The original AIr look & sound, expressed as a Scene. */
export const DEFAULT_SCENE = {
  name: 'Night Signal',
  tagline: 'the original — green glitch over a slow drone',
  bpm: 92,
  drone:   { pitch: 0, brightness: 0.55, space: 0.35, density: 0.45, motion: 0.6 },
  drums:   { kickTune: 0, kickLength: 0.45, snareTone: 0.5, metalTone: 0.55, swing: 0.1 },
  visuals: {
    palette: ['#0a0a0a', '#00ff88', '#ff4488'],
    glitch: 0.7, grain: 0.4, trails: 0.5,
    videoTreatment: 'natural', particleStyle: 'shards',
  },
};

export const PRESETS = [
  DEFAULT_SCENE,
  {
    name: 'Deep Water',
    tagline: 'slow, wet and blue, everything a little far away',
    bpm: 68,
    drone:   { pitch: -7, brightness: 0.18, space: 0.9, density: 0.85, motion: 0.35 },
    drums:   { kickTune: -5, kickLength: 0.85, snareTone: 0.15, metalTone: 0.2, swing: 0.25 },
    visuals: {
      palette: ['#020a14', '#2fa8ff', '#7affe0'],
      glitch: 0.15, grain: 0.25, trails: 0.9,
      videoTreatment: 'duotone', particleStyle: 'rings',
    },
  },
  {
    name: 'Strobe Church',
    tagline: 'bright, tight, fast — a warehouse at 3am',
    bpm: 132,
    drone:   { pitch: 5, brightness: 0.95, space: 0.2, density: 0.2, motion: 0.85 },
    drums:   { kickTune: 2, kickLength: 0.25, snareTone: 0.9, metalTone: 0.95, swing: 0 },
    visuals: {
      palette: ['#0c0010', '#ff2bd6', '#f6ff00'],
      glitch: 1, grain: 0.15, trails: 0.3,
      videoTreatment: 'mono', particleStyle: 'shards',
    },
  },
  {
    name: 'Ember Hymn',
    tagline: 'warm dust, slow embers, a candlelit room',
    bpm: 76,
    drone:   { pitch: -3, brightness: 0.4, space: 0.7, density: 0.7, motion: 0.5 },
    drums:   { kickTune: -2, kickLength: 0.6, snareTone: 0.35, metalTone: 0.4, swing: 0.4 },
    visuals: {
      palette: ['#140602', '#ff7a1a', '#ffd27a'],
      glitch: 0.25, grain: 0.75, trails: 0.7,
      videoTreatment: 'thermal', particleStyle: 'embers',
    },
  },
  {
    name: 'Paper Garden',
    tagline: 'soft, airy and playful, petals on the breeze',
    bpm: 104,
    drone:   { pitch: 7, brightness: 0.75, space: 0.55, density: 0.35, motion: 0.7 },
    drums:   { kickTune: 4, kickLength: 0.3, snareTone: 0.65, metalTone: 0.8, swing: 0.55 },
    visuals: {
      palette: ['#0a0a10', '#ff9ec7', '#b8f5c8'],
      glitch: 0.1, grain: 0.3, trails: 0.6,
      videoTreatment: 'ghost', particleStyle: 'petals',
    },
  },
];
