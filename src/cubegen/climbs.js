// Route moves that need no stairs or bridges: ladders up (or down) a cliff face, and jumps over
// a gap of one or two cells. Ladders are kept in their own list (not structure pieces): the
// lower floor's cell holds the ladder against the wall of the higher column.
import { LH, DIRS, OPP, WATER } from '../core/constants.js';
import { idx, inb, hash32 } from '../core/util.js';
import { laddersOf, pickLadder } from '../themes/builds.js';
import { themeOf } from '../themes/depth.js';

// ladder from f to the floor g in the neighbouring column n (3-14 levels apart, either way).
// With ctx.bigLadders (ways onto cut-off platforms and out of pits) also long ones up to 24
// levels, and ones hanging from the edge of a floating platform down to the ground.
const MAX_RISE = 14, BIG_RISE = 24;
export function ladderMoves(ctx, f, d, n, out) {
  if (f.landing || f.fluid) return;
  const big = ctx.bigLadders;
  for (const g of ctx.cols[n]) {
    if (g.fluid || g.siteBlocked) continue;
    const lo = g.top > f.top ? f : g, hi = lo === f ? g : f, rise = hi.top - lo.top;
    if (rise < 3 || rise > (big ? BIG_RISE : MAX_RISE)) continue;
    const hang = hi.bottom > lo.top + 1;   // no wall behind the ladder's lower part
    // a hanging ladder: nothing else in the high column alongside it
    if (hang && (!big || ctx.cols[hi.c].some(h => h !== hi && h.top > lo.top - 1 && h.bottom < hi.top))) continue;
    const above = ctx.nextAbove(lo);
    if (above && above.bottom < hi.top + 3) continue;   // room to climb all the way up
    if (!ctx.headOK(hi, hi.top)) continue;
    out.push({ kind: 'ladder', from: f, to: g, d, cells: [], lo, hi, hang, cost: 1.6 + 0.2 * rise + (rise > MAX_RISE ? 3 : 0) + (hang ? 3 : 0) });
  }
}

// jump from f over 1-2 cells of open drop (or void) to a floor at most 1 level higher and at most
// 2 lower (a soft landing, so jumps can follow each other; over two cells exactly 2 lower, for the
// time to get across), with room overhead for the arc
export function jumpMoves(ctx, f, d, out) {
  if (f.landing || f.fluid || !ctx.headOK(f, f.top + 2)) return;
  const [dx, dz] = DIRS[d], bx = f.x - dx, bz = f.z - dz;
  // a run-up: level ground right behind the take-off (not a ledge you only drop onto)
  if (!inb(bx, bz) || !ctx.cols[idx(bx, bz)].some(b => !b.fluid && !b.siteBlocked && Math.abs(b.top - f.top) <= 1)) return;
  for (let gap = 1; gap <= 2; gap++) {
    const gx = f.x + dx * gap, gz = f.z + dz * gap, ex = gx + dx, ez = gz + dz;
    if (!inb(ex, ez)) return;
    // the gap cell has to be clearly lower, with nothing to bump into overhead (and never a great
    // shaft's hole: you wind down round it)
    if (ctx.noCross?.has(idx(gx, gz)) || ctx.cols[idx(gx, gz)].some(h => h.top > f.top - 4 && h.bottom < f.top + 6)) return;
    for (const g of ctx.cols[idx(ex, ez)]) {
      const dh = g.top - f.top;
      if (g.fluid || g.siteBlocked || dh > (gap === 1 ? 1 : -2) || dh < -2 || !ctx.headOK(g, f.top + 2)) continue;   // soft landings only
      out.push({ kind: 'jump', from: f, to: g, d, gap, cells: [], cost: 1.6 + 0.6 * gap });
    }
  }
}

// placement: a ladder claims the space in front of its wall, a jump the air over its gap
// (nothing else may cross there), and the edges they use never get fences. A hanging ladder has
// no wall behind its lower part, only the air under the platform: it claims that too, or a bridge
// or stair under the platform would run through the ladder (or right behind it)
const overlaps = (list, cl) => list.some(o => !(o.hi + 2 <= cl.lo || cl.hi + 2 <= o.lo));
export function placeClimb(m, claims, pathEdges, ladders) {
  if (m.kind === 'jump') {
    const air = [];
    for (let j = 1; j <= m.gap; j++) air.push({ c: idx(m.from.x + DIRS[m.d][0] * j, m.from.z + DIRS[m.d][1] * j), lo: m.from.top - 4, hi: m.from.top + 4 });
    if (air.some(cl => overlaps(claims[cl.c], cl))) return false;
    for (const cl of air) claims[cl.c].push(cl);
    pathEdges.add(m.from.id + ':' + m.d); pathEdges.add(m.to.id + ':' + OPP[m.d]);
    return true;
  }
  const { lo, hi } = m, wall = lo === m.from ? m.d : OPP[m.d];
  const cls = [{ c: lo.c, lo: lo.top, hi: hi.top + 1 }];
  if (m.hang) cls.push({ c: hi.c, lo: lo.top, hi: hi.bottom });
  if (cls.some(cl => overlaps(claims[cl.c], cl))) return false;
  for (const cl of cls) claims[cl.c].push(cl);
  pathEdges.add(lo.id + ':' + wall); pathEdges.add(hi.id + ':' + OPP[wall]);
  if (!ladders.some(l => l.lo === lo && l.hi === hi)) ladders.push({ lo, hi, d: wall, hang: !!m.hang });   // (lo in water: out of it, cubegen/escape.js)
  return true;
}

// how a ladder is built: one of the theme's ladder styles that fits (themes/builds.js), from a
// hash of the cube and the floors it joins (not the generator's random stream, which would
// change everything after it)
export function ladderStyle(spec, l) {
  const h = hash32(spec.seed ^ Math.imul(l.lo.id + 1, 0x9e3779b1) ^ Math.imul(l.hi.id + 1, 0x85ebca6b));
  return pickLadder(laddersOf(themeOf(spec), spec.forceLadder), l.hang, h / 2 ** 32);
}

// what the game needs to know about a ladder (plain data); one standing in the water (out of it:
// cubegen/escape.js addWaterEscapes) has its surface, `wet` (physics/climb.js)
export const ladderInfo = (l, style) => ({
  c: l.lo.c, x: l.lo.x, z: l.lo.z, d: l.d, y0: l.lo.top * LH, y1: l.hi.top * LH, layer: l.lo.layer, lo: l.lo.id, hi: l.hi.id, hang: l.hang, style,
  ...l.lo.fluid === WATER && { wet: l.lo.surf * LH },
});
