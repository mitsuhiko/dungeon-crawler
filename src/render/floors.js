// Terrain geometry for every floor: smooth top, cliff walls, slab underside, fluid volume.
import { N, LH, DIRS, OPP, DIRV, EDGE_CORNERS, edgePts, drawnFluid } from '../core/constants.js';
import { idx, inb, hash32 } from '../core/util.js';
import { C, gradient, TOP_STOPS, UNDERSIDE, SOFT, SURFACE, fluidBed, fluidBank } from './palette.js';
import { cliffWall, wallRegion } from './walls.js';
import { palRow } from '../themes/fluids.js';
import { buildInteriorFloors } from './interior.js';
import { restY } from './surface.js';
import { floorY, partAt, cornersY } from '../core/surfaces.js';
import { cutPoints, sidePoint, sideT, onSide, topTriangles, cutLine, clipPoly } from '../core/cuts.js';
import { townShade } from '../core/footing.js';
import { groundAt, slopeAt, triangleSlope, waterSolids, WET_LIFT } from './shore.js';

const ICE_TOP = C('#cfe8f4');
const shade = (x, z) => ((x + z) & 1 ? 1.0 : 0.95) * (0.97 + (hash32(x * 31 + z * 977) % 100) / 1600);

// how high ground of `level` looks: by its height, but the town's (docs/town.md: its upper town half
// a cube up, its hill) a meadow all over, lighter the higher (core/footing.js TOWN_SHADE)
const groundShade = (m, level) => m.town ? townShade(level) : level;

// A built floor (its `surface`: a role, themes/surfaces.js; Foggery's tower and the floor of his
// caldera, cubegen/towerarena.js; Mansk's museum, cubegen/arenashapes.js `stage`) is the theme's
// colour for that role, not the terrain's by height; paving in a checker of its two tiles
function topColor(m, f) {
  const cs = f.cs;
  if (f.surface) return SURFACE[f.surface][f.surface === 'paving' && (f.x + f.z) & 1 ? 'alt' : 'top'].clone().multiplyScalar(shade(f.x, f.z) * (0.92 + (hash32(f.c * 7 + Math.round(cs[0] * 4)) % 100) / 600));
  if (f.fluid) return fluidBed(drawnFluid(f));
  if (f.soft) return SOFT.clone().multiplyScalar(shade(f.x, f.z));   // a plunge's landing
  if (f.ice) return ICE_TOP.clone().multiplyScalar(shade(f.x, f.z));   // a slide puzzle's ice (cubegen/trials/slide.js)
  const top = gradient(TOP_STOPS, groundShade(m, (cs[0] + cs[1] + cs[2] + cs[3]) / 4 / LH)).multiplyScalar(shade(f.x, f.z));
  // sandy / scorched banks next to fluids
  for (const g of f.link) if (g && g.fluid) top.lerp(fluidBank(drawnFluid(g)), 0.4);
  for (let d = 0; d < 4; d++) {
    const nx = f.x + DIRS[d][0], nz = f.z + DIRS[d][1];
    if (!inb(nx, nz)) continue;
    const wf = m.cols[idx(nx, nz)].find(g => g.fluid && Math.abs(g.surf - f.top) <= 2);
    if (wf) top.lerp(fluidBank(drawnFluid(wf)), 0.35);
  }
  return top;
}

