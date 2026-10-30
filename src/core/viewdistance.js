// Render-only discovery and distance budget. Only visited cubes show, with no exceptions: not the
// far side of a gorge span, not the rest of a large area, not the room under a hole
// (docs/world.md, "Only where you have been"). Cubes are selected conservatively for any
// player position inside the active cube; the renderer tests their actual bounds each frame.
import { N } from './constants.js';
import { key, parse } from '../world/coords.js';

export const VIEW_DISTANCE = 3 * N;
export const VIEW_FADE = N / 2;
// cubes: what lives in the surroundings (their people, the friends there: game/drawn.js) is drawn
// this far round the cube played in, no further
export const NEAR_CUBES = 2;
// are cubes a and b on one layer, at most n cubes apart (across and diagonally)?
export function cubesNear(a, b, n = NEAR_CUBES) {
  if (!a || !b) return false;
  const p = parse(a), q = parse(b);
  return p.length === 3 && q.length === 3 && p.every(Number.isFinite) && q.every(Number.isFinite)
    && p[1] === q[1] && Math.max(Math.abs(p[0] - q[0]), Math.abs(p[2] - q[2])) <= n;
}

export function discoveredCubes(cubes, active, distance = VIEW_DISTANCE) {
  const [x, y, z] = parse(active), radius = Math.ceil(distance / N) + 1, list = [];
  for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
    if (!dx && !dz) continue;
    // Minimum distance between the two cube footprints, not their centers.
    const gapX = Math.max(0, Math.abs(dx) - 1) * N, gapZ = Math.max(0, Math.abs(dz) - 1) * N;
    if (Math.hypot(gapX, gapZ) >= distance) continue;
    const c = cubes.get(key(x + dx, y, z + dz));
    if (c?.visits) list.push({ key: c.key, geo: c.geo, dx, dz });
  }
  return list;
}

export function distanceFade(distance, limit = VIEW_DISTANCE, band = VIEW_FADE) {
  const t = Math.max(0, Math.min(1, (limit - distance) / band));
  return t * t * (3 - 2 * t);
}
