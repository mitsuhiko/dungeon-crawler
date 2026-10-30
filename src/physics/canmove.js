// Can the character's body move to a new position? Cliffs, walls, structures and fences.
import { N, STEP, SWIM_STEP, STEEP, WADE_CLIMB } from '../core/constants.js';
import { clamp, edgeKey } from '../core/util.js';
import { topOf } from '../core/surfaces.js';
import { player, state } from '../game/state.js';
import { cellAt, groundAt, blockedAt } from './collide.js';
import { wadeable } from './fluid.js';

// The invisible rails along stairs, bridges and landings (cubegen/fences.js) keep a walking or
// swimming body on them; a jump goes on or off over them. Visible fences hold up to their height.
const walking = () => player.grounded || player.swimming;
// How far up the body steps: a plain step (STEP) on land; a swimmer, or one wading at least
// WADE_CLIMB deep, climbs out onto a bank up to a level over the water (SWIM_STEP)
export const stepOf = p => p.swimming || (p.wade || 0) >= WADE_CLIMB ? SWIM_STEP : STEP;

function fenceBlocks(a, b, y) {
  if (a < 0 || b < 0 || a === b) return false;
  const ax = a % N, az = (a / N) | 0, bx = b % N, bz = (b / N) | 0;
  if (Math.abs(ax - bx) + Math.abs(az - bz) !== 1) return false;
  const f = state.map.fences.get(edgeKey(ax, az, bx, bz));
  return !!f && f.some(e => (e.show || walking()) && y > e.ymin - 0.45 && y < e.ymax + 0.6);
}

// Surfaces are continuous inside a cell, so the only real obstacles are height jumps across a
// cell edge (cliffs, slab sides, stair sides) and structures at body height. (rx,rz) is a
// reference point on our side, (px,pz) the probe point.
function hopBlocked(rx, rz, px, pz, y, step) {
  const ri = cellAt(rx, rz), pi = cellAt(px, pz);
  if (pi < 0) return true;
  if (ri === pi || ri < 0) return blockedAt(px, pz, y, step, true);
  const e = 0.002;
  const qx = clamp(px, Math.floor(rx) + e, Math.floor(rx) + 1 - e), qz = clamp(pz, Math.floor(rz) + e, Math.floor(rz) + 1 - e);
  // our side of the edge: the surface we stand on if it is in that cell, else whatever is there
  const sup = player.support, qi = cellAt(qx, qz);
  const own = sup && sup.c === qi ? topOf(sup, qx - Math.floor(qx), qz - Math.floor(qz)) : groundAt(qx, qz, y + 0.6, 0).h;
  // in the air we only compare against our feet, not the ground below
  const ref = player.grounded ? Math.max(y, own) : y;
  const q2x = clamp(qx, Math.floor(px) + e, Math.floor(px) + 1 - e), q2z = clamp(qz, Math.floor(pz) + e, Math.floor(pz) + 1 - e);
  return blockedAt(q2x, q2z, ref, step);
}

// Stairs and bridges have invisible side rails (cubegen/fences.js), but only towards cells in
// the cube: on its edge the cube's bound is the rail. An open face (game/portals.js) is no
// bound, so a side of a stair or bridge lying on it must still keep a walking body from
// crossing (a jump goes over, as over the rails inside the cube). Is the surface underfoot at
// (x, z) a stair or bridge with face dir at its side? map: the cube's map (the neighbour's,
// for where a crossing would arrive)
export function railedFace(x, z, y, dir, map = state.map) {
  if (!walking()) return false;
  const s = groundAt(x, z, y, player.swimming ? SWIM_STEP : STEP, map).s;
  return (s?.kind === 'stair' || s?.kind === 'bridge') && (s.dx !== 0 ? dir >= 2 : dir < 2);
}

// did the last canMove that said no stop the body at a brink (a ledge over what takes it, or over
// nothing)? (physics/brink.js: teetering there, and a jump over it)
let brink = false;
export const stoppedAtBrink = () => brink;

// can the body's center move to (nx,nz) along one axis? probes the center and three rim points
export function canMove(nx, nz, axis, sign) {
  brink = false;
  const r = player.r, y = player.y, step = stepOf(player);
  const ci = cellAt(nx, nz);
  if (ci < 0) return false;
  if (fenceBlocks(cellAt(player.x, player.z), ci, y)) return false;
  const pts = [[nx, nz]];
  if (axis === 'x') { const lx = nx + sign * r; pts.push([lx, nz], [lx, nz - 0.7 * r], [lx, nz + 0.7 * r]); }
  else { const lz = nz + sign * r; pts.push([nx, lz], [nx - 0.7 * r, lz], [nx + 0.7 * r, lz]); }
  for (let k = 0; k < pts.length; k++) {
    const [sx, sz] = pts[k];
    const si = cellAt(sx, sz);
    if (si < 0) return false;
    const [rx, rz] = k ? [nx, nz] : [player.x, player.z];
    // Stop at a brink, a ledge over lava or acid (or slime over the head: physics/fluid.js
    // wadeable, judged at the probe) or a hole through the cube (nothing to land on below),
    // while walking (physics/brink.js: teetering there, then a jump over it), but never act as an
    // invisible wall for jumps/falls. Clear water (and mud) is walked into, however deep: it is
    // swum in.
    // Query the landing surface so bridges and stacked dry floors above fluids or voids
    // remain walkable. Rim probes keep the body off the edge. This looks for drops, not rises:
    // a rim probe ahead on a steep (but walkable) slope lies more than a step above the feet,
    // so it may look as high as the steepest slope rises from the center to it (rises at a
    // cell edge are hopBlocked's). A wall is no brink (its floor lies too high to be found here).
    if (hopBlocked(rx, rz, sx, sz, y, step)) return false;
    if (player.grounded && !player.swimming) {
      const gr = groundAt(sx, sz, y, step + STEEP * Math.hypot(sx - nx, sz - nz));
      if (!gr.s || !wadeable(gr, true)) { brink = true; return false; }
    }
    if (fenceBlocks(ci, si, y)) return false;
  }
  return true;
}
