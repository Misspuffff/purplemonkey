/**
 * visionFileset.js
 *
 * One shared MediaPipe Tasks Vision WASM runtime for both landmarkers.
 *
 * The WASM URL is pinned to the installed npm version. `@latest` used to be
 * here, which silently pulls a newer runtime than the JS glue in node_modules
 * and breaks the day MediaPipe ships an incompatible release.
 */

import { FilesetResolver } from '@mediapipe/tasks-vision';

// Keep in sync with "@mediapipe/tasks-vision" in client/package.json.
const TASKS_VISION_VERSION = '0.10.32';
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;

let filesetPromise = null;

export function getVisionFileset() {
  filesetPromise ??= FilesetResolver.forVisionTasks(WASM_URL);
  return filesetPromise;
}
