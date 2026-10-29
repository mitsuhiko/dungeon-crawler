// Streams on upper layers: a channel running to the slab edge that spills over as a
// waterfall into a pool (or an existing body of the same fluid) below.
import { N, HEAD, DIRS, FLUID_NAME, WATER } from '../core/constants.js';
import { idx, inb } from '../core/util.js';
import { poolAround, banks } from './pools.js';
import { WIDER } from './river.js';

// candidate channels on layer k: straight runs with banks on both sides, ending at an edge
function channels(ctx, k) {
  const { cols, layerFloor, nextAbove } = ctx;
  const ok = f => f && f.layer === k && !f.prot && !f.ramp && !f.fluid && !f.site;
  const at = (x, z) => inb(x, z) ? layerFloor(idx(x, z), k) : null;
  const cands = [];
  for (let c = 0; c < N * N; c++) {
    const s0 = layerFloor(c, k);
    if (!ok(s0)) continue;
    for (let d = 0; d < 4; d++) {
      const [dx, dz] = DIRS[d], lx = dz, lz = dx;
      if (inb(s0.x - dx, s0.z - dz) && !at(s0.x - dx, s0.z - dz)) continue;   // bank (or cube wall) behind the source
      const chan = [];
      let x = s0.x, z = s0.z, good = true;
      for (;;) {
        const f = at(x, z);
        if (!ok(f) || !at(x + lx, z + lz) || !at(x - lx, z - lz) || chan.length > 6) { good = false; break; }
        chan.push(f);
        if (!inb(x + dx, z + dz)) { good = false; break; }
        if (!at(x + dx, z + dz)) break;   // reached the slab edge
        x += dx; z += dz;
      }
      if (!good || chan.length < 2) continue;
      const e = chan[chan.length - 1], bc = idx(e.x + dx, e.z + dz);
      let g = null;
      for (const f of cols[bc]) if (f.top < e.top - 3) g = f;
      const above = g && nextAbove(g);
      if (!g || g.prot || g.ramp || g.site || ctx.keep?.has(bc) || (above && above.bottom < e.top + 1)) continue;
      cands.push({ chan, d, g, bc });
    }
  }
  return { cands, at };
}

export function addStreams(ctx) {
  const { R, ri, K, pickFluid, nextBelow, stats } = ctx;
  const falls = ctx.falls = [];
  for (let k = 1; k < K; k++) {
    if (R() > 0.85) continue;
    const type = pickFluid();
    const { cands, at } = channels(ctx, k);
    if (!cands.length) continue;
    const st = cands[ri(0, cands.length - 1)];
    const [dx, dz] = DIRS[st.d], lx = dz, lz = dx;

    // channel surface level with its lowest bank
    let S = Infinity;
    for (const f of st.chan) {
      S = Math.min(S, f.top);
      for (const b of [at(f.x + lx, f.z + lz), at(f.x - lx, f.z - lz)]) S = Math.min(S, b.top);
    }
    const back = at(st.chan[0].x - dx, st.chan[0].z - dz);
    if (back) S = Math.min(S, back.top);
    const bed = S - 2;
    if (st.chan.some(f => { const b = nextBelow(f); return !f.merged && b && b.top + HEAD > bed - 1; })) continue;
    if (!banks(ctx, st.chan, S)) continue;   // its banks have to reach as deep as the channel

    // the pool at the bottom (or an existing body of the same fluid)
    const S2 = st.g.fluid ? (st.g.fluid === type ? st.g.surf : 0) : poolAround(ctx, st.g, 1.3 + R() * 0.6 + (type === WATER ? WIDER : 0), type);
    if (!S2 || S2 >= S - 2) continue;
    banks(ctx, st.chan, S, true);
    for (const f of st.chan) { f.top = bed; f.fluid = type; f.surf = S; if (!f.merged) f.bottom = Math.min(f.bottom, bed - 1); }
    falls.push({ c: st.bc, d: st.d, top: S, bot: S2, type, layer: st.g.layer });
    stats.fluids.push(FLUID_NAME[type] + ' fall L' + k + '→L' + st.g.layer);
  }
}
