// Angled cliffs and shores: where the ground steps round cells in a staircase, a straight line at
// an angle parts the cells it runs through instead (core/cuts.js; docs/world.md "Angled cliffs").
// The last stage of a cube: the floors, their links and every way through the room are what they
// were; the cut only moves where a cliff stands within the cells along it, and its fences with it.
//
// 1. Risers: the cell edges where the top floors of two cells meet in a step, unlinked (a cliff;
//    a bank down to a fluid), in chains from grid corner to grid corner, on through a corner where
//    the ground on each side goes on round it, broken where a third ground comes in.
// 2. Each chain is fitted with a polyline in its style: `grid` (none: the staircase stays),
//    `octo` (lines at multiples of 45°) or `sixteen` (also one across for two along: 26.6°),
//    every cell round it far enough off it on its own side.
// 3. The polyline parts each cell it crosses once along the chord from where it comes in to where
//    it goes out; the part beyond takes the ground of the cells beyond. A cell that would lose its
//    middle or a linked side's middle (or come too close to them) keeps its square.
// 4. Fences: a fenced riser's fence moves onto the line, or stays on what is left of its edge.
import { N, LH, DIRS, OPP, EDGE_CORNERS, WATER } from '../core/constants.js';
import { idx, inb, hash32, edgeKey } from '../core/util.js';
import { cornersY, floorY, partAt } from '../core/surfaces.js';
import { clipPoly, cutLine, cutPoints, sidePoint } from '../core/cuts.js';

// The directions each style's lines may take (unit [x, z]): `grid` none (the staircase stays),
// `octo` the multiples of 45°, `sixteen` those and the slopes of one cell across for two along
// (26.6°, 63.4° and round: the nearest to 22.5° a line can keep straight across a grid; at
// 22.5° itself every other cell's middle would come too close to the line to be cut)
const turn = list => list.flatMap(([x, z]) => [[x, z], [-z, x], [-x, -z], [z, -x]]).map(([x, z]) => { const l = Math.hypot(x, z); return [x / l, z / l]; });
export const CUT_STYLES = { grid: [], octo: turn([[1, 0], [1, 1]]), sixteen: turn([[1, 0], [2, 1], [1, 1], [1, 2]]) };
export const CUT_WATER = true;    // (shores too: a fluid's bank is a step down to it)
// how a room's cliffs are cut, by default: weights of the styles (a chain draws one; a room's
// spec.cuts overrides)
export const DEFAULT_CUTS = { grid: 0.2, octo: 0.35, sixteen: 0.45 };
// How far a cell's middle and its linked sides' middles stay off its cut, on its own side: from
// a wall up (its part higher: the hero's width and a little) or from a drop (its part lower:
// walked to its brink anyway). The fit keeps every cell round a chain as far off its line.
// A fenced drop keeps its cells' middles further off (the fence stands a little in from the
// line, and the hero must get round its posts to the middle).
const WALL = 0.25, DROP = 0.1, FENCED = 0.33;
const MIN_PART = 0.03;  // the least of a cell a part may be
const FENCE_DROP = 0.9; // a fence stands over a drop this deep (cubegen/fences.js)
const SNAP = 0.04;      // where a line meets a side this close to a corner, it meets the corner

const key = (X, Z) => X * 1024 + Z;

