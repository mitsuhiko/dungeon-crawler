// Fluid dwellers: a species that lives in fluids (a profile's `dwells`: the fluids it lives in, the
// Squirtles: water, lava or slime, core/enemies.js). It is only ever put down in one of them, a
// fluid floor's (a pool, a river, a lake: there for good) or a standing one deep enough over the
// floor (a boss's tide or flood, a trial's: SHALLOW), and moves only through them (`wet` floors);
// the land it only leaps onto, and crosses as a puddle to get back into one (game/enemyai.js
// `ashore`). In a fluid it floats, SUNK of its body under the surface (or stands on the bed where
// it is shallower than that).
//
// How it walks is a walker (physics/enemynav.js takes one wherever it takes a body's height): its
// height, which floors it may stand on (`ok`) and the floor next to one along a direction (`step`).
// Inside its fluid only wet floors are ok; ashore every floor it fits on is too. No link joins a
// fluid floor to its bank (cubegen/smooth.js), so a step out of one or into one goes to the floor
// next to it whose edge meets the fluid's surface within BANK.
//
// An amphibian (a profile's `wades`: Qualmos, in his lagoon) lives on land and in those fluids alike:
// it walks on land, goes into them and out again over a bank as a dweller does, and floats in them
// as a dweller does; under their surface (`under`: his dive, game/qualmos.js) it keeps to them.
import { LH, N, DIRS, OPP } from '../core/constants.js';
import { topOf } from '../core/surfaces.js';
import { state } from '../game/state.js';
import { floorWalkable, navNeighbor, columnClear } from './floornav.js';
import { standingAt } from './fluid.js';

export const SHALLOW = 0.1;    // units: the least depth of a standing fluid it lives in
export const SUNK = 0.3;       // the share of its body under the surface where it floats
export const BANK = 1;         // units: the most a bank stands over (or under) a fluid's surface to climb out
const EDGE = [[1, .5], [0, .5], [.5, 1], [.5, 0]];

// the fluids `profile` lives (or wades) in, or undefined
export const fluidsOf = profile => profile?.dwells ?? profile?.wades;
// the surface (units) of the fluid `profile` lives in over floor f (a structure piece never),
// or null: f is dry for it
export function wetAt(profile, f) {
  const fluids = fluidsOf(profile);
  if (!fluids || !f || f.kind) return null;
  let y = null;
  if (f.fluid && !f.crust && fluids.includes(f.fluid)) y = f.surf * LH;
  const s = standingAt(f.x + 0.5, f.z + 0.5);
  if (s && fluids.includes(s.look ?? s.fluid) && s.y - topOf(f, 0.5, 0.5) >= SHALLOW) y = Math.max(y ?? -Infinity, s.y);
  return y;
}
// ... in a fluid floor alone (where a cube puts its dwellers down: no standing fluid has risen yet)
export const fixedWet = (profile, f) => !!f && !f.kind && !!f.fluid && !f.crust && !!fluidsOf(profile)?.includes(f.fluid);

// The fluid round a body whose feet are at (x, y, z), by where it is alone (for the looks, also of
// one a friend's game runs, net/foes.js): { fluid (a standing one's look), y (its surface) } or
// null. A dweller of `profile` floating in a fluid floor of its own, else a standing fluid over
// its feet.
export function fluidAround(profile, x, y, z) {
  const cell = Math.floor(z) * N + Math.floor(x), up = (profile?.bodyHeight ?? 0) * SUNK;
  if (fluidsOf(profile) && x >= 0 && z >= 0 && x < N && z < N)
    for (const g of state.map?.cols[cell] ?? []) if (fixedWet(profile, g) && Math.abs(g.surf * LH - y - up) < 0.35) return { fluid: g.fluid, y: g.surf * LH };
  const s = standingAt(x, z);
  return s && s.y > y + 0.05 ? { fluid: s.look ?? s.fluid, y: s.y } : null;
}

// where the feet of a body of `profile` on floor f at (x, z) are: on the ground, or floating in
// its fluid
export function standY(profile, f, x, z) {
  const ground = topOf(f, x - f.x, z - f.z), wet = fluidsOf(profile) ? wetAt(profile, f) : null;
  return wet === null ? ground : Math.max(ground, wet - profile.bodyHeight * SUNK);
}

// is there room for a body of `profile` in fluid floor f (floating in it, nothing over it)?
const room = new WeakMap();
function roomIn(map, profile, f) {
  if (f.open || f.covered || map.blockers?.[f.c]?.length) return false;
  if (!f.fluid) return floorWalkable(map, f, profile.height);
  let by = room.get(f);
  if (!by) room.set(f, by = new Map());
  if (!by.has(profile.height)) {
    const lo = f.surf * LH - profile.bodyHeight * SUNK;
    by.set(profile.height, columnClear(map, f.c, lo, lo + profile.height, f));
  }
  return by.get(profile.height);
}
// can a body of `profile` live on floor f: wet for it, with room?
export const livesOn = (profile, f, map = state.map) => wetAt(profile, f) !== null && roomIn(map, profile, f);

// how high the edge of floor f along d is for a dweller: a fluid floor's surface, else the ground
const edgeY = (f, d) => f.fluid ? f.surf * LH : topOf(f, ...EDGE[d]);

// The walker of a dweller of `profile`, inside its fluid or ashore (physics/enemynav.js)
const walkers = new WeakMap();
export function walker(profile, ashore = false) {
  let pair = walkers.get(profile);
  if (!pair) walkers.set(profile, pair = [make(profile, false), make(profile, true)]);
  return pair[ashore ? 1 : 0];
}
function make(profile, ashore) {
  const height = profile.height;
  const ok = ashore ? f => !!f && (livesOn(profile, f) || floorWalkable(state.map, f, height)) : f => !!f && livesOn(profile, f);
  const step = (f, d) => {
    const map = state.map, g = navNeighbor(map, f, d, height, ok);
    if (g || f.kind) return g;
    const x = f.x + DIRS[d][0], z = f.z + DIRS[d][1];
    if (x < 0 || z < 0 || x >= N || z >= N) return null;
    let best = null, gap = BANK + 1e-6;
    for (const h of map.cols[z * N + x] ?? []) {
      if (!(f.fluid || h.fluid) || !ok(h)) continue;
      const dy = Math.abs(edgeY(f, d) - edgeY(h, OPP[d]));
      if (dy < gap) { best = h; gap = dy; }
    }
    return best;
  };
  return { height, ok, step, dweller: profile, ashore };
}
// the walker of enemy e as it is now: a dweller's, ashore when it stands on dry ground or is out
// of its fluid's hold (`ashore`: the way of its leap, its puddle's way back in, game/enemyai.js);
// an amphibian's, on land and in its fluids alike (under their surface, in them alone); anyone
// else's height
export function walkerOf(e) {
  if (e.profile.dwells) return walker(e.profile, !!e.ashore || wetAt(e.profile, e.f) === null);
  if (e.profile.wades) return walker(e.profile, !e.under);
  return e.profile.height;
}