// The uncovered pieces of floor f's side face towards d: from its bottom up to its top line, less
// what the floors of the neighbouring column cover (a crumbling crust's floors, render/trials.js,
// may be gone: walls behind them are drawn). Along the edge P0 -> P1, each piece over its `lows`
// and under its `ups` (lines: [y at P0, y at P1]). Its cliff wall (walls) and the wet bands on it
// (wetWall: a cube's own fluid's banks, a standing fluid's walls, render/trials.js) alike.
export function wallPieces(m, f, d) {
  const fb = f.bottom * LH;
  const nx = f.x + DIRS[d][0], nz = f.z + DIRS[d][1];
  const nbs = inb(nx, nz) ? m.cols[idx(nx, nz)].filter(g => !g.crust).sort((a, b) => a.bottom - b.bottom) : [];
  // (in pieces where a cut, ours or the neighbour's, meets the side: core/cuts.js)
  const ts = [0, 1, ...cutPoints(f, d), ...nbs.flatMap(g => cutPoints(g, OPP[d]))].sort((a, b) => a - b);
  const [E0, E1] = edgePts(f.x, f.z, d), out = [];
  const at = t => [E0[0] + (E1[0] - E0[0]) * t, E0[1] + (E1[1] - E0[1]) * t];
  for (let i = 0; i + 1 < ts.length; i++) {
    const t0 = ts[i], t1 = ts[i + 1], tm = (t0 + t1) / 2;
    if (t1 - t0 < 1e-6) continue;
    const own = partAt(f, ...sidePoint(d, tm)), line = (s, e, t) => cornersY(s.cs, s.split, ...sidePoint(e, t));
    const topLine = [line(own, d, t0), line(own, d, t1)];
    let gl = [-1e9, -1e9];
    const pieces = [];
    for (const g of nbs) {
      const gs = partAt(g, ...sidePoint(OPP[d], tm));
      pieces.push({ lows: [[fb, fb], gl], ups: [topLine, [g.bottom * LH, g.bottom * LH]] });
      gl = [line(gs, OPP[d], t0), line(gs, OPP[d], t1)];
    }
    pieces.push({ lows: [[fb, fb], gl], ups: [topLine, [1e9, 1e9]] });
    out.push({ d, P0: at(t0), P1: at(t1), t0, t1, topLine, pieces, own });
  }
  return out;
}
// our side faces minus whatever the neighbouring columns cover (none on a seam of the town: the
// ground goes on in the next tile, docs/town.md; its edge would show as a line)
const builderOf = (L, f) => f.surface === 'masonry' ? L.stone : L.terrain;
function walls(m, f, b, L) {
  for (let d = 0; d < 4; d++) {
    if (m.seams?.[d] && !inb(f.x + DIRS[d][0], f.z + DIRS[d][1])) continue;
    for (const w of wallPieces(m, f, d)) for (const p of w.pieces) {
      const s = w.own, sb = L ? builderOf(L, s) : b;   // (the floor's, or its cut's part's: core/cuts.js)
      if (s.surface) builtWall(sb, w.P0, w.P1, p.lows, p.ups, w.topLine, DIRV[d], SURFACE[s.surface].side, f.c + d);
      else cliffWall(sb, w.P0, w.P1, p.lows, p.ups, w.topLine, DIRV[d], !s.fluid);
    }
  }
  if (f.cut) cutWalls(f, L ? side => builderOf(L, side) : () => b);
}
// The wall along a cut cell's line (core/cuts.js): from the lower side's ground up to the higher
// side's, facing the lower side, in pieces where its heights run straight (and where the sides
// swap which is higher)
function cutWalls(f, builder) {
  const [nx, nz] = f.cut.n;
  for (const s of cutLine(f)) {
    const d0 = s.own[0] - s.part[0], d1 = s.own[1] - s.part[1], pieces = [];
    if (d0 * d1 < 0) {
      const t = d0 / (d0 - d1), m = [s.p[0] + (s.q[0] - s.p[0]) * t, s.p[1] + (s.q[1] - s.p[1]) * t];
      const own = s.own[0] + (s.own[1] - s.own[0]) * t, part = s.part[0] + (s.part[1] - s.part[0]) * t;
      pieces.push({ p: s.p, q: m, own: [s.own[0], own], part: [s.part[0], part] }, { p: m, q: s.q, own: [own, s.own[1]], part: [part, s.part[1]] });
    } else pieces.push(s);
    for (const q of pieces) {
      const high = q.own[0] + q.own[1] > q.part[0] + q.part[1], top = high ? q.own : q.part, low = high ? q.part : q.own;
      if (Math.max(top[0] - low[0], top[1] - low[1]) < 1e-4) continue;
      const P0 = [f.x + q.p[0], f.z + q.p[1]], P1 = [f.x + q.q[0], f.z + q.q[1]], nrm = high ? [nx, 0, nz] : [-nx, 0, -nz];
      const s = high ? f : f.cut.part, b = builder(s);
      // (a built floor's side: its courses of blocks)
      if (s.surface) builtWall(b, P0, P1, [low], [top], top, nrm, SURFACE[s.surface].side, f.c + 7);
      else cliffWall(b, P0, P1, [low], [top], top, nrm, !s.fluid);
    }
  }
}
// a built floor's side: courses of blocks half a cell high, every other one darker
function builtWall(b, P0, P1, lows, ups, topLine, nrm, [a, c], seed) {
  const ymin = Math.max(...lows.map(l => Math.min(l[0], l[1]))), ymax = Math.min(Math.max(...topLine), ...ups.map(l => Math.max(l[0], l[1])));
  if (ymax <= ymin) return;
  for (let j = Math.floor(ymin / LH); j * LH < ymax; j++) {
    const col = (j & 1 ? a : c).clone().multiplyScalar(0.94 + (hash32(seed * 31 + j) % 100) / 900);
    wallRegion(b, P0, P1, lows.concat([[j * LH, j * LH]]), ups.concat([[(j + 1) * LH, (j + 1) * LH], topLine]), nrm, col);
  }
}

