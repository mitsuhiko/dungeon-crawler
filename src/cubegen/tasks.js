// A room task laid over an ordinary room (docs/trials.md "Room tasks", core/tasks.js): where its
// things stand, kept clear and reachable both ways like a spot (cubegen/spots.js), and checked
// with the final slopes and fences. The room is built as any other; the task only claims a few
// cells of it and the ways to them.
//   placeTask   after the route, the reward sites' ways and the spots: picks the cells (the
//               braziers, the shards, the hidden button, the wardstones, the keybearer's post,
//               the beacon's circle and the arches the waves come out of) and builds the ways to
//               them that are missing
//   finishTask  at the end: every cell reached from the way in and leading on to the exit; a
//               brazier, a shard or a wardstone that is not drops out (while enough are left);
//               a kind that cannot be had falls back to the hidden button, which always can.
//               -> { trial (map.trial), reservations (no props there) }
// On a stream of its own: the room's own draws stay as they were.
import { N, HEAD } from '../core/constants.js';
import { idx, inb, hash32, mulberry32 } from '../core/util.js';
import { floorY } from '../core/surfaces.js';
import { search, take } from './route.js';
import { reachTo, reachFrom, isCramped } from './reach.js';
import { arrivals } from './trials/timing.js';
import { PLACE, HIGH, HOLD, fitBurn, COMBAT } from '../core/tasks.js';

const TRIES = 8;   // cells tried (both ways searched) per thing
const AXES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const ROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// the floor a portal (by its face) stands on
const portalFloor = (ctx, dir) => ctx.portalFloors[ctx.portals.findIndex(p => p.dir === dir)] ?? null;

export function placeTask(ctx) {
  const spec = ctx.spec.task;
  ctx.task = null;
  if (!spec || !ctx.portalFloors.length) return;
  const R = mulberry32(hash32(ctx.seed ^ 0x7a5c11));
  const entry = portalFloor(ctx, spec.fromDir ^ 1) || ctx.portalFloors.find(f => f !== ctx.hub) || ctx.portalFloors[0];
  const exit = ctx.hub || entry;
  let kind = spec.kind;
  // a fight with nobody in the room: the hidden button instead
  if (COMBAT.has(kind) && (ctx.spec.enemyFree || ctx.spec.populationScale === 0)) kind = 'hidden';
  const base = { spec, entry, exit, R, things: [], kind };
  ctx.task = place(ctx, base) ?? place(ctx, { ...base, kind: 'hidden' }) ?? { ...base, kind: 'hidden', things: [] };
}

