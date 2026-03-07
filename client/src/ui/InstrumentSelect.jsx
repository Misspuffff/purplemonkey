/**
 * ui/InstrumentSelect.jsx
 *
 * Three toggle buttons — Drums / Piano / Guitar — that write to the
 * instrument store.  The active button is visually distinct; inactive
 * buttons are dimmed.  A subtle loading indicator appears while
 * isInitialized is false after a switch.
 */

import { useInstrumentStore } from '../store/instrumentStore';
import './InstrumentSelect.css';

const INSTRUMENTS = [
  { name: 'drums', label: 'Drums', icon: '🥁' },
  { name: 'piano', label: 'Piano', icon: '🎹' },
  { name: 'guitar', label: 'Guitar', icon: '🎸' },
];

export default function InstrumentSelect() {
  const activeInstrument = useInstrumentStore((s) => s.activeInstrument);
  const isInitialized    = useInstrumentStore((s) => s.isInitialized);
  const setInstrument    = useInstrumentStore((s) => s.setInstrument);

  return (
    <div className="ins" role="toolbar" aria-label="Instrument selection">
      {INSTRUMENTS.map(({ name, label, icon }) => {
        const isActive  = name === activeInstrument;
        const isLoading = isActive && !isInitialized;

        return (
          <button
            key={name}
            className={[
              'ins__btn',
              isActive  ? 'ins__btn--active'  : '',
              isLoading ? 'ins__btn--loading' : '',
            ].join(' ').trim()}
            onClick={() => setInstrument(name)}
            aria-pressed={isActive}
            aria-label={`${label}${isLoading ? ' (loading)' : ''}`}
          >
            <span className="ins__icon" aria-hidden="true">{icon}</span>
            <span className="ins__label">{label}</span>
            {isLoading && <span className="ins__spinner" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
