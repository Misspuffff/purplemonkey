/**
 * Knob.jsx
 *
 * A hardware-style rotary control.
 *   • drag up/down (hold Shift for fine), scroll, or arrow keys to change
 *   • double-click to reset to the default
 *   • optional `mod` (() => 0–1): an outer ring that shows live modulation —
 *     how far your face is pushing this parameter right now
 *
 * Exposed to assistive tech as a slider.
 */

import { useRef, useState } from 'react';
import { useTicker } from './ticker.js';

const SWEEP = 270;                 // degrees of travel
const START = -SWEEP / 2;          // 0° = straight up

function polar(cx, cy, r, deg) {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

function arc(cx, cy, r, from, to) {
  if (to - from < 0.5) return '';
  const [x1, y1] = polar(cx, cy, r, from);
  const [x2, y2] = polar(cx, cy, r, to);
  return `M${x1} ${y1} A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
}

export function Knob({
  label, value, min = 0, max = 1, step, defaultValue,
  onChange, format = (v) => Math.round(v * 100), unit = '', mod, size = 52,
}) {
  const [drag, setDrag] = useState(false);
  const modRef = useRef(null);
  const startRef = useRef(null);
  const range = max - min;
  const t = (value - min) / range;
  const angle = START + t * SWEEP;
  const c = size / 2;
  const fineStep = step ?? range / 100;

  const set = (v) => {
    const snapped = step ? Math.round(v / step) * step : v;
    onChange(Math.max(min, Math.min(max, snapped)));
  };

  useTicker(() => {
    if (!mod || !modRef.current) return;
    const m = Math.max(0, Math.min(1, mod()));
    modRef.current.setAttribute('d', arc(c, c, c - 2, angle, Math.min(START + SWEEP, angle + m * SWEEP)));
  });

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    startRef.current = { y: e.clientY, v: value };
    setDrag(true);
  };
  const onPointerMove = (e) => {
    if (!startRef.current) return;
    const dy = startRef.current.y - e.clientY;
    set(startRef.current.v + (dy / (e.shiftKey ? 600 : 150)) * range);
  };
  const end = () => { startRef.current = null; setDrag(false); };

  const onKeyDown = (e) => {
    const big = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); set(value + fineStep * big); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); set(value - fineStep * big); }
    if (e.key === 'Home') set(min);
    if (e.key === 'End') set(max);
  };

  const [px, py] = polar(c, c, c * 0.52, angle);

  return (
    <div className={`knob ${drag ? 'is-drag' : ''}`}>
      <svg
        width={size} height={size} viewBox={`0 0 ${size} ${size}`}
        role="slider" tabIndex={0}
        aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={Number(value.toFixed(3))}
        aria-valuetext={`${format(value)}${unit}`}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={end} onPointerCancel={end}
        onWheel={(e) => set(value - Math.sign(e.deltaY) * fineStep * (e.shiftKey ? 1 : 3))}
        onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)}
        onKeyDown={onKeyDown}
      >
        <path className="knob__track" d={arc(c, c, c - 6, START, START + SWEEP)} />
        <path className="knob__value" d={arc(c, c, c - 6, START, angle)} />
        {mod && <path ref={modRef} className="knob__mod" />}
        <circle className="knob__cap" cx={c} cy={c} r={c * 0.62} />
        <line className="knob__pointer" x1={c} y1={c} x2={px} y2={py} />
      </svg>
      <span className="knob__label">{label}</span>
      <span className="knob__readout">{format(value)}{unit}</span>
    </div>
  );
}
