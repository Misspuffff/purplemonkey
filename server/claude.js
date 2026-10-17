/**
 * claude.js
 *
 * Thin wrapper around the Anthropic SDK for AIr's two Claude features:
 *
 *   vibeToScene(prompt, current)  — text → full Scene        (effort: medium)
 *   jam(performance)              — gesture summary → pattern (effort: low)
 *
 * Both use structured outputs (output_config.format) so the reply is always
 * schema-shaped JSON, then pass through Zod to clamp every number into range.
 *
 * The API key is read from the environment (ANTHROPIC_API_KEY or an
 * `ant auth login` profile) and never reaches the browser.
 */

import Anthropic from '@anthropic-ai/sdk';
import { SceneSchema, JamSchema, sceneJsonSchema, jamJsonSchema } from './scene.js';

const MODEL = 'claude-opus-5-5';

let client = null;
function getClient() {
  client ??= new Anthropic();
  return client;
}

export const hasCredentials = () =>
  Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);

// ── Prompts ──────────────────────────────────────────────────────────────────
// Kept as frozen constants so the system prompt is a stable, cacheable prefix.

const INSTRUMENT = `AIr is a webcam instrument played with the face and hands.
- Face → a granular drone: jaw opens grains and the filter, raised brows add reverb and pitch, closed eyes smear grains together, a smile adds shimmer, turning the head bends playback speed.
- Hands → drums: a downward strike in the lower half of the frame is a kick, in the upper half a snare; a fast horizontal swipe is a metallic cymbal.
- Visuals are the mirrored webcam with hand ribbons, hit particles, glitch and grain, tinted by a 3-colour palette.`;

const VIBE_SYSTEM = `${INSTRUMENT}

You translate a performer's mood words into a Scene: a complete setting for the drone, drums and visuals.
Commit to the mood. "Underwater" should feel dark, slow, wet and blue; "rave" should feel bright, tight, fast and saturated. Avoid the middle of every range — a Scene with every value near 0.5 sounds like nothing.
Palettes: the background colour must be very dark (each channel under 0x30); primary and accent should contrast with each other.
If the request is not about mood or sound, still return the closest musical interpretation.`;

// TODO(you): The jam partner's personality.
// This paragraph decides what kind of musician Claude is when it plays with you.
// See the note in the chat for the trade-offs.
const JAM_PERSONA = `You are a patient, groove-first drummer. Follow the performer's tempo and density rather than leading;
leave space where they are playing and fill where they are resting. Change the Scene rarely — only when the
performer's energy or face clearly shifts for a sustained stretch.`;

const JAM_SYSTEM = `${INSTRUMENT}

You are the performer's AI jam partner. Every few bars you receive a summary of what they just played
(hit times in seconds, which drum, velocity) plus their facial mood, the current Scene and the pattern you
are looping. Reply with the next 16-step loop (one bar of sixteenth notes at the Scene's bpm) and, rarely, a new Scene.

${JAM_PERSONA}

Infer their tempo from the gaps between hits when there are enough of them; otherwise keep the current bpm.
If they played nothing, play something sparse and inviting rather than silence.`;

// ── Core call ────────────────────────────────────────────────────────────────

export class ClaudeRefusal extends Error {}

async function structured({ system, user, schema, zod, effort, maxTokens }) {
  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default', // re-run on a fallback model if a safety classifier declines
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
    output_config: {
      effort,
      format: { type: 'json_schema', schema },
    },
  });

  if (response.stop_reason === 'refusal') {
    throw new ClaudeRefusal(response.stop_details?.explanation ?? 'Claude declined this request.');
  }

  const text = response.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error(`No text in response (stop_reason: ${response.stop_reason})`);

  return zod.parse(JSON.parse(text));
}

// ── Public API ───────────────────────────────────────────────────────────────

export function vibeToScene(prompt, current) {
  const user = current
    ? `Current scene (for reference — change whatever the request implies):\n${JSON.stringify(current)}\n\nRequest: ${prompt}`
    : `Request: ${prompt}`;

  return structured({
    system: VIBE_SYSTEM,
    user,
    schema: sceneJsonSchema,
    zod: SceneSchema,
    effort: 'medium',
    maxTokens: 8000,
  });
}

export function jam(performance) {
  return structured({
    system: JAM_SYSTEM,
    user: JSON.stringify(performance),
    schema: jamJsonSchema,
    zod: JamSchema,
    effort: 'low', // latency matters more than depth — the next bar is coming
    maxTokens: 8000,
  });
}
