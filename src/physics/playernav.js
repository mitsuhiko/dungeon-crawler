// The hero's way to where a click sends him (click to move, game/orders.js), and steering along
// it. The way goes over the floor graph the enemies walk too (floors, stairs, bridges, landings:
// physics/floornav.js), and where only the hero goes: up and down ladders (map.ladders,
// physics/climb.js) and the jumps he can make (physics/leaps.js: over gaps, up a ledge, down off
// one), and through the water (he wades and swims: physics/move.js; in and out over a bank no
// more than a level over its surface going out, JUMP_IN going in). The cheapest way wins (cells
// walked; climbing, jumping and swimming cost more), or, when there is none, the way to the
// reached node closest to the target. A trial's crust that is gone for now (a sunk stone, one of
// the balance's rhythm stones under: game/trials.js) is not on the way while it is: when it comes
// up, it is only on a way planned anew (the jumps themselves are found with it there).
// Along walked steps it cuts corners where the straight line keeps to the way's nodes by walking
// (never onto a stair or bridge from its side, under a bridge for over it, over a ledge). Before a
// ladder or a jump it stops cutting: it gets onto a ladder in front of it (or over its top) and
// climbs; it runs up to a jump along the middle of the take-off cell, jumps where the jump was
// found to work (or walks slowly off the ledge) and keeps straight on in the air. A jump or
// ladder that does not work out is left out from then on, and the way planned anew.
import { CHAR_H, CHAR_R, DIRS, OPP, EDGE_CORNERS, N, LH, RUN_SPEED, CLIMB_SPEED, SWIM_SPEED, SWIM_DEPTH, SWIM_FEET, SWIM_STEP, WATER } from '../core/constants.js';
import { idx, inb, edgeKey } from '../core/util.js';
import { topOf } from '../core/surfaces.js';
import { containsXZ } from '../core/blockers.js';
import { Heap } from '../core/heap.js';
import { player, state } from '../game/state.js';
import { navNeighbor, structureLinks, columnClear } from './floornav.js';
import { walkable, groundY } from './enemynav.js';
import { goneNow } from './collide.js';
import { leapsFrom, cellFrame, cellPoint, runStart, airSteer, LATE, ALIGN, DROP_START, DROP_PACE } from './leaps.js';

// can the hero stand on node f: headroom, and the body fits in the middle of the cell
export function passable(f) {
  if (!walkable(f, CHAR_H, true)) return false;
  const y = groundY(f, f.x + 0.5, f.z + 0.5);
  return !(state.map.blockers?.[f.c] || []).some(b => b.bottom < y + CHAR_H && b.top > y + 0.1
    && containsXZ(b, f.x + 0.5, f.z + 0.5, CHAR_R + 0.03));
}
const nodeY = n => topOf(n, 0.5, 0.5);
const center = n => [n.x + 0.5, n.z + 0.5];