export function cutCliffs(ctx, styleOf = null) {
  const { cols, floors } = ctx;
  if (!floors?.length) return;
  const weights = ctx.spec.cuts ?? DEFAULT_CUTS;
  // a room all straight now and then: its cliffs keep their squares (the style drawn per room, so
  // whole rooms read as built or as worn)
  const roomR = hash32(ctx.seed ^ 0x6c75a) / 2 ** 32;
  const pick = (h) => {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let r = (h / 2 ** 32) * total;
    for (const [k, w] of Object.entries(weights)) { if ((r -= w) < 0) return k; }
    return 'grid';
  };
  const style = styleOf ?? ((x, z, h) => roomR < (weights.grid ?? 0) * 0.5 ? 'grid' : pick(h));

  const top = c => cols[c][cols[c].length - 1];
  const topAt = (x, z) => inb(x, z) ? top(idx(x, z)) : null;
  const water = ctx.cutWater ?? CUT_WATER;

  // what may not be cut: what the generator pinned (portals, ramps, landings, sites, spots,
  // structures' ends, ladders, a jump's or drop's ends, the ground under a stair), built floors,
  // the cube's outer ring (the faces), a crumbling crust, a fall's pool
  const pinned = new Set();
  for (const l of ctx.ladders || []) { pinned.add(l.lo.c); pinned.add(l.hi.c); }
  for (const r of ctx.runs || []) { pinned.add(r.from.c); pinned.add(r.to.c); for (const p of r.pieces) pinned.add(p.c); }
  for (const m of ctx.moves || []) if (m.kind !== 'walk') { pinned.add(m.from.c); pinned.add(m.to.c); }
  // (a fall and where it lands, and round them: their splashes and streams, render/falls.js)
  for (const fl of ctx.falls || []) for (const [ox, oz] of [[0, 0], DIRS[fl.d] || [0, 0]])
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const x = fl.c % N + ox + dx, z = ((fl.c / N) | 0) + oz + dz; if (inb(x, z)) pinned.add(idx(x, z)); }
  for (const c of ctx.noCut || []) pinned.add(c);
  const fixed = f => pinned.has(f.c) || f.prot || f.ramp || f.landing || f.site || f.siteAnchor || f.siteAccess || f.siteDressing
    || f.spot || f.hordeReserved || f.underStair || f.covered || f.crust || (f.fluid && !water) || f.surface || f.noCut || ctx.border(f)
    || ctx.pieces[f.c]?.length || ctx.noFence?.has(f.c);
  // a floor's heights along its side d (a fluid's: its surface)
  const edgeYs = (f, d) => f.fluid ? [f.surf * LH, f.surf * LH] : EDGE_CORNERS[d].map(k => f.cs[k]);

  // 2. risers: the edges where the top floors of two cells meet in a step, unlinked: { v0, v1
  // (grid corners), hi, lo (the floors), m (its middle) }. A fluid's bank is a step down to it.
  const risers = [];
  for (const f of floors) {
    if (f !== top(f.c) || (f.fluid && !water)) continue;
    for (const d of [0, 2]) {
      const g = topAt(f.x + DIRS[d][0], f.z + DIRS[d][1]);
      if (!g || f.link[d] === g || (g.fluid && !water) || (f.fluid && g.fluid)) continue;
      const ef = edgeYs(f, d), eg = edgeYs(g, OPP[d]), d0 = ef[0] - eg[0], d1 = ef[1] - eg[1];
      let hi, lo;
      if (f.fluid || g.fluid) {
        [hi, lo] = f.fluid ? [g, f] : [f, g];
        if (Math.min(...edgeYs(hi, hi === f ? d : OPP[d])) < lo.surf * LH - 0.01) continue;   // (no bank: never so)
      } else {
        if (Math.sign(d0) !== Math.sign(d1) || Math.min(Math.abs(d0), Math.abs(d1)) < 0.25) continue;
        [hi, lo] = d0 > 0 ? [f, g] : [g, f];
      }
      if (lo.top < hi.bottom) continue;   // (the lower one's solid reaches up to the higher one: no gap under a slab)
      const v0 = d === 0 ? [f.x + 1, f.z] : [f.x, f.z + 1], v1 = [f.x + 1, f.z + 1];
      const fenced = !!ctx.fences?.get(edgeKey(f.x, f.z, g.x, g.z))?.some(e => e.cliff === hi.id && e.show !== false);
      risers.push({ v0, v1, hi, lo, fenced, m: [(v0[0] + v1[0]) / 2, (v0[1] + v1[1]) / 2] });
    }
  }
  if (!risers.length) return;

  // chains from grid corner to grid corner: on through a corner with two risers, its other two
  // edges links (the same ground on each side round it); broken anywhere else
  const at = new Map(), corner = new Map();
  for (const r of risers) for (const v of [r.v0, r.v1]) { const k = key(...v); if (!at.has(k)) { at.set(k, []); corner.set(k, v); } at.get(k).push(r); }
  const linked = (a, b) => !!a && !!b && a.link.includes(b);
  const through = v => {
    const rs = at.get(key(...v));
    if (rs.length !== 2) return null;
    const [X, Z] = v, c = [[X - 1, Z - 1], [X, Z - 1], [X - 1, Z], [X, Z]].map(([x, z]) => topAt(x, z));
    // the four edges round the corner: c0|c1 (x = X, above it), c2|c3 (below), c0|c2 (z = Z, left), c1|c3 (right)
    const edges = [[0, 1, [X, Z - 1]], [2, 3, [X, Z + 1]], [0, 2, [X - 1, Z]], [1, 3, [X + 1, Z]]];
    for (const [i, j, far] of edges) {
      if (rs.some(r => key(...(key(...r.v0) === key(...v) ? r.v1 : r.v0)) === key(...far))) continue;
      if (!linked(c[i], c[j])) return null;
    }
    return rs;
  };
  const used = new Set(), chains = [];
  const walk = (start, r0) => {
    const V = [start], R = [];
    let v = start, r = r0;
    while (r && !used.has(r)) {
      used.add(r); R.push(r);
      v = key(...r.v0) === key(...v) ? r.v1 : r.v0;
      V.push(v);
      const next = through(v);
      r = next ? next.find(q => q !== r) : null;
    }
    return { V, R };
  };
  for (const [k, rs] of at) if (!through(corner.get(k))) for (const r of rs) if (!used.has(r)) chains.push(walk(corner.get(k), r));
  for (const r of risers) if (!used.has(r)) chains.push(walk(r.v0, r));   // loops

  // 3. fit each chain (split where its sides swap: it touches itself); a chain's sides: its risers'
  // higher floors and what is linked to them (+1), the lower ones' (-1)
  const polylines = [];
  for (const ch of chains) for (const part of orient(ch)) {
    const H = new Set(part.R.map(r => r.hi)), L = new Set(part.R.map(r => r.lo));
    const sideOf = g => !g ? 0 : H.has(g) ? 1 : L.has(g) ? -1 : g.link.some(h => H.has(h)) ? 1 : g.link.some(h => L.has(h)) ? -1 : 0;
    const r0 = part.R[0], st = style(r0.m[0], r0.m[1], hash32(ctx.seed ^ (key(...part.V[0]) * 7919) ^ r0.hi.id * 31 ^ r0.lo.id));
    const dirs = CUT_STYLES[st] ?? [];
    if (!dirs.length || part.R.length < 2) continue;
    const drop = part.R.some(r => r.fenced) ? FENCED : DROP, pts = fit(part, dirs, topAt, sideOf, drop);
    if (pts.length > 2 || (pts.length === 2 && notGrid(pts[0], pts[1]))) polylines.push({ pts, R: part.R, sideOf, drop });
  }

  // 4. rasterize: each cell crossed once, by one polyline
  const visits = new Map(), clash = new Set();
  for (const pl of polylines) {
    const mine = new Map();
    let last = -1;
    for (let i = 0; i + 1 < pl.pts.length; i++) for (const [c, p, q] of cellPieces(pl.pts[i], pl.pts[i + 1])) {
      if (c === last) { mine.get(c).b = q; continue; }
      if (mine.has(c) || visits.has(c)) clash.add(c);
      mine.set(c, { pl, a: p, b: q }); last = c;
    }
    for (const [c, v] of mine) visits.set(c, v);
  }
  let made = 0;
  const cutCells = [];
  for (const [c, v] of visits) {
    const f = top(c), s = f && v.pl.sideOf(f);
    if (clash.has(c) || !s || fixed(f)) continue;
    const cut = makeCut(f, v.a, v.b, g => v.pl.sideOf(g) === -s, v.pl.drop);
    if (cut) { f.cut = cut; made++; cutCells.push({ f, pl: v.pl }); }
  }
  ctx.stats.cuts = (ctx.stats.cuts || 0) + made;
  if (made) moveFences(ctx, cutCells);

  // is side d of floor f one a way crosses that its part (corners cs) would stand in the way of: a
  // link, or out of a water onto a bank up to a level over it (physics/playernav.js waterEdges),
  // where its part would rise higher than a swimmer climbs out (a part the bank's height, or one of
  // water, it crosses as well as the side)
  function crossed(f, d, cs) {
    if (f.link[d]) return true;
    const g = topAt(f.x + DIRS[d][0], f.z + DIRS[d][1]);
    return !!g && f.fluid === WATER && !g.fluid && g.top >= f.surf && g.top <= f.surf + 1 && Math.max(...cs) > (f.surf + 1) * LH + 0.01;
  }
  // the cut of floor f along A -> B (the cube's coordinates), the part beyond taking the ground of
  // the cells round it on the other side (other(g))
  function makeCut(f, A, B, other, drop) {
    const a = [A[0] - f.x, A[1] - f.z], b = [B[0] - f.x, B[1] - f.z];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.05) return null;
    let nrm = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len], c = nrm[0] * a[0] + nrm[1] * a[1];
    if (nrm[0] * 0.5 + nrm[1] * 0.5 > c) { nrm = [-nrm[0], -nrm[1]]; c = -c; }
    const side = (x, z) => nrm[0] * x + nrm[1] * z - c;   // < 0: the floor's own
    const poly = clipPoly([[0, 0], [1, 0], [1, 1], [0, 1]], nrm, c, 1);
    let area = 0;
    for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; area += p[0] * q[1] - q[0] * p[1]; }
    if (Math.abs(area) / 2 < MIN_PART) return null;
    // the ground beyond, carried on: the corners of the floors round f on the other side (a
    // fluid's: its bed), the donor the one nearest the part
    const near = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const g = (dx || dz) && topAt(f.x + dx, f.z + dz); if (g && other(g)) near.push(g); }
    if (!near.length) return null;
    const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length + f.x, cz = poly.reduce((s, p) => s + p[1], 0) / poly.length + f.z;
    const donor = near.reduce((a, g) => Math.hypot(g.x + 0.5 - cx, g.z + 0.5 - cz) < Math.hypot(a.x + 0.5 - cx, a.z + 0.5 - cz) ? g : a);
    if (!!donor.fluid !== near.every(g => g.fluid)) return null;   // (all water or all dry beyond)
    // (each corner the donor's own where it has it, else its ground's beside it: the floors linked
    // to it, else its mean)
    const mean = donor.cs.reduce((s, v) => s + v) / 4, ground = near.filter(g => g === donor || donor.link.includes(g));
    const touches = (g, X, Z) => X - g.x >= 0 && X - g.x <= 1 && Z - g.z >= 0 && Z - g.z <= 1;
    const cs = [0, 1, 2, 3].map(k => {
      const X = f.x + (k & 1), Z = f.z + (k >> 1);
      if (touches(donor, X, Z)) return donor.cs[(X - donor.x) + 2 * (Z - donor.z)];
      const hs = ground.filter(g => touches(g, X, Z)).map(g => g.cs[(X - g.x) + 2 * (Z - g.z)]);
      return hs.length ? hs.reduce((s, v) => s + v) / hs.length : mean;
    });
    // its middle and linked sides' middles off the line: further off a wall up than a drop
    const up = cs.reduce((s, v) => s + v) > (f.fluid ? 4 * f.surf * LH : f.cs.reduce((s, v) => s + v)), room = up ? WALL : drop;
    if (-side(0.5, 0.5) < room) return null;
    for (let d = 0; d < 4; d++) if (crossed(f, d, cs)) { const [x, z] = [[1, .5], [0, .5], [.5, 1], [.5, 0]][d]; if (side(x, z) > -room) return null; }
    const lowest = Math.min(...poly.map(([x, z]) => cornersY(cs, splitOf(cs), x, z)));
    if (lowest < f.bottom * LH + 0.25) return null;   // (the part's solid is the floor's, from its bottom up)
    if (up && donor.bottom * LH > Math.min(...f.cs) + 0.01) return null;   // (a raised part: the donor's solid reaches down to us)
    const part = { id: donor.id, c: f.c, x: f.x, z: f.z, cs, split: splitOf(cs), top: donor.top, bottom: f.bottom, layer: f.layer,
      merged: f.merged, fluid: donor.fluid || 0, surf: donor.surf || 0, link: [null, null, null, null], part: true, cutOf: f, donor,
      ...(donor.look !== undefined && { look: donor.look }), ...(donor.soft && { soft: true }), ...(donor.ice && { ice: true }) };
    const cut = { n: nrm, c, a, b, part };
    // a real step along it, or no cut
    if (Math.max(...cutLine({ ...f, cut }).flatMap(s => [Math.abs(s.own[0] - s.part[0]), Math.abs(s.own[1] - s.part[1])])) < 0.15) return null;
    return cut;
  }
}
const splitOf = cs => Math.abs(cs[0] - cs[3]) <= Math.abs(cs[1] - cs[2]) ? 0 : 1;
const notGrid = (p, q) => Math.abs(p[0] - q[0]) > 1e-9 && Math.abs(p[1] - q[1]) > 1e-9;

