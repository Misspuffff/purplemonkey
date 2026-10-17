/**
 * scene.js
 *
 * The shared "Scene" contract between Claude and the client.
 *
 * A Scene is a complete description of how AIr sounds and looks: the face-driven
 * drone, the hand-driven drums, and the visual treatment. Both /api/vibe and
 * /api/jam return Scenes, and the client's engines consume them directly.
 *
 * Two representations live here:
 *   • JSON Schema  — sent to Claude as output_config.format (structured outputs).
 *                    Ranges are stated in descriptions rather than min/max
 *                    keywords, which keeps the schema within what structured
 *                    outputs accepts.
 *   • Zod schemas  — validate and *clamp* what comes back, so an out-of-range
 *                    number can never reach an audio node.
 */

import { z } from 'zod';

// ── Zod helpers ──────────────────────────────────────────────────────────────

const clamped = (lo, hi) => z.number().transform((v) => Math.max(lo, Math.min(hi, v)));
const unit    = clamped(0, 1);
const hex     = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** Force an array to exactly n integer steps in [0, max], padding with rests. */
const steps = (n, max) => z.array(z.number()).transform((arr) =>
  Array.from({ length: n }, (_, i) => Math.max(0, Math.min(max, Math.round(arr[i] ?? 0)))),
);

export const VIDEO_TREATMENTS = ['natural', 'mono', 'duotone', 'thermal', 'ghost'];
export const PARTICLE_STYLES  = ['shards', 'rings', 'embers', 'petals'];

// ── Zod: Scene ───────────────────────────────────────────────────────────────

export const SceneSchema = z.object({
  name:    z.string().max(40),
  tagline: z.string().max(90),
  bpm:     clamped(60, 170),
  drone: z.object({
    pitch:      clamped(-12, 12),
    brightness: unit,
    space:      unit,
    density:    unit,
    motion:     unit,
  }),
  drums: z.object({
    kickTune:   clamped(-12, 12),
    kickLength: unit,
    snareTone:  unit,
    metalTone:  unit,
    swing:      unit,
  }),
  visuals: z.object({
    palette:        z.array(hex).length(3),
    glitch:         unit,
    grain:          unit,
    trails:         unit,
    videoTreatment: z.enum(VIDEO_TREATMENTS),
    particleStyle:  z.enum(PARTICLE_STYLES),
  }),
});

// ── Zod: Jam reply ───────────────────────────────────────────────────────────

export const JamSchema = z.object({
  comment: z.string().max(120),
  pattern: z.object({
    kick:  steps(16, 3),
    snare: steps(16, 3),
    hat:   steps(16, 3),
    bass:  steps(16, 7),
  }),
  scene: SceneSchema.nullable(),
});

// ── JSON Schema (for output_config.format) ───────────────────────────────────

const num  = (description) => ({ type: 'number', description });
const u    = (description) => num(`${description} 0–1.`);
const obj  = (properties)  => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const sceneJsonSchema = obj({
  name:    { type: 'string', description: '2–4 evocative words, title case.' },
  tagline: { type: 'string', description: 'One short line (under 12 words) describing the feel.' },
  bpm:     num('Tempo for the jam partner, 60–170.'),
  drone: obj({
    pitch:      num('Drone transposition in semitones, -12 to 12.'),
    brightness: u('Filter openness / airiness.'),
    space:      u('Base reverb amount.'),
    density:    u('Grain overlap — 0 is sparse and stuttery, 1 is a smooth wash.'),
    motion:     u('How strongly head movement bends the drone.'),
  }),
  drums: obj({
    kickTune:   num('Kick pitch offset in semitones, -12 to 12.'),
    kickLength: u('Kick decay — 0 is a tight click, 1 is a long boom.'),
    snareTone:  u('Snare colour — 0 is dark and thuddy, 1 is bright and crackly.'),
    metalTone:  u('Swipe-cymbal colour — 0 is gong-like, 1 is glassy and high.'),
    swing:      u('Groove swing for the jam partner.'),
  }),
  visuals: obj({
    palette: {
      type: 'array',
      items: { type: 'string', description: '#rrggbb hex colour' },
      description: 'Exactly 3 colours: [background tint, primary, accent]. Background should be very dark.',
    },
    glitch:         u('Glitch intensity on hits.'),
    grain:          u('Film grain amount.'),
    trails:         u('Motion-trail persistence of hand ribbons.'),
    videoTreatment: { type: 'string', enum: VIDEO_TREATMENTS },
    particleStyle:  { type: 'string', enum: PARTICLE_STYLES },
  }),
});

const stepArray = (description) => ({
  type: 'array',
  items: { type: 'integer' },
  description: `Exactly 16 sixteenth-note steps. ${description}`,
});

export const jamJsonSchema = obj({
  comment: { type: 'string', description: 'What you are doing musically, under 12 words, lowercase, shown on screen.' },
  pattern: obj({
    kick:  stepArray('0 = rest, 1–3 = soft/medium/hard.'),
    snare: stepArray('0 = rest, 1–3 = soft/medium/hard.'),
    hat:   stepArray('0 = rest, 1–3 = soft/medium/hard.'),
    bass:  stepArray('0 = rest, 1–7 = scale degree of the minor pentatonic over the drone root.'),
  }),
  scene: {
    anyOf: [sceneJsonSchema, { type: 'null' }],
    description: 'A full new Scene ONLY when the performance clearly calls for a mood shift; otherwise null.',
  },
});
