// What the reveals of the bosses' intros share (game/reveals.js, game/bossreveals.js; docs/bosses.md
// "The intro"): turning him to the camera, his roar, his landing, a puff of cloud, a splash, rings on
// a fluid, bubbles, a way in along the floors of the fight, and the moments of a clip played slower
// or faster than it is (`warp`).
import { player, state } from './state.js';
import { fitting } from './bossfight.js';
import { groundY } from '../physics/enemynav.js';
import { cellAt, insideSolid } from '../physics/collide.js';
import { standingAt } from '../physics/fluid.js';
import { LH, N } from '../core/constants.js';
import { viewBlockedAt } from '../core/blockers.js';
import { WALLED } from './camera.js';
import { emit, glow, soft, rand } from '../render/particles.js';
import { sfx, SOUND_NAMES } from '../audio/sfx.js';
import { quake, cameraKick, hitstop } from './juice.js';
import { together } from '../net/online.js';

export const clamp01 = u => u <= 0 ? 0 : u >= 1 ? 1 : u;
export const smooth = u => (u = clamp01(u)) * u * (3 - 2 * u);
export const facing = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
export const sizeOf = e => e.profile.size ?? 1;
// he turns to where the intro's camera is (r.view: [x, y, z]; before it has one, the hero), so
// it sees his face: at `rate` (1/s), or at once
export function faceCamera(r, dt, rate = 3) {
  const e = r.e, p = r.view ?? [player.x, player.y, player.z], want = Math.atan2(p[0] - e.x, p[2] - e.z);
  e.yaw += Math.atan2(Math.sin(want - e.yaw), Math.cos(want - e.yaw)) * (rate === Infinity ? 1 : Math.min(1, dt * rate));
}
// A clip's time at the intro's t, by keys [[t, clip time], ...]: held before the first and after
// the last, straight between (a clip slowed down or sped up where it should be)
export function warp(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, c1] = keys[i], [t0, c0] = keys[i - 1];
    if (t < t1) return c0 + (c1 - c0) * (t - t0) / (t1 - t0);
  }
  return keys.at(-1)[1];
}
// a step of something at t (once): D[name] is set the first time t is past `at`
export const once = (D, name, t, at) => t >= at && !D[name] && (D[name] = true);

