// Ways out: every floor the character can get to from a portal must lead back to the exit. A pit you can drop into but not climb out of gets a
// route of its own (ladders, stairs, bridges) to the nearest floor that does lead on. Escapes
// that do not fit are dropped again by placement; falls are still moved by game/fall.js.
// So does every water the character can get into (they swim, physics/move.js): a body of water
// whose banks all stand more than a level over its surface (the most a swimmer climbs out:
// cubegen/reach.js) gets a ladder up out of it (addWaterEscapes); cubegen/index.js checks that
// every water got to leads out.
import { N, DIRS, WATER } from '../core/constants.js';
import { idx, inb } from '../core/util.js';
import { graph, reachFrom, reachTo, stuckInWater } from './reach.js';
import { search, take, moveKey } from './route.js';

const MAX = 12;          // escape routes per cube
const ACCESS = 8;        // ways onto cut-off platforms per cube
// floors a cut-off platform needs to be worth a way up: floating platforms (upper layers)
// look like places to go; on the ground most are scenery (mesa tops, crater rims)
const ACCESS_MIN = 8, ACCESS_MIN_GROUND = 40;
const TWO_WAY = mv => mv.kind !== 'drop' && mv.kind !== 'jump';

// floor ids the character can get to from the portals (a fall in from the cube above does not
// leave you here: game/fall.js puts you back where the fall started)
export const reachable = (ctx, real) => reachFrom(ctx, ctx.portalFloors, real);

// Platforms and plateaus nothing leads onto: the bigger ones get a way up (searched from the
// platform down to where the character can go, over moves that work both ways). Their way
// back out is left to addEscapes.
export function addAccess(ctx) {
  const { hub, floors, jitter, have } = ctx;
  if (!hub) return;
  ctx.bigLadders = true;
  // never onto the cube's rim, nor from the foot of a spiral's mountain (cubegen/areas.js: the way up is the ramp)
  const stand = f => f && !f.fluid && !f.prot && !f.siteBlocked && !f.landing && !ctx.border(f) && !ctx.foot?.has(f.c);
  const failed = new Set();
  for (let n = 0; n < ACCESS; n++) {
    const seen = reachable(ctx, false), adj = graph(ctx, false), und = new Map();
    const link = (a, b) => { let s = und.get(a); if (!s) und.set(a, s = []); s.push(b); };
    for (const [a, bs] of adj) for (const b of bs) { link(a, b.id); link(b.id, a); }
    // the biggest platform nobody reaches yet
    let best = null;
    const done = new Set();
    for (const f of floors) {
      if (!stand(f) || seen.has(f.id) || done.has(f.id) || failed.has(f.id)) continue;
      const comp = [f], set = new Set([f.id]);
      const grow = g => { if (!set.has(g.id) && stand(g) && !seen.has(g.id)) { set.add(g.id); comp.push(g); } };
      for (let i = 0; i < comp.length; i++) {
        const g = comp[i];
        for (const id of und.get(g.id) || []) grow(floors[id]);
        // steps of up to two levels mostly turn into slopes when smoothing: one platform
        for (const [dx, dz] of DIRS) if (inb(g.x + dx, g.z + dz))
          for (const h of ctx.cols[idx(g.x + dx, g.z + dz)]) if (Math.abs(h.top - g.top) <= 2) grow(h);
      }
      comp.forEach(g => done.add(g.id));
      const floating = comp.filter(g => g.layer > 0).length;
      if ((floating >= ACCESS_MIN || comp.length >= ACCESS_MIN_GROUND) && (!best || comp.length > best.length)) best = comp;
    }
    if (!best) break;
    // from its lowest floor: the shortest climb
    const from = best.reduce((a, b) => b.top < a.top ? b : a);
    const seg = search(ctx, from, f => seen.has(f.id), jitter, have, TWO_WAY);
    if (!take(ctx, seg)) { best.forEach(g => failed.add(g.id)); continue; }
    ctx.stats.access = (ctx.stats.access || 0) + 1;
  }
  ctx.bigLadders = false;
}

export function addEscapes(ctx) {
  const { hub, floors, jitter, have } = ctx;
  if (!hub) return;
  ctx.bigLadders = true;
  const failed = new Set();
  for (let n = 0; n < MAX; n++) {
    const safe = reachTo(ctx, hub, false), seen = reachable(ctx, false);
    // the deepest trapped floor first: pits drain downwards, so it is usually the one the rest
    // of its trap ends up in, and its way out frees them too
    let from = null;
    for (const id of seen) {
      const f = floors[id];
      if (!f || f.fluid || f.prot || f.siteBlocked || safe.has(id) || failed.has(id)) continue;
      if (!from || f.top < from.top) from = f;
    }
    if (!from) break;
    // (in a large area never up onto the rim: once visited its inner faces open, the rim is the next
    // cube's edge too)
    const seg = search(ctx, from, f => safe.has(f.id) && !(ctx.spec.area && !f.landing && ctx.border(f) && !f.prot), jitter, have);
    if (!take(ctx, seg)) { failed.add(from.id); continue; }
    ctx.stats.escapes = (ctx.stats.escapes || 0) + 1;
  }
  ctx.bigLadders = false;
}

// The water floors joined to water floor w at its surface (on its layer), by the four sides
function waterBody(ctx, w) {
  const body = [w], seen = new Set([w.id]);
  for (let i = 0; i < body.length; i++) {
    const f = body[i];
    for (const [dx, dz] of DIRS) {
      if (!inb(f.x + dx, f.z + dz)) continue;
      for (const g of ctx.cols[idx(f.x + dx, f.z + dz)]) if (g.fluid === WATER && g.surf === f.surf && !seen.has(g.id)) { seen.add(g.id); body.push(g); }
    }
  }
  return body;
}

