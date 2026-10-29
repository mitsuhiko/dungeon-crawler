// Fluid pools on upper layers, plus a generic "pool around a floor" used under waterfalls. Their
// surface is level with their lowest bank (walked into and out of there), their bed two under it.
import { N, HEAD, DIRS, FLUID_NAME } from '../core/constants.js';
import { idx, inb } from '../core/util.js';

// The slabs walling in a fluid body (surface S, bed 2 levels lower) reach down as deep as its
// own slab, so its sides never show under a thinner ledge next to it. null if one of them
// cannot (no headroom below); with apply, they are thickened.
export function banks(ctx, cells, S, apply = false) {
  const bed = S - 2, set = new Set(cells), out = [];
  for (const f of cells) for (const [dx, dz] of DIRS) {
    const x = f.x + dx, z = f.z + dz;
    if (!inb(x, z)) continue;
    const b = ctx.cols[idx(x, z)].find(h => !set.has(h) && !h.fluid && h.top >= S && h.bottom <= S);
    if (!b || b.merged || b.bottom <= bed - 1 || out.includes(b)) continue;
    const below = ctx.nextBelow(b);
    if (below && below.top + HEAD > bed - 1) return null;
    out.push(b);
  }
  if (apply) for (const b of out) b.bottom = bed - 1;
  return out;
}

// turn floors into a fluid body with surface S (bed 2 levels lower); false if a slab gets too thin
function flood(ctx, cells, type, S) {
  const bed = S - 2;
  if (bed < 0 || cells.some(f => ctx.border(f) || f.site) || cells.some(f => { const b = ctx.nextBelow(f); return !f.merged && b && b.top + HEAD > bed - 1; })) return false;
  if (!banks(ctx, cells, S)) return false;
  banks(ctx, cells, S, true);
  for (const f of cells) { f.top = bed; f.fluid = type; f.surf = S; if (!f.merged) f.bottom = Math.min(f.bottom, bed - 1); }
  return true;
}

export function addPools(ctx) {
  const { R, ri, K, pickFluid, layerFloor, stats } = ctx;
  for (let k = 1; k < K; k++) {
    if (R() > 0.6) continue;
    const type = pickFluid();
    const ok = c => { const f = layerFloor(c, k); return f && !f.prot && !f.ramp && !f.site; };
    const centers = [];
    for (let c = 0; c < N * N; c++) {
      if (!ok(c)) continue;
      const x = c % N, z = (c / N) | 0;
      let all = true;
      for (let dz = -1; dz <= 1 && all; dz++) for (let dx = -1; dx <= 1; dx++) if (!inb(x + dx, z + dz) || !ok(idx(x + dx, z + dz))) { all = false; break; }
      if (all) centers.push(c);
    }
    if (!centers.length) continue;
    const c0 = centers[ri(0, centers.length - 1)], rad = 1 + R() * 0.7;
    const cells = [];
    for (let c = 0; c < N * N; c++) {
      if (!ok(c) || Math.hypot(c % N - c0 % N, ((c / N) | 0) - ((c0 / N) | 0)) > rad) continue;
      const x = c % N, z = (c / N) | 0;
      if (DIRS.every(([dx, dz]) => inb(x + dx, z + dz) && layerFloor(idx(x + dx, z + dz), k))) cells.push(layerFloor(c, k));
    }
    if (!cells.length) continue;
    const set = new Set(cells);
    let S = Infinity;
    for (const f of cells) for (const [dx, dz] of DIRS) {
      const g = layerFloor(idx(f.x + dx, f.z + dz), k);
      if (!set.has(g)) S = Math.min(S, g.top);
    }
    if (flood(ctx, cells, type, S)) stats.fluids.push(FLUID_NAME[type] + ' pool (L' + k + ')');
  }
}

// the floor that walls in a fluid at level h in column (x,z):
// undefined = cube wall (holds), null = nothing (it would spill)
const bankAt = (ctx, x, z, h) => inb(x, z) ? ctx.cols[idx(x, z)].find(f => f.bottom <= h && f.top >= h - 3) || null : undefined;

// pool around `center` on its layer; returns the surface level or 0
export function poolAround(ctx, center, rad, type) {
  const cells = [];
  for (let z = center.z - 2; z <= center.z + 2; z++) for (let x = center.x - 2; x <= center.x + 2; x++) {
    if (!inb(x, z) || !x || !z || x === N - 1 || z === N - 1 || Math.hypot(x - center.x, z - center.z) > rad) continue;
    const g = ctx.cols[idx(x, z)].find(f => f.layer === center.layer && !f.fluid && !f.prot && !f.ramp && !f.site && !f.roof
      && !(f.layer === 0 && ctx.keep?.has(f.c)) && Math.abs(f.top - center.top) <= 2);
    if (g) cells.push(g);
  }
  if (!cells.includes(center)) return 0;
  const set = new Set(cells);
  let S = Infinity;
  for (const f of cells) {
    S = Math.min(S, f.top);
    for (const [dx, dz] of DIRS) {
      const b = bankAt(ctx, f.x + dx, f.z + dz, f.top);
      if (b === undefined || set.has(b)) continue;
      if (!b) return 0;
      if (b.fluid) { if (b.fluid !== type) return 0; continue; }
      S = Math.min(S, b.top);
    }
  }
  return flood(ctx, cells, type, S) ? S : 0;
}
