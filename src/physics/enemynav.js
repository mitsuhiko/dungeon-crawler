// Floor-graph navigation for enemies. Clearance is species-specific: a Stunder
// cannot fit through the low ceilings that a spider can. The graph's nodes are floors and
// structure pieces: enemies walk up and down stairs and ramps, over bridges and landings,
// but none climbs ladders or jumps.
// Wherever these take a body's height they take a walker too: a fluid dweller's (the Squirtles,
// physics/dwell.js), which says itself which floors it may stand on and what lies next to one.
import { DIRS } from '../core/constants.js';
import { topOf } from '../core/surfaces.js';
import { floorWalkable, navNeighbor, structureLinks } from './floornav.js';
import { state } from '../game/state.js';
import { cellAt, insideSolid } from './collide.js';
import { containsXZ } from '../core/blockers.js';
import { walkerOf, standY } from './dwell.js';

export function walkable(f, height = .9, player = false) {
  if (f?.kind) structureLinks(state.map);   // gives the pieces their cells
  if (typeof height === 'object') return height.ok(f);
  return floorWalkable(state.map, f, height, player);
}
const dirOf = (dx, dz) => DIRS.findIndex(([x, z]) => x === dx && z === dz);
// ok: which floors may be entered (default: walkable for this height)
const via = (f, d, height, ok) => typeof height === 'object' ? height.step(f, d) : navNeighbor(state.map, f, d, height, ok);
export const neighbors = (f, height = 0.9, ok) => [0, 1, 2, 3].map(d => via(f, d, height, ok)).filter(Boolean);
export function floorAt(f, x, z, height = 0.9) {
  const c = cellAt(x, z);
  if (c < 0) return null;
  if (c === f.c) return walkable(f, height) ? f : null;
  const dx = Math.floor(x) - f.x, dz = Math.floor(z) - f.z;
  if (Math.abs(dx) > 1 || Math.abs(dz) > 1) return null;
  if (!dx || !dz) return via(f, dirOf(dx, dz), height);
  const a = via(f, dirOf(dx, 0), height), b = via(f, dirOf(0, dz), height);
  const g1 = a && via(a, dirOf(0, dz), height), g2 = b && via(b, dirOf(dx, 0), height);
  return g1 && g2 === g1 ? g1 : null;
}
export const groundY = (f, x, z) => topOf(f, x - f.x, z - f.z);

// The body must fit on the floors it covers; the probe is kept a little inside a cell's
// half-width, so that even a broad body fits on a stair or bridge one cell wide.
export function stepEnemy(s, mx, mz, radius = s.profile.radius, height = walkerOf(s)) {
  if (s.deck) return onDeck(s, s.x + mx, s.z + mz, radius);
  radius = Math.min(radius, 0.42);
  const go = (x, z) => {
    const g = floorAt(s.f, x, z, height);
    if (!g) return false;
    for (const [ox, oz] of [[radius, 0], [-radius, 0], [0, radius], [0, -radius]])
      if (!floorAt(g, x + ox, z + oz, height)) return false;
    s.x = x; s.z = z; s.f = g; s.y = standY(s.profile, g, x, z);
    return true;
  };
  return go(s.x + mx, s.z + mz) || go(s.x + mx, s.z) || go(s.x, s.z + mz);
}
// One standing on a platform floating round Foggery's tower (`deck`, a mover: physics/collide.js,
// game/foggery.js): it goes to (x, z) as far as the slab reaches, never off it, on its top.
// true: it moved.
export function onDeck(s, x, z, radius = s.profile.radius) {
  const d = s.deck, r = Math.min(radius + 0.05, (d.x1 - d.x0) / 2, (d.z1 - d.z0) / 2);
  const cx = Math.min(d.x1 - r, Math.max(d.x0 + r, x)), cz = Math.min(d.z1 - r, Math.max(d.z0 + r, z));
  const moved = Math.abs(cx - s.x) > 1e-9 || Math.abs(cz - s.z) > 1e-9;
  s.x = cx; s.z = cz; s.y = d.y1;
  return moved;
}
// learn: paths.html#bfs-code (see learn/README.md)
export function findPath(a, b, maxLen, height = 0.9) {
  if (!a || !b || !walkable(a, height) || !walkable(b, height)) return null;
  const prev = new Map([[a, null]]);
  let front = [a];
  for (let d = 0; d < maxLen && front.length && !prev.has(b); d++) {
    const next = [];
    for (const f of front) for (const g of neighbors(f, height))
      if (!prev.has(g)) { prev.set(g, f); next.push(g); }
    front = next;
  }
  if (!prev.has(b)) return null;
  const path = [];
  for (let f = b; f; f = prev.get(f)) path.unshift(f);
  return path;
}
// Breadth-first like findPath, to the node nearest the point (x, y, z) within maxLen steps
// (height differences count double): as close as it gets to a target it cannot reach.
export function pathToward(a, x, y, z, maxLen, height = 0.9) {
  if (!a || !walkable(a, height)) return null;
  const prev = new Map([[a, null]]), far = f => Math.hypot(f.x + 0.5 - x, f.z + 0.5 - z) + 2 * Math.abs(topOf(f, 0.5, 0.5) - y);
  let front = [a], best = a, bestD = far(a);
  for (let d = 0; d < maxLen && front.length; d++) {
    const next = [];
    for (const f of front) for (const g of neighbors(f, height)) {
      if (prev.has(g)) continue;
      prev.set(g, f); next.push(g);
      const gd = far(g);
      if (gd < bestD) { best = g; bestD = gd; }
    }
    front = next;
  }
  const path = [];
  for (let f = best; f; f = prev.get(f)) path.unshift(f);
  return path;
}
// Breadth-first like findPath, within maxLen steps: the path to the nearest node (fewest steps,
// a itself included) that `ok` accepts; else, given `score`, to the reached node that scores
// highest (a itself, unless one beats it); else null.
export function nearest(a, ok, maxLen, height = 0.9, score = null) {
  if (!a || !walkable(a, height)) return null;
  const prev = new Map([[a, null]]);
  let front = [a], hit = ok(a) ? a : null, best = a, top = score && !hit ? score(a) : -Infinity;
  for (let d = 0; d < maxLen && front.length && !hit; d++) {
    const next = [];
    for (const f of front) {
      for (const g of neighbors(f, height)) {
        if (prev.has(g)) continue;
        prev.set(g, f); next.push(g);
        if (ok(g)) { hit = g; break; }
        if (score) { const s = score(g); if (s > top) { best = g; top = s; } }
      }
      if (hit) break;
    }
    front = next;
  }
  const end = hit ?? (score ? best : null);
  if (!end) return null;
  const path = [];
  for (let f = end; f; f = prev.get(f)) path.unshift(f);
  return path;
}
export function around(f, n, height = 0.9) {
  const seen = new Set([f]);
  let front = [f];
  for (let d = 0; d < n; d++)
    front = front.flatMap(g => neighbors(g, height).filter(h => !seen.has(h) && seen.add(h)));
  return [...seen];
}
// learn: paths.html#sight (see learn/README.md)
export function clearLine(ax, ay, az, bx, by, bz) {
  const n = Math.ceil(Math.hypot(bx - ax, by - ay, bz - az) / 0.15);
  for (let i = 1; i < n; i++) {
    const t = i / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
    if (insideSolid(x, z, y)) return false;
    const c = cellAt(x, z);
    if ((state.map.blockers?.[c] || []).some(b => y > b.bottom && y < b.top && containsXZ(b, x, z))) return false;
  }
  return true;
}
