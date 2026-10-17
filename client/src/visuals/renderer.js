/**
 * visuals/renderer.js
 *
 * Draws one AIr frame onto the main canvas. Owns all per-frame visual state
 * (palette easing, ribbons, particles, glitch events) so App.jsx only has to
 * feed it inputs and events.
 *
 * Layer order (bottom → top)
 *   1. Mirrored video with the Scene's treatment (+ kick "bump" zoom)
 *   2. Face ambience — palette tint, grain, brow streaks, breathing vignette
 *   3. Glitch layer — strike lines / swipe scanline tears with motion trails
 *   4. Shockwaves + particles
 *   5. Hand ribbons and fingertip dots
 *   6. Jam partner step dots
 *   7. Scene title card
 *
 * Everything is on the canvas (no DOM overlays) so recordings capture it all.
 */

import { hexToRgb, rgba, mix, easeColor, lerp, clamp, WHITE } from './color.js';
import { spawnBurst, spawnStreak, updateAndDrawParticles, drawShockwaves } from './particles.js';

const RIBBON_TIPS  = [4, 8];               // thumb + index fingertip
const ALL_TIPS     = [4, 8, 12, 16, 20];
const TITLE_MS     = 2800;
const PALETTE_EASE = 0.045;                // ≈1 s crossfade at 60 fps

const TREATMENT_FILTER = {
  natural: 'none',
  mono:    'grayscale(1) contrast(1.35) brightness(0.85)',
  duotone: 'grayscale(1) contrast(1.4) brightness(1.1)',
  thermal: 'grayscale(1) contrast(1.6) brightness(1.05)',
  ghost:   'grayscale(0.6) brightness(1.3)',
};

export class Renderer {
  #ctx;
  #glitch = document.createElement('canvas');
  #gc     = this.#glitch.getContext('2d');
  #ghost  = document.createElement('canvas');
  #ghc    = this.#ghost.getContext('2d');

  #visuals = null;
  #palette = [hexToRgb('#0a0a0a'), hexToRgb('#00ff88'), hexToRgb('#ff4488')];
  #target  = this.#palette.map((c) => ({ ...c }));

  #trails     = [];   // [handIndex][tipIdx] → [{x,y}]
  #particles  = [];
  #waves      = [];
  #glitchEvts = [];
  #bump       = 0;    // kick zoom, decays each frame
  #flash      = 0;    // scene-change flash
  #title      = null; // { name, tagline, born }
  #lastNow    = performance.now();

  constructor(canvas) {
    this.#ctx = canvas.getContext('2d');
  }

  // ── Events ────────────────────────────────────────────────────────────────

  setScene(scene, announce = true) {
    this.#visuals = scene.visuals;
    this.#target  = scene.visuals.palette.map(hexToRgb);
    if (announce) {
      this.#title = { name: scene.name, tagline: scene.tagline, born: performance.now() };
      this.#flash = 1;
    }
  }

