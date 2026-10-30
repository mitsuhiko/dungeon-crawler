// Open side connections are run state, not changes to generated terrain or cube physics.
import { N, DIRS } from './constants.js';
import { faceKey, step } from '../world/coords.js';
import { portalLocked } from './guardians.js';
import { trialGate } from './trials.js';

export const isFaceOpen = (opened, key, dir) => dir < 4 && dir >= 0 && opened.has(faceKey(key, dir));
export const openedSides = (opened, key) => DIRS.map((_, dir) => isFaceOpen(opened, key, dir));
// An open face always has both of its cubes visited (discovery, or walking through its portal).
// Faces carried over from elsewhere (a saved world, the host's run) keep to that: a save from
// before large areas were discovered a cube at a time holds their inner faces open unvisited.
export const visitedFaces = (faces, visited) => faces.filter(fk => {
  const [k, d] = fk.split('/');
  return visited.has(k) && visited.has(step(k, +d));
});
// Two route sections (a room on the route plus its branches) may be joined by discovery
// only over ground already covered: every route room between them discovered, and none of
// their forward exits still locked by a guardian. A shortcut then never skips an unseen
// room or a guard, even for rooms first reached by a fall or the town portal.
export function sectionsJoined(cubes, a, b, run) {
  if (a.routeIndex === b.routeIndex) return true;
  const route = a.route;
  if (!route || !run) return false;
  const lo = Math.min(a.routeIndex, b.routeIndex), hi = Math.max(a.routeIndex, b.routeIndex);
  for (let i = lo; i <= hi; i++) {
    const room = cubes.get(route[i]);
    if (!room?.visits) return false;
    if (i < hi && portalLocked(room.map, run, { dir: room.map.exit })) return false;
  }
  return true;
}

// A room that joins its neighbours only through its own portals, never through a whole face: an
// annex (world/layout.js), and a trial room (world/trials.js) until its trial is resolved (its
// gate unlocked: game/trials.js resolve). Its glass box glows (render/glass.js setGlassShut).
export const portalsOnly = (map, run) => !!map && (!!map.annexRoom || (!!map.trialRoom && !run?.unlockedGates.has(trialGate(map.key))));

// Discovery opens faces along actual portal links, or between sections already joined
// (above), so proximity cannot shorten the route or skip guards.
export function discoveredFaces(cubes, c, run) {
  const out = [];
  if (c.visits) for (let d = 0; d < 4; d++) {
    const neighbor = cubes.get(step(c.key, d));
    if (!neighbor?.visits) continue;
    // an annex and an unresolved trial room join only through their own portals (portalsOnly); so
    // does the town with what lies round it (only its gate leads out: docs/town.md)
    if ((portalsOnly(c.map, run) || portalsOnly(neighbor.map, run) || !!c.map.town !== !!neighbor.map.town) && !c.map.portals.some(p => p.dir === d)) continue;
    const a = c.map?.routeIndex, b = neighbor.map?.routeIndex;
    if (a != null && b != null && !c.map.portals.some(p => p.dir === d) && !sectionsJoined(cubes, c.map, neighbor.map, run)) continue;
    if (run && (portalLocked(c.map, run, { dir: d }) || portalLocked(neighbor.map, run, { dir: d ^ 1 }))) continue;
    out.push(faceKey(c.key, d));
  }
  return out;
}

export const faceDistance = (p, dir) => [N - p.x, p.x, N - p.z, p.z][dir];

// Trigger before the body's rim hits the cube-local collision boundary. Require outward
// intent/velocity so standing near, or walking parallel to, a face does not take you through.
export function approachingFace(p, dir, dx = 0, dz = 0) {
  const [nx, nz] = DIRS[dir];
  return faceDistance(p, dir) < p.r + 0.14
    && (dx * nx + dz * nz > 0 || p.vx * nx + p.vz * nz > 0.05);
}

// Preserve the point along the face and the height; only the normal coordinate changes.
// A little room inside the new cube keeps the whole body in bounds and prevents bounce-back.
export function boundaryArrival(p, dir) {
  const inset = Math.max(0.6, p.r + 0.25);
  const x = dir === 0 ? inset : dir === 1 ? N - inset : p.x;
  const z = dir === 2 ? inset : dir === 3 ? N - inset : p.z;
  return { x, y: p.y, z };
}
