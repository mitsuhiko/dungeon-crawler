// The cube's spots (world/spots.js planned which kind, and how hidden): where exactly they lie,
// kept clear and reachable both ways, like a reward site. Placed once the route and the reward
// sites have their ways (so a spot never takes their room), before the structures, which make
// room for the ways to the spots too.
//   hide  one cell: a thing or a person may be found there
//   seat  two cells: where an NPC stands (`anchor`) and, in front, where you stand to talk
//         (`approach`)
//   camp  a fire (`anchor`) and the four cells beside it: three people around it (`places`),
//         the fourth side the approach (with the corners between them that are level too)
//   outpost  three by three level cells, a supply cart in the middle (`anchor`, it blocks), its
//         keeper on one side (`places`), the approach on another, and room to fight round it
//   glass one cell, like a hiding place: where a bubble of the glassmaker's glass floats
//         (game/intro.js); the one on the way (`way`) close by it, the other hidden like a hide
// A spot's floors are flat, dry, under open sky or enough headroom, off portal pads, reward
// sites and the horde's patch, and nothing is built on them (they claim their space against
// structures, smoothing keeps them flat, props and enemies keep off them). One that does not
// fit is a failure the generator tries again for, like a reward site's.
import { N, HEAD } from '../core/constants.js';
import { idx, inb, hash32, mulberry32 } from '../core/util.js';
import { floorY } from '../core/surfaces.js';
import { search, take } from './route.js';
import { reachTo, reachFrom, isCramped } from './reach.js';