// per map: node -> the ladders from it [{ g, ladder, up, cost }]
const ladderCache = new WeakMap();
function ladderLinks(map) {
  let links = ladderCache.get(map);
  if (links) return links;
  ladderCache.set(map, links = new Map());
  const floor = (c, id) => map.cols[c]?.find(f => f.id === id) ?? null;
  for (const l of map.ladders || []) {
    const [dx, dz] = DIRS[l.d], hx = l.x + dx, hz = l.z + dz;
    const lo = floor(l.c, l.lo), hi = inb(hx, hz) ? floor(idx(hx, hz), l.hi) : null;
    if (!lo || !hi || (lo.fluid && l.wet === undefined) || hi.fluid) continue;   // (one out of the water: from it, swimming)
    const cost = 2 + (l.y1 - l.y0) * RUN_SPEED / CLIMB_SPEED;
    for (const [a, g, up] of [[lo, hi, true], [hi, lo, false]]) {
      if (!links.has(a)) links.set(a, []);
      links.get(a).push({ g, ladder: l, up, cost });
    }
  }
  return links;
}
// The water's ways: a water floor (one he wades or swims in) joins the water beside it at its
// surface (wading: WADE_COST a cell; swimming: SWIM_COST), and the ground beside it he climbs out
// onto (up to a level over its surface) or goes into it from (a bank at most JUMP_IN levels over deep
// water, a level over shallow water, whose bed would not catch the fall: the walk goes off it into
// the water, as any walk does: physics/canmove.js). Not under a ceiling.
const SWIM_COST = RUN_SPEED / SWIM_SPEED, WADE_COST = 1.4, JUMP_IN = 3;
const fenceOn = (map, a, b, y) => !!map.fences?.get(edgeKey(a.x, a.z, b.x, b.z))?.some(e => e.ymax > y - 0.6 && e.ymin < y + CHAR_H);
// (free over the water from swimming height up to `top`: the head, or where it goes in from)
const swimmable = (map, g, top = g.surf * LH + CHAR_H - SWIM_FEET) => g.fluid === WATER && !g.crust && columnClear(map, g.c, g.surf * LH - SWIM_FEET, top, g);
function waterEdges(map, f, out) {
  for (let d = 0; d < 4; d++) {
    const x = f.x + DIRS[d][0], z = f.z + DIRS[d][1];
    if (!inb(x, z)) continue;
    for (const g of map.cols[idx(x, z)]) {
      if (f.fluid === WATER) {
        if (g.fluid === WATER && g.surf === f.surf && swimmable(map, g)) out.push([g, (g.surf - g.top) * LH > SWIM_DEPTH ? SWIM_COST : WADE_COST, null]);
        else if (!g.fluid && !g.kind && g.top >= f.surf && g.top <= f.surf + 1 && passable(g) && !fenceOn(map, f, g, g.top * LH)
          && EDGE_CORNERS[OPP[d]].reduce((a, k) => a + g.cs[k], 0) / 2 <= f.surf * LH - SWIM_FEET + SWIM_STEP - 0.05) out.push([g, 1.5, null]);
      } else if (g.fluid === WATER && f.top >= g.surf && f.top <= g.surf + (g.surf - g.top >= 2 ? JUMP_IN : 1) && swimmable(map, g, f.top * LH + CHAR_H)
        && !fenceOn(map, f, g, f.top * LH)) out.push([g, 1.5, null]);
    }
  }
}

// the ways on from f: [g, cost, how (null: walked, a ladder's or a leap's step)]
function edges(map, f) {
  const out = [];
  if (!f.kind && !f.landing) waterEdges(map, f, out);
  for (const e of ladderLinks(map).get(f) || []) if (passable(e.g)) out.push([e.g, e.cost, e]);
  if (f.fluid) return out;
  for (let d = 0; d < 4; d++) { const g = navNeighbor(map, f, d, CHAR_H, passable); if (g && !goneNow(g)) out.push([g, 1, null]); }
  // (not onto a trial's crust while it is gone: a stone sunk for now, physics/collide.js)
  for (const e of leapsFrom(map, f, passable)) if (!goneNow(e.g)) out.push([e.g, e.cost, e]);
  return out;
}

const LIMIT = 6 * N;   // how far (in cells walked) a way may go
// The cheapest way from node `from` to node `to`, else to the reached node closest to goal
// { x, y, z } (height counting like distance). bad: from -> Set of nodes not to go to from it.
// { path: nodes, how: how each is got to (how[0]: null) }
// learn: paths.html#hero-way #way-code (see learn/README.md)
export function findWay(from, to, goal, bad) {
  const map = state.map;
  structureLinks(map);   // (gives the pieces their cells)
  const gy = goal.y ?? (to ? nodeY(to) : player.y);
  const far = n => Math.hypot(n.x + 0.5 - goal.x, n.z + 0.5 - goal.z) + Math.abs(nodeY(n) - gy);
  const cost = new Map([[from, 0]]), prev = new Map(), done = new Set(), heap = new Heap();
  let best = from, bestD = far(from);
  heap.push(0, from);
  while (heap.size) {
    const f = heap.pop();
    if (done.has(f)) continue;
    done.add(f);
    if (f === to) { best = f; break; }
    const fd = far(f);
    if (fd < bestD - 1e-9) { best = f; bestD = fd; }
    const c = cost.get(f);
    if (c > LIMIT) continue;
    for (const [g, k, how] of edges(map, f)) {
      if (done.has(g) || bad?.get(f)?.has(g)) continue;
      if (c + k < (cost.get(g) ?? Infinity)) { cost.set(g, c + k); prev.set(g, [f, how]); heap.push(c + k, g); }
    }
  }
  const path = [], how = [];
  for (let n = best; n;) {
    const p = prev.get(n);
    path.unshift(n); how.unshift(p ? p[1] : null);
    n = p ? p[0] : null;
  }
  return { path, how };
}