  /** drum: 'kick' | 'snare'. x/y in canvas pixels. */
  onStrike(x, y, drum, velocity) {
    const [, primary, accent] = this.#palette;
    const scale = this.#scale();
    const color = drum === 'kick' ? primary : accent;
    spawnBurst(this.#particles, this.#visuals?.particleStyle ?? 'shards', x, y, velocity,
               [primary, accent, WHITE], scale);
    this.#waves.push({ x, y, born: performance.now(), color,
                       life: drum === 'kick' ? 700 : 450,
                       maxR: (drum === 'kick' ? 320 : 160) * scale * (0.6 + velocity),
                       width: (drum === 'kick' ? 10 : 5) * scale });
    if (drum === 'kick') this.#bump = Math.min(1, this.#bump + 0.6 + velocity * 0.4);
    if ((this.#visuals?.glitch ?? 0.5) > 0.05) this.#glitchEvts.push(this.#spawnStrikeGlitch(x, y));
  }

  onSwipe(x, y, dir, velocity) {
    const [, primary, accent] = this.#palette;
    spawnStreak(this.#particles, x, y, dir, velocity, [primary, accent, WHITE], this.#scale());
    if ((this.#visuals?.glitch ?? 0.5) > 0.05) this.#glitchEvts.push(this.#spawnSwipeGlitch(dir));
  }

  // ── Frame ─────────────────────────────────────────────────────────────────

  /**
   * @param {object} f
   * @param {HTMLVideoElement} f.video
   * @param {number} f.now
   * @param {Array<Array<{x,y}>>} f.hands      raw landmarks (unmirrored, normalised)
   * @param {Array<{x,y}>|null} f.faceLandmarks
   * @param {object} f.face                    smoothed blendshapes
   * @param {number} f.level                   master level 0–1
   * @param {{step:number, lastHits:object}|null} f.jam
   */
  draw({ video, now, hands, faceLandmarks, face, level, jam }) {
    const ctx = this.#ctx;
    const { width: w, height: h } = ctx.canvas;
    const dt = Math.min(0.1, (now - this.#lastNow) / 1000);
    this.#lastNow = now;
    const v = this.#visuals ?? { glitch: 0.7, grain: 0.4, trails: 0.5, videoTreatment: 'natural' };

    this.#palette.forEach((c, i) => easeColor(c, this.#target[i], PALETTE_EASE));
    this.#bump  *= 0.86;
    this.#flash *= 0.9;

    this.#drawVideo(ctx, video, w, h, v.videoTreatment);
    this.#drawFaceAmbient(ctx, w, h, face, faceLandmarks, level, v);
    this.#drawGlitch(ctx, w, h, now, v.glitch);
    drawShockwaves(ctx, this.#waves, now);
    updateAndDrawParticles(ctx, this.#particles, now, dt, this.#scale());
    this.#drawHands(ctx, hands, w, h, v.trails, level);
    if (jam && jam.step >= 0) this.#drawJam(ctx, w, h, now, jam);
    this.#drawTitle(ctx, w, h, now);

    if (this.#flash > 0.01) {
      ctx.fillStyle = rgba(this.#palette[1], this.#flash * 0.25);
      ctx.fillRect(0, 0, w, h);
    }
  }

  // ── Layers ────────────────────────────────────────────────────────────────

  #scale() { return this.#ctx.canvas.height / 720; }

  #drawVideo(ctx, video, w, h, treatment) {
    const [bg, primary, accent] = this.#palette;
    const z = 1 + this.#bump * 0.025;

    if (!video) {
      // No camera: a slow-drifting gradient field so pads and the sequencer still have a stage
      const t = performance.now() / 6000;
      const g = ctx.createRadialGradient(w * (0.5 + 0.2 * Math.sin(t)), h * (0.45 + 0.15 * Math.cos(t * 1.3)), 0,
                                         w / 2, h / 2, h * 1.1);
      g.addColorStop(0, rgba(mix(bg, primary, 0.28)));
      g.addColorStop(0.55, rgba(mix(bg, accent, 0.08)));
      g.addColorStop(1, rgba(bg));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      return;
    }

    const drawMirrored = (c, filter) => {
      c.save();
      c.filter = filter;
      c.translate(w / 2, h / 2);
      c.scale(-z, z);
      c.translate(-w / 2, -h / 2);
      c.drawImage(video, 0, 0, w, h);
      c.restore();
    };

    if (treatment === 'ghost') {
      // Low-alpha accumulation → motion smears into soft afterimages
      if (this.#ghost.width !== w || this.#ghost.height !== h) {
        this.#ghost.width = w; this.#ghost.height = h;
      }
      this.#ghc.globalAlpha = 0.16;
      drawMirrored(this.#ghc, TREATMENT_FILTER.ghost);
      this.#ghc.globalAlpha = 1;
      ctx.drawImage(this.#ghost, 0, 0);
    } else {
      drawMirrored(ctx, TREATMENT_FILTER[treatment] ?? 'none');
    }

    ctx.save();
    if (treatment === 'duotone') {
      // Luminance → shadows in bg, highlights in primary
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = rgba(mix(primary, WHITE, 0.25));
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighten';
      ctx.fillStyle = rgba(bg);
      ctx.fillRect(0, 0, w, h);
    } else if (treatment === 'thermal') {
      // Hue from a radial accent→primary gradient, luminance from the video
      const g = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, h * 0.8);
      g.addColorStop(0, rgba(accent));
      g.addColorStop(1, rgba(primary));
      ctx.globalCompositeOperation = 'color';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();

    // Pull the video back so effects read as foreground
    ctx.fillStyle = rgba(bg, treatment === 'natural' ? 0.3 : 0.18);
    ctx.fillRect(0, 0, w, h);
  }

  #drawFaceAmbient(ctx, w, h, face, lm, level, v) {
    const [bg, primary, accent] = this.#palette;
    const { jawOpen = 0, browInnerUp = 0, eyesClosed = 0, mouthSmile = 0 } = face ?? {};

    // 1. Tint — background colour, pulled toward primary by jaw, accent by smile
    const tint = mix(mix(bg, primary, jawOpen * 0.5), accent, mouthSmile * 0.4);
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = rgba(tint);
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // 2. Grain — always a little (scene), more with an open jaw
    const grainAlpha = v.grain * (0.05 + jawOpen * 0.2);
    if (grainAlpha > 0.004) {
      const nose = lm?.[4];
      const fx = nose ? (1 - nose.x) * w : w * 0.5;
      const fy = nose ? nose.y * h : h * 0.4;
      const spread = w * (0.25 + jawOpen * 0.3);
      const gColor = mix(WHITE, accent, browInnerUp);
      const count = (60 + v.grain * 160) | 0;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = rgba(gColor);
      for (let i = 0; i < count; i++) {
        const px = fx + (Math.random() - 0.5) * spread * 2;
        const py = fy + (Math.random() - 0.5) * spread * 1.4;
        const sz = 1.5 + Math.random() * 2.5;
        ctx.globalAlpha = grainAlpha * (0.4 + Math.random() * 0.6);
        ctx.fillRect(px, py, sz, sz);
      }
      ctx.restore();
    }

    // 3. Brow streaks — rising lines above the inner brows when raised
    if (browInnerUp > 0.4 && lm) {
      const t = (browInnerUp - 0.4) / 0.6;
      const maxH = (15 + t * 50) * this.#scale();
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.lineWidth = 1;
      [lm[107], lm[336]].filter(Boolean).forEach((pt) => {
        const x = (1 - pt.x) * w, y = pt.y * h;
        for (let i = 0; i < 4; i++) {
          const ox = (Math.random() - 0.5) * 24;
          ctx.strokeStyle = rgba(mix(WHITE, primary, Math.random()), t * 0.7 * (0.6 + Math.random() * 0.4));
          ctx.beginPath();
          ctx.moveTo(x + ox, y);
          ctx.lineTo(x + ox, y - maxH * (0.4 + Math.random() * 0.6));
          ctx.stroke();
        }
      });
      ctx.restore();
    }

    // 4. Vignette — breathes with the mix level, deepens when eyes close
    const vig = clamp(0.35 + eyesClosed * 0.4 - level * 0.25, 0, 0.8);
    const g = ctx.createRadialGradient(w / 2, h / 2, h * lerp(0.35, 0.2, eyesClosed), w / 2, h / 2, h * 0.85);
    g.addColorStop(0, rgba(bg, 0));
    g.addColorStop(1, rgba(bg, vig));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  #spawnStrikeGlitch(x, y) {
    const g = this.#visuals?.glitch ?? 0.7;
    const s = this.#scale();
    const rand = (lo, hi) => lo + Math.random() * (hi - lo);
    return {
      type: 'strike', t: performance.now(), x, y,
      lines: Array.from({ length: Math.round(4 + g * 10) }, () => ({
        dir: Math.random() > 0.5 ? 1 : -1, len: rand(40, 220) * s * (0.4 + g),
        lw: rand(1, 2.5), dy: rand(-12, 12) * s, ci: Math.floor(Math.random() * 3),
      })),
      blocks: Array.from({ length: Math.round(3 + g * 9) }, () => {
        const a = Math.random() * Math.PI * 2, d = rand(8, 70) * s;
        return { bx: x + Math.cos(a) * d, by: y + Math.sin(a) * d, sz: rand(3, 9) * s, ci: Math.floor(Math.random() * 3) };
      }),
    };
  }

  #spawnSwipeGlitch(dir) {
    const { width: w, height: h } = this.#ctx.canvas;
    const g = this.#visuals?.glitch ?? 0.7;
    return {
      type: 'swipe', t: performance.now(), w,
      bands: Array.from({ length: Math.round(1 + g * 3) }, () => ({
        y: Math.random() * h, bh: 1 + Math.random() * 3, offset: dir * (10 + Math.random() * 40),
      })),
    };
  }

  #drawGlitch(ctx, w, h, now, amount) {
    const gc = this.#gc;
    if (this.#glitch.width !== w || this.#glitch.height !== h) {
      this.#glitch.width = w; this.#glitch.height = h;
    }
    // Partial fade = motion-blur trail without touching the video layer
    gc.globalCompositeOperation = 'destination-out';
    gc.fillStyle = 'rgba(0,0,0,0.2)';
    gc.fillRect(0, 0, w, h);
    gc.globalCompositeOperation = 'screen';

    const cols = [WHITE, this.#palette[1], this.#palette[2]];
    this.#glitchEvts = this.#glitchEvts.filter((e) => {
      const age = now - e.t;
      const ttl = e.type === 'strike' ? 260 : 200;
      if (age >= ttl) return false;
      const a = (1 - age / ttl) * (0.4 + amount * 0.6);
      if (e.type === 'strike') {
        e.lines.forEach(({ dir, len, lw, dy, ci }) => {
          gc.strokeStyle = rgba(cols[ci], a);
          gc.lineWidth = lw;
          gc.beginPath();
          gc.moveTo(e.x, e.y + dy);
          gc.lineTo(e.x + dir * len, e.y + dy);
          gc.stroke();
        });
        e.blocks.forEach(({ bx, by, sz, ci }) => {
          gc.fillStyle = rgba(cols[ci], a);
          gc.fillRect(bx, by, sz, sz);
        });
      } else {
        gc.fillStyle = rgba(mix(WHITE, this.#palette[1], 0.4), a * 0.45);
        e.bands.forEach(({ y, bh, offset }) => gc.fillRect(offset, y, e.w, bh));
      }
      return true;
    });

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(this.#glitch, 0, 0);
    ctx.restore();
  }

  #drawHands(ctx, hands, w, h, trails, level) {
    const maxLen = Math.round(lerp(5, 34, trails));
    const s = this.#scale();
    const colors = [this.#palette[1], this.#palette[2]];

    for (let hi = 0; hi < 2; hi++) {
      const lm = hands[hi];
      this.#trails[hi] ??= RIBBON_TIPS.map(() => []);
      RIBBON_TIPS.forEach((tip, ti) => {
        const trail = this.#trails[hi][ti];
        if (lm?.[tip]) trail.push({ x: (1 - lm[tip].x) * w, y: lm[tip].y * h });
        else trail.splice(0, 2); // hand gone — let the ribbon drain away
        while (trail.length > maxLen) trail.shift();
        if (trail.length < 2) return;

        const color = colors[hi];
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        for (let pass = 0; pass < 2; pass++) {
          for (let i = 1; i < trail.length; i++) {
            const t = i / (trail.length - 1);
            const width = lerp(0.5, 7, t) * s * (1 + level * 0.8) * (pass === 0 ? 3.2 : 1);
            ctx.strokeStyle = rgba(pass === 0 ? color : mix(color, WHITE, 0.5), t * (pass === 0 ? 0.12 : 0.9));
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
            ctx.lineTo(trail[i].x, trail[i].y);
            ctx.stroke();
          }
        }
        ctx.restore();
      });

      if (!lm) continue;
      ctx.save();
      ctx.fillStyle = rgba(mix(colors[hi], WHITE, 0.4), 0.7);
      ALL_TIPS.forEach((tip) => {
        ctx.beginPath();
        ctx.arc((1 - lm[tip].x) * w, lm[tip].y * h, 2.5 * s, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }
  }

  #drawJam(ctx, w, h, now, jam) {
    const [, primary, accent] = this.#palette;
    const s = this.#scale();
    const gap = 16 * s, y = h - 30 * s, x0 = w / 2 - gap * 7.5;

    // Kick from the partner → a soft glow along the bottom edge
    const kickAge = now - jam.lastHits.kick;
    if (kickAge < 220) {
      const g = ctx.createLinearGradient(0, h, 0, h - 120 * s);
      g.addColorStop(0, rgba(accent, 0.35 * (1 - kickAge / 220)));
      g.addColorStop(1, rgba(accent, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, h - 120 * s, w, 120 * s);
    }

    for (let i = 0; i < 16; i++) {
      const on = i === jam.step;
      ctx.fillStyle = on ? rgba(mix(accent, WHITE, 0.3), 0.95) : rgba(primary, i % 4 === 0 ? 0.45 : 0.2);
      ctx.beginPath();
      ctx.arc(x0 + i * gap, y, (on ? 4 : i % 4 === 0 ? 2.8 : 2) * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  #drawTitle(ctx, w, h, now) {
    if (!this.#title) return;
    const age = Math.max(0, now - this.#title.born);
    if (age > TITLE_MS) { this.#title = null; return; }
    const a = Math.min(age / 350, 1) * Math.min((TITLE_MS - age) / 700, 1);
    const s = this.#scale();
    const [, primary, accent] = this.#palette;
    const cy = h * 0.78;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(8 * s)}px`;
    ctx.font = `600 ${Math.round(46 * s)}px "Space Grotesk", system-ui, sans-serif`;
    ctx.shadowColor = rgba(primary, 0.8 * a);
    ctx.shadowBlur = 24 * s;
    ctx.fillStyle = rgba(WHITE, a);
    ctx.fillText(this.#title.name.toUpperCase(), w / 2, cy);

    // Accent rule sweeps outward under the name
    const ruleW = w * 0.28 * Math.min(age / 600, 1);
    ctx.shadowBlur = 0;
    ctx.fillStyle = rgba(accent, a * 0.9);
    ctx.fillRect(w / 2 - ruleW / 2, cy + 34 * s, ruleW, 2 * s);

    if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(1.5 * s)}px`;
    ctx.font = `400 ${Math.round(17 * s)}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.fillStyle = rgba(WHITE, a * 0.75);
    ctx.fillText(this.#title.tagline, w / 2, cy + 62 * s);
    ctx.restore();
  }
}
