// Ground floors for every column, then the upper layers: slabs made of blobs (plus portal
// pads) that merge into whatever pokes up from below (hills become overhangs / pillars).
import { N, HEAD, count16 } from '../core/constants.js';
import { idx } from '../core/util.js';
import { spoutSlabs } from './spouts.js';

export function buildSlabs(ctx) {
  const { R, ri, noise, topNoise, K, B, cols, mk, topFloor, removeFloor } = ctx;
  for (let c = 0; c < N * N; c++) {
    if (ctx.void0[c]) continue;   // open to the depth below: no ground here
    const f = mk(c, ctx.lvl0[c], 0, 0);
    f.fluid = ctx.fluid0[c]; f.surf = ctx.surf0[c]; f.prot = ctx.prot0[c];
    const reserved = ctx.siteSpace?.get(c);
    if (reserved?.layer === 0) Object.assign(f, { site: reserved.site.id,
      siteAnchor: c === reserved.site.anchorCell, siteAccess: c === reserved.site.accessCell,
      hordeReserved: !!reserved.horde, hordeSpawn: !!reserved.spawn });
    cols[c].push(f);
    if (ctx.soft?.has(c)) f.soft = true;   // a plunge's landing (cubegen/heights.js)
    // a tunnel's roof over its floor (cubegen/tunnel.js): a floor of its own, kept clear of slabs
    const roof = ctx.roofs?.get(c);
    if (roof) cols[c].push(Object.assign(mk(c, roof.top, roof.bottom, 0), { roof: true, merged: false }));
  }

  for (let k = 1; k < K; k++) {
    const mask = new Uint8Array(N * N);
    const blob = (cx, cz, hx, hz) => {
      for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
        const dx = Math.abs(x + 0.5 - cx) / hx, dz = Math.abs(z + 0.5 - cz) / hz;
        if (dx ** 4 + dz ** 4 + (noise(x * 0.7 + k * 13, z * 0.7 + k * 7) - 0.5) * 0.9 < 1) mask[idx(x, z)] = 1;
      }
    };
    for (let b = ri(count16(1), count16(3)); b > 0; b--) blob(ri(2, N - 3) + 0.5, ri(2, N - 3) + 0.5, 1.8 + R() * 3, 1.8 + R() * 3);
    // slabs only touch the cube faces at portal pads, so the edges match the neighbours
    for (let c = 0; c < N * N; c++) { const x = c % N, z = (c / N) | 0; if (!x || !z || x === N - 1 || z === N - 1 || ctx.sky?.has(c)) mask[c] = 0; }
    for (const [c, reserved] of ctx.siteSpace || []) mask[c] = reserved.layer === k ? 1 : 0;
    const padOf = new Map();
    for (const p of ctx.portals) if (p.layer === k) for (const c of p.cells) { mask[c] = 1; padOf.set(c, p.id); }
    spoutSlabs(ctx, k, mask, padOf);

    for (let c = 0; c < N * N; c++) {
      if (!mask[c]) continue;
      const x = c % N, z = (c / N) | 0;
      const reserved = ctx.siteSpace?.get(c);
      const top = reserved?.layer === k ? reserved.top : padOf.has(c) ? B[k] : B[k] + (topNoise(x * 0.35 + k * 5, z * 0.35) > 0.6 ? 1 : 0);
      const u = mk(c, top, top - 2, k);
      if (reserved?.layer === k) Object.assign(u, { site: reserved.site.id,
        siteAnchor: c === reserved.site.anchorCell, siteAccess: c === reserved.site.accessCell,
        hordeReserved: !!reserved.horde, hordeSpawn: !!reserved.spawn });
      u.prot = padOf.get(c) || 0;
      const below = topFloor(c);
      if (below && below.top + HEAD > u.bottom) {
        if ((below.fluid || below.prot) && !u.prot) continue;   // leave a hole above rivers / pads
        u.bottom = below.bottom; u.merged = true; removeFloor(below);
      }
      cols[c].push(u);
    }
  }
}
