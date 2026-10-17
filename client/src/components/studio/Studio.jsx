/**
 * Studio.jsx — the rack under the video: transport strip + five modules.
 *
 * `live` is App's per-frame ref (face values, master level, hit timestamps,
 * tracking, jam engine). Modules read it through the shared ticker, so the rack
 * only re-renders when store state (knobs, pattern, patch) actually changes.
 */

import { Transport } from './Transport.jsx';
import { PatchModule } from './PatchModule.jsx';
import { DroneModule } from './DroneModule.jsx';
import { DrumModule } from './DrumModule.jsx';
import { SequencerModule } from './SequencerModule.jsx';
import { LookModule } from './LookModule.jsx';
import './studio.css';

export function Studio({ live, inputRef, onPad, onToggleRecord, collapsed, onToggleCollapsed }) {
  return (
    <div className={`rack ${collapsed ? 'is-collapsed' : ''}`}>
      <Transport live={live} onToggleRecord={onToggleRecord} collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} />
      {!collapsed && (
        <div className="rack__modules">
          <PatchModule inputRef={inputRef} />
          <DroneModule live={live} />
          <DrumModule live={live} onPad={onPad} />
          <SequencerModule live={live} />
          <LookModule />
        </div>
      )}
    </div>
  );
}
