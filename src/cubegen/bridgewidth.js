// Optional widening of short route bridges. The original one-cell move stays the guaranteed
// way through; a broader footprint is accepted only with equally level banks and ample room
// in every added column. This runs at placement, when other ways' claims are known.
import { N, SHEAD } from '../core/constants.js';
import { hash32, idx } from '../core/util.js';

export function widenBridge(ctx, m, canPlace) {
  // Authored puzzles and climbs keep their intended ways in and out; freestanding landings
  // have no bank beside them. Decorative extras keep their narrow, incidental character.
  if (m.kind !== 'bridge' || m.span || m.from.landing || m.to.landing || ctx.spec.trial || ctx.spec.height || ctx.spec.area || ctx.spec.sparse) return m;
  const roll = hash32(ctx.seed ^ Math.imul(m.from.c + m.to.c, 7919) ^ m.cells.length) % 100;
  const wanted = m.cells.length >= 3 && roll < 5 ? 3 : roll < 40 ? 2 : 1;
  if (wanted === 1) return m;
  const stride = m.dx ? N : 1;
  const shift = (c, off) => {
    const x = c % N + (m.dz ? off : 0), z = Math.floor(c / N) + (m.dx ? off : 0);
    return x > 0 && z > 0 && x < N - 1 && z < N - 1 ? idx(x, z) : null;
  };
  const lo = Math.min(m.from.top, m.to.top), hi = Math.max(m.from.top, m.to.top);
  const bank = (f, off) => {
    const c = shift(f.c, off);
    if (c === null) return false;
    const g = ctx.cols[c].find(g => !g.fluid && !g.siteBlocked && !g.siteClaimTop && !g.hordeReserved && !g.covered && g.layer === f.layer && g.top === f.top);
    return !!g && ctx.headOK(g, g.top) && !ctx.trialKeep?.has(c) && !ctx.noCross?.has(c);
  };
  const laneFits = off => bank(m.from, off) && bank(m.to, off) && m.cells.every(c => {
    const q = shift(c, off);
    if (q === null || ctx.noCross?.has(q) || ctx.trialKeep?.has(q)) return false;
    return ctx.cols[q].every(g => !g.prot && !g.siteBlocked && !g.siteClaimTop && !g.hordeReserved
      && (g.bottom >= hi + SHEAD || (g.fluid ? g.surf <= lo - 2 : g.top <= lo - SHEAD - 1)));
  });
  // Try the broad option first, then either side for an even deck. Both choices preserve
  // the same centreline route; an obstructed extension never invalidates that route.
  const options = wanted === 3 ? [[-1, 0, 1], [0, 1], [-1, 0]] : [[0, 1], [-1, 0]];
  for (const offsets of options) {
    if (!offsets.filter(o => o).every(laneFits)) continue;
    const wide = { ...m, width: offsets.length, lanes: offsets.map(o => m.cells.map(c => c + o * stride)) };
    if (canPlace(wide)) return wide;
  }
  return m;
}
