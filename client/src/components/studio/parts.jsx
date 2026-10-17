/**
 * parts.jsx — small building blocks shared by the rack modules.
 */

import { useRef } from 'react';
import { useTicker } from './ticker.js';

/** A titled rack module. `tag` is the small right-aligned caption (e.g. "FACE"). */
export function Module({ title, tag, className = '', children }) {
  return (
    <section className={`module ${className}`} aria-label={title}>
      <header className="module__head">
        <h2>{title}</h2>
        {tag && <span className="module__tag">{tag}</span>}
      </header>
      {children}
    </section>
  );
}

/**
 * An LED whose brightness is driven every frame by `level()` (0–1).
 * Static `on` works too, for plain status lights.
 */
export function Led({ level, on, color, label, title }) {
  const ref = useRef(null);
  useTicker(() => {
    if (level && ref.current) ref.current.style.setProperty('--lit', level().toFixed(3));
  });
  return (
    <span className="led-wrap" title={title}>
      <i ref={ref} className="led" style={{ '--lit': on ? 1 : 0, ...(color && { '--led': color }) }} />
      {label && <span className="led-label">{label}</span>}
    </span>
  );
}

/** A row of mutually exclusive buttons — like a hardware mode switch. */
export function Segmented({ label, options, value, onChange }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      <span className="seg__label">{label}</span>
      <div className="seg__opts">
        {options.map((o) => (
          <button
            key={o}
            role="radio"
            aria-checked={o === value}
            className={o === value ? 'is-on' : ''}
            onClick={() => onChange(o)}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Vertical bar meter driven every frame by `level()` (0–1). */
export function Meter({ label, caption, level }) {
  const ref = useRef(null);
  useTicker(() => {
    if (ref.current) ref.current.style.setProperty('--v', Math.max(0, Math.min(1, level())).toFixed(3));
  });
  return (
    <div className="meter" title={caption}>
      <div ref={ref} className="meter__bar"><i /></div>
      <span className="meter__label">{label}</span>
      {caption && <span className="meter__caption">{caption}</span>}
    </div>
  );
}
