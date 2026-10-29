// Falls between this cube and the ones above / below it (world/cascades.js). Ground stage: the
// source pool beside the void it pours into (outflow), the catch pool under a stream coming
// in through the top (inflow, its columns stay free of slabs). After the streams: the sheets.
import { N, LH, CUBE_H, BASE, DIRS, FLUID_NAME } from '../core/constants.js';
import { idx } from '../core/util.js';
import { bankGround } from './contain.js';

const TOP = (CUBE_H - BASE) / LH, BOTTOM = -BASE / LH;   // the glass box's top / bottom (levels)

// a pool of radius rad around (cx, cz), its surface level with its lowest bank: [cells, S]
export function pool(ctx, cx, cz, rad, type) {
  const { lvl0, prot0, void0, fluid0, surf0 } = ctx, cells = [];
  for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++)
    if (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) < rad && !prot0[idx(x, z)] && !void0[idx(x, z)]) cells.push(idx(x, z));
  const set = new Set(cells);
  let S = Infinity;
  for (const i of cells) {
    S = Math.min(S, lvl0[i]);
    for (const [dx, dz] of DIRS) { const n = i + dx + dz * N; if (!set.has(n) && !void0[n]) S = Math.min(S, lvl0[n]); }
  }
  S = Math.max(3, S);
  for (const i of cells) { fluid0[i] = type; surf0[i] = S; lvl0[i] = S - 2; }
  return [cells, S];
}

export function cascadeGround(ctx) {
  const { spec, void0, prot0 } = ctx, list = ctx.cascades = [], sky = ctx.sky = new Set(ctx.keep);   // sky: no slabs (nor sites, hordes)
  const out = spec.outflow, inn = spec.inflow;
  // an open shaft around the falling water (3x3 around cell c)
  const shaft = c => { for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) sky.add(c + dx + dz * N); };
  if (out) {
    const fc = idx(out.x, out.z), [dx, dz] = DIRS[out.d], src = fc - dx - dz * N;
    if (!prot0[src] && !prot0[fc]) {
      void0[fc] = 1; ctx.fluid0[fc] = 0; void0[src] = 0; shaft(fc);
      const [cells, S] = pool(ctx, out.x + 0.5 - dx, out.z + 0.5 - dz, 1.3, out.type);
      for (const c of cells) sky.add(c);
      list.push({ c: fc, d: out.d, top: S, bot: BOTTOM, type: out.type, layer: 0, out: true });
    }
  }
  if (inn) {
    // the catch pool sits on the line the sheet comes down (the fall cell's entry edge)
    const fc = idx(inn.x, inn.z), [dx, dz] = DIRS[inn.d];
    if (spec.lake && ctx.fluid0[fc]) {
      // into a great lake (cubegen/setpieces.js): the lake is its catch pool
      shaft(fc); shaft(fc - dx - dz * N);
      list.push({ c: fc, d: inn.d, top: TOP, bot: ctx.surf0[fc], type: inn.type, layer: 0, in: true });
    } else {
      for (let z = inn.z - 2; z <= inn.z + 2; z++) for (let x = inn.x - 2; x <= inn.x + 2; x++) void0[idx(x, z)] = 0;
      const [cells, S] = pool(ctx, inn.x + 0.5 - dx * 0.5, inn.z + 0.5 - dz * 0.5, 1.7, inn.type);
      for (const c of cells) sky.add(c);
      shaft(fc); shaft(fc - dx - dz * N);
      list.push({ c: fc, d: inn.d, top: TOP, bot: S, type: inn.type, layer: 0, in: true });
    }
  }
  if (list.length) bankGround(ctx, new Set(list.map(f => f.c)));   // the pools spill only into their falls
}

export function cascadeFalls(ctx) {
  for (const f of ctx.cascades) {
    ctx.falls.push(f);
    ctx.stats.fluids.push(FLUID_NAME[f.type] + (f.out ? ' fall to the depth below' : ' fall from above'));
  }
}