// The wet bands a fluid leaves on its shores (in its own mesh, uv u -1: the shader draws them only
// between its surface and its wet line, materials.js cellMaterial). On a wall (wallPieces), a
// little in front of it, between the heights lo and hi; on the sloping top of floor f (its
// triangles steeper than flat), WET_LIFT over it (its `shore` w 3: the shader goes by the
// ground's height under it). b: the fluid's builder, its uvNow set.
const WHITE = C('#ffffff');
export function wetWall(b, ws, lo, hi) {
  for (const w of ws) {
    const ox = DIRS[w.d][0] * 0.005, oz = DIRS[w.d][1] * 0.005;
    const P0 = [w.P0[0] + ox, w.P0[1] + oz], P1 = [w.P1[0] + ox, w.P1[1] + oz];
    for (const p of w.pieces) wallRegion(b, P0, P1, [...p.lows, [lo, lo]], [...p.ups, [hi, hi]], DIRV[w.d], WHITE);
  }
}
const SLOPED = 0.03, ON_SLOPE = [0, 0, 0, 3];
export function wetSlope(b, f) {
  const P = [0, 1, 2, 3].map(k => [f.x + (k & 1), f.cs[k] + WET_LIFT, f.z + (k >> 1)]), was = b.shoreAt;
  b.shoreAt = () => ON_SLOPE;
  for (const t of f.split ? [[0, 1, 2], [1, 3, 2]] : [[0, 1, 3], [0, 3, 2]]) {
    const c = t.map(k => P[k]), mid = [(c[0][0] + c[1][0] + c[2][0]) / 3 - f.x, (c[0][2] + c[1][2] + c[2][2]) / 3 - f.z];
    if (triangleSlope(f, mid[0], mid[1]) > SLOPED) b.tri(c[0], c[1], c[2], WHITE, [0, 1, 0]);
  }
  b.shoreAt = was;
}