// The cells a task's things may stand on, scored, and the chosen ones with their ways built;
// null: not enough of them
function place(ctx, t) {
  const { kind, entry, exit, R } = t, P = PLACE[kind];
  if (kind === 'clear') return t;
  const portalCells = ctx.portals.flatMap(p => p.cells);
  const nearPortal = (f, r) => portalCells.some(c => Math.abs(c % N - f.x) <= r && Math.abs(((c / N) | 0) - f.z) <= r);
  const runCells = new Set(ctx.moves.flatMap(m => m.cells));
  const routeFloors = [...new Set(ctx.moves.flatMap(m => [m.from, m.to]))];
  const taken = new Set((ctx.spots || []).flatMap(s => s.cells.map(g => g.c)));
  const stand = f => !!f && !f.fluid && !f.prot && !f.landing && !f.roof && !f.site && !f.siteBlocked && !f.hordeReserved && !f.spot
    && !ctx.border(f) && !ctx.ramp?.has(f.c) && !ctx.railed?.has(f.c) && !ctx.soft?.has(f.c) && !ctx.noCross?.has(f.c)
    && !runCells.has(f.c) && !taken.has(f.c) && (!ctx.nextAbove(f) || ctx.nextAbove(f).bottom >= f.top + HEAD + 1) && !nearPortal(f, 1);
  // level ground to stand and fight on (the way may cross it, but nothing built there)
  const level = f => !!f && !f.fluid && !f.prot && !f.landing && !f.roof && !f.site && !f.siteBlocked && !f.hordeReserved && !f.spot
    && !ctx.ramp?.has(f.c) && !ctx.railed?.has(f.c) && !ctx.soft?.has(f.c) && !taken.has(f.c) && !nearPortal(f, 0)
    && (!ctx.nextAbove(f) || ctx.nextAbove(f).bottom >= f.top + HEAD + 1);
  // the floor beside f on its layer, at its height (or `step` levels up or down), that `ok` takes
  const beside = (f, dx, dz, ok = level, step = 0) => {
    if (!inb(f.x + dx, f.z + dz)) return null;
    const g = ctx.cols[idx(f.x + dx, f.z + dz)].find(h => h.layer === f.layer && !h.landing && !h.roof);
    return g && Math.abs(g.top - f.top) <= step && ok(g) ? g : null;
  };
  // how far off the way (cells, a level up or down counting half a cell), and how high over the way in
  const off = f => Math.min(99, ...routeFloors.map(g => Math.max(Math.abs(g.x - f.x), Math.abs(g.z - f.z)) + Math.abs(g.top - f.top) / 2));
  const high = f => f.top - entry.top;
  const portal = f => Math.min(...portalCells.map(c => Math.hypot(c % N - f.x, ((c / N) | 0) - f.z)));
  // room to fight round it: level floors (a level up or down) within 3 cells
  const room = f => ctx.floors.filter(g => g.layer === f.layer && Math.abs(g.top - f.top) <= 1 && Math.hypot(g.x - f.x, g.z - f.z) <= 3 && !g.fluid && !g.prot).length;
  // a nook: walls (a column standing two levels over it, or the cube's edge) round it, a roof over it
  const nook = f => ROUND.filter(([dx, dz]) => !inb(f.x + dx, f.z + dz) || ctx.cols[idx(f.x + dx, f.z + dz)].some(g => g.layer === f.layer && g.top >= f.top + 2)).length
    + (ctx.nextAbove(f) && ctx.nextAbove(f).bottom <= f.top + HEAD + 4 ? 3 : 0);
  const fromEntry = reachFrom(ctx, [entry], false), toExit = reachTo(ctx, exit, false);
  // the ways to a cell and back (built where missing); true: it can be had
  const reach = f => {
    if (fromEntry.has(f.id) && toExit.has(f.id)) return true;
    const there = search(ctx, entry, f, ctx.jitter, ctx.have), back = there && search(ctx, f, exit, ctx.jitter, ctx.have);
    if (!back || [...there, ...back].some(m => m.cells.includes(f.c))) return false;
    take(ctx, there); take(ctx, back);
    for (const m of ctx.moves) for (const c of m.cells) runCells.add(c);
    return true;
  };
  const claim = cells => { for (const g of cells) { taken.add(g.c); g.spot = g.spot ?? `task:${t.spec.key}`; g.siteClaimTop = Math.max(g.siteClaimTop ?? 0, g.top + HEAD); } };
  const jitter = () => R() * 1.5;
  if (kind === 'hold') {
    // the beacon's circle: three by three level cells round the beacon, near the exit (or the room's
    // middle in a branch), and two dark arches at the room's edge the waves come out of
    const exitPad = t.spec.exit != null ? portalFloor(ctx, t.spec.exit) : null;
    const options = [];
    for (const f of ctx.floors) {
      if (!level(f) || runCells.has(f.c) || nearPortal(f, 1)) continue;
      const ring = ROUND.map(([dx, dz]) => beside(f, dx, dz, level, 1)).filter(Boolean);
      if (ring.length < 6) continue;
      const d = exitPad ? Math.hypot(exitPad.x - f.x, exitPad.z - f.z) : Math.hypot(f.x - 7.5, f.z - 7.5);
      if (exitPad && (d < 2.5 || d > 9 || Math.abs(exitPad.top - f.top) > 6)) continue;
      options.push({ f, ring, s: Math.abs(d - (exitPad ? 4.5 : 0)) + Math.abs((exitPad ?? f).top - f.top) * 0.3 + (8 - ring.length) * 0.5 + jitter() });
    }
    options.sort((a, b) => a.s - b.s);
    for (const o of options.slice(0, TRIES)) {
      if (!reach(o.f)) continue;
      const mouths = [], centre = o.f;
      const edge = g => Math.min(g.x, g.z, N - 1 - g.x, N - 1 - g.z);
      const cand = ctx.floors.filter(g => stand(g) && edge(g) <= 2 && Math.hypot(g.x - centre.x, g.z - centre.z) >= 6 && !nearPortal(g, 3))
        .map(g => ({ g, s: -Math.hypot(g.x - centre.x, g.z - centre.z) * 0.3 + jitter() })).sort((a, b) => a.s - b.s).map(q => q.g);
      const theirs = reachTo(ctx, centre, false);
      for (const g of cand) {
        if (mouths.length >= 2) break;
        if (!theirs.has(g.id) || mouths.some(m => Math.hypot(m.x - g.x, m.z - g.z) < 5)) continue;
        mouths.push(g);
      }
      if (mouths.length < 2) continue;
      claim([centre, ...mouths]);   // (the circle round it is ground as it is: slopes a level up or down)
      return { ...t, things: [centre], ring: o.ring, mouths };
    }
    return null;
  }
  // one or more things, each on a cell of its own, spread out
  const score = {
    // hidden: off the way, far from the portals, in a nook, up high
    hidden: f => Math.min(off(f), 6) * 0.8 + Math.min(portal(f), 8) * 0.3 + nook(f) * 0.7 + Math.max(0, high(f)) * 0.25,
    lanterns: f => Math.min(off(f), 5) * 0.5 + Math.max(0, high(f)) * 0.15,
    fading: f => Math.min(off(f), 4) * 0.4,
    shards: f => Math.min(off(f), 6) * 0.6 + Math.max(0, high(f)) * 0.4 + nook(f) * 0.15,
    wardstones: f => Math.min(room(f), 18) * 0.2 + Math.min(portal(f), 8) * 0.3,
    keybearer: f => Math.min(room(f), 20) * 0.2 + Math.min(Math.hypot(f.x - entry.x, f.z - entry.z), 10) * 0.3,
  }[kind];
  const fights = kind === 'wardstones' || kind === 'keybearer';
  const options = ctx.floors.filter(f => stand(f) && (!fights || (portal(f) >= 4 && room(f) >= 7 && AXES.filter(([dx, dz]) => beside(f, dx, dz)).length >= 3)))
    .map(f => ({ f, s: score(f) + jitter() })).sort((a, b) => b.s - a.s);
  const n = P.n[0] + Math.floor(R() * (P.n[1] - P.n[0] + 1)), things = [];
  const spread = f => things.every(g => Math.hypot(g.x - f.x, g.z - f.z) + Math.abs(g.top - f.top) * 0.3 >= P.apart);
  // the first of them the farthest off the way (it may need its way built), the rest spread out
  const isOff = f => off(f) >= P.off || high(f) >= HIGH;
  let tries = 0;
  for (const o of options) {
    if (things.length >= n || tries > TRIES * n) break;
    if (!spread(o.f) || (P.off && !things.length && !isOff(o.f))) continue;
    tries++;
    if (!reach(o.f)) continue;
    things.push(o.f);
  }
  if (things.length < n) return null;
  claim(things);
  return { ...t, things };
}

