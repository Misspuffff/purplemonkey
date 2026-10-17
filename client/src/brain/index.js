/**
 * brain/index.js
 *
 * One entry point for AIr's two "thinking" features. Each picks Claude when
 * the server has Anthropic credentials, and the local rule-based brain
 * otherwise — same inputs, same output shapes, so callers never branch.
 *
 * If a Claude call fails mid-session (network, rate limit), the jam partner
 * falls back to the local brain for that bar rather than going silent.
 */

import { useAppStore } from '../store/instrumentStore.js';
import { requestVibe, requestJam } from './api.js';
import { localVibe } from './localVibe.js';
import { localJam } from './localJam.js';

export const brainName = () => (useAppStore.getState().claude.available ? 'claude' : 'local');

/** @returns {Promise<{ scene, brain: 'claude'|'local' }>} */
export async function generateVibe(prompt, current, signal) {
  if (brainName() === 'local') return { scene: localVibe(prompt), brain: 'local' };
  return { scene: await requestVibe(prompt, current, signal), brain: 'claude' };
}

/** @returns {Promise<{ comment, pattern, scene|null, brain, error? }>} */
export async function jamStep(performance, signal) {
  if (brainName() === 'local') return { ...localJam(performance), brain: 'local' };
  try {
    return { ...(await requestJam(performance, signal)), brain: 'claude' };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { ...localJam(performance), brain: 'local', error: err.message };
  }
}