// A fluid box from the bed up to the surface, faces hidden where a neighbour covers them. The
// surface is SUB x SUB quads a cell (its waves, render/materials.js cellMaterial), and its uvs
// say what each face is, for the shader (v: the surface's rest height, y in the cube):
//   top: u = c * 256 + the cell's shores, a bit for each neighbour that is a bank (a solid
//        reaching over the surface): 1 << d for the sides (DIRS order), 16 << i for the
//        corners (DIAG order), so the foam can follow the shore
//   side: u = -2
//   wet band: u = -1, a strip on a bank's wall just inside the fluid, from under the lowest
//        the surface sinks to over the highest it rises, and over its bed where that slopes up
//        out of it (wetWall, wetSlope), darkened where the water has just been
// and the top's `shore` the bed under it (render/shore.js: its height, its slope), so the foam
// also follows a shore that slopes down into the water inside the cell.
// A cut cell's fluid (core/cuts.js: a fluid floor with dry ground in its part, or a dry floor
// with a fluid in its part) fills its side of the line only (host: the cut floor, side: which
// side; w: the fluid's surface, the floor or its part): its quads clipped to it, its sides only
// where it reaches a side of the cell, and its shore along the line, where the bank stands, by
// the `shore` of the vertices: as if the ground under them sloped up steeply to the line
// (LINE_SLOPE), so the shader's foam follows it (materials.js shoreDist).
const SUB = 4, DIAG = [[1, 1], [-1, 1], [1, -1], [-1, -1]], BAND = 0.4, LINE_SLOPE = 4, LINE_DROP = 0.3;
const SQUARE = [[0, 0], [1, 0], [1, 1], [0, 1]];
function fluidVolume(m, w, b, host = w, side = 0) {
  const x = host.x, z = host.z, sy = restY(w.surf * LH), by = w.top * LH, cut = host.cut;
  const region = cut ? clipPoly(SQUARE, cut.n, cut.c, side) : SQUARE;
  // where along side d of the cell the fluid reaches: [t0, t1], or null
  const span = d => {
    const ts = region.filter(p => onSide(d, p)).map(p => sideT(d, ...p));
    return ts.length >= 2 && Math.max(...ts) - Math.min(...ts) > 1e-6 ? [Math.min(...ts), Math.max(...ts)] : null;
  };
  // what of a solid g in the neighbouring column faces us along side d at t (a cut cell: its side there)
  const facing = (g, d, t) => g.cut ? partAt(g, ...sidePoint(OPP[d], t)) : g;
  // a bank: a solid in the neighbouring column (a floor, or a stair or landing standing in it:
  // render/shore.js waterSolids) reaching down under the surface and up over it along our side d
  // (as far as the fluid reaches it); down to our bed it hides our side there
  const bank = (d, low = sy) => {
    const sp = span(d), nx = x + DIRS[d][0], nz = z + DIRS[d][1];
    if (!sp || !inb(nx, nz)) return null;
    const tm = (sp[0] + sp[1]) / 2;
    return waterSolids(m, idx(nx, nz)).find(g => {
      const s = facing(g, d, tm);
      return !g.fluid && !s.fluid && g.bottom * LH < low && Math.min(...sp.map(t => cornersY(s.cs, s.split, ...sidePoint(OPP[d], t)))) >= sy;
    }) || null;
  };
  const hidden = d => {
    const nx = x + DIRS[d][0], nz = z + DIRS[d][1];
    // (past a town's seam the water goes on as it is here: world/townland.js)
    if (!inb(nx, nz)) return !!m.seams?.[d];
    const sp = span(d), tm = sp ? (sp[0] + sp[1]) / 2 : 0.5;
    return !!bank(d, by + 0.02) || m.cols[idx(nx, nz)].some(g => { const s = facing(g, d, tm); return !g.crust && s.fluid && s.surf >= w.surf && s.top * LH <= sy; });
  };
  let shores = 0;
  for (let d = 0; d < 4; d++) if (bank(d)) shores |= 1 << d;
  DIAG.forEach(([dx, dz], i) => {
    const k = [dx > 0 ? 1 : 0, dz > 0 ? 1 : 0], nx = x + dx, nz = z + dz;
    if (!inb(nx, nz) || !region.some(p => p[0] === k[0] && p[1] === k[1])) return;
    const corner = (dx > 0 ? 0 : 1) + (dz > 0 ? 0 : 2), at = [corner & 1, corner >> 1];
    const g = waterSolids(m, idx(nx, nz)).find(g => {
      const s = g.cut ? partAt(g, at[0] ? 0.999 : 0.001, at[1] ? 0.999 : 0.001) : g;
      return !g.fluid && !s.fluid && g.bottom * LH < sy && s.cs[corner] >= sy;
    });
    if (g) shores |= 16 << i;
  });
  const white = C('#ffffff');
  b.palNow = w.pal ?? m.fluidRows?.[w.fluid] ?? palRow(m.depth ?? 0, drawnFluid(w), 0);   // its colours (cubegen/fluidbodies.js)
  b.uvNow = [(z * N + x) * 256 + shores, sy];
  // the ground under every corner (render/shore.js): the bed, or a stair or landing standing in
  // the water over it; its quads split along the bed's own diagonal, so that the bed's height
  // between them is what it is
  const memo = new Map(), grounds = waterSolids(m, host.c).filter(g => g === host || !g.fluid && g.bottom * LH < sy && g.top * LH > by);
  const toward = side ? 1 : -1;
  b.shoreAt = v => {
    const k = v[0] + ',' + v[2];
    if (!memo.has(k)) {
      // (a point on a cut's line: the ground on our side of it)
      const px = cut ? v[0] + cut.n[0] * 1e-4 * toward : v[0], pz = cut ? v[2] + cut.n[1] * 1e-4 * toward : v[2];
      const g = grounds.reduce((a, g) => groundAt(g, px, pz) > groundAt(a, px, pz) ? g : a, host);
      let s = [groundAt(g, px, pz), slopeAt(m, g, px, pz), 0, 0];
      if (cut) {
        // the bank along the line: steeply up to it, if that is the nearer shore
        const r = Math.abs(cut.n[0] * (v[0] - x) + cut.n[1] * (v[2] - z) - cut.c), dg = s[1] > 0.02 ? (sy - s[0]) / s[1] : Infinity;
        if (r + LINE_DROP / LINE_SLOPE < dg) s = [sy - LINE_DROP - r * LINE_SLOPE, LINE_SLOPE, 0, 0];
      }
      memo.set(k, s);
    }
    return memo.get(k);
  };
  for (let i = 0; i < SUB; i++) for (let j = 0; j < SUB; j++) {
    const x0 = i / SUB, x1 = (i + 1) / SUB, z0 = j / SUB, z1 = (j + 1) / SUB;
    if (cut) {
      const poly = clipPoly([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], cut.n, cut.c, side);
      for (let k = 1; k + 1 < poly.length; k++) b.tri(...[poly[0], poly[k], poly[k + 1]].map(([px, pz]) => [x + px, sy, z + pz]), white, [0, 1, 0]);
    } else if (w.split) b.quad([x + x0, sy, z + z1], [x + x1, sy, z + z1], [x + x1, sy, z + z0], [x + x0, sy, z + z0], [0, 1, 0], white);
    else b.quad([x + x0, sy, z + z0], [x + x0, sy, z + z1], [x + x1, sy, z + z1], [x + x1, sy, z + z0], [0, 1, 0], white);
  }
  b.shoreAt = null;
  // the wet band where the bed slopes up out of the water
  b.uvNow = [-1, sy];
  if (Math.max(...w.cs) > sy - BAND) {
    if (cut) wetTriangles(b, topTriangles(host, side), x, z);
    else wetSlope(b, w);
  }
  // ... and on the bank along a cut's line, facing the fluid
  if (cut) for (const s of cutLine(host)) {
    const ours = side ? s.part : s.own, theirs = side ? s.own : s.part, nrm = [cut.n[0] * toward, cut.n[1] * toward];
    const P0 = [x + s.p[0] + nrm[0] * 0.005, z + s.p[1] + nrm[1] * 0.005], P1 = [x + s.q[0] + nrm[0] * 0.005, z + s.q[1] + nrm[1] * 0.005];
    wallRegion(b, P0, P1, [ours, [sy - BAND, sy - BAND]], [theirs, [sy + BAND, sy + BAND]], [nrm[0], 0, nrm[1]], WHITE);
  }
  for (let d = 0; d < 4; d++) {
    const sp = span(d);
    if (!sp) continue;
    const [[ax, az], [bx, bz]] = edgePts(x, z, d);
    const at = t => [ax + (bx - ax) * t, az + (bz - az) * t];
    const g = bank(d);
    if (g) {
      // the wet band on the bank's wall facing us, round the surface (a structure is wet by its
      // own material: render/wet.js)
      b.uvNow = [-1, sy];
      if (!g.piece) wetWall(b, wallPieces(m, g, OPP[d]).filter(p => (p.t0 + p.t1) / 2 > sp[0] && (p.t0 + p.t1) / 2 < sp[1]), sy - BAND, sy + BAND);
    } else if (!hidden(d)) {
      b.uvNow = [-2, sy];
      for (let k = 0; k < SUB; k++) {
        const [px, pz] = at(sp[0] + (sp[1] - sp[0]) * k / SUB), [qx, qz] = at(sp[0] + (sp[1] - sp[0]) * (k + 1) / SUB);
        b.quad([px, by, pz], [qx, by, qz], [qx, sy, qz], [px, sy, pz], DIRV[d], white);
      }
    }
  }
}
// the wet band on the sloping ones of these triangles (local, with their heights) of cell (x, z)
function wetTriangles(b, tris, x, z) {
  const was = b.shoreAt;
  b.shoreAt = () => ON_SLOPE;
  for (const t of tris) {
    const [p, q, r] = t, ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (Math.hypot(nx, nz) / Math.abs(ny || 1e-9) > SLOPED) b.tri(...t.map(([px, py, pz]) => [x + px, py + WET_LIFT, z + pz]), WHITE, [0, 1, 0]);
  }
  b.shoreAt = was;
}

