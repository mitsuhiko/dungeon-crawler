// The cubes of the big height pieces (world/heights.js):
//   ascent    you come in at the foot of an escarpment; a shelf runs along its top to the
//             plateau, with a terrace halfway up along part of the cliff
//   plateau   high ground all round (its faces are all up there)
//   descent   down from the plateau's edge: a plunge (a soft landing right under the cliff, so
//             you can leap), a climb down past a terrace, or a great shaft (a ramp winding down
//             round a hole that opens into the depth below, the rest a rim up high)
//   pinnacle  a needle of rock with a ramp winding up round it; a reward site waits on top
//   under a shaft: a flat basin where the shaft above comes down
// The route search finds the way up and down (stairs, ladders, the ramps, the plunge's drop).
// Cells these shapes depend on are kept (ctx.keep): no slabs, sites or hordes on them.
import { N, MAX_L, DIRS, at16 } from '../core/constants.js';
import { idx, clamp } from '../core/util.js';
import { edgeCell } from './portals.js';

// cell (x, z) along a travel direction: u from the face it is entered by, w across
const along = (dir, x, z) => [[x, z], [N - 1 - x, z], [z, x], [N - 1 - z, x]][dir];
const inner = fn => { for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) fn(x, z, idx(x, z)); };
const TAU = Math.PI * 2;
const wrap = a => ((a % TAU) + TAU) % TAU;

// a terrace halfway up a cliff that stands at u = cu (between cu - 1 and cu, or cu + 1 for a
// shelf that is low beyond): part of its width
function terrace(ctx, h, from, to, level) {
  const len = ctx.ri(Math.round(at16(5)), Math.round(at16(8))), w0 = ctx.ri(2, N - 2 - len);
  inner((x, z, i) => {
    const [u, w] = along(h.dir, x, z);
    if (u >= from && u <= to && w >= w0 && w < w0 + len) ctx.lvl0[i] = level;
  });
}

// the low ground's level near a cliff: what the blend made of it, at most `cap`
function lowLevel(ctx, h, cells, cap) {
  let s = 0, n = 0;
  for (const i of cells) { s += Math.min(ctx.lvl0[i], cap); n++; }
  return clamp(Math.round(n ? s / n : 4), 3, cap);
}

// where the route comes in at the side (the ascent) or leaves at the side (the descent), a cove
// at the foot of the cliff round its pad, so it never opens into the shelf
function cove(ctx, h, cap) {
  const p = ctx.spec.portals.find(q => q.dir === h.way);
  if (!p || p.dir >= 4 || (p.dir >> 1) === (h.dir >> 1)) return;
  const pads = [];
  for (let t = p.pos - 1; t <= p.pos + 1; t++) for (let j = 0; j < 2; j++) pads.push(edgeCell(p.dir, t, j));
  // (where the pad is up on the shelf's side of the cliff, the cove runs on along the face to the
  // cliff's foot, so the way out is down there: in a big cube the pad may stand well in from it)
  const uw = pads.map(c => along(h.dir, c % N, c / N | 0)), us = uw.map(p => p[0]), ws = uw.map(p => p[1]);
  const shelf = h.role === 'descent' ? Math.max(...us) < h.cu : Math.min(...us) > h.cu;
  const [u0, u1] = [Math.min(...us, h.cu), Math.max(...us, h.cu)], [w0, w1] = [Math.min(...ws) - 2, Math.max(...ws) + 2];
  inner((x, z, i) => {
    const [u, w] = along(h.dir, x, z);
    if (pads.some(c => Math.max(Math.abs(c % N - x), Math.abs((c / N | 0) - z)) <= 2) || (shelf && u >= u0 - 2 && u <= u1 + 2 && w >= w0 && w <= w1))
      ctx.lvl0[i] = Math.min(ctx.lvl0[i], cap);
  });
}

export function shapeAscent(ctx) {
  const { spec, lvl0, void0 } = ctx, h = spec.height, cap = h.hi - 9, low = [];
  inner((x, z, i) => {
    const [u] = along(h.dir, x, z);
    void0[i] = 0;
    if (u > h.cu) lvl0[i] = h.hi;
    else { lvl0[i] = Math.min(lvl0[i], cap); if (u >= h.cu - 3) low.push(i); }
  });
  const base = lowLevel(ctx, h, low, cap);
  if (ctx.R() < 0.75) terrace(ctx, h, h.cu - 1, h.cu, Math.round((base + h.hi) / 2));
  cove(ctx, h, cap);
  ctx.stats.mode = spec.kind + ' / ascent';
}

