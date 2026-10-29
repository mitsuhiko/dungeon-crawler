// Where the character can get to on its own: walk on level ground and slopes, jump up a
// level, drop down any cliff (unless a fence is in the way), swim and climb out of water onto a
// bank up to a level over its surface (physics/move.js SWIM_STEP),
// plus the structures on the route (both ways) and the route's own moves. `real` uses the
// final slopes and fences; before smoothing only level ground and one-level steps count.
import { N, LH, WATER, DIRS, OPP, EDGE_CORNERS, CHAR_H, SWIM_STEP, SWIM_FEET } from '../core/constants.js';
import { idx, inb, edgeKey } from '../core/util.js';

const ONE_WAY = new Set(['walk', 'drop', 'jump']);
const level = f => f.fluid ? f.surf : f.top;

// smoothing can pull a corner up into the room under the floor above: too low to stand
export const isCramped = (ctx, f) => { const a = !f.landing && ctx.nextAbove(f); return !!a && Math.max(...f.cs) + CHAR_H + 0.02 > a.bottom * LH; };

export function graph(ctx, real) {
  const { cols, floors, headOK, moves, fences } = ctx, adj = new Map();
  const memo = new Map(), cramped = f => real && (memo.get(f) ?? memo.set(f, isCramped(ctx, f)).get(f));
  const stand = f => !f.siteBlocked && (!f.fluid || f.fluid === WATER) && !cramped(f);
  const add = (a, b) => { if (cramped(a) || cramped(b)) return; let s = adj.get(a.id); if (!s) adj.set(a.id, s = []); s.push(b); };
  const fenced = (f, n, h) => real && (fences.get(edgeKey(f.x, f.z, n % N, (n / N) | 0)) || []).some(e => e.ymin < h + 0.6 && e.ymax > h - 0.6);
  // out of the water onto g, the way d: with the final slopes, the middle of g's edge it climbs
  // out at no higher than a swimmer reaches (physics/move.js SWIM_STEP from SWIM_FEET under the surface)
  const climbs = (f, g, d) => !real || f.fluid !== WATER || g.fluid || !g.cs
    || EDGE_CORNERS[OPP[d]].reduce((a, k) => a + g.cs[k], 0) / 2 <= f.surf * LH - SWIM_FEET + SWIM_STEP - 0.05;
  for (const f of floors) {
    if (!stand(f)) continue;
    const h = level(f);
    for (let d = 0; d < 4; d++) {
      const nx = f.x + DIRS[d][0], nz = f.z + DIRS[d][1];
      if (!inb(nx, nz)) continue;
      const n = idx(nx, nz);
      // the highest floor at or below our level, and the first one above it
      let below = null, above = null;
      for (const g of cols[n]) if (level(g) <= h) below = g; else if (!above) above = g;
      if (above && above.bottom < h + 2) {   // in the way: step / jump / climb out onto it, or nothing
        const up = level(above) - h;
        if (stand(above) && headOK(above, h) && headOK(f, level(above)) && (up <= 1 || (real && f.link[d] === above)) && climbs(f, above, d)) add(f, above);
        continue;
      }
      if (!below || !stand(below)) continue;
      if (level(below) === h || (real && f.link[d] === below)) { if (headOK(below, h) && climbs(f, below, d)) add(f, below); }
      // (a spiral's ramp is railed all along: before the rails exist, no drop off it either)
      else if (headOK(below, h + 1) && !fenced(f, n, h * LH) && (real || !ctx.railed?.has(f.c) || ctx.railed.has(n))) add(f, below);   // drop
    }
  }
  // route walks become slopes when smoothing (smooth.js): both ways, before it as well
  // (a jump over one cell to a floor within a level of its own is jumped back as well:
  // cubegen/climbs.js jumpMoves would find it the other way round too)
  const back = m => !ONE_WAY.has(m.kind) || (!real && m.kind === 'walk') || (m.kind === 'jump' && m.gap === 1 && Math.abs(m.to.top - m.from.top) <= 1);
  for (const m of moves) { add(m.from, m.to); if (back(m)) add(m.to, m.from); }
  return adj;
}

// ids of every node that can reach floor `goal` (null: everything counts)
// learn: world.html#inspector (see learn/README.md)
export function reachTo(ctx, goal, real) {
  if (!goal) return null;
  const adj = graph(ctx, real), rev = new Map();
  for (const [a, bs] of adj) for (const b of bs) { let s = rev.get(b.id); if (!s) rev.set(b.id, s = []); s.push(a); }
  const seen = new Set([goal.id]), stack = [goal.id];
  while (stack.length) for (const a of rev.get(stack.pop()) || []) if (!seen.has(a)) { seen.add(a); stack.push(a); }
  return seen;
}

// ids of every floor the character can get to from `starts`
export function reachFrom(ctx, starts, real) {
  const adj = graph(ctx, real), seen = new Set(starts.map(f => f.id)), stack = [...seen];
  while (stack.length) for (const b of adj.get(stack.pop()) || []) if (!seen.has(b.id)) { seen.add(b.id); stack.push(b.id); }
  return seen;
}

// ids of the water floors (they are swum in) from which no floor out of the water can be got to:
// a body of water with no bank low enough to climb out onto (cubegen/escape.js gives it a ladder)
export function stuckInWater(ctx, real) {
  const adj = graph(ctx, real), rev = new Map();
  for (const [a, bs] of adj) for (const b of bs) { let s = rev.get(b.id); if (!s) rev.set(b.id, s = []); s.push(a); }
  const out = new Set(), stack = [];
  for (const f of ctx.floors) if (!f.fluid && adj.has(f.id) || rev.has(f.id) && !f.fluid) { out.add(f.id); stack.push(f.id); }
  while (stack.length) for (const a of rev.get(stack.pop()) || []) if (!out.has(a)) { out.add(a); stack.push(a); }
  return new Set(ctx.floors.filter(f => f.fluid === WATER && !out.has(f.id)).map(f => f.id));
}
