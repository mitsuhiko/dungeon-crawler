// Route-level encounters, on a separate stream from topology and terrain retries.
import { hash32, mulberry32 } from '../core/util.js';

// the horde's kinds at a depth, and how many it has (lo, hi); a siege's waves are drawn from them too
export const hordeKinds = depth => depth <= 1 ? ['snake'] : depth === 2 ? ['snake', 'spider'] : depth === 3 ? ['frostspider']
  : depth <= 6 ? ['sandviper', 'spider'] : depth <= 8 ? ['spider'] : depth <= 10 ? ['frostspider', 'frostadder']
    : depth <= 12 ? ['bogspider', 'venomadder'] : depth === 13 ? ['venomadder', 'bloodviper'] : depth <= 16 ? ['spider', 'redback']
      : depth === 17 ? ['bloodviper', 'shadowmamba'] : ['redback', 'shadowmamba'];
export const hordeSize = depth => depth === 0 ? [6, 8] : depth <= 4 ? [8, 12] : depth <= 12 ? [12, 18] : [16, 24];

// blocked(key): rooms the horde may not take (a large area's, world/areas.js)
export function planHordes(seed, depth, route, guardians, blocked = () => false) {
  const R = mulberry32(hash32(seed ^ Math.imul(depth + 1, 0x48a7de)));
  const candidates = route.slice(depth === 0 ? 3 : 2, -1).filter(k => !guardians.has(k) && !blocked(k));
  if (!candidates.length) throw new Error(`No horde room at depth ${depth}`);
  const key = candidates[Math.floor(R() * candidates.length)];
  const kinds = hordeKinds(depth), [lo, hi] = hordeSize(depth);
  return new Map([[key, { id: `${seed}:${key}:horde:0`, kind: kinds[Math.floor(R() * kinds.length)],
    count: lo + Math.floor(R() * (hi - lo + 1)) }]]);
}