// a chain's pieces with its higher side on one side all along, and no floor on both of its
// sides (a ramp between the two grounds): { V, R, sigma }
function orient({ V, R }) {
  const out = [];
  let cur = null, H, L;
  for (let i = 0; i < R.length; i++) {
    const r = R[i], p = V[i], q = V[i + 1];
    const ca = [r.hi.x + 0.5, r.hi.z + 0.5];
    const s = Math.sign((q[0] - p[0]) * (ca[1] - p[1]) - (q[1] - p[1]) * (ca[0] - p[0]));
    const on = (set, f) => set.has(f) || f.link.some(g => set.has(g));
    if (!cur || cur.sigma !== s || on(L, r.hi) || on(H, r.lo)) { cur = { V: [p], R: [], sigma: s }; out.push(cur); H = new Set(); L = new Set(); }
    cur.R.push(r); cur.V.push(q); H.add(r.hi); L.add(r.lo);
  }
  return out;
}

// The polyline for a chain: from its first corner to its last, each piece in one of `dirs`, as
// long as it goes with every cell round the corners it passes on its own side (the higher
// ground's `drop` off it, the lower one's WALL); where nothing fits, along the risers round the
// corner. It starts from the middle of the first riser, or a little to either side of it,
// whichever takes the fewest pieces.
function fit({ V, R, sigma }, dirs, topAt, sideOf, drop) {
  const n = R.length;
  // the cells round each corner of the chain: [x, z, side (+1: the higher one's), margin]
  const cellsAt = V.map(([X, Z]) => {
    const out = [];
    for (const [x, z] of [[X - 1, Z - 1], [X, Z - 1], [X - 1, Z], [X, Z]]) {
      const s = sideOf(topAt(x, z));
      if (s) out.push([x + 0.5, z + 0.5, s * sigma, s > 0 ? drop : WALL]);
    }
    return out;
  });
  // the cells round the corners passed (from riser i's start to riser j's), and riser j's own two
  const ok = (S, u, i, j) => {
    const side = ([x, z, sg, m]) => sg * (u[0] * (z - S[1]) - u[1] * (x - S[0])) >= m;
    for (let k = i; k <= j; k++) if (!cellsAt[k].every(side)) return false;
    const r = R[j];
    return side([r.hi.x + 0.5, r.hi.z + 0.5, sigma, drop]) && side([r.lo.x + 0.5, r.lo.z + 0.5, -sigma, WALL]);
  };
  // the directions nearest the one from S to T
  const candidates = (S, T) => {
    const dx = T[0] - S[0], dz = T[1] - S[1], l = Math.hypot(dx, dz) || 1;
    return dirs.map(u => [u, (u[0] * dx + u[1] * dz) / l]).filter(([, c]) => c > 0.5).sort((p, q) => q[1] - p[1]).slice(0, 3).map(([u]) => u);
  };
  const run = S0 => {
    const pts = [V[0], S0];
    let S = S0, i = 1, cost = 0;
    while (i < n) {
      let got = null;
      for (let j = n - 1; j >= i && !got; j--) {
        const T = R[j].m;
        for (const u of candidates(S, T)) {
          if (!ok(S, u, i, j)) continue;
          const E = meet(S, u, R[j]);
          if (!E || (E[0] - S[0]) * u[0] + (E[1] - S[1]) * u[1] <= 1e-6) continue;
          got = { j, E }; break;
        }
      }
      cost++;
      if (got) { pts.push(got.E); S = got.E; i = got.j + 1; continue; }
      // (nothing fits: round the corner along the risers)
      pts.push(V[i], R[i].m); S = R[i].m; i++; cost += 2;
    }
    pts.push(V[n]);
    return { pts: dedupe(pts), cost };
  };
  const r0 = R[0], w = r0.v0[0] === r0.v1[0] ? [1, 0] : [0, 1];
  let best = null;
  for (const s of [0, 0.05, -0.05, 0.1, -0.1, 0.15, -0.15, 0.2, -0.2, 0.25, -0.25, 0.3, -0.3, 0.35, -0.35, 0.4, -0.4]) {
    const got = run([r0.m[0] + w[0] * s, r0.m[1] + w[1] * s]);
    if (!best || got.cost < best.cost) best = got;
  }
  return best.pts;
}
const dedupe = pts => pts.filter((p, i) => !i || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-9);
const clean = v => Math.abs(v) < 1e-12 ? 0 : Math.abs(Math.abs(v) - 1) < 1e-12 ? Math.sign(v) : v;
// where the line from S along u crosses riser r's line between its two cells' middles
function meet(S, u, r) {
  const w = r.v0[0] === r.v1[0] ? [1, 0] : [0, 1], M = r.m;
  const det = u[0] * -w[1] - u[1] * -w[0];
  if (Math.abs(det) < 1e-9) return null;
  const dx = M[0] - S[0], dz = M[1] - S[1];
  const t = (dx * -w[1] - dz * -w[0]) / det, s = (u[0] * dz - u[1] * dx) / det;
  if (Math.abs(s) > 0.5) return null;   // (between the middles)
  return [S[0] + u[0] * t, S[1] + u[1] * t];
}
// the pieces of the segment p -> q in each cell it crosses: [[c, from, to], ...] (a piece lying on
// a grid line, or in no cell of the cube, is in none)
function cellPieces(p, q) {
  const ts = [0, 1], dx = q[0] - p[0], dz = q[1] - p[1];
  for (const [o, d] of [[p[0], dx], [p[1], dz]]) if (Math.abs(d) > 1e-12) {
    const lo = Math.min(o, o + d), hi = Math.max(o, o + d);
    for (let k = Math.ceil(lo); k <= Math.floor(hi); k++) { const t = (k - o) / d; if (t > 0 && t < 1) ts.push(t); }
  }
  ts.sort((a, b) => a - b);
  const at = t => snap([p[0] + dx * t, p[1] + dz * t]), out = [];
  for (let i = 0; i + 1 < ts.length; i++) {
    const a = at(ts[i]), b = at(ts[i + 1]);
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6) continue;
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    if (Math.abs(mx - Math.round(mx)) < 1e-9 || Math.abs(mz - Math.round(mz)) < 1e-9) continue;
    const x = Math.floor(mx), z = Math.floor(mz);
    if (inb(x, z)) out.push([idx(x, z), a, b]);
  }
  return out;
}
// a point on a grid line this close to a corner is the corner
function snap([x, z]) {
  const rx = Math.round(x), rz = Math.round(z);
  if (Math.abs(x - rx) < 1e-9 && Math.abs(z - rz) < SNAP) return [rx, rz];
  if (Math.abs(z - rz) < 1e-9 && Math.abs(x - rx) < SNAP) return [rx, rz];
  return [Math.abs(x - rx) < 1e-9 ? rx : x, Math.abs(z - rz) < 1e-9 ? rz : z];
}

