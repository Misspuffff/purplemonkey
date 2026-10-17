# AIr

A music studio you play with your face and hands — in the browser, from a webcam.

- **Face → drone.** Open your jaw, raise your brows, close your eyes, smile and turn your head to shape a granular drone.
- **Hands → drums.** Flick a hand down to strike (low = kick, high = snare); swipe sideways for metal.
- **A jam partner.** A 16-step sequencer you can program by hand — or switch on **Jam** and the partner listens to what you play and rewrites the loop every few bars.
- **Vibe → patch.** Type a mood ("underwater cathedral") and get a full patch: drone, drums, colours and visual style.

Everything you see on the stage — video treatment, hand ribbons, hit particles, glitches, the patch title card — is drawn on one canvas, so **REC** captures it all with the audio.

## Run it

```bash
npm install
npm install --prefix client
npm run dev
```

Open http://localhost:5173 and allow camera access. Headphones recommended.

No camera? Click **Play without camera** — the pads (`Z` `X` `C`) and sequencer still work.

### Claude (optional)

AIr works fully offline. The vibe generator and jam partner use a small built-in rule-based "local brain" by default. To have Claude power them instead:

```bash
cp .env.example .env   # then paste your key into ANTHROPIC_API_KEY
```

Restart `npm run dev`. The transport badge switches from **LOCAL** to **CLAUDE**. The key stays on the Express server; the browser only talks to `/api/*`.

|                 | Local brain                                | Claude                                                   |
| --------------- | ------------------------------------------ | -------------------------------------------------------- |
| Vibe → patch    | Keyword lexicon (~30 mood words)           | Understands any description                              |
| Jam partner     | Tempo-following, call-and-response rules   | Musical judgement; occasionally shifts the whole patch   |
| Cost / latency  | Free, instant                              | Per-call API cost, ~1–3 s (replies land on the next bar) |

If a Claude call fails mid-jam, that bar falls back to the local brain instead of going silent.

## Controls

| Key       | Action                          |
| --------- | ------------------------------- |
| `Z` `X` `C` | Kick / snare / metal pads     |
| `Space`   | Play / stop the sequencer       |
| `J`       | Jam on / off                    |
| `/`       | Focus the vibe prompt           |
| `R`       | Record video + audio            |
| `H`       | Hide / show the rack            |
| `D`       | Debug readout                   |

Knobs: drag up/down (Shift for fine), scroll, or arrow keys; double-click resets. The thin outer ring on the drone knobs shows how far your face is pushing that parameter right now.

## How it fits together

```
client/src
├── App.jsx              camera + tracking → engines → renderer, one RAF loop
├── hooks/               camera, MediaPipe face + hand landmarkers, recorder
├── gesture-engine/      strike / swipe detection from hand velocity
├── audio-engine/        Tone.js: GranularEngine (face), PercussiveEngine (hands),
│                        JamEngine (sequencer), masterBus (limiter, meter, rec tap)
├── visuals/             canvas renderer, particles, colour easing
├── brain/               vibe + jam: Claude via /api, or the local fallback
├── scene/presets.js     the Scene (patch) shape + built-in patches
└── components/studio/   the rack: transport, patch, drone, drums, sequencer, look
server/
├── index.js             Express: /api/status, /api/vibe, /api/jam (+ static in prod)
├── claude.js            Anthropic SDK calls with structured outputs
└── scene.js             JSON Schema sent to Claude + Zod schemas that clamp replies
```

A **Scene** is the single contract between everything: the brains produce Scenes, the engines and renderer consume them, the knobs edit them.

## Production

```bash
npm run build
npm start          # serves client/dist and /api on :3001
```
