/**
 * PatchModule.jsx — the patch display and the vibe → patch generator.
 *
 * The LCD shows the current patch; ‹ › step through presets; typing a mood and
 * pressing Generate asks the brain (Claude, or the local lexicon) for a patch.
 */

import { useRef, useState } from 'react';
import { useAppStore } from '../../store/instrumentStore.js';
import { PRESETS } from '../../scene/presets.js';
import { generateVibe } from '../../brain/index.js';
import { Module } from './parts.jsx';

const SOURCE = { preset: 'PRESET', vibe: 'GENERATED', jam: 'FROM JAM', edit: 'EDITED' };

export function PatchModule({ inputRef }) {
  const scene    = useAppStore((s) => s.scene);
  const source   = useAppStore((s) => s.sceneSource);
  const vibe     = useAppStore((s) => s.vibe);
  const claudeOn = useAppStore((s) => s.claude.available);
  const { setScene, setVibe } = useAppStore.getState();
  const [text, setText] = useState('');
  const abortRef = useRef(null);

  const idx = PRESETS.findIndex((p) => p.name === scene.name);
  const step = (d) => setScene(PRESETS[(Math.max(idx, 0) + d + PRESETS.length) % PRESETS.length], 'preset');

  async function submit(e) {
    e.preventDefault();
    const prompt = text.trim();
    if (!prompt) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setVibe({ status: 'loading', error: null });
    try {
      const { scene: next } = await generateVibe(prompt, scene, abortRef.current.signal);
      setScene(next, 'vibe');
      setVibe({ status: 'idle' });
      setText('');
      inputRef.current?.blur();
    } catch (err) {
      if (err.name !== 'AbortError') setVibe({ status: 'error', error: err.message });
    }
  }

  return (
    <Module title="PATCH" tag={claudeOn ? 'CLAUDE' : 'LOCAL'} className="module--patch">
      <div className="patch-lcd lcd">
        <button className="lcd__nav" onClick={() => step(-1)} aria-label="Previous preset">‹</button>
        <div className="patch-lcd__body" aria-live="polite">
          <span className="patch-lcd__meta">
            {String(Math.max(idx, 0) + 1).padStart(2, '0')} · {SOURCE[source]}
          </span>
          <strong>{vibe.status === 'loading' ? 'GENERATING…' : scene.name}</strong>
          <span className="patch-lcd__tag">
            {vibe.status === 'error' ? <em>{vibe.error}</em> : scene.tagline}
          </span>
        </div>
        <button className="lcd__nav" onClick={() => step(1)} aria-label="Next preset">›</button>
      </div>

      <div className="swatches" aria-hidden="true">
        {scene.visuals.palette.map((c, i) => <i key={i} style={{ background: c }} />)}
      </div>

      <form className="vibe" onSubmit={submit}>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="describe a sound… underwater cathedral"
          maxLength={300}
          disabled={vibe.status === 'loading'}
          aria-label="Describe a vibe to generate a patch"
        />
        <button className="tbtn tbtn--accent" disabled={!text.trim() || vibe.status === 'loading'}>
          {vibe.status === 'loading' ? <span className="thinking" /> : 'GENERATE'}
        </button>
      </form>
    </Module>
  );
}