// A walk: to node `to` (null: straight for the point) at (x, z) (y: its height, if known).
// nearest: when `to` cannot be reached, the walk ends in the middle of the node closest to it.
// path / how: the way (null: none, straight for the point), i: the index of the node to get to
// next; done: on the way's last node.
export function planWalk(to, x, z, y = null, nearest = false) {
  const w = { to, x, z, y, nearest, bad: new Map(), path: null, how: null, nodes: null, i: 1,
    run: false, air: false, push: 0, lost: 0, replan: false, done: false, reached: false };
  plan(w);
  return w;
}
// in a jump or on a ladder (or running up to one): the way is not planned anew until it is over
export const walkBusy = w => !!(w && (w.run || w.air || player.climb));
// a new target for the walk (planned at once, or after the jump or climb under way)
export function retarget(w, to, x, z, y = null, nearest = w.nearest) {
  Object.assign(w, { to, x, z, y, nearest });
  if (walkBusy(w)) w.replan = true; else plan(w);
}
function plan(w) {
  const from = player.support;
  Object.assign(w, { path: null, how: null, nodes: null, i: 1, run: false, air: false, push: 0, lost: 0, replan: false, done: false, reached: false });
  if (!from || !w.to || from === w.to || !state.map) { w.reached = !!from && from === w.to; return; }
  const { path, how } = findWay(from, w.to, { x: w.x, y: w.y, z: w.z }, w.bad);
  if (path.length < 2) return;
  Object.assign(w, { path, how, nodes: new Set(path), reached: path[path.length - 1] === w.to });
  if (!w.reached && w.nearest) [w.x, w.z] = center(path[path.length - 1]);   // as close as it gets
}
// the step from path[i - 1] to path[i] did not work out: never again, and a new way
function fail(w) {
  const a = w.path[w.i - 1], b = w.path[w.i];
  if (!w.bad.has(a)) w.bad.set(a, new Set());
  w.bad.get(a).add(b);
  plan(w);
}

// The node walked to from node n at (x, z), on the way (or, `any`, wherever walking goes), or null.
const dirOf = (dx, dz) => DIRS.findIndex(([x, z]) => x === dx && z === dz);
function nodeAt(w, n, x, z, any = false) {
  const cx = Math.floor(x), cz = Math.floor(z);
  if (!inb(cx, cz)) return null;
  const dx = cx - n.x, dz = cz - n.z;
  if (!dx && !dz) return n;
  if (Math.abs(dx) > 1 || Math.abs(dz) > 1) return null;
  const via = (a, d) => a && navNeighbor(state.map, a, d, CHAR_H, passable);
  let g;
  if (!dx || !dz) g = via(n, dirOf(dx, dz));
  else {   // diagonally: both ways round the corner
    const g1 = via(via(n, dirOf(dx, 0)), dirOf(0, dz)), g2 = via(via(n, dirOf(0, dz)), dirOf(dx, 0));
    g = g1 && g1 === g2 ? g1 : null;
  }
  return g && (any || w.nodes.has(g)) ? g : null;
}
// is the straight walk from the hero to (x, z) on the way's nodes (body width included)?
function clearTo(w, x, z) {
  const p = player;
  let n = p.support;
  if (!p.grounded || !w.nodes.has(n)) return false;
  const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz), steps = Math.ceil(d / 0.2);
  const px = -dz / (d || 1) * 0.22, pz = dx / (d || 1) * 0.22;
  for (let i = 1; i <= steps; i++) {
    const sx = p.x + dx * i / steps, sz = p.z + dz * i / steps;
    n = nodeAt(w, n, sx, sz);
    if (!n || !nodeAt(w, n, sx + px, sz + pz, true) || !nodeAt(w, n, sx - px, sz - pz, true)) return false;
  }
  return true;
}

// steering: { dx, dz (at most unit length), jump, run (whatever Ctrl says), end (heading for
// the target itself), climbing, ladder: the one ladder to take hold of (physics/climb.js; null:
// none, so that walking past one never climbs it) }
const steer = (dx, dz, more = {}) => {
  const d = Math.hypot(dx, dz);
  return { dx: d > 1 ? dx / d : dx, dz: d > 1 ? dz / d : dz, jump: false, run: false, end: false, ladder: null, ...more };
};
// towards (x, z); `slow`: slowing down close to it, to stop on it
function aim(x, z, end = false, slow = false) {
  const dx = x - player.x, dz = z - player.z, d = Math.hypot(dx, dz) || 1, k = slow ? Math.min(1, Math.max(0.3, d / 0.3)) : 1;
  return steer(dx / d * k, dz / d * k, { end });
}

