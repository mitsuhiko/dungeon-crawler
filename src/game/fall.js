// Falling through the void into the cube below. A fall is no way into a cube: the cube below is
// found (discovered, on the map) as the slide down ends, and then
//   - with the robot along, it catches the hero before they land (game/rescue.js catchFall) and
//     carries them back up (liftBack: the slide up, game/travel.js 'lift') and on to safe ground in
//     the cube the fall started in, for a quarter of their most health (or all they have left);
//   - with no robot yet, they keep falling (through more cubes, if there is void below again) until
//     they land, take full fall damage, and are put back in the cube the fall started in
//     (game/flow.js recover / die).
import { CUBE_H, FALL_DAMAGE } from '../core/constants.js';
import { RESCUE } from '../core/rescue.js';
import { floorY } from '../core/surfaces.js';
import { step } from '../world/coords.js';
import { depthOf, MAX_DEPTH } from '../themes/depth.js';
import { groundAt } from '../physics/collide.js';
import { player, state } from './state.js';
import { startTravel } from './travel.js';
import { arrivalPoint, recover } from './flow.js';
import { knockDown } from './ragdoll.js';
import { robotCanRescue } from './rescue.js';
import { msg } from '../i18n/i18n.js';

const UP = 5;            // (the direction up: world/coords.js D6)

// fell through the void: into the cube below, if there is one there (else: false)
export function startFall() {
  if (state.map.interior) return false;   // houses have no cube below (and walls all round)
  if (state.map.trialRoom) return false;   // nothing falls out of a trial room (world/trials.js)
  if (state.map.flip) return false;   // nor out of Flip's box: it turns (the robot catches them there, game/rescue.js)
  const below = step(state.cubeKey, 4);
  if (depthOf(below) > MAX_DEPTH || !state.cubes.layout(depthOf(below)).exists.has(below)) return false;   // (nothing below the core)
  // only the first cube of a fall counts; the hole is where the robot carries them back out
  state.fallFrom ||= { key: state.cubeKey, arrival: state.arrival, portalLock: state.portalLock,
    boundaryLock: state.boundaryLock, visit: state.visit, safe: { ...player.safe }, catch: robotCanRescue(),
    hole: { x: player.x, y: (player.footY ?? 0) + RESCUE.over, z: player.z } };
  startTravel({ kind: 'fall', dir: 4 });
  return true;
}

// the fall is over (landed, or out of the world): full damage, then back where it started
export function landFall() {
  knockDown({ damage: FALL_DAMAGE, reason: msg('Fell through the void!'), respawn: 'safe' });
}

// Caught (game/rescue.js): the robot carries the hero back up into the cube the fall started in,
// out over the hole they fell through. false: it cannot (they are not in the cube right below it)
export function liftBack() {
  const f = state.fallFrom;
  if (!f || step(state.cubeKey, UP) !== f.key || state.transitioning) return false;
  // (should that cube not come: back in it the old way, game/flow.js returnFromFall)
  startTravel({ kind: 'lift', dir: UP, at: { ...f.hole }, failed: () => { player.rescue = null; recover(); } }, { force: true });
  return true;
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

// where a fall comes out: same spot, a few units over the ground (a hard landing is the price), and
// high enough over it for the robot to catch them in time (RESCUE.clear)
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
  return { air: { x, y: Math.max(Math.min(g.h + 5, CUBE_H - 2), g.h + RESCUE.clear), z }, rest };
}
