// Ramps leading up to slab edges, and pillars so no slab floats freely.
import { N, HEAD, DIRS, count16 } from '../core/constants.js';
import { idx, inb } from '../core/util.js';

// raise the layer below into a 2-wide slope leading up to a slab edge
export function addRamps(ctx) {
  const { R, ri, K, cols, layerFloor, nextAbove, stats } = ctx;
  // (a ramp or so a layer for a room of 16 cells, more in a bigger one)
  for (let k = 1; k < K; k++) for (let n = count16(1); n > 0; n--) {
    if (R() > 0.6) continue;
    const cands = [];
    for (let c = 0; c < N * N; c++) {
      const e = layerFloor(c, k);
      if (!e || e.prot || e.fluid || e.site) continue;
      for (let d = 0; d < 4; d++) {
        const nx = e.x + DIRS[d][0], nz = e.z + DIRS[d][1];
        if (inb(nx, nz) && !layerFloor(idx(nx, nz), k)) cands.push([e, d]);
      }
    }
    if (!cands.length) continue;
    const [e, d] = cands[ri(0, cands.length - 1)];
    const lat = d < 2 ? [0, 1] : [1, 0];
    let made = 0;
    for (let j = 0; j < 8; j++) {
      const target = e.top - 2 * (j + 1);
      let any = false;
      for (const w of [0, 1]) {
        const x = e.x + DIRS[d][0] * (j + 1) + lat[0] * w, z = e.z + DIRS[d][1] * (j + 1) + lat[1] * w;
        if (!inb(x, z)) continue;
        let g = null;
        for (const f of cols[idx(x, z)]) if (f.top < e.top - 1) g = f;
        // (never on ground something else is shaped with: a tunnel's aprons, cubegen/tunnel.js)
        if (!g || g.fluid || g.prot || g.site || g.top >= target || ctx.border(g) || (g.layer === 0 && ctx.keep?.has(g.c))) continue;
        const a = nextAbove(g);
        if (a && a.bottom < target + HEAD) continue;
        g.top = target; g.ramp = true; any = true; made++;
      }
      if (!any) break;
    }
    if (made) stats.ramps++;
  }
}

// every floating slab rests on at least one pillar (unless the cube has floating islands);
// tiny crumbs are dropped
export function addSupports(ctx) {
  const { ri, K, layerFloor, removeFloor, nextBelow, stats } = ctx, floating = ctx.spec.floating;
  for (let k = 1; k < K; k++) {
    const seen = new Set();
    for (let c = 0; c < N * N; c++) {
      const f0 = layerFloor(c, k);
      if (!f0 || seen.has(f0)) continue;
      const comp = [f0]; seen.add(f0);
      for (let i = 0; i < comp.length; i++) {
        const f = comp[i];
        for (const [dx, dz] of DIRS) {
          if (!inb(f.x + dx, f.z + dz)) continue;
          const g = layerFloor(idx(f.x + dx, f.z + dz), k);
          if (g && !seen.has(g)) { seen.add(g); comp.push(g); }
        }
      }
      const prot = comp.some(f => f.prot || f.site);
      if (comp.length < 3 && !prot && !comp.some(f => f.merged)) { comp.forEach(removeFloor); continue; }
      if (comp.some(f => f.merged) || floating) continue;
      const cands = comp.filter(f => { const b = nextBelow(f); return b && !b.fluid && !b.prot && !b.ramp && !b.site && !f.prot && !f.site; });
      // nothing to stand a pillar on: keep it as a floating island if it is over the void
      if (!cands.length) { if (!prot && !comp.some(f => !nextBelow(f))) comp.forEach(removeFloor); continue; }
      for (let n = Math.min(cands.length, comp.length > 12 ? 2 : 1); n > 0; n--) {
        const f = cands.splice(ri(0, cands.length - 1), 1)[0], b = nextBelow(f);
        f.bottom = b.bottom; f.merged = true; removeFloor(b); stats.pillars++;
      }
    }
  }
}