// Water the character can get into but not out of (no bank low enough to climb out onto): a
// ladder up out of it, from the water onto a bank (the lowest climb onto one that leads on to the
// exit, else onto any, whose way on addEscapes then finds), standing in the water against the
// bank's wall (map.ladders `wet`: physics/climb.js takes hold of it swimming)
const WET_RISE = 24;
export function addWaterEscapes(ctx) {
  const { hub, floors, jitter } = ctx;
  if (!hub || ctx.spec.trial) return 0;   // (a trial room's fluid is the trial's: game/trials.js sweptAway)
  const failed = new Set();
  let added = 0;
  for (let n = 0; n < MAX; n++) {
    const safe = reachTo(ctx, hub, false), seen = reachable(ctx, false), stuck = stuckInWater(ctx, false);
    const from = [...seen].map(id => floors[id]).find(f => f && stuck.has(f.id) && !failed.has(f.id));
    if (!from) break;
    const body = waterBody(ctx, from);
    body.forEach(f => failed.add(f.id));
    let best = null;
    for (const w of body) {
      if (w.siteBlocked || w.prot) continue;
      const above = ctx.nextAbove(w);
      for (let d = 0; d < 4; d++) {
        const nx = w.x + DIRS[d][0], nz = w.z + DIRS[d][1];
        if (!inb(nx, nz)) continue;
        for (const g of ctx.cols[idx(nx, nz)]) {
          const rise = g.top - w.surf;
          if (g.fluid || g.siteBlocked || g.landing || rise < 2 || rise > WET_RISE) continue;
          if (above && above.bottom < g.top + 3) continue;   // room to climb all the way up
          if (g.bottom > w.top + 1 || !ctx.headOK(g, g.top)) continue;   // a wall behind it, down into the water
          const cost = rise + (safe.has(g.id) ? 0 : 20) + jitter[g.id];
          if (!best || cost < best.cost) best = { cost, move: { kind: 'ladder', from: w, to: g, d, cells: [], lo: w, hi: g, hang: false, wet: true, cost: 1.6 + 0.2 * rise } };
        }
      }
    }
    if (!best) continue;
    // (a move of its own, not a route: the routes keep out of the water)
    const key = moveKey(best.move);
    if (!ctx.have.has(key)) { ctx.have.add(key); ctx.moves.push(best.move); }
    ctx.stats.waterEscapes = (ctx.stats.waterEscapes || 0) + 1;
    added++;
  }
  return added;
}

// Clear water rarely stands deep everywhere: its cells next to a bank (or any other ground) have
// their bed a level under the surface, waded through (physics/move.js: shallower than SWIM_DEPTH);
// only those with water all round them keep theirs two under it, deep enough to swim. Raising a
// bed only thickens its slab. (Before the moves: a route never walks on a fluid floor.)
export function shoalWater(ctx) {
  if (ctx.spec.trial) return;   // (a trial room's fluids are its own: cubegen/trials/)
  const wet = (x, z, f) => !inb(x, z) || ctx.cols[idx(x, z)].some(g => g.fluid === WATER && g.surf === f.surf && g.layer === f.layer);
  for (const col of ctx.cols) for (const f of col) {
    if (f.fluid !== WATER || f.crust || f.top !== f.surf - 2) continue;
    let open = true;
    for (let dz = -1; dz <= 1 && open; dz++) for (let dx = -1; dx <= 1; dx++) if ((dx || dz) && !wet(f.x + dx, f.z + dz, f)) { open = false; break; }
    if (!open) f.top = f.surf - 1;
  }
}

// Water is walked into and out of: where ground beside it stands a level over its surface, that
// ground comes down level with it (a shore), on the ground layer, inside the cube's outer ring
// (shared with the neighbours), but for what is kept as it is (portal pads, sites, spots, a horde's
// camp, a ramp, the big height pieces' cells), ground beside other water that stands higher, and a
// ridge with lower ground behind it (it holds the water: brought down, its slopes would sag under it).
// Pools are made level with their lowest bank already (cubegen/river.js, pools.js, cascades.js);
// this gives rivers, seas and lakes their shores, and pools more of them.
export function shoreWater(ctx) {
  if (ctx.spec.trial) return;   // (a trial room's fluids are its own: cubegen/trials/)
  const inner = (x, z) => x > 0 && z > 0 && x < N - 1 && z < N - 1;
  const kept = g => g.prot || g.site || g.siteBlocked || g.siteDressing || g.spot || g.ramp || g.landing || g.hordeReserved
    || ctx.keep?.has(g.c) || ctx.siteSpace?.has(g.c) || ctx.noCross?.has(g.c);
  const waterBeside = g => DIRS.flatMap(([dx, dz]) => inb(g.x + dx, g.z + dz) ? ctx.cols[idx(g.x + dx, g.z + dz)].filter(w => w.fluid) : []);
  for (const col of ctx.cols) for (const f of col) {
    if (f.fluid !== WATER || f.crust) continue;
    for (const [dx, dz] of DIRS) {
      const x = f.x + dx, z = f.z + dz;
      if (!inner(x, z)) continue;
      const g = ctx.cols[idx(x, z)].find(h => !h.fluid && h.layer === 0 && h.top === f.surf + 1 && h.bottom < f.surf);
      if (!g || kept(g) || waterBeside(g).some(w => w.surf > f.surf || w.fluid !== WATER)) continue;
      // (not a ridge: the ground behind it as high as the water, or its slopes would sag under it)
      if (DIRS.some(([ex, ez]) => !inb(g.x + ex, g.z + ez) || ctx.cols[idx(g.x + ex, g.z + ez)].some(h => !h.fluid && h.layer === 0 && h.top < f.surf))) continue;
      g.top = f.surf;
    }
  }
}
