// Route search moves. Nodes are floors plus free-standing stair landings (cell, level).
import { N, MAX_L, SHEAD, DIRS } from '../core/constants.js';
import { idx, inb } from '../core/util.js';
import { ladderMoves, jumpMoves } from './climbs.js';

const MAX_DROP = 8;   // levels; deeper drops land hard enough to knock the character over

export function makeMoves(ctx) {
  const { cols, floors, nextAbove } = ctx;
  // enough room above floor g for a ball arriving at level h
  const headOK = (g, h) => { const a = nextAbove(g); return !a || a.bottom >= Math.max(h, g.top) + 2; };
  // can a structure occupy column c between levels lo..hi? floors must be clearly below or above
  const colClear = (c, lo, hi, gapSolid) => {
    if (ctx.noCross?.has(c)) return false;   // a great shaft's hole stays open (cubegen/heights.js)
    for (const g of cols[c]) {
      if (g.prot || ((g.siteBlocked || g.hordeReserved) && g.top + 3 > lo && g.bottom < hi + SHEAD)) return false;
      if (g.bottom >= hi + SHEAD) continue;
      if (g.fluid ? (g.surf <= lo - 1) : (g.top <= lo - gapSolid)) continue;
      return false;
    }
    return true;
  };
  const NL = floors.length;
  const nodeOf = new Map();
  const landingAt = (c, h) => {
    const id = NL + c * 64 + h;
    let n = nodeOf.get(id);
    if (!n) { n = { id, c, x: c % N, z: (c / N) | 0, top: h, landing: true, layer: 0 }; nodeOf.set(id, n); }
    return n;
  };
  // a landing is a stone platform at level h: needs free space around it
  const landingOK = (c, h) => {
    if (h > MAX_L || ctx.noCross?.has(c)) return false;
    for (const g of cols[c]) {
      if (g.prot || g.siteBlocked || g.hordeReserved || g.top === h) return false;
      if (g.bottom >= h + SHEAD) continue;
      if (g.top <= h - 1 && (!g.fluid || g.surf <= h - 1)) continue;
      return false;
    }
    return true;
  };

  // walk (incl. 1-2 level slopes) / drop off a cliff / walkway between landings
  function stepMoves(f, d, n, out) {
    const h = f.top;
    if (f.landing) {
      if (landingOK(n, h)) out.push({ kind: 'walkway', from: f, to: landingAt(n, h), d, cells: [], cost: 2.2 });
      return;
    }
    let below = null, walked = false;
    for (const g of cols[n]) {
      if (g.siteBlocked) continue;
      const dh = g.top - h;
      if (Math.abs(dh) <= 2 && !g.fluid && headOK(g, h) && headOK(f, g.top)) {
        out.push({ kind: 'walk', from: f, to: g, d, cells: [], cost: 1 + 0.4 * Math.abs(dh) }); walked = true;
      }
      // deeper only onto something soft: a plunge (cubegen/heights.js)
      if (g.top < h - 2 && (g.top >= h - MAX_DROP || g.soft)) below = g;
    }
    if (!walked && below && !below.fluid && headOK(below, h + 1))
      out.push({ kind: 'drop', from: f, to: below, d, cells: [], cost: below.soft ? 1.2 : 2.2, plunge: h - below.top > MAX_DROP });
  }

  // stairs: k flight cells, then a floor or a new landing; at most 2 levels per cell
  function stairMoves(f, d, allowLandings, out) {
    const [dx, dz] = DIRS[d], h = f.top, flight = [];
    for (let k = 1; k <= 5; k++) {
      const sx = f.x + dx * k, sz = f.z + dz * k, ex = sx + dx, ez = sz + dz;
      if (!inb(ex, ez)) break;
      flight.push(idx(sx, sz));
      const e = idx(ex, ez), targets = [];
      for (const g of cols[e]) if (!g.fluid && !g.siteBlocked && headOK(g, g.top)) targets.push(g);
      if (allowLandings) for (let r = 2 * k; r >= 2 * k - 1; r--) if (r >= 2 && landingOK(e, h + r)) targets.push(landingAt(e, h + r));
      for (const g of targets) {
        const rise = g.top - h, ar = Math.abs(rise);
        if (ar < Math.max(f.landing || g.landing ? 2 : 3, k) || ar > 2 * k) continue;
        let ok = true;
        for (let j = 0; j < k && ok; j++) {
          const a = h + rise * j / k, b = h + rise * (j + 1) / k;
          ok = colClear(flight[j], Math.floor(Math.min(a, b)), Math.ceil(Math.max(a, b)), 0);
        }
        if (ok) out.push({ kind: 'stair', from: f, to: g, d, dx, dz, cells: flight.slice(), cost: 1.5 + k * 1.6 + (g.landing ? 2.5 : 0) });
      }
    }
  }

  // bridges: straight span over fluid or lower ground to a floor, may slope by up to 2 levels
  function bridgeMoves(f, d, out) {
    const [dx, dz] = DIRS[d], h = f.top, span = [];
    for (let k = 1; k <= 7; k++) {
      const cx = f.x + dx * k, cz = f.z + dz * k, ex = cx + dx, ez = cz + dz;
      if (!inb(ex, ez)) break;
      span.push(idx(cx, cz));
      if (!colClear(span[k - 1], h, h, 2)) break;
      for (const g of cols[idx(ex, ez)]) {
        if (g.fluid || g.siteBlocked || Math.abs(g.top - h) > Math.min(2, k)) continue;
        const lo = Math.min(h, g.top), hi = Math.max(h, g.top);
        if (span.every(c => colClear(c, lo, hi, 2)))
          out.push({ kind: 'bridge', from: f, to: g, d, dx, dz, cells: span.slice(), cost: 1.5 + k * 1.1 + Math.abs(g.top - h) * 0.3 });
      }
    }
  }

  function movesFrom(f, allowLandings = true) {
    const out = [];
    if (f.siteBlocked) return out;
    for (let d = 0; d < 4; d++) {
      const nx = f.x + DIRS[d][0], nz = f.z + DIRS[d][1];
      if (!inb(nx, nz)) continue;
      stepMoves(f, d, idx(nx, nz), out);
      stairMoves(f, d, allowLandings, out);
      bridgeMoves(f, d, out);
      if (allowLandings) { ladderMoves(ctx, f, d, idx(nx, nz), out); jumpMoves(ctx, f, d, out); }
    }
    for (const m of ctx.extraMoves?.get(f.id) || []) out.push(m);   // a span's bridge (span.js)
    return out;
  }
  Object.assign(ctx, { headOK, movesFrom, SZ: NL + N * N * 64 });
}
