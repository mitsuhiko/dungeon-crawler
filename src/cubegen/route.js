// A* from the first portal to every other one over walk / drop / stair / bridge moves. Moves
// already on the route are cheap, so later routes share the earlier ones where they can.
import { Heap } from '../core/heap.js';

export const moveKey = m => m.kind + ':' + Math.min(m.from.id, m.to.id) + ':' + Math.max(m.from.id, m.to.id);

// `goal`: a floor, or a test for any of several (then plain Dijkstra); `ok`: which moves count
// learn: paths.html#astar #astar-code (see learn/README.md)
export function search(ctx, from, goal, jitter, have, ok = null) {
  const { SZ, movesFrom } = ctx;
  const { gs, prev, closed } = scratch(SZ);
  const many = typeof goal === 'function', isGoal = many ? goal : f => f === goal;
  const hfn = many ? () => 0 : f => Math.abs(f.x - goal.x) + Math.abs(f.z - goal.z);
  const open = new Heap();
  gs[from.id] = 0; open.push(hfn(from), from);
  let end = null;
  while (open.size) {
    const cur = open.pop();
    if (isGoal(cur)) { end = cur; break; }
    if (closed[cur.id]) continue;
    closed[cur.id] = 1;
    for (const mv of movesFrom(cur)) {
      if (ok && !ok(mv)) continue;
      // no jump straight after a drop the same way (the fall carries you into the gap)
      if (mv.kind === 'jump' && prev[cur.id]?.kind === 'drop' && prev[cur.id].d === mv.d) continue;
      const ng = gs[cur.id] + (have.has(moveKey(mv)) ? 0.2 : mv.cost + jitter[mv.to.id]);
      if (ng < gs[mv.to.id]) { gs[mv.to.id] = ng; prev[mv.to.id] = mv; open.push(ng + hfn(mv.to), mv.to); }
    }
  }
  if (!end) return null;
  const moves = [];
  for (let f = end; f !== from; f = prev[f.id].from) moves.unshift(prev[f.id]);
  return moves;
}

// A search's arrays (gs all Infinity, prev all null, closed all 0), as long as the cube's nodes
// and landings: the same ones for every search, set back each time (a search never runs inside
// another one)
const lent = { gs: new Float64Array(0), prev: [], closed: new Uint8Array(0) };
function scratch(SZ) {
  if (lent.gs.length < SZ) Object.assign(lent, { gs: new Float64Array(SZ), prev: new Array(SZ), closed: new Uint8Array(SZ) });
  lent.gs.fill(Infinity, 0, SZ); lent.prev.fill(null, 0, SZ); lent.closed.fill(0, 0, SZ);
  return lent;
}

export function findRoute(ctx) {
  const { R, SZ, portals, portalFloors, spec } = ctx;
  if (!portalFloors.length) { Object.assign(ctx, { moves: [], segments: [], pathFloors: [] }); return true; }   // not part of the world
  const jitter = new Float32Array(SZ).map(() => R() * 0.6);   // varies the route per seed
  // the hub is the exit (the way on towards depth 20): every portal must lead there; the way
  // back from it is only tried (a portal may be one-sided). No exit (the core): first portal.
  const hi = Math.max(0, portals.findIndex(p => p.dir === spec.exit)), hub = portalFloors[hi];
  const others = portalFloors.filter((_, i) => i !== hi), toHub = spec.exit != null;
  Object.assign(ctx, { have: new Set(), moves: [], segments: [], jitter, hub: toHub ? hub : null });
  for (const f of others) if (!take(ctx, toHub ? search(ctx, f, hub, jitter, ctx.have) : search(ctx, hub, f, jitter, ctx.have))) return false;
  ctx.reqMoves = ctx.moves.length;
  if (toHub) for (const f of others) take(ctx, search(ctx, hub, f, jitter, ctx.have));
  return true;
}

// add a route (a list of moves) unless it is missing; returns whether it was there
export function take(ctx, seg) {
  if (!seg) return false;
  ctx.segments.push(seg);
  for (const m of seg) if (!ctx.have.has(moveKey(m))) { ctx.have.add(moveKey(m)); ctx.moves.push(m); }
  return true;
}

// after all routes are in: the floors on them; landings belong to the layer the climb started
// from (so they stay visible from below)
export function finishRoute(ctx) {
  const { moves, portalFloors } = ctx;
  ctx.pathFloors = [...new Set([...portalFloors.slice(0, 1), ...moves.flatMap(m => [m.from, m.to])])].filter(n => !n.landing);
  for (const m of moves) if (m.to.landing) m.to.layer = m.from.layer;
}
