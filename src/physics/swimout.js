// Can a swimmer get out of the water on their own? The generator gives every water of the cubes a
// way out (cubegen/reach.js, cubegen/escape.js: banks a level over the surface, ladders), but a
// standing water (a trial's, a boss's) may stand anywhere: a body swimming in one with nowhere to
// climb out is pulled out by the robot (game/rescue.js). From the swimmer's cell over the cells
// where the water is as deep, to a cell whose ground a swimmer steps up onto that is not as deep
// (or a ladder out of the water). A wall more than a swimmer's step over the feet is no way.
import { N, STEP, SWIM_STEP, SWIM_FEET, DIRS } from '../core/constants.js';
import { groundAt } from './collide.js';
import { swimWater, wadeable, peril } from './fluid.js';
import { state } from '../game/state.js';

// the ground a swimmer with their feet at y finds at (x, z): a bridge or a stair only a plain
// step over the feet (they swim under it), as physics/move.js
function under(x, z, y) {
  const g = groundAt(x, z, y, SWIM_STEP);
  return g.s?.kind && g.h > y + STEP ? groundAt(x, z, y, STEP) : g;
}

// true: a way out from (x, z) in the water whose surface stands at `surface`
export function wayOut(x, z, surface, map = state.map) {
  const feet = surface - SWIM_FEET, start = Math.floor(z) * N + Math.floor(x);
  if (start < 0 || start >= N * N) return true;
  const wet = new Set([start]), queue = [start];
  const ladders = new Map();
  for (const l of map.ladders || []) if (l.wet !== undefined && Math.abs(l.wet - surface) < 0.3) ladders.set(l.c, true);
  while (queue.length) {
    const c = queue.pop();
    if (ladders.has(c)) return true;
    const cx = c % N, cz = (c / N) | 0;
    for (const [dx, dz] of DIRS) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
      const n = nz * N + nx;
      if (wet.has(n)) continue;
      // (just over the edge into it: a bank sloping up from the water is climbed out onto at its edge)
      const g = under(cx + 0.5 + dx * 0.6, cz + 0.5 + dz * 0.6, feet);
      if (!g.s || !Number.isFinite(g.h)) continue;
      const w = swimWater(g, SWIM_FEET - 0.02);
      if (w !== null) {
        if (Math.abs(w - surface) < 0.3) { wet.add(n); queue.push(n); }
        continue;
      }
      // ground to stand on: not under lava or acid, not a hole (it falls on to something lower)
      if (g.h >= feet - 0.05 && !peril(g, g.h + 0.01) && wadeable(g, true)) return true;
    }
  }
  return false;
}
