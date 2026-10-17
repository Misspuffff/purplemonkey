/**
 * brain/useJamPartner.js
 *
 * Two hooks that connect the store's step sequencer to the JamEngine:
 *
 *   useSequencer   — play/stop, tempo/scene, and pattern edits → engine.
 *                    Hand edits apply on the next step; brain edits on the
 *                    next downbeat.
 *   useJamPartner  — while "Jam" is on, every few bars send the brain a
 *                    summary of what you just played and write its reply into
 *                    the sequencer (and, rarely, load a new patch).
 *
 * Pacing: one call per CALL_BARS bars (never faster than MIN_INTERVAL_MS) and
 * never two in flight — a slow reply just means the current loop keeps playing.
 */

import { useEffect } from 'react';
import { useAppStore } from '../store/instrumentStore.js';
import { jamStep } from './index.js';
import { snapshot } from './performanceLog.js';

const CALL_BARS       = 4;
const MIN_INTERVAL_MS = 8000;

export function useSequencer(jamRef) {
  const isActive = useAppStore((s) => s.isActive);
  const playing  = useAppStore((s) => s.seq.playing);
  const pattern  = useAppStore((s) => s.seq.pattern);
  const source   = useAppStore((s) => s.seq.source);

  useEffect(() => {
    const engine = jamRef.current;
    if (!isActive || !engine) return;
    if (playing) engine.start();
    else engine.stop();
  }, [isActive, playing, jamRef]);

  useEffect(() => {
    jamRef.current?.setPattern(pattern, { immediate: source === 'user' });
  }, [pattern, source, jamRef, isActive]);
}

export function useJamPartner(jamRef, logRef) {
  const enabled  = useAppStore((s) => s.jam.enabled);
  const isActive = useAppStore((s) => s.isActive);

  useEffect(() => {
    if (!enabled || !isActive || !jamRef.current) return;

    const { setJam, setScene, setSeq } = useAppStore.getState();
    const controller = new AbortController();
    let inFlight = false;
    let timer;

    setSeq({ playing: true });
    setJam({ status: 'thinking', comment: 'listening…', error: null });

    const barMs = () => (60 / useAppStore.getState().scene.bpm) * 4 * 1000;

    async function ask() {
      if (inFlight) return;
      inFlight = true;
      setJam({ status: 'thinking' });
      try {
        const { scene, seq } = useAppStore.getState();
        const reply = await jamStep(snapshot(logRef.current, { scene, loop: seq.pattern }), controller.signal);
        setSeq({ pattern: reply.pattern, source: 'brain' });
        if (reply.scene) setScene(reply.scene, 'jam');
        setJam({ status: reply.error ? 'error' : 'idle', comment: reply.comment, error: reply.error ?? null });
      } catch (err) {
        if (!controller.signal.aborted) setJam({ status: 'error', error: err.message });
      } finally {
        inFlight = false;
      }
    }

    function loop(delay) {
      timer = setTimeout(async () => {
        await ask();
        if (!controller.signal.aborted) loop(Math.max(MIN_INTERVAL_MS, barMs() * CALL_BARS));
      }, delay);
    }
    loop(barMs()); // first reply after one bar, so there is something to listen to

    return () => {
      controller.abort();
      clearTimeout(timer);
      setJam({ status: 'idle', comment: '' });
    };
  }, [enabled, isActive, jamRef, logRef]);
}
