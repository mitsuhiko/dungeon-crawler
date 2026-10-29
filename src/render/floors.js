// Terrain geometry for every floor: smooth top, cliff walls, slab underside, fluid volume.
import { N, LH, DIRS, OPP, DIRV, EDGE_CORNERS, edgePts, drawnFluid } from '../core/constants.js';
import { idx, inb, hash32 } from '../core/util.js';
import { C, gradient, TOP_STOPS, UNDERSIDE, SOFT, SURFACE, fluidBed, fluidBank } from './palette.js';
import { cliffWall, wallRegion } from './walls.js';
import { palRow } from '../themes/fluids.js';
import { buildInteriorFloors } from './interior.js';
import { restY } from './surface.js';
import { groundAt, slopeAt, triangleSlope, waterSolids, WET_LIFT } from './shore.js';

const ICE_TOP = C('#cfe8f4');
const shade = (x, z) => ((x + z) & 1 ? 1.0 : 0.95) * (0.97 + (hash32(x * 31 + z * 977) % 100) / 1600);

// A built floor (its `surface`: a role, themes/surfaces.js; Foggery's tower and the floor of his
// caldera, cubegen/towerarena.js; Mansk's museum, cubegen/arenashapes.js `stage`) is the theme's
// colour for that role, not the terrain's by height; paving in a checker of its two tiles
function topColor(m, f) {
  const cs = f.cs;
  if (f.surface) return SURFACE[f.surface][f.surface === 'paving' && (f.x + f.z) & 1 ? 'alt' : 'top'].clone().multiplyScalar(shade(f.x, f.z) * (0.92 + (hash32(f.c * 7 + Math.round(cs[0] * 4)) % 100) / 600));
  if (f.fluid) return fluidBed(drawnFluid(f));
  if (f.soft) return SOFT.clone().multiplyScalar(shade(f.x, f.z));   // a plunge's landing
  if (f.ice) return ICE_TOP.clone().multiplyScalar(shade(f.x, f.z));   // a slide puzzle's ice (cubegen/trials/slide.js)
  const top = gradient(TOP_STOPS, (cs[0] + cs[1] + cs[2] + cs[3]) / 4 / LH).multiplyScalar(shade(f.x, f.z));
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
  const fb = f.bottom * LH, cs = f.cs;
  const [ea, eb] = EDGE_CORNERS[d], [na, nb] = EDGE_CORNERS[OPP[d]];
  const topLine = [cs[ea], cs[eb]];
  const nx = f.x + DIRS[d][0], nz = f.z + DIRS[d][1];
  const nbs = inb(nx, nz) ? m.cols[idx(nx, nz)].filter(g => !g.crust).sort((a, b) => a.bottom - b.bottom) : [];
  const [P0, P1] = edgePts(f.x, f.z, d);
  let gl = [-1e9, -1e9];
  const pieces = [];
  for (const g of nbs) { pieces.push({ lows: [[fb, fb], gl], ups: [topLine, [g.bottom * LH, g.bottom * LH]] }); gl = [g.cs[na], g.cs[nb]]; }
  pieces.push({ lows: [[fb, fb], gl], ups: [topLine, [1e9, 1e9]] });
  return { d, P0, P1, topLine, pieces };
}
// our side faces minus whatever the neighbouring columns cover
function walls(m, f, b) {
  for (let d = 0; d < 4; d++) {
    const w = wallPieces(m, f, d);
    for (const p of w.pieces) {
      if (f.surface) builtWall(b, w.P0, w.P1, p.lows, p.ups, w.topLine, DIRV[d], SURFACE[f.surface].side, f.c + d);
      else cliffWall(b, w.P0, w.P1, p.lows, p.ups, w.topLine, DIRV[d], !f.fluid);
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
export function wetWall(b, w, lo, hi) {
  const ox = DIRS[w.d][0] * 0.005, oz = DIRS[w.d][1] * 0.005;
  const P0 = [w.P0[0] + ox, w.P0[1] + oz], P1 = [w.P1[0] + ox, w.P1[1] + oz];
  for (const p of w.pieces) wallRegion(b, P0, P1, [...p.lows, [lo, lo]], [...p.ups, [hi, hi]], DIRV[w.d], WHITE);
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
const SUB = 4, DIAG = [[1, 1], [-1, 1], [1, -1], [-1, -1]], BAND = 0.4;
function fluidVolume(m, f, b) {
  const x = f.x, z = f.z, sy = restY(f.surf * LH), by = f.top * LH;
  // a bank: a solid in the neighbouring column (a floor, or a stair or landing standing in it:
  // render/shore.js waterSolids) reaching down under the surface and up over it at the corners of
  // it next to us; down to our bed it hides our side there
  const bank = (nx, nz, corners, low = sy) => inb(nx, nz) && waterSolids(m, idx(nx, nz)).find(g => !g.fluid
    && g.bottom * LH < low && Math.min(...corners.map(k => g.cs[k])) >= sy);
  const hidden = d => {
    const nx = x + DIRS[d][0], nz = z + DIRS[d][1];
    if (!inb(nx, nz)) return false;
    return !!bank(nx, nz, EDGE_CORNERS[OPP[d]], by + 0.02) || m.cols[idx(nx, nz)].some(g => !g.crust && g.fluid && g.surf >= f.surf && g.top * LH <= sy);
  };
  let shores = 0;
  for (let d = 0; d < 4; d++) if (bank(x + DIRS[d][0], z + DIRS[d][1], EDGE_CORNERS[OPP[d]])) shores |= 1 << d;
  DIAG.forEach(([dx, dz], i) => { if (bank(x + dx, z + dz, [(dx > 0 ? 0 : 1) + (dz > 0 ? 0 : 2)])) shores |= 16 << i; });
  const white = C('#ffffff');
  b.palNow = f.pal ?? m.fluidRows?.[f.fluid] ?? palRow(m.depth ?? 0, drawnFluid(f), 0);   // its colours (cubegen/fluidbodies.js)
  b.uvNow = [(z * N + x) * 256 + shores, sy];
  // the ground under every corner (render/shore.js): the bed, or a stair or landing standing in
  // the water over it; its quads split along the bed's own diagonal, so that the bed's height
  // between them is what it is
  const memo = new Map(), grounds = waterSolids(m, f.c).filter(g => g === f || !g.fluid && g.bottom * LH < sy && g.top * LH > by);
  b.shoreAt = v => {
    const k = v[0] + ',' + v[2];
    if (!memo.has(k)) {
      const g = grounds.reduce((a, g) => groundAt(g, v[0], v[2]) > groundAt(a, v[0], v[2]) ? g : a, f);
      memo.set(k, [groundAt(g, v[0], v[2]), slopeAt(m, g, v[0], v[2]), 0, 0]);
    }
    return memo.get(k);
  };
  for (let i = 0; i < SUB; i++) for (let j = 0; j < SUB; j++) {
    const x0 = x + i / SUB, x1 = x + (i + 1) / SUB, z0 = z + j / SUB, z1 = z + (j + 1) / SUB;
    if (f.split) b.quad([x0, sy, z1], [x1, sy, z1], [x1, sy, z0], [x0, sy, z0], [0, 1, 0], white);
    else b.quad([x0, sy, z0], [x0, sy, z1], [x1, sy, z1], [x1, sy, z0], [0, 1, 0], white);
  }
  b.shoreAt = null;
  // the wet band where the bed slopes up out of the water
  b.uvNow = [-1, sy];
  if (Math.max(...f.cs) > sy - BAND) wetSlope(b, f);
  for (let d = 0; d < 4; d++) {
    const [[ax, az], [bx, bz]] = edgePts(x, z, d);
    const at = k => [ax + (bx - ax) * k / SUB, az + (bz - az) * k / SUB];
    const g = bank(x + DIRS[d][0], z + DIRS[d][1], EDGE_CORNERS[OPP[d]]);
    if (g) {
      // the wet band on the bank's wall facing us, round the surface (a structure is wet by its
      // own material: render/wet.js)
      b.uvNow = [-1, sy];
      if (!g.piece) wetWall(b, wallPieces(m, g, OPP[d]), sy - BAND, sy + BAND);
    } else if (!hidden(d)) {
      b.uvNow = [-2, sy];
      for (let k = 0; k < SUB; k++) {
        const [px, pz] = at(k), [qx, qz] = at(k + 1);
        b.quad([px, by, pz], [qx, by, qz], [qx, sy, qz], [px, sy, pz], DIRV[d], white);
      }
    }
  }
}

export function buildFloors(m, layers) {
  if (m.interior) return buildInteriorFloors(m, layers);
  for (const f of m.floors) {
    if (f.crust) continue;   // the crumbling crust: drawn on its own, it falls (render/trials.js)
    const L = layers[f.layer], x = f.x, z = f.z, cs = f.cs, B = f.surface === 'masonry' ? L.stone : L.terrain;
    const P = [[x, cs[0], z], [x + 1, cs[1], z], [x, cs[2], z + 1], [x + 1, cs[3], z + 1]];
    // smooth top surface: 2 triangles, shared normals for soft shading
    const top = topColor(m, f);
    const tris = f.split ? [[0, 1, 2], [1, 3, 2]] : [[0, 1, 3], [0, 3, 2]];
    tris.forEach((t, ti) => {
      const col = top.clone().multiplyScalar(0.95 + (hash32(f.c * 2 + ti + f.layer * 977) % 100) / 1000);
      B.tri(P[t[0]], P[t[1]], P[t[2]], col, [0, 1, 0], true);
    });
    walls(m, f, B);
    const fb = f.bottom * LH;
    B.quad([x, fb, z], [x + 1, fb, z], [x + 1, fb, z + 1], [x, fb, z + 1], [0, -1, 0], f.surface ? SURFACE[f.surface].under : UNDERSIDE);
    if (f.fluid) fluidVolume(m, f, L.fluids[drawnFluid(f)]);   // (a mud pool: its own part, render/parts.js)
  }
  const clearing = m.town || m.merchantCamp;
  if (clearing) buildClearingPaths(m, clearing.paths, layers[0].terrain);
}

// Flat clearings use narrow straight ribbons along the grid, not whole-cell paving. Each run
// is a rectangle reaching `width` to either side and past both ends, so corners close up.
// These are baked into the worker's terrain mesh, so cutaways, shadows and neighbour proxies agree.
function buildClearingPaths(m, paths, builder) {
  const y = m.floors[0].top * LH + .012, color = C('#b3a58a');
  const bounded = v => Math.max(0, Math.min(N, v));
  for (const { points, width } of paths) for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i], len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) continue;
    const ux = (bx - ax) / len * width, uz = (bz - az) / len * width;
    const corner = (x, z, side) => [bounded(x - uz * side), y, bounded(z + ux * side)];
    builder.quad(corner(ax - ux, az - uz, 1), corner(ax - ux, az - uz, -1), corner(bx + ux, bz + uz, -1), corner(bx + ux, bz + uz, 1), [0, 1, 0], color);
  }
}
