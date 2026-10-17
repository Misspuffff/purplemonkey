/**
 * LookModule.jsx — the visual side of the patch: video treatment, particle
 * style, and the glitch / grain / trail amounts.
 */

import { useAppStore } from '../../store/instrumentStore.js';
import { Module, Segmented } from './parts.jsx';
import { Knob } from './Knob.jsx';

const TREATMENTS = ['natural', 'mono', 'duotone', 'thermal', 'ghost'];
const PARTICLES  = ['shards', 'rings', 'embers', 'petals'];
const pct = (v) => Math.round(v * 100);

export function LookModule() {
  const v = useAppStore((s) => s.scene.visuals);
  const tweak = (k) => (val) => useAppStore.getState().tweakScene('visuals', k, val);

  return (
    <Module title="LOOK" tag="VISUALS" className="module--look">
      <Segmented label="VIDEO" options={TREATMENTS} value={v.videoTreatment} onChange={tweak('videoTreatment')} />
      <Segmented label="HITS" options={PARTICLES} value={v.particleStyle} onChange={tweak('particleStyle')} />
      <div className="knobs">
        <Knob label="GLITCH" value={v.glitch} onChange={tweak('glitch')} format={pct} size={44} />
        <Knob label="GRAIN"  value={v.grain}  onChange={tweak('grain')}  format={pct} size={44} />
        <Knob label="TRAILS" value={v.trails} onChange={tweak('trails')} format={pct} size={44} />
      </div>
    </Module>
  );
}