export function shapePlateau(ctx) {
  const { spec, lvl0, void0, noise } = ctx, h = spec.height;
  // high ground with a few knolls on it
  inner((x, z, i) => {
    void0[i] = 0;
    lvl0[i] = h.hi + (noise(x * 0.35 + 30, z * 0.35 + 30) > 0.68 ? 1 : 0) + (noise(x * 0.2 + 70, z * 0.2) > 0.75 ? 1 : 0);
  });
  ctx.stats.mode = spec.kind + ' / plateau';
}

export function shapeDescent(ctx) {
  const { spec } = ctx, h = spec.height;
  if (h.hole) return shapeShaft(ctx);
  const { lvl0, void0, ri } = ctx, cap = h.hi - 9, low = [];
  inner((x, z, i) => {
    const [u] = along(h.dir, x, z);
    void0[i] = 0;
    if (u < h.cu) lvl0[i] = h.hi;
    else { lvl0[i] = Math.min(lvl0[i], cap); if (u <= h.cu + 3) low.push(i); }
  });
  const base = lowLevel(ctx, h, low, cap);
  cove(ctx, h, cap);
  if (h.descent === 'plunge') {
    // the landing: three cells wide, two deep, right under the edge, on the way to the exit;
    // flat, soft and kept
    const exit = ctx.spec.portals.find(q => q.dir === h.way), wx = exit && exit.dir < 4 ? along(h.dir, ...cellXZ(edgeCell(exit.dir, exit.pos, 1)))[1] : null;
    // (and never where the cove round a way out lowered the edge it is leapt from: a little further
    // along it)
    const first = wx === null ? ri(4, N - 5) : clamp(wx + ri(-2, 2), 3, N - 4), soft = ctx.soft;
    const atUW = (u, w) => [[u, w], [N - 1 - u, w], [w, u], [w, N - 1 - u]][h.dir];
    const edgeUp = w => [-1, 0, 1].every(o => ctx.lvl0[idx(...atUW(h.cu - 1, w + o))] >= h.hi);
    const wp = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6].map(o => first + o).find(w => w >= 3 && w <= N - 4 && edgeUp(w)) ?? first;
    const landing = clamp(Math.min(base, h.hi - 11), 3, base);   // a long way down
    inner((x, z, i) => {
      const [u, w] = along(h.dir, x, z);
      if (Math.abs(w - wp) > 1) return;
      if (u >= h.cu && u <= h.cu + 1) { lvl0[i] = landing; soft.add(i); ctx.keep.add(i); }
      else if (u >= h.cu - 2 && u < h.cu) ctx.keep.add(i);   // the edge you leap from
      else if (u === h.cu + 2) lvl0[i] = Math.min(lvl0[i], landing + 1);   // and the way on from the landing
    });
  } else if (ctx.R() < 0.75) terrace(ctx, h, h.cu, h.cu + 1, Math.round((base + h.hi) / 2));
  ctx.stats.mode = spec.kind + ' / descent (' + h.descent + ')';
}

const cellXZ = c => [c % N, c / N | 0];

// a plunge's or a shaft's descent: every other way down off the shelf (or the rim) costs more,
// so the route leaps, or winds down the ramp (the ways back up stay as they are)
export function descentRoute(ctx) {
  const h = ctx.spec.height;
  if (h?.role !== 'descent' || h.descent === 'stairs') return;
  const movesFrom = ctx.movesFrom;
  ctx.movesFrom = (f, ...rest) => movesFrom(f, ...rest).map(m => m.to.soft || f.top < h.hi - 1 || m.to.top > f.top - 3 ? m : { ...m, cost: m.cost + 40 });
}

// where a ground portal's pad is: its cell one step in from its face (side portals)
function padCell(spec, dir) {
  const p = spec.portals.find(q => q.dir === dir);
  return p && dir < 4 ? edgeCell(dir, p.pos, 1) : null;
}

