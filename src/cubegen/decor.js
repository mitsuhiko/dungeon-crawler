// Decorative extras off the route: a few stairs and bridges that lead nowhere in particular.
// Never onto a spiral's ramp, a lone peak or a trial's ground (their ways up are the ramp and the ladder), nor in a
// large area onto the rim (once both sides are visited its inner faces open, and that would be a
// way into the next cube). Nor a bridge low over ground the character gets to: two levels under
// its deck the body does not fit (cubegen/reach.js isCramped), and that ground may be a way on
// (out of a water onto its only bank).
import { reachFrom } from './reach.js';

export function addDecor(ctx, canPlace, place) {
  const { ri, floors, movesFrom, cols } = ctx;
  if (ctx.spec.sparse) return;   // a mostly empty set piece (cubegen/setpieces.js)
  let seen = null;
  const low = m => {
    if (m.kind !== 'bridge') return false;
    const deck = Math.min(m.from.top, m.to.top);
    return m.cells.some(c => cols[c].some(g => !g.fluid && g.top < deck && deck - g.top <= 2
      && (seen ||= reachFrom(ctx, ctx.portalFloors, false)).has(g.id)));
  };
  // (nor onto a trial's own ground, cubegen/trials/: the flood's summit is climbed by its ramp)
  const off = f => !f.landing && (ctx.ramp?.has(f.c) || ctx.peakTop?.has(f.c) || (ctx.spec.area && ctx.border(f)) || ctx.trialKeep?.has(f.c));
  let ds = ri(1, 3), db = ri(0, 2), tries = 0;
  while ((ds > 0 || db > 0) && tries++ < 300) {
    const f = floors[ri(0, floors.length - 1)];
    if (f.fluid || f.prot) continue;
    const mvs = movesFrom(f, false).filter(m => ((m.kind === 'stair' && ds > 0) || (m.kind === 'bridge' && db > 0)) && !off(m.from) && !off(m.to));
    if (!mvs.length) continue;
    const m = mvs[ri(0, mvs.length - 1)];
    if (!canPlace(m) || low(m)) continue;
    place(m);
    if (m.kind === 'stair') ds--; else db--;
  }
}
