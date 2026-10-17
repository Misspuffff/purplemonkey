/**
 * StartScreen.jsx
 *
 * First thing a visitor sees: what AIr is, how to play it, and whether the
 * camera and tracking models are ready. The Start click doubles as the user
 * gesture browsers require before audio can play.
 */

const GUIDE = [
  { k: 'Face', t: 'shapes the drone', d: 'Open your jaw, raise your brows, close your eyes, smile, turn your head.' },
  { k: 'Strike', t: 'plays drums', d: 'Flick a hand down. Lower half of the frame is a kick, upper half is a snare.' },
  { k: 'Swipe', t: 'crashes metal', d: 'Sweep a hand fast, side to side.' },
];

const CAMERA_MSG = {
  pending:     'Waiting for camera permission…',
  denied:      'Camera blocked — you can still play the pads and sequencer. Allow camera access in site settings and reload for face + hands.',
  unavailable: 'No camera found — you can still play the pads and sequencer.',
};

export function StartScreen({ cameraStatus, modelsReady, onStart }) {
  const cameraOk = cameraStatus === 'ready';
  const blocked  = cameraStatus === 'denied' || cameraStatus === 'unavailable';
  const ready    = cameraOk && modelsReady;

  let status = CAMERA_MSG[cameraStatus];
  if (cameraOk) status = modelsReady ? 'Camera and tracking ready.' : 'Loading face and hand tracking…';

  return (
    <div className="start">
      <div className="start__panel">
        <h1 className="start__title">AI<span>r</span></h1>
        <p className="start__lede">A studio you play with your face and hands — with a jam partner that plays back.</p>

        <ul className="start__guide">
          {GUIDE.map((g) => (
            <li key={g.k}>
              <strong>{g.k}</strong> <em>{g.t}</em>
              <span>{g.d}</span>
            </li>
          ))}
        </ul>

        <button className="start__btn" onClick={onStart}>
          {ready ? 'Start' : blocked ? 'Play without camera' : 'Start anyway'}
        </button>
        <p className={`start__status ${blocked ? 'is-error' : ''}`} role="status">
          <i className={ready ? 'dot dot--ok' : blocked ? 'dot dot--err' : 'dot dot--wait'} />
          {status}
        </p>
        <p className="start__keys">Best with headphones · <kbd>Z</kbd><kbd>X</kbd><kbd>C</kbd> pads · <kbd>Space</kbd> play · <kbd>J</kbd> jam · <kbd>/</kbd> vibe · <kbd>R</kbd> rec · <kbd>H</kbd> rack</p>
      </div>
    </div>
  );
}
