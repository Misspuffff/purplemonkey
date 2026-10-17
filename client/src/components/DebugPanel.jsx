/**
 * DebugPanel.jsx
 *
 * Live readout of face expression values and recent gesture events.
 * Reads from a shared ref that the RAF loop writes to each frame.
 * Updates via 100ms interval — no RAF involvement, no re-render pressure.
 *
 * Toggle with the 'D' key (wired in App.jsx).
 */

import { useEffect, useState } from 'react';

function Bar({ label, value }) {
  const pct = Math.min(100, Math.round(value * 100));
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
      <span style={{
        width: 88, fontSize: 10, color: '#888',
        fontFamily: 'monospace', letterSpacing: '0.04em',
      }}>
        {label}
      </span>
      <div style={{
        width: 72, height: 5, background: '#222',
        borderRadius: 2, overflow: 'hidden', flexShrink: 0,
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: '#00ff88', borderRadius: 2,
        }} />
      </div>
      <span style={{
        marginLeft: 7, width: 30, fontSize: 10,
        color: '#ccc', fontFamily: 'monospace', textAlign: 'right',
      }}>
        {value.toFixed(2)}
      </span>
    </div>
  );
}

const SECTION = { fontSize: 9, color: '#555', fontFamily: 'monospace',
                  letterSpacing: '0.12em', marginBottom: 6 };

export function DebugPanel({ debugRef }) {
  const [face, setFace] = useState({ jawOpen: 0, browInnerUp: 0, eyesClosed: 0, mouthSmile: 0 });
  const [gestures, setGestures] = useState([]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!debugRef?.current) return;
      setFace({ ...debugRef.current.face });
      const now = performance.now();
      setGestures(debugRef.current.gestures.map((g) => ({ ...g, age: (now - g.t) / 1000 })));
    }, 100);
    return () => clearInterval(id);
  }, [debugRef]);

  return (
    <div style={{
      position: 'absolute', top: 64, right: 16,
      background: 'rgba(0,0,0,0.70)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 6, padding: '10px 12px',
      backdropFilter: 'blur(6px)',
      minWidth: 210,
      pointerEvents: 'none',
      userSelect: 'none',
    }}>
      <div style={SECTION}>FACE EXPRESSIONS</div>
      <Bar label="jawOpen"     value={face.jawOpen     ?? 0} />
      <Bar label="browInnerUp" value={face.browInnerUp ?? 0} />
      <Bar label="eyesClosed"  value={face.eyesClosed  ?? 0} />
      <Bar label="mouthSmile"  value={face.mouthSmile  ?? 0} />

      <div style={{ ...SECTION, marginTop: 10 }}>GESTURE EVENTS</div>
      {gestures.length === 0 ? (
        <div style={{ fontSize: 10, color: '#444', fontFamily: 'monospace' }}>—</div>
      ) : (
        gestures.map((g, i) => (
          <div key={i} style={{
            fontSize: 10, fontFamily: 'monospace', marginBottom: 2,
            color: i === 0 ? '#fff' : '#555',
          }}>
            {g.type} H{g.hand}
            <span style={{ color: '#444', marginLeft: 6 }}>
              {g.age.toFixed(1)}s
            </span>
          </div>
        ))
      )}

      <div style={{ ...SECTION, marginTop: 10, color: '#333' }}>
        [D] toggle
      </div>
    </div>
  );
}
