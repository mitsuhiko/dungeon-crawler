// Thrown flasks (core/items.js POTIONS with `flask`), as pure rules; game/throws.js runs them
// against the live level and enemies, render/throws.js draws them and the aiming arc.
//
// A flask is lobbed: it leaves the hand when the throw reaches activeStart (core/combat.js
// THROW) and flies a parabola that comes down on the target (a point on the floor, or an
// enemy's feet), at most `range` cells away (a target further off is pulled in along the same
// line). Short throws are quick and flat, long ones take up to a second. It bursts on the first
// thing it touches: an enemy's body, a wall, a prop or the floor (past the target it keeps
// falling, so a throw off a ledge comes down below). The aiming arc is the very same flight.
import { MUZZLES } from './shots.js';
import { absent, baseY } from './enemies.js';

export const LOB_GRAVITY = 16;    // cells/s², heavier than the world's for a snappy arc
export const FLASK_R = 0.09;      // the flask's radius, for touching bodies
const MAX_EXTRA = 2.5;            // s it may keep falling past the target before it is lost
// how long a throw over `d` cells flies
export const flightTime = d => Math.min(1, 0.32 + 0.075 * d);

// where the flask leaves the hand of p, turned to `yaw` (the Throw clip's muzzle)
export function releasePoint(p, yaw) {
  const [mx, my, mz] = MUZZLES.throw, s = Math.sin(yaw), c = Math.cos(yaw);
  return { x: p.x + mx * c + mz * s, y: p.y + my, z: p.z - mx * s + mz * c };
}
// target `to` ({ x, y, z }) pulled in to at most `range` cells from (x, z), along the same line
export function clampTarget(x, z, to, range) {
  const dx = to.x - x, dz = to.z - z, d = Math.hypot(dx, dz);
  return d <= range ? { ...to } : { ...to, x: x + dx / d * range, z: z + dz / d * range, clamped: true };
}
// a flask flying from `from` so it comes down on `to`; stats: the throw's (core/combat.js)
export function launchFlask(from, to, stats = null) {
  const dx = to.x - from.x, dz = to.z - from.z, T = flightTime(Math.hypot(dx, dz));
  return { kind: 'flask', stats, x: from.x, y: from.y, z: from.z, vx: dx / T, vz: dz / T,
    vy: (to.y - from.y + 0.5 * LOB_GRAVITY * T * T) / T, t: 0, T, spin: 0 };
}
// does flask f touch the body of living enemy e?
export const touchesBody = (f, e) => !absent(e) && Math.hypot(f.x - e.x, f.z - e.z) < e.profile.radius + FLASK_R
  && f.y > e.y && f.y < e.y + e.profile.bodyHeight;
// Advance by dt in small steps. Returns null (still flying), 'hit' (an enemy's body; f.hit says
// which), 'blocked' (solid(x, y, z): the level; the flask stays just outside) or 'lost'.
export function stepFlask(f, dt, enemies, solid) {
  const n = Math.max(1, Math.ceil(Math.hypot(f.vx, f.vy, f.vz) * dt / 0.06)), h = dt / n;
  for (let i = 0; i < n; i++) {
    const px = f.x, py = f.y, pz = f.z;
    f.x += f.vx * h; f.y += (f.vy - 0.5 * LOB_GRAVITY * h) * h; f.z += f.vz * h; f.t += h;   // exact under gravity
    f.vy -= LOB_GRAVITY * h;
    if (solid(f.x, f.y, f.z)) { f.x = px; f.y = py; f.z = pz; return 'blocked'; }
    for (const e of enemies) if (touchesBody(f, e)) { f.hit = e; return 'hit'; }
    if (f.t > f.T + MAX_EXTRA) return 'lost';
  }
  return null;
}
// The aiming arc: the flight from `from` to `to`, sampled every `step` s until it would burst.
// { points: [[x, y, z]], end: { x, y, z }, hit: the enemy it would hit first, or null }
export function arcOf(from, to, enemies, solid, step = 1 / 30) {
  const f = launchFlask(from, to), points = [[f.x, f.y, f.z]];
  let end = null;
  while (!end && f.t <= f.T + MAX_EXTRA) {
    end = stepFlask(f, step, enemies, solid);
    points.push([f.x, f.y, f.z]);
  }
  return { points, end: { x: f.x, y: f.y, z: f.z }, hit: end === 'hit' ? f.hit : null };
}
// Who a burst at `at` reaches: the living enemies whose body is within `radius` cells (and not
// too far above or below), each with the share of the full effect it gets: all of it at the
// middle, half at the edge. [{ e, share }]
export function burstVictims(at, radius, enemies) {
  const out = [];
  for (const e of enemies) {
    if (absent(e) || baseY(e) > at.y + 1.2 || baseY(e) + e.profile.bodyHeight < at.y - 1) continue;
    const d = Math.max(0, Math.hypot(e.x - at.x, e.z - at.z) - e.profile.radius);
    if (d <= radius) out.push({ e, share: 1 - 0.5 * d / radius });
  }
  return out;
}
// is (x, y, z) inside a lingering area { x, y, z, r } (a burning patch, a poison cloud)?
export const inArea = (a, x, y, z, r = 0) => Math.hypot(x - a.x, z - a.z) <= a.r + r && y > a.y - 0.8 && y < a.y + 1.2;