// the beacon's circle, with the final slopes: most of it got to from the way in, and the waves'
// arches leading to its middle (an enemy's way)
function holdBroken(ctx, t, fromEntry) {
  t.ring = t.ring.filter(g => !g.fluid && fromEntry.has(g.id));
  const toCentre = reachTo(ctx, t.things[0], true);
  return t.ring.length < 5 || t.mouths.some(g => g.fluid || ctx.pieces[g.c].length || !toCentre?.has(g.id));
}

// at the middle of floor f (its y on the floor's own slope)
const at = f => ({ x: f.x + 0.5, y: floorY(f, 0.5, 0.5), z: f.z + 0.5 });

export function finishTask(ctx) {
  const t = ctx.task;
  if (!t) return { trial: null, reservations: [] };
  const { spec, entry, exit } = t;
  const toExit = reachTo(ctx, exit, true), fromEntry = reachFrom(ctx, [entry], true);
  const ok = f => !!f && toExit?.has(f.id) && fromEntry.has(f.id) && !f.fluid && !ctx.pieces[f.c].length && !f.siteBlocked && !isCramped(ctx, f)
    && Math.max(...f.cs) - Math.min(...f.cs) < 0.2;
  let kind = t.kind, things = t.things.filter(ok);
  const least = { lanterns: 2, fading: 2, shards: 2, wardstones: 1 }[kind] ?? t.things.length;
  if (things.length < least || (kind === 'hold' && (things.length < 1 || holdBroken(ctx, t, fromEntry)))) {
    // fall back to the hidden button, on the best cell that can be had both ways
    kind = 'hidden';
    const f = t.kind === 'hidden' && things[0] || ctx.floors.filter(f => !f.landing && ok(f) && !f.spot && f !== entry && f !== exit)
      .sort((a, b) => Math.hypot(b.x - entry.x, b.z - entry.z) - Math.hypot(a.x - entry.x, a.z - entry.z))[0] || entry;
    things = [f];
  }
  for (const f of things) f.noSpawn = true;
  const out = { id: spec.id, key: spec.key, kind, task: true, planned: spec.kind, role: spec.role, gate: spec.gate, from: spec.from, fromDir: spec.fromDir,
    entry: spec.fromDir ^ 1, exit: spec.exit, entryFloor: entry.id, exitFloor: exit.id, parts: [], start: {} };
  const reservations = things.map(f => ({ c: f.c, layer: f.layer }));
  if (kind === 'lanterns' || kind === 'fading') {
    out.parts = things.map((f, i) => ({ id: `lantern${i}`, type: 'lantern', i, f: f.id, ...at(f) }));
    if (kind === 'fading') {
      // the fastest round of them, from whichever is lit first to the last (each a USE_TIME): the
      // burn fitted to a slow player's
      const legs = things.map(f => arrivals(ctx, f).time);
      let tour = Infinity;
      const go = (from, left, sum) => {
        if (sum >= tour) return;
        if (!left.length) { tour = sum; return; }
        for (const j of left) { const d = legs[from].get(things[j].id); if (d != null) go(j, left.filter(k => k !== j), sum + d); }
      };
      things.forEach((_, i) => go(i, things.map((__, j) => j).filter(j => j !== i), 0));
      if (!Number.isFinite(tour)) tour = 20;
      out.burn = fitBurn(tour, things.length);
      out.check = { tour: Math.round(tour * 100) / 100, burn: out.burn };
    }
  }
  if (kind === 'shards') out.parts = things.map((f, i) => ({ id: `shard${i}`, type: 'shard', i, f: f.id, ...at(f) }));
  if (kind === 'hidden') out.parts = [{ id: 'hidden', type: 'hidden', f: things[0].id, ...at(things[0]) }];
  if (kind === 'wardstones') out.wards = things.map((f, i) => ({ i, f: f.id, ...at(f) }));
  if (kind === 'keybearer') out.bearer = { f: things[0].id, ...at(things[0]), yaw: Math.atan2(entry.x - things[0].x, entry.z - things[0].z) };
  if (kind === 'hold') {
    const c = at(things[0]);
    out.parts = [{ id: 'beacon', type: 'beacon', f: things[0].id, ...c }];
    out.ring = { x: c.x, z: c.z, y: c.y, r: HOLD.radius, cells: t.ring.map(g => g.id) };
    out.mouths = t.mouths.map(g => ({ ...at(g), f: g.id, yaw: Math.atan2(c.x - g.x - 0.5, c.z - g.z - 0.5) }));
    for (const g of [...t.ring, ...t.mouths]) { g.noSpawn = true; reservations.push({ c: g.c, layer: g.layer }); }
  }
  ctx.stats.task = kind;
  return { trial: out, reservations };
}