// a great shaft: a hole into the depth below, a ramp winding down round it from the entry
// (on the plateau's side) to a cut leading out to the exit, the rest a rim up high
// learn: world.html#heights (see learn/README.md)
function shapeShaft(ctx) {
  const { spec, lvl0, void0 } = ctx, h = spec.height, { cx, cz, r } = h.hole;
  const exit = padCell(spec, spec.exit), lo = spec.portals.find(q => q.dir === spec.exit)?.level ?? 4;
  const [dx, dz] = DIRS[h.dir], tin = Math.atan2(-dz, -dx);
  const tout = exit === null ? tin + Math.PI : Math.atan2((exit / N | 0) + 0.5 - cz, exit % N + 0.5 - cx);
  // down the longer way round, but never all the way
  const short = wrap(tout - tin), sense = short > Math.PI ? 1 : -1, arc = Math.min(1.7 * Math.PI, sense > 0 ? short : TAU - short);
  const ramp = r + 1.8;
  inner((x, z, i) => {
    const [u] = along(h.dir, x, z), d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
    if (d < r) { void0[i] = 1; lvl0[i] = 2; ctx.noCross.add(i); return; }
    void0[i] = 0;
    if (d < ramp) {
      const a = wrap(sense * (Math.atan2(z + 0.5 - cz, x + 0.5 - cx) - tin));
      lvl0[i] = a <= arc ? Math.round(h.hi - 1 - (h.hi - 1 - lo) * a / arc) : h.hi;
      ctx.keep.add(i); ctx.rails.add(i);
      return;
    }
    lvl0[i] = u <= N - 5 ? h.hi : Math.min(lvl0[i], lo + 1);
  });
  // the cut from the ramp's foot out to the exit
  if (exit !== null) {
    const tend = tin + sense * arc, fx = cx + Math.cos(tend) * (r + 0.9), fz = cz + Math.sin(tend) * (r + 0.9);
    const tx = exit % N + 0.5, tz = (exit / N | 0) + 0.5, steps = Math.ceil(Math.hypot(tx - fx, tz - fz) * 2);
    for (let s = 0; s <= steps; s++) {
      const px = fx + (tx - fx) * s / steps, pz = fz + (tz - fz) * s / steps;
      for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) {
        const x = Math.floor(px) + ox, z = Math.floor(pz) + oz;
        if (x < 1 || z < 1 || x > N - 2 || z > N - 2) continue;
        const i = idx(x, z);
        if (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) < r + 0.95) continue;
        lvl0[i] = lo; void0[i] = 0; ctx.keep.add(i);
      }
    }
  }
  ctx.stats.mode = spec.kind + ' / great shaft';
}

// the needle: its top (a disc), a ramp once round it, a flat ring at its foot; a reward site
// is reserved on its top (cubegen/sites.js)
export const PINNACLE_TOP = 2.3;
// learn: world.html#heights (see learn/README.md)
export function shapePinnacle(ctx) {
  const { spec, lvl0, void0, R } = ctx, p = spec.pinnacle, rt = PINNACLE_TOP, ramp = rt + 1.7, foot = ramp + 1.2;
  const cx = p.x + 0.5, cz = p.z + 0.5, t0 = R() * TAU, arc = TAU * 0.9, sense = R() < 0.5 ? 1 : -1;
  const ring = [];
  inner((x, z, i) => { const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz); if (d >= ramp && d < foot + 1) ring.push(i); });
  const lo = clamp(Math.round(ring.reduce((s, i) => s + lvl0[i], 0) / Math.max(1, ring.length)), 3, 13);
  // at least ten levels over its foot, however high the ground around it
  const top = ctx.pinnacleTop = clamp(Math.max(p.top, lo + 10), p.top, MAX_L - 1);
  inner((x, z, i) => {
    const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
    if (d >= foot + 1) return;
    void0[i] = 0; ctx.keep.add(i);
    if (d < rt) lvl0[i] = top;
    else if (d < ramp) {
      const a = wrap(sense * (Math.atan2(z + 0.5 - cz, x + 0.5 - cx) - t0));
      lvl0[i] = a <= arc ? Math.round(lo + (top - 1 - lo) * a / arc) : lo;
      if (a <= arc) { ctx.pinnacle.add(i); ctx.rails.add(i); }
    } else if (d < foot) lvl0[i] = lo;
    else lvl0[i] = Math.min(lvl0[i], lo + 2);
    if (d < rt) { ctx.pinnacle.add(i); ctx.rails.add(i); }
  });
  ctx.stats.mode = spec.kind + ' / pinnacle';
}

// the way up a pinnacle winds round it: stairs, ladders, bridges and jumps onto the needle cost a lot
// more (more than walking down off high ground beside it and round the ramp)
export function pinnacleRoute(ctx) {
  if (!ctx.pinnacle?.size) return;
  const movesFrom = ctx.movesFrom, on = f => ctx.pinnacle.has(f.c);
  ctx.movesFrom = (f, ...rest) => movesFrom(f, ...rest).map(m => m.kind === 'walk' || m.kind === 'drop' || !on(m.to) || (on(f) && !f.landing && m.to.top < f.top) ? m : { ...m, cost: m.cost + 200 });
}

// under a great shaft (in the depth below): a flat, dry basin where it comes down
export function shapeShaftBottom(ctx) {
  const { lvl0, void0, spec } = ctx, { cx, cz, r } = spec.shaftBottom, cells = [];
  inner((x, z, i) => { if (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) < r + 1.5) cells.push(i); });
  const level = clamp(Math.round(cells.reduce((s, i) => s + lvl0[i], 0) / Math.max(1, cells.length)), 3, 8);
  for (const i of cells) { lvl0[i] = level; void0[i] = 0; ctx.keep.add(i); }   // (no pools, no slabs over it)
  ctx.seaCells = ctx.seaCells.filter(i => !cells.includes(i));
}

