/**
 * store/instrumentStore.js
 *
 * Unified app store.
 *
 * Shape
 * ─────
 *   isActive : boolean  — true after the user clicks Start (unlocks AudioContext)
 *   setActive(bool)     — setter
 */

import { create } from 'zustand';

export const useAppStore = create((set) => ({
  isActive: false,
  setActive: (bool) => set({ isActive: bool }),
}));
