// Falling through the void into the cube below. For now this is no way into a cube: you
// keep falling (through more cubes, if there is void below again) until you land, take full
// fall damage, and are put back in the cube the fall started in (game/flow.js recover / die).
import { CUBE_H, FALL_DAMAGE } from '../core/constants.js';
import { floorY } from '../core/surfaces.js';
import { step } from '../world/coords.js';
import { depthOf, MAX_DEPTH } from '../themes/depth.js';
import { groundAt } from '../physics/collide.js';
import { player, state } from './state.js';
import { startTravel } from './travel.js';
import { arrivalPoint } from './flow.js';
import { knockDown } from './ragdoll.js';
import { msg } from '../i18n/i18n.js';
import { narrate } from './narrator.js';

// fell through the void: into the cube below, if there is one there (else: false)
export function startFall() {
  if (state.map.interior) return false;   // houses have no cube below (and walls all round)
  if (state.map.trialRoom) return false;   // nothing falls out of a trial room (world/trials.js)
  if (state.map.flip) return false;   // nor out of Flip's box: out through a hole hurts (physics/hazards.js)
  const below = step(state.cubeKey, 4);
  if (depthOf(below) > MAX_DEPTH || !state.cubes.layout(depthOf(below)).exists.has(below)) return false;   // (nothing below the core)
  // only the first cube of a fall counts
  state.fallFrom ||= { key: state.cubeKey, arrival: state.arrival, portalLock: state.portalLock,
    boundaryLock: state.boundaryLock, visit: state.visit, safe: { ...player.safe } };
  startTravel({ kind: 'fall', dir: 4 });
  narrate('fall');
  return true;
}

// the fall is over (landed, or out of the world): full damage, then back where it started
export function landFall() {
  knockDown({ damage: FALL_DAMAGE, reason: msg('Fell through the void!'), respawn: 'safe' });
}

// a spot that does not lead on (a sealed pit, lava, acid): the nearest top floor that does
function safeSpot(m, x, z) {
  let best = null, bd = Infinity;
  for (const col of m.cols) {
    const f = col[col.length - 1];
    if (!f || f.fluid || f.prot || !m.safe[f.id]) continue;
    const d = Math.hypot(f.x + 0.5 - x, f.z + 0.5 - z);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

// where a fall comes out: same spot, a few units over the ground (a hard landing is the price)
export function fallPoint(m) {
  let x = player.x, z = player.z, g = groundAt(x, z, 99, 0);
  if (!isFinite(g.h)) return { air: { x, y: 3, z }, rest: arrivalPoint(m.portals.find(q => q.kind !== 'spawn')) };
  const f = !g.s?.kind && g.s && !g.s.fluid && !m.safe[g.s.id] && safeSpot(m, x, z);
  if (f) { x = f.x + 0.5; z = f.z + 0.5; g = groundAt(x, z, 99, 0); }
  // Let a fall land in a fluid, but never make that fluid the death respawn point.
  const wet = !g.s?.kind && g.s?.fluid, dry = wet && safeSpot(m, x, z);
  const rest = !wet ? { x, y: g.h, z }
    : dry ? { x: dry.x + 0.5, y: floorY(dry, 0.5, 0.5), z: dry.z + 0.5 }
    : arrivalPoint(m.portals.find(q => q.kind !== 'spawn'));
  return { air: { x, y: Math.min(g.h + 5, CUBE_H - 2), z }, rest };
}
