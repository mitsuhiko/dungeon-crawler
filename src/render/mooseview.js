// What the game adds to a Moose's clips (render/enemies.js; its charge: core/enemies.js MOOSE):
// before it charges it scrapes a hoof (a little dust there) and snorts (puffs from its nose), and
// running at you it drums its hooves and kicks up dust behind it; its tail swishes as it sweeps
// round. Its stars, when it crashed, are in its clip.
import { attackOf } from '../core/enemies.js';
import { soft, emit, rand } from './particles.js';
import { player } from '../game/state.js';
import { sfx } from '../audio/sfx.js';

const DUST = ['#d8cfbd', '#c2b8a4', '#a39a88'], BREATH = '#f2f4f6';
// (its dust and breath shrink with it, `g`) where on it (model space, at size 1: x, up, forward): the scraping hoof, its nose with the head
// lowered (blender/moose.py MooseCharge)
const HOOF = [-0.21, 0.05, 0.25], NOSE = [0, 1.25, 1.3];

const STRIDE = 0.3;   // s a stride of its charge's gallop takes (blender/moose.py)

export function mooseLook(v, e, dt, off) {
  const a = e.mode === 'attack' ? attackOf(e) : null, r = a?.roll;
  if (a?.back && e.t >= a.hitAt - 0.12 && e.t - dt < a.hitAt - 0.12) sfx('swing', { at: e, pitch: 0.45, volume: 0.9 });
  if (!r || Math.hypot(e.x - player.x, e.z - player.z) > 16) return;
  const k = v.size, g = Math.sqrt(k), fx = Math.sin(e.yaw), fz = Math.cos(e.yaw), at = ([x, y, z]) =>
    [e.x + off.x + (fz * x + fx * z) * k, e.y + off.y + y * k, e.z + off.z + (-fx * x + fz * z) * k];
  if (e.t < r.from) {   // winding up: a hoof scraping, snorts
    if (e.t > 0.15 && Math.random() < dt * 9) {
      const [x, y, z] = at(HOOF);
      emit(soft, x + rand(-0.1, 0.1) * k, y, z + rand(-0.1, 0.1) * k, { v: [rand(-0.4, 0.4) - fx * 0.6, rand(0.3, 0.8), rand(-0.4, 0.4) - fz * 0.6],
        life: rand(0.4, 0.7), size: rand(0.12, 0.22) * g, grow: 1.4, color: DUST[Math.floor(rand(0, 3))], alpha: 0.5, drag: 2 });
    }
    const beat = Math.floor(e.t * 3), was = Math.floor((e.t - dt) * 3);
    if (beat !== was && e.t > 0.2) {
      const [x, y, z] = at(NOSE);
      for (let i = 0; i < 4; i++)
        emit(soft, x, y, z, { v: [fx * rand(0.6, 1.2) + rand(-0.3, 0.3), rand(-0.3, 0.1), fz * rand(0.6, 1.2) + rand(-0.3, 0.3)],
          life: rand(0.35, 0.55), size: rand(0.08, 0.14) * g, grow: 2, color: BREATH, alpha: 0.4, drag: 3 });
    }
    return;
  }
  if (e.t >= r.to || (e.speed ?? 0) < 1) return;   // running at you: hooves drumming, dust kicked up behind it
  if (Math.floor((e.t - r.from) / STRIDE) !== Math.floor((e.t - dt - r.from) / STRIDE)) sfx('hooves', { at: e, pitch: 0.9 + 0.2 * Math.random() });
  const bx = e.x + off.x - fx * 0.6 * k, bz = e.z + off.z - fz * 0.6 * k;
  for (let i = Math.floor(26 * dt + Math.random()); i > 0; i--)
    emit(soft, bx + rand(-0.4, 0.4) * k, e.y + off.y + 0.12 * k, bz + rand(-0.4, 0.4) * k, { v: [rand(-0.6, 0.6), rand(0.4, 1.1), rand(-0.6, 0.6)],
      life: rand(0.5, 0.9), size: rand(0.18, 0.34) * g, grow: 1.4, color: DUST[i % 3], alpha: 0.45, drag: 1.5 });
}