const ORDER = { outpost: 0, camp: 1, seat: 2, hide: 3, glass: 4 };   // (the glass last: the others lie where they did before it)
const ROOM = 10;   // level floors (a level up or down) within 4 cells an outpost needs to fight on (more is better)
const TRIES = 10;   // footprints tried (both ways searched) per spot
const AXES = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function placeSpots(ctx) {
  ctx.spots = []; ctx.spotFailures = [];
  const plans = [...(ctx.spec.spots || [])].sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
  if (!plans.length || !ctx.portalFloors.length) { for (const s of plans) ctx.spotFailures.push({ id: s.id, kind: s.kind, reason: 'no way in' }); return; }
  const portalCells = ctx.portals.flatMap(p => p.cells);
  const nearPortal = (f, r) => portalCells.some(c => Math.abs(c % N - f.x) <= r && Math.abs(((c / N) | 0) - f.z) <= r);
  // cells on the way's structures (stairs, bridges) and those of the route's floors
  const runCells = new Set(ctx.moves.flatMap(m => m.cells));
  const onRoute = new Set(ctx.moves.flatMap(m => [m.from.id, m.to.id]));
  const routeCells = new Set(ctx.moves.flatMap(m => [m.from.c, m.to.c]));
  const byRoute = cells => cells.some(g => AXES.some(([dx, dz]) => inb(g.x + dx, g.z + dz) && routeCells.has(idx(g.x + dx, g.z + dz))));
  const taken = new Set();
  const stand = f => !!f && !f.fluid && !f.prot && !f.landing && !f.roof && !f.site && !f.siteBlocked && !f.hordeReserved
    && !ctx.border(f) && !ctx.ramp?.has(f.c) && !ctx.railed?.has(f.c) && !ctx.soft?.has(f.c)
    && !ctx.noCross?.has(f.c) && !runCells.has(f.c) && !taken.has(f.c)
    && (!ctx.nextAbove(f) || ctx.nextAbove(f).bottom >= f.top + HEAD + 1) && !nearPortal(f, 1);
  // the floor beside f at the same height, on its layer
  const beside = (f, dx, dz) => {
    if (!inb(f.x + dx, f.z + dz)) return null;
    const g = ctx.cols[idx(f.x + dx, f.z + dz)].find(h => h.layer === f.layer && !h.landing && !h.roof);
    return g && g.top === f.top && stand(g) ? g : null;
  };
  const entry = ctx.portalFloors.find(f => f !== ctx.hub) || ctx.hub || ctx.portalFloors[0], exit = ctx.hub || entry;
  const fromEntry = reachFrom(ctx, [entry], false), toExit = reachTo(ctx, exit, false);
  for (const plan of plans) {
    const R = mulberry32(hash32(ctx.seed ^ plan.seed)), options = [];
    for (const f of ctx.floors) {
      if (!stand(f)) continue;
      // the footprint: its floors, where you come to it from, and (a camp) the places around it
      let cells, access, places = [];
      if (plan.kind === 'hide' || plan.kind === 'glass') { cells = [f]; access = f; }
      else if (plan.kind === 'seat') {
        const d = Math.floor(R() * 4), [dx, dz] = AXES[d], g = beside(f, dx, dz);
        if (!g) continue;
        cells = [f, g]; access = g;
      } else if (plan.kind === 'outpost') {
        if (onRoute.has(f.id)) continue;   // (the cart stands there: not on the way itself)
        const ring = [];
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx || dz) ring.push(beside(f, dx, dz));
        if (ring.some(g => !g)) continue;
        let room = 0;
        for (const g of ctx.floors) if (g.layer === f.layer && Math.abs(g.top - f.top) <= 1 && Math.hypot(g.x - f.x, g.z - f.z) <= 4 && !g.fluid && !g.prot) room++;
        if (room < ROOM) continue;
        cells = [f, ...ring]; cells.room = room;
        const sides = AXES.map(([dx, dz]) => beside(f, dx, dz)), open = Math.floor(R() * 4);
        access = sides[open]; places = [sides[(open + 2) % 4]];
      } else {
        // the fire and the four cells beside it (and the corners that are level with it)
        const sides = AXES.map(([dx, dz]) => beside(f, dx, dz));
        if (sides.some(g => !g)) continue;
        const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([dx, dz]) => beside(f, dx, dz)).filter(Boolean);
        cells = [f, ...sides, ...corners];
        const open = Math.floor(R() * 4);
        access = sides[open]; places = sides.filter((_, i) => i !== open);
      }
      // hidden ones away from the way and the portals (the hardest ones up high), seats and
      // camps close to the way, a camp near where you come in
      const portal = Math.min(...portalCells.map(c => Math.hypot(c % N - f.x, ((c / N) | 0) - f.z)));
      const score = plan.kind === 'glass' && plan.way ? -Math.abs(portal - 5) + (byRoute(cells) ? 3 : 0) + (onRoute.has(f.id) ? -2 : 0)
        : plan.kind === 'hide' || plan.kind === 'glass' ? (onRoute.has(f.id) ? -4 : 0) + Math.min(portal, 8) * 0.5 + (plan.tier >= 3 ? f.top * 0.6 : 0)
        : plan.kind === 'seat' ? -Math.abs(portal - 5) + (cells.some(g => onRoute.has(g.id)) ? -1 : 0) + (byRoute(cells) ? 2 : 0)
        : plan.kind === 'outpost' ? -Math.abs(portal - 5) + (byRoute(cells) ? 2 : 0) + Math.min(cells.room, 30) * 0.25
        : -Math.abs(Math.hypot(entry.x - f.x, entry.z - f.z) - 4);
      // level ground all round stays level when smoothed
      let flat = 0;
      for (const g of cells) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const h = inb(g.x + dx, g.z + dz) && ctx.cols[idx(g.x + dx, g.z + dz)].find(q => q.layer === g.layer);
        if (h && h.top === g.top) flat++;
      }
      options.push({ f, cells, access, places, score: score + flat / cells.length * 0.4 + R() * 2 });
    }
    options.sort((a, b) => b.score - a.score);
    // first where the character gets to and back from anyway (on the route's own structures,
    // walking, stepping up a level and dropping), then where the way needs building
    let placed = null;
    for (const o of options) if (fromEntry.has(o.access.id) && toExit.has(o.access.id) && !o.cells.some(g => taken.has(g.c))) { placed = o; break; }
    for (const o of placed ? [] : options.slice(0, TRIES)) {
      if (o.cells.some(g => taken.has(g.c))) continue;
      const there = search(ctx, entry, o.access, ctx.jitter, ctx.have), back = there && search(ctx, o.access, exit, ctx.jitter, ctx.have);
      // the ways there must not run over the spot's own cells with a structure
      if (!back || [...there, ...back].some(m => m.cells.some(c => o.cells.some(g => g.c === c)))) continue;
      take(ctx, there); take(ctx, back);
      placed = o; break;
    }
    if (!placed) { ctx.spotFailures.push({ id: plan.id, kind: plan.kind, reason: 'no footprint' }); continue; }
    for (const g of placed.cells) {
      taken.add(g.c);
      // flat, nothing built over it up to a head's room, nothing put on it
      g.spot = plan.id; g.siteClaimTop = Math.max(g.siteClaimTop ?? 0, g.top + HEAD);
    }
    for (const m of ctx.moves) for (const c of m.cells) runCells.add(c);
    ctx.spots.push({ plan, ...placed, entry, exit });
  }
  // (the ways that need building are not required of the structures: one that does not fit
  // leaves its spot cut off, and the generator tries again; making them required would make the
  // route's ways back required too)
}

