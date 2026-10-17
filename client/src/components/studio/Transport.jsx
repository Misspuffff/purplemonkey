/**
 * Transport.jsx — the strip across the top of the rack.
 *
 *   AIr · tracking LEDs · ▶/■ · BPM · master meter · REC · brain badge · hide
 */

import { useRef } from 'react';
import { useAppStore } from '../../store/instrumentStore.js';
import { Led } from './parts.jsx';
import { useTicker } from './ticker.js';

export function Transport({ live, onToggleRecord, collapsed, onToggleCollapsed }) {
  const playing   = useAppStore((s) => s.seq.playing);
  const bpm       = useAppStore((s) => s.scene.bpm);
  const recording = useAppStore((s) => s.recording);
  const claudeOn  = useAppStore((s) => s.claude.available);
  const { setSeq, tweakScene } = useAppStore.getState();

  const meterRef = useRef(null);
  useTicker(() => {
    meterRef.current?.style.setProperty('--v', Math.min(1, (live.current.level ?? 0) * 1.4).toFixed(3));
  });

  const nudgeBpm = (d) => tweakScene(null, 'bpm', Math.max(60, Math.min(170, Math.round(bpm) + d)));

  return (
    <div className="transport">
      <span className="transport__logo">AI<b>r</b></span>

      <div className="transport__group" aria-label="Tracking">
        <Led label="FACE" level={() => (live.current.tracking.face ? 1 : 0.08)} title="Face tracking" />
        <Led label="HANDS" level={() => Math.min(1, live.current.tracking.hands / 2 + 0.08)} title="Hand tracking" />
      </div>

      <div className="transport__group">
        <button
          className={`tbtn tbtn--play ${playing ? 'is-on' : ''}`}
          onClick={() => setSeq({ playing: !playing })}
          aria-pressed={playing}
          title="Play / stop the sequencer (Space)"
        >
          {playing ? '■' : '▶'}
        </button>

        <div className="lcd lcd--bpm" title="Tempo — scroll or use the arrows">
          <button onClick={() => nudgeBpm(-1)} aria-label="Slower">‹</button>
          <span onWheel={(e) => nudgeBpm(e.deltaY > 0 ? -1 : 1)}>
            {Math.round(bpm)}<small>BPM</small>
          </span>
          <button onClick={() => nudgeBpm(1)} aria-label="Faster">›</button>
        </div>
      </div>

      <div className="transport__meter" aria-hidden="true">
        <span>OUT</span>
        <div ref={meterRef} className="hmeter"><i /></div>
      </div>

      <button
        className={`tbtn tbtn--rec ${recording ? 'is-on' : ''}`}
        onClick={onToggleRecord}
        aria-pressed={recording}
        title="Record video + audio (R)"
      >
        <i /> REC
      </button>

      <span
        className={`brain ${claudeOn ? 'brain--claude' : 'brain--local'}`}
        title={claudeOn
          ? 'Vibe and Jam are powered by Claude'
          : 'Vibe and Jam use the built-in local brain. Add ANTHROPIC_API_KEY to .env to use Claude.'}
      >
        {claudeOn ? 'CLAUDE' : 'LOCAL'}
      </span>

      <button className="tbtn tbtn--ghost" onClick={onToggleCollapsed} aria-expanded={!collapsed} title="Show / hide rack (H)">
        {collapsed ? '▴ RACK' : '▾ RACK'}
      </button>
    </div>
  );
}
