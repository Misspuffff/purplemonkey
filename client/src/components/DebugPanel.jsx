import './DebugPanel.css';

// ── Static lookup tables ──────────────────────────────────────────────────────

const ZONE_META = {
  hihat: { emoji: '🎩', label: 'hi-hat',  color: '#4fc3f7' },
  crash: { emoji: '💥', label: 'crash',   color: '#ff8a65' },
  snare: { emoji: '🥁', label: 'snare',   color: '#ce93d8' },
  kick:  { emoji: '🦵', label: 'kick',    color: '#a5d6a7' },
};

// Colours cycle per octave number so notes group visually.
const OCTAVE_COLORS = {
  2: '#b39ddb', 3: '#80cbc4', 4: '#fff176', 5: '#ffab91',
};

/**
 * Resolve display metadata for any zone string — drum zone OR note name.
 * Note names match /^[A-G](#|b)?\d$/ e.g. "C4", "F#3", "Bb2".
 */
function resolveMeta(zone) {
  if (ZONE_META[zone]) return ZONE_META[zone];

  // Piano note — extract octave digit for colour, keep label as-is.
  const octaveMatch = zone.match(/(\d)$/);
  const octave      = octaveMatch ? octaveMatch[1] : '4';
  const color       = OCTAVE_COLORS[octave] ?? '#e0e0e0';
  return { emoji: '🎹', label: zone, color };
}

const HAND_LABEL = { 0: 'L', 1: 'R' };

/** Format a performance.now() timestamp as a relative age string. */
function relAge(ts) {
  const age = performance.now() - ts;
  if (age < 1000) return `${Math.round(age)}ms`;
  return `${(age / 1000).toFixed(1)}s`;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * DebugPanel
 *
 * Shows the last `maxEvents` GestureEvents in a compact fixed overlay.
 *
 * Props
 * ──────
 * @param {GestureEvent[]} events     – accumulated gesture history (newest last)
 * @param {number}         maxEvents  – how many rows to show (default 5)
 */
export default function DebugPanel({ events, maxEvents = 5, threshold = 0.8, cooldown = 150 }) {
  // Newest row at top.
  const visible = events.slice(-maxEvents).reverse();

  return (
    <aside className="dp" aria-label="Gesture debug panel">
      <header className="dp__header">
        <span className="dp__title">Gesture log</span>
        <span className="dp__count">{events.length} total</span>
      </header>

      <div className="dp__body">
        {visible.length === 0 ? (
          <p className="dp__empty">Strike a zone to see events…</p>
        ) : (
          <ol className="dp__list" reversed>
            {visible.map((evt, rowIdx) => {
              const meta   = resolveMeta(evt.zone);
              const velPct = Math.round(evt.velocity * 100);
              const isFresh = rowIdx === 0;

              return (
                <li
                  key={evt.timestamp}
                  className={`dp__row${isFresh ? ' dp__row--fresh' : ''}`}
                  style={{ '--zone-color': meta.color }}
                >
                  {/* ① Zone pill */}
                  <span className="dp__zone">
                    <span className="dp__zone-emoji" role="img" aria-label={meta.label}>
                      {meta.emoji}
                    </span>
                    <span className="dp__zone-name">{meta.label}</span>
                  </span>

                  {/* ② Velocity bar + percentage */}
                  <span className="dp__vel" title={`velocity ${evt.velocity.toFixed(3)}`}>
                    <span className="dp__vel-track">
                      <span className="dp__vel-fill" style={{ width: `${velPct}%` }} />
                    </span>
                    <span className="dp__vel-pct">{velPct}%</span>
                  </span>

                  {/* ③ Hand badge */}
                  <span className="dp__hand" title={`hand ${evt.handIndex}`}>
                    {HAND_LABEL[evt.handIndex] ?? evt.handIndex}
                  </span>

                  {/* ④ Age */}
                  <span className="dp__age">{relAge(evt.timestamp)}</span>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <footer className="dp__footer">
        threshold <code>{threshold}</code> nu/s · cooldown <code>{cooldown}</code> ms
      </footer>
    </aside>
  );
}