// his voice (his kind's alert, deeper) and the ground trembling a little
export function roar(e, pitch = 0.8) {
  const voice = `${e.profile.species}_alert`;
  if (SOUND_NAMES.includes(voice)) sfx(voice, { at: e, pitch: (e.profile.pitch ?? 1) * pitch, volume: 1 });
  sfx('rumble', { at: e, pitch: 1.4, volume: 0.5 });
  quake(0.012);
}
// down on his spot: a crash, a ring of dust running out, the view jolting and the moment held
export function landFx(e, colors = ['#c9c0ae', '#c9c0ae', '#e8e2d6'], much = 1) {
  const s = Math.sqrt(sizeOf(e)) * Math.max(0.6, Math.min(1.6, e.profile.height / 1.8)) * much, r = e.profile.radius;
  sfx('stomp', { at: e, pitch: 0.9 / Math.sqrt(s) });
  sfx('boom', { at: e, pitch: 0.55, volume: 0.7 * Math.min(1, much) });
  for (let i = 0; i < 46; i++) {
    const a = rand(0, Math.PI * 2), v = rand(2.5, 5.5) * s;
    emit(soft, e.x + Math.cos(a) * r, e.y + 0.1, e.z + Math.sin(a) * r, { v: [Math.cos(a) * v, rand(0.2, 1.2), Math.sin(a) * v],
      life: rand(0.6, 1.1), size: rand(0.3, 0.55) * s, grow: 1.4, color: colors[i % colors.length], alpha: 0.55, drag: 2.6 });
  }
  for (let i = 0; i < 14; i++)
    emit(soft, e.x + rand(-r, r), e.y + 0.05, e.z + rand(-r, r), { v: [rand(-1, 1), rand(2, 4.5), rand(-1, 1)], life: rand(0.6, 0.9),
      size: rand(0.04, 0.08), color: '#8a7a62', alpha: 0.9, gravity: 9 });
  quake(0.04 * Math.min(1, much));
  cameraKick(0, 0, 0, 0.09 * Math.min(1, much));
  if (!together()) hitstop(0.07);   // (playing together the world runs on for the others)
}
// a puff of cloud round him as he comes (Gusto out of thin air)
export function cloudFx(e, colors = ['#ffffff', '#e4e8f0', '#c8ccd6']) {
  const y = e.y + e.profile.height * 0.55, s = Math.sqrt(sizeOf(e));
  emit(glow, e.x, y, e.z, { life: 0.25, size: 1.2 * s, grow: 1.4, color: '#ffffff', alpha: 0.25 });
  for (let i = 0; i < 44; i++) {
    const a = rand(0, Math.PI * 2), r = rand(0.3, 1.1), up = rand(-0.6, 1);
    emit(soft, e.x + Math.cos(a) * r * 0.5, y + up * 0.8, e.z + Math.sin(a) * r * 0.5, { v: [Math.cos(a) * rand(1.2, 3), rand(0.2, 1.4), Math.sin(a) * rand(1.2, 3)],
      life: rand(0.6, 1.1), size: rand(0.35, 0.6) * s, grow: 1.5, color: colors[i % colors.length], alpha: 0.7, drag: 2.4 });
  }
  sfx('poof', { at: e, pitch: 0.7 });
  sfx('whirl', { at: e, pitch: 0.8, volume: 0.6 });
}
// a splash thrown up out of a fluid (or goo, or lava: `colors`, `layer` glow for what shines),
// `n` drops, `up` how high they fly (cells/s), `wide` how far out
export function splashFx(x, y, z, { colors, n = 40, up = 5, wide = 2, size = [0.06, 0.14], layer = soft, life = [0.6, 1.1] }) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), out = rand(0.2, 1) * wide;
    emit(layer, x + Math.cos(a) * 0.25, y + 0.05, z + Math.sin(a) * 0.25, { v: [Math.cos(a) * out, rand(0.45, 1) * up, Math.sin(a) * out],
      life: rand(...life), size: rand(...size), color: colors[i % colors.length], alpha: 0.9, gravity: 9, drag: 0.4 });
  }
}
// a ring running out over a fluid's surface from (x, y, z), `r` cells across to start with
export function rippleFx(x, y, z, r, colors, speed = 1.6) {
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * Math.PI * 2 + rand(-0.1, 0.1);
    emit(soft, x + Math.cos(a) * r, y + 0.04, z + Math.sin(a) * r, { v: [Math.cos(a) * speed, 0, Math.sin(a) * speed],
      life: rand(0.7, 1), size: rand(0.05, 0.09), grow: 0.6, color: colors[i % colors.length], alpha: 0.45, drag: 1.2 });
  }
}
// bubbles coming up through a fluid round (x, z) to its surface y, `rate` a second
export function bubbleFx(x, y, z, r, dt, rate, colors, layer = soft) {
  for (let i = Math.floor(rate * dt + Math.random()); i > 0; i--)
    emit(layer, x + rand(-r, r), y + 0.02, z + rand(-r, r), { v: [rand(-0.2, 0.2), rand(0.6, 1.6), rand(-0.2, 0.2)], life: rand(0.25, 0.5),
      size: rand(0.03, 0.07), grow: 0.8, color: colors[i % colors.length], alpha: 0.85, gravity: 2, drag: 1 });
}
// the surface of the fluid at (x, z), if it stands over the floor at y: its height (else null)
export function fluidTop(x, z, y) {
  const s = standingAt(x, z);
  if (s && s.y > y - 0.05) return s.y;
  const i = cellAt(x, z);
  if (i < 0) return null;
  let top = null;
  for (const f of state.map.cols[i]) if (f.fluid && f.surf * LH > y - 0.05) top = Math.max(top ?? -Infinity, f.surf * LH);
  return top;
}

