// Where things that lie about come to rest (the loot, game/loot.js): on the ground that stays,
// never on a platform that floats by (Foggery's, game/movers.js: it would slide away from under
// it), never in a pit of lava, acid or deep water (there for good). A standing fluid that rises
// and falls (a trial's, a boss's tide) may go over it: it is still there when it drains.
import { N, GRAV } from '../core/constants.js';
import { topOf } from '../core/surfaces.js';
import { state } from '../game/state.js';
import { stillGroundAt } from './collide.js';
import { fixedFluid, inFluid } from './fluid.js';
import { supportedPoint } from './respawn.js';

// the ground that stays at (x, z), at most `step` above y: { h, s, i } (s null: none); in the cube
// only (what lies about belongs to it: not past a side, in the cube beyond, physics/collide.js)
const inCube = (x, z) => x >= 0 && z >= 0 && x < N && z < N;
export const restGround = (x, z, y, step = 0.05) => inCube(x, z) ? stillGroundAt(x, z, y, step) : { h: -Infinity, s: null, i: -1 };
// can something rest on the ground g? (`wet`: under a standing fluid too)
export const restsOn = (g, wet = true) => !!g.s && Number.isFinite(g.h) && !fixedFluid(g) && (wet || !inFluid(g, g.h + 0.01));

// (x, y, z) dropped straight down onto the ground that stays; with none under it, or a pit of
// fluid, the nearest dry spot something can stand on
export function restSpot(x, y, z) {
  const g = restGround(x, z, y);
  if (restsOn(g)) return { x, y: g.h, z };
  return drySpot(x, Number.isFinite(g.h) ? g.h : y, z) ?? { x, y: Number.isFinite(g.h) ? g.h : y, z };
}
// A landing spot near (x, y, z) on about the level of the ground under it (a body floating over
// it scatters round its feet), between near and far away (rand: 0..1): a dry one, else one under
// a standing fluid that will drain (never a pit of one); else the ground under the spot itself
// (or the nearest dry spot)
export function scatterSpot(x, y, z, near, far, rand = Math.random) {
  const base = restGround(x, z, y + 0.5), y0 = Number.isFinite(base.h) ? base.h : y;
  for (const wet of [false, true]) for (let i = 0; i < 8; i++) {
    const a = rand() * Math.PI * 2, r = near + rand() * (far - near);
    const tx = x + Math.cos(a) * r, tz = z + Math.sin(a) * r, g = restGround(tx, tz, y0 + 0.5, 0.6);
    if (restsOn(g, wet) && Math.abs(g.h - y0) < 0.6) return { x: tx, y: g.h, z: tz };
  }
  return restsOn(base) ? { x, y: base.h, z } : restSpot(x, y, z);
}

// One frame of p ({ x, y, z, vy? }) coming to rest: falling onto the ground that stays under it
// when that is further down (the ground gone from under it), up onto it when it is a hair higher
// (a position rounded on the way over the wire); none, or a pit: at once to the nearest dry spot.
// snap: no falling, at once. true: it landed after a noticeable fall.
export function settle(p, dt, snap = false) {
  const g = restGround(p.x, p.z, p.y);
  if (!restsOn(g)) { Object.assign(p, restSpot(p.x, p.y, p.z)); delete p.vy; return false; }
  if (snap || g.h >= p.y - 1e-4) { p.y = g.h; delete p.vy; return false; }
  p.vy = (p.vy ?? 0) - GRAV * dt;
  p.y += p.vy * dt;
  if (p.y > g.h) return false;
  const hard = p.vy < -2;
  p.y = g.h; delete p.vy;
  return hard;
}

// (a spot physics/respawn.js would stand a body on, not a platform)
const still = c => !!c && Math.abs(restGround(c.x, c.z, c.y).h - c.y) < 0.06;
function drySpot(x, y, z) {
  const own = supportedPoint(x, y, z);
  if (still(own)) return own;
  let best = null, distance = Infinity;
  for (const s of [...state.map.floors, ...state.map.pieces.flat().filter(p => p.kind !== 'pillar')]) {
    const c = supportedPoint(s.c % N + 0.5, topOf(s, 0.5, 0.5), Math.floor(s.c / N) + 0.5);
    if (!still(c)) continue;
    const d = (c.x - x) ** 2 + (c.y - y) ** 2 + (c.z - z) ** 2;
    if (d < distance) { best = c; distance = d; }
  }
  return best;
}
