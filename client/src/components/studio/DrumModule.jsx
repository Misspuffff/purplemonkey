/**
 * DrumModule.jsx — the hand-played drums.
 *
 * Three pads light up whenever their drum fires — from a hand gesture or from
 * clicking / tapping the pad (or Z X C), so the instrument is playable without
 * a camera too. Knobs retune the voices.
 */

import { useRef } from 'react';
import { useAppStore } from '../../store/instrumentStore.js';
import { DEFAULT_SCENE } from '../../scene/presets.js';
import { Module } from './parts.jsx';
import { Knob } from './Knob.jsx';
import { useTicker, flashLevel } from './ticker.js';

const D = DEFAULT_SCENE.drums;
const pct = (v) => Math.round(v * 100);
const semis = (v) => `${v > 0 ? '+' : ''}${Math.round(v)}`;

const PADS = [
  { drum: 'kick',  label: 'KICK',  how: 'strike low',  hotkey: 'Z' },
  { drum: 'snare', label: 'SNARE', how: 'strike high', hotkey: 'X' },
  { drum: 'metal', label: 'METAL', how: 'swipe',       hotkey: 'C' },
];

function Pad({ drum, label, how, hotkey, live, onPad }) {
  const ref = useRef(null);
  useTicker((now) => {
    ref.current?.style.setProperty('--hit', flashLevel(live.current.hits[drum], now, 220).toFixed(3));
  });
  return (
    <button
      ref={ref}
      className={`pad pad--${drum}`}
      onPointerDown={(e) => { e.preventDefault(); onPad(drum); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPad(drum); } }}
      aria-label={`${label} pad`}
    >
      <span className="pad__label">{label}</span>
      <span className="pad__how">{how}</span>
      <kbd>{hotkey}</kbd>
    </button>
  );
}

export function DrumModule({ live, onPad }) {
  const drums = useAppStore((s) => s.scene.drums);
  const tweak = (k) => (v) => useAppStore.getState().tweakScene('drums', k, v);

  return (
    <Module title="DRUMS" tag="HANDS" className="module--drums">
      <div className="pads">
        {PADS.map((p) => <Pad key={p.drum} {...p} live={live} onPad={onPad} />)}
      </div>
      <div className="knobs">
        <Knob label="TUNE" value={drums.kickTune} min={-12} max={12} step={1} defaultValue={D.kickTune}
              onChange={tweak('kickTune')} format={semis} unit="st" size={44} />
        <Knob label="DECAY" value={drums.kickLength} defaultValue={D.kickLength}
              onChange={tweak('kickLength')} format={pct} size={44} />
        <Knob label="SNARE" value={drums.snareTone} defaultValue={D.snareTone}
              onChange={tweak('snareTone')} format={pct} size={44} />
        <Knob label="METAL" value={drums.metalTone} defaultValue={D.metalTone}
              onChange={tweak('metalTone')} format={pct} size={44} />
      </div>
    </Module>
  );
}
