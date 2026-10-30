// Stepping into a portal: through the face for side portals, onto the centre of a well or ring.
// Vertical portals charge while standing in the circle: 0.75s down, 1.5s up; the town portal
// (game/townportal.js) for 1s.
import { N, DIRS } from '../core/constants.js';
import { isFaceOpen, approachingFace, faceDistance, boundaryArrival } from '../core/boundaries.js';
import { step, OPP6 } from '../world/coords.js';
import { railedFace } from '../physics/canmove.js';
import { player, state, setStatus } from './state.js';
import { portalLocked, lockMessage, leavingFight, steersOut } from '../core/guardians.js';
import { guardianKind } from './enemyspawn.js';
import { askLeave } from './leavefight.js';
import { startTravel } from './travel.js';
import { townPadIn, onPad, TOWN_PORTAL_CHARGE } from '../core/townportal.js';
import { takeTownPortal } from './townportal.js';
import { checkDoors } from './doors.js';
import { checkHandover } from './handover.js';
import { sealedIn } from './trials.js';
import { SEALED_MESSAGE } from '../core/trials.js';
import { tr } from '../i18n/i18n.js';

export const PORTAL_CHARGE = 1.5;
export const portalChargeDuration = kind => kind === 'town' ? TOWN_PORTAL_CHARGE : kind === 'down' ? PORTAL_CHARGE / 2 : PORTAL_CHARGE;

function inside(q) {
  const p = player;
  if (Math.abs(p.y - q.y) > 0.6) return false;
  // wells and rings only take you when you step on them yourself (not stunned or knocked there)
  if (q.kind !== 'side') return Math.hypot(p.x - q.x - 0.5, p.z - q.z - 0.5) < 0.42 && p.grounded && p.stun <= 0 && Math.hypot(p.vx, p.vz) < 4.4;
  const along = q.dir < 2 ? p.z - q.z - 0.5 : p.x - q.x - 0.5;
  const out = [p.x - N, -p.x, p.z - N, -p.z][q.dir];   // distance past the face (negative inside)
  return Math.abs(along) < 1.5 && out > -0.4;
}

// a stair or bridge along open face d keeps its side rail there: on it, or on the one beside
// where we would arrive (the neighbour is discovered, so its map is here)
function railedAcross(d) {
  const next = state.cubes?.cubes.get(step(state.cubeKey, d))?.map, at = boundaryArrival(player, d);
  return railedFace(player.x, player.z, player.y, d) || !!next && railedFace(at.x, at.z, at.y, OPP6[d], next);
}

// Arriving somewhere other than through a portal (following a friend, src/net/session.js):
// a portal or an open face we happen to stand in does not take us on until we step out of it.
export function lockPortalsHere() {
  state.portalLock = state.map.portals.find(q => q.kind !== 'spawn' && inside(q))?.id ?? 0;
  state.boundaryLock = DIRS.findIndex((_, d) => faceDistance(player, d) <= player.r + 0.25);
  state.portalCharge = null;
}

// Out of a guardian's arena while it lives: asks first, if we steer out ourselves; pushed there,
// we stay (core/guardians.js leavingFight, game/leavefight.js). True: the fight holds us.
function fightHolds(d, steer) {
  if (!leavingFight(state.map, state.run, d)) return false;
  if (steersOut(player, d, steer[0], steer[1])) askLeave(d);
  return true;
}

// dt: time spent this step (charges vertical portals); charge: carried over from the last
// step. state.portalCharge only survives while we keep standing in the same portal.
// steer: where we steer ourselves (game/update.js: the keys or a mouse order, not a lunge)
export function checkPortals(dx = 0, dz = 0, dt = 0, charge = state.portalCharge, steer = [dx, dz]) {
  state.portalCharge = null;
  if (state.map.flipKey) return false;   // Flip's box turned: its portals are in the walls (game/flipworld.js)
  if (state.boundaryLock >= 0 && faceDistance(player, state.boundaryLock) > player.r + 0.25) state.boundaryLock = -1;
  const sealed = sealedIn();   // a trial room while its event runs (game/trials.js): nothing takes you out
  // the town's seams: walked across, the tile beyond takes over (game/handover.js)
  if (checkHandover()) return true;
  // open side faces take you across anywhere along them, whether they ever had a gate or not
  for (let d = 0; d < 4; d++) {
    if (state.map.seams?.[d]) continue;
    if (!isFaceOpen(state.openedFaces, state.cubeKey, d) || state.boundaryLock === d || !approachingFace(player, d, dx, dz)) continue;
    if (railedAcross(d)) continue;
    if (sealed) { setStatus(tr(SEALED_MESSAGE)); continue; }
    if (portalLocked(state.map, state.run, { dir: d })) { setStatus(lockMessage(state.map, d, guardianKind(state.map))); continue; }
    if (fightHolds(d, steer)) continue;
    startTravel(state.map.portals.find(q => q.kind === 'side' && q.dir === d) || { kind: 'side', dir: d });
    return true;
  }
  if (checkDoors(dx, dz)) return true;   // house doors (game/doors.js)
  for (const q of state.map.portals) {
    if (q.kind === 'spawn' || q.kind === 'side' && isFaceOpen(state.openedFaces, state.cubeKey, q.dir)) continue;
    const at = inside(q);
    if (state.portalLock === q.id) { if (!at) state.portalLock = 0; continue; }
    if (!at) continue;
    if (sealed) { setStatus(tr(SEALED_MESSAGE)); continue; }
    if (portalLocked(state.map, state.run, q)) { setStatus(lockMessage(state.map, q.dir, guardianKind(state.map))); continue; }
    if (q.kind === 'side' && fightHolds(q.dir, steer)) continue;
    if (q.kind === 'up' || q.kind === 'down') {
      const c = charge?.key === state.cubeKey && charge.id === q.id ? charge : { key: state.cubeKey, id: q.id, t: 0 };
      c.t += dt;
      if (c.t < portalChargeDuration(q.kind)) { state.portalCharge = c; continue; }
    }
    startTravel(q); return true;
  }
  const pad = townPadIn(state.map, state.run);
  if (pad && onPad(player, pad) && !sealed) {
    const c = charge?.key === state.cubeKey && charge.id === 'town' ? charge : { key: state.cubeKey, id: 'town', t: 0 };
    c.t += dt;
    if (c.t < portalChargeDuration('town')) { state.portalCharge = c; return false; }
    return takeTownPortal();
  }
  return false;
}
