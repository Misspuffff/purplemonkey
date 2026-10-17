/**
 * SequencerModule.jsx — 16-step drum + bass sequencer, and the jam partner.
 *
 * Click a cell to cycle it (rest → soft → medium → hard; bass cycles scale
 * degrees). Play runs the loop on its own. Jam hands the grid to the brain,
 * which rewrites it every few bars in response to what you play — you can keep
 * editing while it does.
 */

import { useRef } from 'react';
import { useAppStore } from '../../store/instrumentStore.js';
import { LANES, STARTER_PATTERN } from '../../audio-engine/patterns.js';
import { DEFAULT_SCENE } from '../../scene/presets.js';
import { Module, Led } from './parts.jsx';
import { Knob } from './Knob.jsx';
import { useTicker, flashLevel } from './ticker.js';

const EMPTY = { kick: Array(16).fill(0), snare: Array(16).fill(0), hat: Array(16).fill(0), bass: Array(16).fill(0) };

export function SequencerModule({ live }) {
  const seq      = useAppStore((s) => s.seq);
  const jam      = useAppStore((s) => s.jam);
  const swing    = useAppStore((s) => s.scene.drums.swing);
  const claudeOn = useAppStore((s) => s.claude.available);
  const { setSeq, setJam, toggleStep, tweakScene } = useAppStore.getState();

  const gridRef = useRef(null);
  useTicker(() => {
    const step = live.current.jam?.isPlaying ? live.current.jam.step : -1;
    gridRef.current?.style.setProperty('--step', step);
    gridRef.current?.classList.toggle('is-running', step >= 0);
  });

  const lastHit = (lane) => () => flashLevel(live.current.jam?.lastHits?.[lane], performance.now(), 160);

  return (
    <Module title="SEQUENCER" tag={jam.enabled ? (claudeOn ? 'JAM · CLAUDE' : 'JAM · LOCAL') : 'STEP'} className="module--seq">
      <div className="seq-head">
        <button
          className={`tbtn tbtn--play ${seq.playing ? 'is-on' : ''}`}
          onClick={() => setSeq({ playing: !seq.playing })}
          aria-pressed={seq.playing}
          title="Play / stop (Space)"
        >
          {seq.playing ? '■ STOP' : '▶ PLAY'}
        </button>
        <button
          className={`tbtn tbtn--jam ${jam.enabled ? 'is-on' : ''}`}
          onClick={() => setJam({ enabled: !jam.enabled })}
          aria-pressed={jam.enabled}
          title="Let the jam partner rewrite the loop as you play (J)"
        >
          {jam.enabled ? '● JAMMING' : 'JAM'}
        </button>
        <button className="tbtn tbtn--ghost" onClick={() => setSeq({ pattern: EMPTY, source: 'user' })}>CLEAR</button>
        <button className="tbtn tbtn--ghost" onClick={() => setSeq({ pattern: STARTER_PATTERN, source: 'user' })}>RESET</button>
        <Knob label="SWING" value={swing} defaultValue={DEFAULT_SCENE.drums.swing} size={36}
              onChange={(v) => tweakScene('drums', 'swing', v)} format={(v) => Math.round(v * 100)} />
      </div>

      <div className={`lcd seq-lcd ${jam.status === 'error' ? 'is-error' : ''}`} aria-live="polite">
        {jam.enabled
          ? <>{jam.status === 'error' && !jam.comment ? jam.error : jam.comment || 'listening…'}{jam.status === 'thinking' && <span className="thinking" />}</>
          : 'click cells to program · JAM lets the partner play along'}
      </div>

      <div ref={gridRef} className="grid" role="grid" aria-label="Step sequencer">
        {LANES.map(({ key, label, max }) => (
          <div key={key} className="grid__row" role="row">
            <span className="grid__lane"><Led level={lastHit(key)} />{label}</span>
            <div className="grid__cells">
              {seq.pattern[key].map((v, i) => (
                <button
                  key={i}
                  role="gridcell"
                  className={`cell ${v ? 'is-on' : ''} ${i % 4 === 0 ? 'is-beat' : ''}`}
                  style={{ '--v': v / max }}
                  onClick={() => toggleStep(key, i, max)}
                  aria-label={`${label} step ${i + 1}: ${v ? (key === 'bass' ? `degree ${v}` : `level ${v}`) : 'off'}`}
                >
                  {key === 'bass' && v ? v : null}
                </button>
              ))}
              <i className="grid__playhead" aria-hidden="true" />
            </div>
          </div>
        ))}
      </div>
    </Module>
  );
}