export function buildFloors(m, layers) {
  if (m.interior) return buildInteriorFloors(m, layers);
  for (const f of m.floors) {
    if (f.crust) continue;   // the crumbling crust: drawn on its own, it falls (render/trials.js)
    const L = layers[f.layer], x = f.x, z = f.z, cs = f.cs, B = builderOf(L, f);
    // smooth top surface: 2 triangles, shared normals for soft shading (a cut cell: each side's
    // triangles clipped to its side of the line, core/cuts.js)
    for (const side of f.cut ? [0, 1] : [0]) {
      const s = side ? f.cut.part : f, top = topColor(m, s), SB = side ? builderOf(L, s) : B;
      topTriangles(f, side).forEach((t, ti) => {
        const col = top.clone().multiplyScalar(0.95 + (hash32(f.c * 2 + (ti > 1 ? 1 : ti) + f.layer * 977) % 100) / 1000);
        SB.tri(...t.map(([px, py, pz]) => [x + px, py, z + pz]), col, [0, 1, 0], true);
      });
    }
    walls(m, f, B, L);
    // its underside (none where its top comes down onto it: the town's ground at level 0, its
    // quarry's floor, its pool's bed; drawn both sides, it would fight with the top)
    const fb = f.bottom * LH;
    if (Math.min(...cs, ...(f.cut ? f.cut.part.cs : [])) - fb > 0.01) B.quad([x, fb, z], [x + 1, fb, z], [x + 1, fb, z + 1], [x, fb, z + 1], [0, -1, 0], f.surface ? SURFACE[f.surface].under : UNDERSIDE);
    if (f.fluid) fluidVolume(m, f, L.fluids[drawnFluid(f)]);   // (a mud pool: its own part, render/parts.js)
    if (f.cut?.part.fluid) fluidVolume(m, f.cut.part, L.fluids[drawnFluid(f.cut.part)], f, 1);   // (its side of a cut: core/cuts.js)
  }
  if (m.town) buildClearingPaths(m, m.town.paths, layers[0].terrain);
}

