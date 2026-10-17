/**
 * claude/api.js
 *
 * Browser side of the Claude features. Everything goes through the Express
 * server (/api/*) so the Anthropic key never reaches the page.
 */

async function post(path, body, signal) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

/** @returns {Promise<boolean>} whether the server has Anthropic credentials */
export async function fetchClaudeStatus() {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) return false;
    return Boolean((await res.json()).claude);
  } catch {
    return false;
  }
}

/** Mood words → a full Scene. */
export async function requestVibe(prompt, current, signal) {
  return (await post('/api/vibe', { prompt, current }, signal)).scene;
}

/** Performance summary → { comment, pattern, scene | null }. */
export function requestJam(performance, signal) {
  return post('/api/jam', performance, signal);
}
