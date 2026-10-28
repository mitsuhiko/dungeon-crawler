// How deep the cutaway goes, driven by occlusion: rays from the character to the camera find
// the lowest solid in the way and the cut drops just below it (a slab underside or a terrain
// level). Revealing is quick; restoring waits until the character has been visible a while.
// The close view (game/camera.js) has none: its camera stays out of the solids, and the walls
// stay up; nor has a boss's intro, while its free camera is on.
import { N, LH } from '../core/constants.js';
import { camera } from '../render/scene.js';
import { setCut } from '../render/section.js';
import { insideSolid, groundAt } from '../physics/collide.js';
import { fluidSurface } from '../physics/fluid.js';
import { player, state } from './state.js';
import { updateCamera, closeView, cineView } from './camera.js';
import { mapInfo, inSlab, outOfSlabs } from './cutinfo.js';
import { viewBlockedAt } from '../core/blockers.js';

// learn: drawing.html#cut-how (see learn/README.md)
const REVEAL = 0.07, RESTORE = 0.12, RESTORE_DELAY = 1;   // spring times (s), wait before restoring
const STEP = 0.12;
let cut = Infinity, vel = 0, hold = 0, lastMap = null;

// height of the first solid on the way from (x,y,z) to the camera (Infinity if the view is clear)
function blockedAt(x, y, z, top) {
  const cp = camera.position;
  let dx = cp.x - x, dy = cp.y - y, dz = cp.z - z;
  const len = Math.hypot(dx, dy, dz);
  dx /= len; dy /= len; dz /= len;
  if (insideSolid(x, z, y)) return Infinity;   // probe point is inside a wall: ignore it
  for (let t = STEP; t < len; t += STEP) {
    const px = x + dx * t, py = y + dy * t, pz = z + dz * t;
    if (py > top) break;
    const inCube = px >= 0 && pz >= 0 && px < N && pz < N;
    // Clearing crowns can overhang the cube; keep probing their foliage outside it,
    // without mistaking the out-of-bounds terrain query for a solid wall.
    if (!inCube && !state.map.authoredProps) break;
    if ((inCube && insideSolid(px, pz, py)) || viewBlockedAt(state.map, px, py, pz)) return py;
  }
  return Infinity;
}

// the surface of the fluid the player stands in (-Infinity: none): the cube's own (a pool, a
// shore) or a standing one (a rising trial's, a boss's tide)
const wetAt = p => fluidSurface(groundAt(p.x, p.z, p.visY + 0.1, 0));

// learn: drawing.html#cut-how (see learn/README.md)
function target(m) {
  const info = mapInfo(m), p = player, y = p.visY;
  // never below our feet, and never below the surface of the water we swim or wade in: the
  // cutaway drops the water above the cut, which would leave the legs standing dry in it
  const wet = wetAt(p), floor = Math.max(p.swimming ? y + 0.6 : y + 0.3, wet > y ? wet + 0.05 : -Infinity);
  if (p.ragdoll && cut !== Infinity) return cut;
  // the character itself (chest and head) ...
  let need = Math.min(blockedAt(p.x, y + 0.6, p.z, info.top), blockedAt(p.x, y + 0.95, p.z, info.top));
  // ... and once it is hidden, its legs too: a wall right in front, cut just under where it
  // crosses the chest's line of sight, would still stand in front of them
  if (need < Infinity) need = Math.min(need, blockedAt(p.x, y + 0.15, p.z, info.top));
  // ... and points around / ahead of it, but only for things overhead (not walls beside us)
  const ahead = [[p.vx * 0.45, p.vz * 0.45], [0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]];
  for (const [ox, oz] of ahead) {
    const h = blockedAt(p.x + ox, y + 0.8, p.z + oz, info.top);
    if (h >= y + 1.1) need = Math.min(need, h);
  }
  if (need === Infinity) return info.top;
  // prefer cutting just under a slab; otherwise snap down to the level grid
  let best = -Infinity;
  for (const b of info.bases) if (b <= need && b >= floor) best = Math.max(best, b);
  if (best === -Infinity) {
    // something on our own layer (hill, pillar, cliff): cut it at a terrain level, moved out of
    // any slab nearby; only if that is impossible keep it and rely on the silhouette
    const g = outOfSlabs(m, Math.max(floor, Math.floor(need / LH) * LH - 0.02), floor, need, player);
    best = g ?? info.top;
  }
  return Math.min(best, info.top);
}

// the probes only change with what they look from and to: standing still under a still camera,
// last frame's target holds (a ragdoll's depends on the cut itself)
let lastKey = null, lastTarget = 0;
function cachedTarget(m) {
  const p = player, c = camera.position;
  const key = [m, m.blockers, p.x, p.visY, p.z, p.vx, p.vz, p.swimming, c.x, c.y, c.z, wetAt(p)];
  if (!p.ragdoll && lastKey && key.every((v, i) => v === lastKey[i])) return lastTarget;
  lastKey = p.ragdoll ? null : key;
  return lastTarget = target(m);
}

// the close view: no cut, no walls down; coming back to the overview opens what is needed
// quickly from nothing cut (reveal), not slowly from an old cut
function open(m) {
  cut = mapInfo(m).top; vel = 0; hold = RESTORE_DELAY; lastKey = null;
  setCut(Infinity, m, player.x, player.visY + 0.6, player.z, false);
}
function apply(m) { setCut(cut >= mapInfo(m).top - 0.01 ? Infinity : cut, m, player.x, player.visY + 0.6, player.z); }

export function updateCut(dt) {
  const m = state.map;
  if (!m) return;
  if (m !== lastMap) { resetCut(); return; }
  if (closeView() || cineView()) { open(m); return; }   // (a boss's intro: its free camera, game/camera.js)
  const t = cachedTarget(m);
  if (t > cut + 1e-3) {
    // restoring hidden geometry: only once the character has been in clear view for a moment;
    // right away if the cut is below our feet (climbing into the layer) or halfway through a slab
    if ((hold -= dt) > 0 && cut >= player.visY + 0.3 && !inSlab(m, cut, player)) return apply(m);
  } else hold = RESTORE_DELAY;
  // critically damped spring towards the target
  const omega = 2 / (t > cut ? RESTORE : REVEAL), x = omega * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cut - t, tmp = (vel + omega * change) * dt;
  vel = (vel - omega * tmp) * e;
  cut = t + (change + tmp) * e;
  if (Math.abs(cut - t) < 1e-3 && Math.abs(vel) < 1e-2) { cut = t; vel = 0; }
  apply(m);
}

// jump straight to the right cut (new cube, respawn)
export function resetCut() {
  const m = state.map;
  if (!m) return;
  updateCamera(0);   // the camera may still be looking at the previous spot
  lastMap = m; vel = 0; hold = RESTORE_DELAY; lastKey = null;
  if (closeView() || cineView()) { open(m); return; }
  cut = mapInfo(m).top;
  cut = target(m);
  apply(m);
}
export const cutTargetFor = m => target(m);   // tests