// 5. The fences: a fenced riser's fence comes off its edge. What is left of the cliff along the
// edge (the higher floor's own side still over a drop) keeps it; a cut cell's line takes one where
// the risers near it were fenced. Each stands on the higher side, a little in from its edge, and
// holds along its line (map.lineFences, physics/canmove.js); for the jumps and the water's ways the
// edge keeps its old fence, `navOnly` (physics/leaps.js, physics/playernav.js).
function moveFences(ctx, cutCells) {
  const { fences } = ctx;
  const cutAt = new Set(cutCells.map(({ f }) => f.c));
  const fenced = new Map();   // riser -> its fence (a cliff fence on its edge)
  for (const r of new Set(cutCells.flatMap(({ pl }) => pl.R))) {
    if (!cutAt.has(r.hi.c) && !cutAt.has(r.lo.c)) continue;
    const k = edgeKey(r.hi.x, r.hi.z, r.lo.x, r.lo.z), list = fences.get(k);
    const e = list?.find(e => e.cliff === r.hi.id && !e.line);
    if (!e) continue;
    fenced.set(r, e);
    list.splice(list.indexOf(e), 1, { ...e, navOnly: true, pts: null });
    ctx.fenceList.splice(ctx.fenceList.indexOf(e), 1);
  }
  const lines = ctx.lineFences ??= new Map();
  const add = (fence, cells) => {
    ctx.fenceList.push(fence);
    for (const c of new Set(cells)) { if (!lines.has(c)) lines.set(c, []); lines.get(c).push(fence); }
  };
  // a fence along p -> q (the cube's coordinates), set in by `inset` (a vector), on the ground of h
  const fenceAlong = (p, q, inset, h, layer, cliff, cells) => {
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (len < 0.12) return;
    const e = Math.min(0.07 / len, 0.25), k = Math.max(2, Math.round(len / 0.43) + 1);
    const A = [p[0] + inset[0], p[1] + inset[1]], B = [q[0] + inset[0], q[1] + inset[1]];
    const pts = Array.from({ length: k }, (_, i) => {
      const t = e + (1 - 2 * e) * i / (k - 1), x = A[0] + (B[0] - A[0]) * t, z = A[1] + (B[1] - A[1]) * t;
      return [x, h(x, z), z];
    });
    const ys = pts.map(p => p[1]);
    add({ pts, ymin: Math.min(...ys), ymax: Math.max(...ys), layer, show: true, cliff,
      line: [[pts[0][0], pts[0][2]], [pts[k - 1][0], pts[k - 1][2]]] }, cells);
  };
  const ground = (x, z) => {
    const cx = Math.min(N - 1, Math.max(0, Math.floor(x))), cz = Math.min(N - 1, Math.max(0, Math.floor(z)));
    const col = ctx.cols[idx(cx, cz)], f = col[col.length - 1];
    return floorY(f, Math.min(1, Math.max(0, x - cx)), Math.min(1, Math.max(0, z - cz)));
  };
  // what is left of each fenced riser's edge
  for (const [r, e] of fenced) {
    const { hi, lo } = r;
    const d = DIRS.findIndex(([dx, dz]) => dx === lo.x - hi.x && dz === lo.z - hi.z);
    const ts = [0, 1, ...cutPoints(hi, d), ...cutPoints(lo, OPP[d])].sort((a, b) => a - b);
    for (let i = 0; i + 1 < ts.length; i++) {
      const t0 = ts[i], t1 = ts[i + 1];
      if (t1 - t0 < 1e-6) continue;
      const m = sidePoint(d, (t0 + t1) / 2), mo = sidePoint(OPP[d], (t0 + t1) / 2);
      const own = partAt(hi, ...m), there = partAt(lo, ...mo);
      if (own !== hi) continue;
      const y0 = cornersY(own.cs, own.split, ...sidePoint(d, t0)), y1 = cornersY(own.cs, own.split, ...sidePoint(d, t1));
      const z0 = cornersY(there.cs, there.split, ...sidePoint(OPP[d], t0)), z1 = cornersY(there.cs, there.split, ...sidePoint(OPP[d], t1));
      if (Math.min(y0 - z0, y1 - z1) < FENCE_DROP) continue;
      const p = sidePoint(d, t0), q = sidePoint(d, t1), [dx, dz] = DIRS[d];
      fenceAlong([hi.x + p[0], hi.z + p[1]], [hi.x + q[0], hi.z + q[1]], [-dx * 0.07, -dz * 0.07], ground, hi.layer, hi.id, [hi.c, lo.c]);
    }
  }
  // the cut cells' lines, where the risers near them were fenced
  for (const { f, pl } of cutCells) {
    const near = pl.R.filter(r => Math.hypot(r.m[0] - f.x - 0.5, r.m[1] - f.z - 0.5) < 1.2);
    const on = near.filter(r => fenced.has(r)).length;
    if (!on || on * 2 < near.length) continue;
    for (const s of cutLine(f)) {
      const hiOwn = s.own[0] + s.own[1] > s.part[0] + s.part[1];
      if (Math.min(Math.abs(s.own[0] - s.part[0]), Math.abs(s.own[1] - s.part[1])) < FENCE_DROP) continue;
      const k = hiOwn ? -1 : 1, inset = [f.cut.n[0] * 0.07 * k, f.cut.n[1] * 0.07 * k];
      fenceAlong([f.x + s.p[0], f.z + s.p[1]], [f.x + s.q[0], f.z + s.q[1]], inset, ground, f.layer, f.id, [f.c]);
    }
  }
}
