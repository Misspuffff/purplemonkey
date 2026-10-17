/**
 * DroneModule.jsx — the face-played granular drone.
 *
 * Knobs set the patch's base character; the outer ring on each knob shows how
 * far your face is pushing it right now. The meters underneath are the raw
 * face signals, each captioned with what it controls.
 */

import { useAppStore } from '../../store/instrumentStore.js';
import { DEFAULT_SCENE } from '../../scene/presets.js';
import { Module, Meter } from './parts.jsx';
import { Knob } from './Knob.jsx';

const D = DEFAULT_SCENE.drone;
const pct = (v) => Math.round(v * 100);
const semis = (v) => `${v > 0 ? '+' : ''}${Math.round(v)}`;

export function DroneModule({ live }) {
  const drone = useAppStore((s) => s.scene.drone);
  const tweak = (k) => (v) => useAppStore.getState().tweakScene('drone', k, v);
  const f = () => live.current.face;

  return (
    <Module title="DRONE" tag="FACE" className="module--drone">
      <div className="knobs">
        <Knob size={46} label="PITCH" value={drone.pitch} min={-12} max={12} step={1} defaultValue={D.pitch}
              onChange={tweak('pitch')} format={semis} unit="st" mod={() => f().browInnerUp * 0.3} />
        <Knob size={46} label="TONE" value={drone.brightness} defaultValue={D.brightness}
              onChange={tweak('brightness')} format={pct} mod={() => f().jawOpen} />
        <Knob size={46} label="SPACE" value={drone.space} defaultValue={D.space}
              onChange={tweak('space')} format={pct} mod={() => f().browInnerUp} />
        <Knob size={46} label="DENSITY" value={drone.density} defaultValue={D.density}
              onChange={tweak('density')} format={pct} mod={() => f().eyesClosed} />
        <Knob size={46} label="MOTION" value={drone.motion} defaultValue={D.motion}
              onChange={tweak('motion')} format={pct} mod={() => Math.abs(f().yaw)} />
      </div>

      <div className="meters">
        <Meter label="JAW"   caption="grain + filter" level={() => f().jawOpen} />
        <Meter label="BROW"  caption="reverb + pitch" level={() => f().browInnerUp} />
        <Meter label="EYES"  caption="smear" level={() => f().eyesClosed} />
        <Meter label="SMILE" caption="shimmer" level={() => f().mouthSmile} />
        <Meter label="TURN"  caption="speed" level={() => Math.abs(f().yaw) * 1.5} />
      </div>
    </Module>
  );
}