// This frame's steering along walk w, or null: on a ladder that is not on the way.
export function steerWalk(w, dt) {
  const p = player;
  if (w.replan && !walkBusy(w)) plan(w);
  if (p.climb) return climbing(w);
  if (!w.path) { w.done = true; return aim(w.x, w.z, true); }
  const path = w.path;
  if (w.run && !p.grounded) w.air = true;   // off the ledge
  if (w.air) {
    const s = w.how[w.i];
    if (!p.grounded) return steer(...airSteer(path[w.i], s.d, s.drop, p.x, p.z), { run: true });
    w.air = w.run = false;   // landed: where it was for?
    if (p.support !== path[w.i]) { fail(w); return steerWalk(w, 0); }
  }
  // where on the way we stand (lost for a while: a new way from here); swimming too
  if (p.grounded || p.swimming) {
    const at = path.indexOf(p.support);
    if (at >= 0) {
      w.lost = 0;
      if (at + 1 !== w.i) { w.i = at + 1; w.run = false; w.push = 0; }
    } else if (!w.run && (w.lost += dt) > 0.3) { plan(w); return steerWalk(w, 0); }
  }
  if (w.i >= path.length) { w.done = true; return aim(w.x, w.z, true); }
  w.done = false;
  const s = w.how[w.i];
  if (s?.ladder) return ladder(w, s, dt);
  if (s) return leap(w, s);
  // walking: as far ahead as is a straight, clear walk away (not past a ladder or jump)
  const point = j => j >= path.length - 1 ? [w.x, w.z] : center(path[j]);
  let k = w.i;
  while (k + 1 < path.length && !w.how[k + 1] && clearTo(w, ...point(k + 1))) k++;
  return aim(...point(k), k >= path.length - 1);
}

// A ladder's step: to the middle of the cell in front of it (going up) or above it (down), then
// into the wall (up) or out over the edge (down), onto its line, until climb.js takes over
function ladder(w, s, dt) {
  const p = player, l = s.ladder, [dx, dz] = DIRS[l.d], wx = l.x + 0.5 + dx * 0.5, wz = l.z + 0.5 + dz * 0.5;
  const out = -(p.x - wx) * dx - (p.z - wz) * dz, side = (p.x - wx) * dz - (p.z - wz) * dx, sg = s.up ? 1 : -1;
  if (p.support !== w.path[w.i - 1]) return aim(...center(w.path[w.i - 1]));
  if (Math.abs(side) < 0.1 && (s.up ? out < 0.8 : out > -0.8)) {
    // (down: it should have taken hold by now; never walk off the edge instead)
    if ((!s.up && out > -0.3) || (w.push += dt) > 0.8) { fail(w); return steer(0, 0); }
    const c = -4 * side;
    return steer(sg * dx + c * dz, sg * dz - c * dx, { ladder: l });
  }
  w.push = 0;
  return aim(wx - sg * dx * 0.5, wz - sg * dz * 0.5, false, true);
}
function climbing(w) {
  const s = w.how?.[w.i];
  if (!s?.ladder || player.climb.l !== s.ladder) return null;
  const [dx, dz] = DIRS[s.ladder.d], sg = s.up ? 1 : -1;
  return steer(sg * dx, sg * dz, { climbing: true, ladder: s.ladder });
}
// A jump's step (or walking off a ledge): to where the run-up starts in the middle of the
// take-off cell, then along it (slowly, walking off), jumping at the take-off
function leap(w, s) {
  const p = player, f = w.path[w.i - 1], [dx, dz] = DIRS[s.d];
  if (p.support !== f) return aim(...center(f));
  const [fwd, lat] = cellFrame(f, s.d, p.x, p.z);
  if (!w.run && Math.abs(lat) <= ALIGN && fwd <= (s.drop ? DROP_START : s.T - LATE)) w.run = true;
  if (!w.run) return aim(...cellPoint(f, s.d, runStart(s), 0), false, true);
  const pace = s.drop ? DROP_PACE : 1;
  return steer(dx * pace, dz * pace, { jump: !s.drop && fwd >= s.T, run: true });
}
