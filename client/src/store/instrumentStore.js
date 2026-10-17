/**
 * store/instrumentStore.js
 *
 * Unified app store. Holds only UI-level state — anything that changes every
 * frame lives in refs inside the RAF loop instead (see App.jsx `liveRef`).
 *
 * Shape
 * ─────
 *   isActive    : boolean   — true after Start (AudioContext unlocked)
 *   scene       : Scene     — current sound + visual patch (see scene/presets.js)
 *   sceneSource : 'preset' | 'vibe' | 'jam' | 'edit'
 *   sceneId     : number    — bumps when a *new* patch loads (not on knob tweaks),
 *                             so the renderer only announces real changes
 *   seq         : { playing, pattern, source: 'user'|'claude' } — the step sequencer
 *   claude      : { available: boolean|null }   — null until /api/status answers
 *   vibe        : { status: 'idle'|'loading'|'error', error: string|null }
 *   jam         : { enabled, status: 'idle'|'thinking'|'error', comment, error }
 *   recording   : boolean
 */

import { create } from 'zustand';
import { DEFAULT_SCENE } from '../scene/presets.js';
import { STARTER_PATTERN } from '../audio-engine/patterns.js';

export const useAppStore = create((set) => ({
  isActive: false,
  setActive: (bool) => set({ isActive: bool }),

  scene: DEFAULT_SCENE,
  sceneSource: 'preset',
  sceneId: 0,
  setScene: (scene, source = 'preset') =>
    set((s) => ({ scene, sceneSource: source, sceneId: s.sceneId + 1 })),
  /** Knob edit: change one value in a section (drone/drums/visuals) or a top-level key. */
  tweakScene: (section, key, value) =>
    set((s) => ({
      sceneSource: 'edit',
      scene: section
        ? { ...s.scene, [section]: { ...s.scene[section], [key]: value } }
        : { ...s.scene, [key]: value },
    })),

  seq: { playing: false, pattern: STARTER_PATTERN, source: 'user' },
  setSeq: (patch) => set((s) => ({ seq: { ...s.seq, ...patch } })),
  toggleStep: (row, step, max) =>
    set((s) => {
      const lane = [...s.seq.pattern[row]];
      lane[step] = (lane[step] + 1) % (max + 1); // cycle rest → soft → med → hard → rest
      return { seq: { ...s.seq, pattern: { ...s.seq.pattern, [row]: lane }, source: 'user' } };
    }),

  claude: { available: null },
  setClaudeAvailable: (available) => set({ claude: { available } }),

  vibe: { status: 'idle', error: null },
  setVibe: (patch) => set((s) => ({ vibe: { ...s.vibe, ...patch } })),

  jam: { enabled: false, status: 'idle', comment: '', error: null },
  setJam: (patch) => set((s) => ({ jam: { ...s.jam, ...patch } })),

  recording: false,
  setRecording: (recording) => set({ recording }),
}));