// The spots as the map carries them, checked with the final slopes and fences: reachable both
// ways, flat, and nothing built on them. The camp's fire and pack (as site placements).
export function finishSpots(ctx) {
  const spots = [], placements = [], blockers = [];
  const at = (f, yaw = 0) => ({ x: f.x + 0.5, y: floorY(f, 0.5, 0.5), z: f.z + 0.5, yaw });
  for (const s of ctx.spots || []) {
    const { plan, f, cells, access, places } = s;
    const reachable = reachTo(ctx, access, true)?.has(s.entry.id) && reachTo(ctx, s.exit, true)?.has(access.id);
    const clear = cells.every(g => !ctx.pieces[g.c].length && !g.fluid && !g.siteBlocked && !isCramped(ctx, g)
      && Math.max(...g.cs) - Math.min(...g.cs) < 0.2);
    if (!reachable || !clear) { ctx.spotFailures.push({ id: plan.id, kind: plan.kind, reason: reachable ? 'not clear' : 'approach or return blocked' }); continue; }
    // somebody standing there (where a seat's NPC or a hidden person stands, a camp's places)
    // must not block the way: every portal still leads to the exit around them
    const stood = plan.kind === 'camp' ? places : plan.kind === 'outpost' ? [f, ...places] : [f], was = stood.map(g => g.siteBlocked);
    for (const g of stood) g.siteBlocked = true;
    const safe = reachTo(ctx, s.exit, true), around = ctx.portalFloors.every(p => safe?.has(p.id))
      && (plan.kind === 'hide' || plan.kind === 'glass' || safe?.has(access.id) && reachTo(ctx, access, true)?.has(s.entry.id));
    stood.forEach((g, i) => { g.siteBlocked = was[i]; });
    // (an outpost's cart stands on its cell: not on one the route's ways go over either)
    const onRoute = plan.kind === 'outpost' && (ctx.segments || []).some(sg => sg.some(m => m.from === f || m.to === f || m.cells.includes(f.c)));
    if (!around || onRoute) { ctx.spotFailures.push({ id: plan.id, kind: plan.kind, reason: 'in the way' }); continue; }
    // facing the one who comes to talk (a seat), the fire (a camp's places)
    const face = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
    const anchor = at(f, plan.kind === 'seat' ? face(f, access) : 0), approach = at(access, face(access, f));
    spots.push({ id: plan.id, kind: plan.kind, tier: plan.tier, depth: plan.depth, seed: plan.seed, layer: f.layer,
      ...plan.kind === 'glass' ? { glass: plan.glass, way: plan.way, ...plan.part ? { part: plan.part } : {} } : {},
      cells: cells.map(g => g.c), floor: f.id, accessFloor: access.id, anchor, approach,
      places: places.map(g => at(g, face(g, f))) });
    if (plan.kind === 'outpost') {
      // the cart blocks its cell (the way round it was checked with it there); a pack on a corner
      const R = mulberry32(plan.seed), corner = cells.slice(1).find(g => g.x !== f.x && g.z !== f.z && !places.includes(g));
      const yaw = Math.floor(R() * 4) * Math.PI / 2, cart = at(f, yaw);
      placements.push({ name: 'mines_ore_cart_a', ...cart, s: 1, spot: plan.id });
      blockers.push({ x: cart.x, z: cart.z, r: 0.42, bottom: cart.y, top: cart.y + 0.9, spot: plan.id });
      f.siteBlocked = true; f.siteBlockTop = f.top + 2;
      if (corner) placements.push({ name: 'relics_abandoned_pack_a', ...at(corner, face(corner, f)), s: 1, spot: plan.id });
    }
    if (plan.kind === 'camp') {
      const R = mulberry32(plan.seed), corner = cells.slice(1).find(g => g.x !== f.x && g.z !== f.z && g !== access);
      placements.push({ name: R() < 0.5 ? 'relics_old_campfire_a' : 'relics_old_campfire_b', ...at(f, R() * Math.PI * 2), s: 1, spot: plan.id });
      if (corner) placements.push({ name: 'relics_abandoned_pack_a', ...at(corner, face(corner, f)), s: 1, spot: plan.id });
    }
  }
  ctx.stats.spots = spots.length; ctx.stats.requestedSpots = (ctx.spec.spots || []).length;
  return { spots, spotPlacements: placements, spotBlockers: blockers, spotFailures: ctx.spotFailures || [] };
}