// The town's paths are narrow straight ribbons along the grid, not whole-cell paving, lying on the
// ground (level where the town stands): each run a strip reaching `width` to either side and past
// both ends, so corners close up, in pieces so it follows the ground; none over water (a bridge
// carries the way over it), nor up a cliff (a piece reaching past one's edge, as a way's end at the
// foot of the stair up the town's cliff: it would stand up the wall as a slab). These are baked into
// the worker's terrain mesh, so cutaways, shadows and neighbour proxies agree.
const STEEP = 1.5;   // (steeper than any slope of the ground: a cliff between two points)
function buildClearingPaths(m, paths, builder) {
  const color = C('#b3a58a');
  const bounded = v => Math.max(0, Math.min(N, v));
  const floorAt = (x, z) => m.cols[idx(Math.min(N - 1, Math.max(0, Math.floor(x))), Math.min(N - 1, Math.max(0, Math.floor(z))))][0];
  const ground = (x, z) => {
    const f = floorAt(x, z), cx = Math.min(N - 1, Math.max(0, Math.floor(x))), cz = Math.min(N - 1, Math.max(0, Math.floor(z)));
    return floorY(f, Math.min(1, Math.max(0, x - cx)), Math.min(1, Math.max(0, z - cz))) + .012;
  };
  for (const { points, width } of paths) for (let i = 1; i < points.length; i++) {
    const [ax0, az0] = points[i - 1], [bx0, bz0] = points[i], len = Math.hypot(bx0 - ax0, bz0 - az0);
    if (len < 1e-6) continue;
    const ux = (bx0 - ax0) / len * width, uz = (bz0 - az0) / len * width;
    const corner = (x, z, side) => { const p = [bounded(x - uz * side), 0, bounded(z + ux * side)]; p[1] = ground(p[0], p[2]); return p; };
    // (a piece over a cliff: its corners further apart in height than any slope takes them)
    const cliff = q => [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2], [1, 3]].some(([i, j]) =>
      Math.abs(q[i][1] - q[j][1]) > STEEP * Math.hypot(q[i][0] - q[j][0], q[i][2] - q[j][2]) + .05);
    const piece = (t0, t1, split) => {
      const ax = ax0 + (bx0 - ax0) * t0, az = az0 + (bz0 - az0) * t0, bx = ax0 + (bx0 - ax0) * t1, bz = az0 + (bz0 - az0) * t1;
      if ([[ax, az], [bx, bz], [(ax + bx) / 2, (az + bz) / 2]].some(([x, z]) => floorAt(x, z).fluid)) return;
      const q = [corner(ax, az, 1), corner(ax, az, -1), corner(bx, bz, -1), corner(bx, bz, 1)];
      if (!cliff(q)) builder.quad(...q, [0, 1, 0], color);
      // (in finer pieces up to its edge)
      else if (split) for (let k = 0; k < 8; k++) piece(t0 + (t1 - t0) * k / 8, t0 + (t1 - t0) * (k + 1) / 8, false);
    };
    const n = Math.max(1, Math.ceil((len + 2 * width) / .5));
    for (let k = 0; k < n; k++) piece(-width / len + (1 + 2 * width / len) * k / n, -width / len + (1 + 2 * width / len) * (k + 1) / n, true);
  }
}
