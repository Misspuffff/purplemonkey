/**
 * visuals/particles.js
 *
 * Hit particles in four styles (picked by the Scene's visuals.particleStyle),
 * plus shockwave rings. All random parameters are seeded at spawn time so
 * nothing flickers between frames.
 *
 *   shards  — sharp triangles flung outward, spinning
 *   rings   — staggered concentric outlines
 *   embers  — small glowing sparks that rise and flicker
 *   petals  — soft ellipses that drift down and sway
 */

import { rgba, lerp } from './color.js';

const MAX_PARTICLES = 500;
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

const LIFE = { shards: 650, rings: 900, embers: 1400, petals: 1700 };

export function spawnBurst(list, style, x, y, velocity, colors, scale) {
  const count = Math.round(lerp(8, 26, velocity) * (style === 'rings' ? 0.25 : 1));
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = rand(0.2, 1) * lerp(250, 900, velocity) * scale;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const p = { style, x, y, color, born: performance.now(), life: LIFE[style] * rand(0.7, 1.2),
                rot: Math.random() * Math.PI * 2, vr: rand(-8, 8), size: rand(4, 11) * scale };

    switch (style) {
      case 'rings':
        Object.assign(p, { vx: 0, vy: 0, delay: i * 90, maxR: rand(60, 160) * scale * (0.6 + velocity) });
        break;
      case 'embers':
        Object.assign(p, { vx: Math.cos(angle) * speed * 0.35, vy: -Math.abs(Math.sin(angle)) * speed * 0.6,
                           size: rand(1.5, 4) * scale, flicker: rand(8, 20) });
        break;
      case 'petals':
        Object.assign(p, { vx: Math.cos(angle) * speed * 0.4, vy: Math.sin(angle) * speed * 0.3 - 80 * scale,
                           sway: rand(1.5, 3.5), size: rand(6, 13) * scale });
        break;
      default: // shards
        Object.assign(p, { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
    }
    list.push(p);
  }
  if (list.length > MAX_PARTICLES) list.splice(0, list.length - MAX_PARTICLES);
}

/** Directional spray for swipes. dir: +1 right, -1 left (canvas space). */
export function spawnStreak(list, x, y, dir, velocity, colors, scale) {
  for (let i = 0; i < 18; i++) {
    list.push({
      style: 'streak', x, y: y + rand(-40, 40) * scale,
      vx: dir * rand(600, 1600) * scale * (0.5 + velocity), vy: rand(-30, 30),
      len: rand(20, 70) * scale, color: colors[i % colors.length],
      born: performance.now(), life: rand(250, 450),
    });
  }
}

export function updateAndDrawParticles(ctx, list, now, dtSec, scale) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    const age = now - p.born - (p.delay ?? 0);
    if (age < 0) continue;
    const t = age / p.life;
    if (t >= 1) { list.splice(i, 1); continue; }
    const fade = 1 - t;

    switch (p.style) {
      case 'rings': {
        const r = p.maxR * (1 - Math.pow(1 - t, 3));
        ctx.strokeStyle = rgba(p.color, fade * 0.8);
        ctx.lineWidth = lerp(3, 0.5, t) * scale;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'embers': {
        p.vx *= 0.97; p.vy -= 40 * dtSec * scale; // drift upward
        p.x += p.vx * dtSec; p.y += p.vy * dtSec;
        const flick = 0.6 + 0.4 * Math.sin(age / 1000 * p.flicker * Math.PI * 2);
        ctx.fillStyle = rgba(p.color, fade * flick);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.6 + fade * 0.6), 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'petals': {
        p.vx *= 0.96; p.vy += 120 * dtSec * scale; p.vy *= 0.97;
        p.x += (p.vx + Math.sin(age / 1000 * p.sway * Math.PI) * 60 * scale) * dtSec;
        p.y += p.vy * dtSec; p.rot += p.vr * 0.2 * dtSec;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = rgba(p.color, fade * 0.75);
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'streak': {
        p.x += p.vx * dtSec; p.y += p.vy * dtSec;
        ctx.strokeStyle = rgba(p.color, fade);
        ctx.lineWidth = 1.5 * scale;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - Math.sign(p.vx) * p.len, p.y);
        ctx.stroke();
        break;
      }
      default: { // shards
        p.vx *= 0.93; p.vy = p.vy * 0.93 + 200 * dtSec * scale;
        p.x += p.vx * dtSec; p.y += p.vy * dtSec; p.rot += p.vr * dtSec;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = rgba(p.color, fade);
        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.lineTo(p.size * 0.45, p.size * 0.6);
        ctx.lineTo(-p.size * 0.45, p.size * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  }
  ctx.restore();
}

/** Expanding shockwave rings, one per hit. */
export function drawShockwaves(ctx, waves, now) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = waves.length - 1; i >= 0; i--) {
    const w = waves[i];
    // Hits are stamped after the frame's `now` was taken, so age can start slightly negative
    const t = Math.max(0, (now - w.born) / w.life);
    if (t >= 1) { waves.splice(i, 1); continue; }
    const r = w.maxR * (1 - Math.pow(1 - t, 2.5));
    ctx.strokeStyle = rgba(w.color, (1 - t) * 0.55);
    ctx.lineWidth = w.width * (1 - t) + 0.5;
    ctx.beginPath();
    ctx.arc(w.x, w.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