// A place for the intro's camera: round `at` ({ x, y, z }), `far` cells away ([nearest,
// furthest]) and `up` cells over it ([lowest, highest]), in the cube (off its walls), out of every
// solid (and `room` cells off it all round) and over every fluid, with nothing between it and any
// of `see` (points { x, y, z }); of those the one `score` (the place, its angle round `at`) likes
// best: { x, y, z }. None clear: null.
export function viewFrom(at, { far, up, see, score = () => 0, room = 0.3 }) {
  const m = state.map, edge = m.walled ? WALLED : 0.6;
  const solid = (x, y, z) => insideSolid(x, z, y) || viewBlockedAt(m, x, y, z);
  const clear = (p, q) => {
    const len = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
    for (let s = 0.4; s < len - 0.3; s += 0.15) {
      const k = s / len;
      if (solid(p.x + (q.x - p.x) * k, p.y + (q.y - p.y) * k, p.z + (q.z - p.z) * k)) return false;
    }
    return true;
  };
  let best = null, value = -Infinity;
  for (let i = 0; i < 36; i++) for (let j = 0; j <= 4; j++) for (let h = 0; h <= 3; h++) {
    const a = i / 36 * Math.PI * 2, d = far[0] + (far[1] - far[0]) * j / 4;
    const p = { x: at.x + Math.cos(a) * d, y: at.y + up[0] + (up[1] - up[0]) * h / 3, z: at.z + Math.sin(a) * d };
    if (p.x < edge || p.z < edge || p.x > N - edge || p.z > N - edge) continue;
    const v = score(p, a);
    if (v <= value || fluidTop(p.x, p.z, p.y - 0.45) !== null) continue;
    if ([[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0], [0.7, 0, 0.7], [-0.7, 0, 0.7], [0.7, 0, -0.7], [-0.7, 0, -0.7]]
      .some(([x, y, z]) => solid(p.x + x * room, p.y + y * room, p.z + z * room))) continue;
    if (!see.every(q => clear(p, q))) continue;
    best = p; value = v;
  }
  return best;
}

// Where he comes in from along the floors of the fight (exported for the checks): a floor he fits
// on, reach[0] to reach[1] cells from his spot, not too near the hero, with floors of the fight
// all the way to it, none more than a step above or below the one before (he bumps up and down
// them); the longest such way, best on one level, from the side (across the camera's view), then
// from the right: { x, y, z, side, heights (the ground along it from there to his spot, every
// STRIDE cells), len }. null: none
export const STRIDE = 0.25;
export function wayIn(r, [lo, hi]) {
  const { e, spot } = r, home = e.home ?? e.f;
  let fx = spot.x - player.x, fz = spot.z - player.z;
  const l = Math.hypot(fx, fz) || 1;
  fx /= l; fz /= l;
  const base = home ? groundY(home, spot.x, spot.z) : spot.y, lift = spot.y - base;
  // the ground of the fight at (x, z) nearest to height y (null: none)
  const ground = (x, z, y) => {
    const i = cellAt(x, z);
    let best = null;
    for (const g of state.map.floors) if (g.c === i && (!state.map.arena || g.encounter)) {
      const h = groundY(g, x, z);
      if (best === null || Math.abs(h - y) < Math.abs(best - y)) best = h;
    }
    return best;
  };
  let best = null, score = -Infinity;
  for (const g of fitting(e.profile)) {
    const x = g.x + 0.5, z = g.z + 0.5, dx = x - spot.x, dz = z - spot.z, d = Math.hypot(dx, dz);
    if (d < lo || d > hi || Math.hypot(x - player.x, z - player.z) < 3) continue;
    const u = Math.max(0, Math.min(1, ((player.x - spot.x) * dx + (player.z - spot.z) * dz) / (d * d)));
    if (Math.hypot(spot.x + dx * u - player.x, spot.z + dz * u - player.z) < 1.8) continue;   // (not over the hero)
    const heights = [];
    let y = base, ok = true;
    for (let s = 0; s <= d + 1e-6 && ok; s += STRIDE) {   // (from his spot outwards)
      const h = ground(spot.x + dx * s / d, spot.z + dz * s / d, y);
      ok = h !== null && Math.abs(h - y) < 1.1;
      y = h; heights.push(h);
    }
    if (!ok) continue;
    const along = (dx * fx + dz * fz) / d, side = Math.sign(-fz * dx + fx * dz) || 1;
    const flat = heights.every(h => Math.abs(h - base) < 0.3);
    const value = Math.min(d, 6) + 2.5 * (1 - Math.abs(along)) + (flat ? 1.5 : 0) + (side > 0 ? 0.4 : 0);
    if (value > score) { score = value; best = { x, y: heights.at(-1) + lift, z, side, heights: heights.reverse().map(h => h + lift), len: d }; }
  }
  return best;
}
// his height at `k` of the way in from where he came (1: on his spot; past it: as on it)
export function wayY(from, spot, k) {
  const H = from.heights;
  if (!H || k >= 1) return spot.y;
  const u = Math.max(0, k) * from.len / STRIDE, i = Math.min(H.length - 1, Math.floor(u)), j = Math.min(H.length - 1, i + 1);
  return H[i] + (H[j] - H[i]) * Math.min(1, (u - i) * 1.6);
}
