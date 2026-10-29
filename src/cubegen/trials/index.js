// A trial room's shape and parts (docs/trials.md), built from spec.trial (world/trials.js) into
// map.trial. The stages, in the generator's order (cubegen/index.js):
//   shapeTrial    the room's big shape (the archetype 'trial'), one module per kind
//   trialCosts    before the route search: what the kind makes its ways cost
//   routeTrial    after the route: the way to the trial's goal from the entry (and on to the
//                 exit) is searched and kept, so what it needs gets built
//   finishTrial   at the end, with the final slopes and fences: the goal must be reachable from
//                 the entry and lead on to the exit, and the kind's own check must pass (the
//                 timing of an event, cubegen/trials/timing.js); else the attempt is retried
import { N, LH, RUN_SPEED, CHAR_H } from '../../core/constants.js';
import { idx } from '../../core/util.js';
import { floorY } from '../../core/surfaces.js';
import { search, take } from '../route.js';
import { reachFrom, reachTo, graph } from '../reach.js';
import { shapeFlood, floodGoal, floodRoute } from './flood.js';
import { shapeCollapse, collapseGoal, collapseRoute } from './collapse.js';
import { shapeBalance, balanceGoal, balanceRoute, balanceSlabs } from './balance.js';
import { puzzleGoal, slideRoute } from './slide.js';
import { shapeSunken, sunkenGoal } from './sunken.js';
import { gridRecord } from './grid.js';
import { shapePuzzle } from './puzzles.js';
import { RIM } from './deck.js';
import { shapeTimed, timedGoal, timedRoute } from './timed.js';
import { shapeMiasma, miasmaGoal } from './miasma.js';
import { shapeCold, coldGoal, coldRoute } from './cold.js';
import { shapeStorm, stormGoal, stormRoute } from './storm.js';
import { shapeSiege, siegeGoal, RING } from './siege.js';
import { shapeChase, chaseGoal, chaseRoute } from './chase.js';
import { arrivals, pathOf, checkDeadlines, floorLevel, USE_TIME } from './timing.js';
import { ARM_TIME, SLACK, REACT, slowTime, fitFlood, floodTime, FLOOD, WAVE, crumbleTime, FOG, COLD, STORM, stormAllowance, HUNTER, runeOrder } from '../../core/trials.js';

const KINDS = {
  flood: { shape: shapeFlood, goal: floodGoal, costs: floodRoute, finish: finishFlood },
  collapse: { shape: shapeCollapse, goal: collapseGoal, costs: collapseRoute, finish: finishCollapse },
  balance: { shape: shapeBalance, goal: balanceGoal, costs: balanceRoute, finish: finishBalance },
  miasma: { shape: shapeMiasma, goal: miasmaGoal, costs: null, finish: finishMiasma },
  cold: { shape: shapeCold, goal: coldGoal, costs: coldRoute, finish: finishCold },
  storm: { shape: shapeStorm, goal: stormGoal, costs: stormRoute, finish: finishStorm },
  siege: { shape: shapeSiege, goal: siegeGoal, costs: null, finish: finishSiege },
  chase: { shape: shapeChase, goal: chaseGoal, costs: chaseRoute, finish: finishChase },
  slide: { shape: shapePuzzle, goal: puzzleGoal, costs: slideRoute, finish: finishPuzzles },
  sunken: { shape: shapeSunken, goal: sunkenGoal, costs: slideRoute, finish: finishSunken },
  mirror: { shape: shapePuzzle, goal: puzzleGoal, costs: slideRoute, finish: finishPuzzles },
  braziers: { shape: shapePuzzle, goal: puzzleGoal, costs: slideRoute, finish: finishPuzzles },
  crates: { shape: shapePuzzle, goal: puzzleGoal, costs: slideRoute, finish: finishPuzzles },
  runes: { shape: shapePuzzle, goal: puzzleGoal, costs: slideRoute, finish: finishPuzzles },
  timedgate: { shape: shapeTimed, goal: timedGoal, costs: timedRoute, finish: finishTimed },
};

// before the route search: what the kind makes its ways cost (cubegen/index.js)
export function trialCosts(ctx) { if (ctx.spec.trial) KINDS[ctx.spec.trial.kind].costs?.(ctx); }

export function shapeTrial(ctx) {
  const kind = KINDS[ctx.spec.trial.kind];
  if (!kind) throw new Error(`no generator for the trial ${ctx.spec.trial.kind}`);
  kind.shape(ctx);
}

// the entry's floor: the portal the room is entered by (spec.trial.entry)
const entryFloor = ctx => ctx.portalFloors[ctx.portals.findIndex(p => p.dir === ctx.spec.trial.entry)] ?? null;

// the way from the entry to the goal, and on from it to the exit, taken into the route
export function routeTrial(ctx) {
  if (!ctx.spec.trial) return true;
  const t = ctx.trialBuild, entry = entryFloor(ctx), goal = KINDS[ctx.spec.trial.kind].goal(ctx);
  if (!entry || !goal || t.failed) return false;
  const up = search(ctx, entry, goal, ctx.jitter, ctx.have), on = ctx.hub && search(ctx, goal, ctx.hub, ctx.jitter, ctx.have);
  if (!up || (ctx.hub && !on)) return false;
  take(ctx, up); if (on) take(ctx, on);
  ctx.reqMoves = ctx.moves.length;
  Object.assign(t, { entry, goal, up });
  return true;
}

// map.trial, or null (the attempt fails): pathPoints turns moves into a polyline (cubegen/index.js)
export function finishTrial(ctx, pathPoints) {
  const spec = ctx.spec;
  if (!spec.trial) return { trial: null };
  const t = ctx.trialBuild, { entry, goal } = t;
  // the goal is reached from the entry (and every other portal) and leads on to the exit, with the
  // final slopes and fences
  const toGoal = reachTo(ctx, goal, true);
  if (!reachFrom(ctx, [entry], true).has(goal.id) || ctx.portalFloors.some(f => !toGoal.has(f.id))) return null;
  if (ctx.hub && !reachTo(ctx, ctx.hub, true).has(goal.id)) return null;
  const pathFloors = [...new Set(t.up.flatMap(m => [m.from, m.to]))].filter(f => !f.landing);
  // nobody spawns on the trial's own ground or the way to its goal
  for (const c of t.keep) for (const f of ctx.cols[c]) f.noSpawn = true;
  for (const f of pathFloors) f.noSpawn = true;
  const out = { id: spec.trial.id, key: spec.trial.key, kind: spec.trial.kind, role: spec.trial.role, gate: spec.trial.gate,
    from: spec.trial.from, fromDir: spec.trial.fromDir, entry: spec.trial.entry, exit: spec.trial.exit, fluid: spec.fluid,
    path: pathPoints(ctx, t.up), pathFloors: pathFloors.map(f => f.id), entryFloor: entry.id, goalFloor: goal.id, parts: [] };
  const own = KINDS[t.kind].finish(ctx, t, out);
  if (!own) return null;
  Object.assign(out, own);
  // enemies keep off the checked path and its 2-cell band
  if (out.check?.path) {
    const band = out.check.path.map(p => [Math.floor(p.x), Math.floor(p.z)]);
    for (const g of ctx.floors) if (band.some(([x, z]) => Math.max(Math.abs(g.x - x), Math.abs(g.z - z)) <= 2)) g.noSpawn = true;
  }
  // no props on the trial's own ground, nor any in the way of the checked path
  const reservations = t.keep.map(c => ({ c, layer: 0 }));
  for (const p of out.check?.path || []) {
    const f = ctx.cols[Math.floor(p.z) * N + Math.floor(p.x)].find(g => Math.abs((g.cs ? floorY(g, 0.5, 0.5) : g.top * LH) - p.y) < 0.01);
    if (f) reservations.push({ c: f.c, layer: f.layer });
  }
  return { trial: out, reservations };
}

// a deadline check's margins, rounded: the slow player's least, and how close it comes to a perfect runner
const margins = check => ({ slack: Math.round(check.slack * 100) / 100, close: Math.round(check.close * 100) / 100 });
// the checked path as plain points: where, when a perfect runner arrives, when it is lost (null: never)
const checkPath = (path, arr, deadline) => path.map(n => ({ x: n.x + 0.5, y: n.landing ? n.top * LH : floorY(n, 0.5, 0.5), z: n.z + 0.5,
  t: Math.round(arr.time.get(n.id) * 100) / 100, dl: deadline(n) }));

// --- flood -------------------------------------------------------------------------------------------

function finishFlood(ctx, t, out) {
  const s = t.summit, f = t.goal;
  // the summit is the highest ground (but for the rock walls round a cave or a canyon)
  const inside = g => Math.min(g.x, g.z, N - 1 - g.x, N - 1 - g.z) >= 2;
  if (ctx.floors.some(g => !g.fluid && inside(g) && g.top > s.level)) return null;
  const timed = fitFloodRoom(ctx, t.entry, f, s.level);
  if (!timed) return null;
  const button = { x: f.x + 0.5, y: floorY(f, 0.5, 0.5), z: f.z + 0.5 };
  return { summit: { c: s.c, level: s.level, x: s.x + 0.5, z: s.z + 0.5, cells: s.cells }, lo: t.lo,
    button, parts: [{ id: 'button', type: 'button', ...button }], ...timed };
}

// The flood's timeline, fitted to the fastest way up for a slow player, then checked on its own:
// { timeline, check: { path: [{ x, y, z, t (a perfect runner's arrival), dl (deadline) }], slack (the
// slow player's least margin), close (a perfect runner's) } }, or null
function fitFloodRoom(ctx, entry, goal, summit) {
  const arr = arrivals(ctx, entry), path = pathOf(arr, goal);
  if (!path) return null;
  const ground = ctx.floors.filter(f => !f.fluid && f.layer === 0);
  const from = Math.min(...ground.map(f => f.top)) - 1, to = summit - 2;
  // each pulse no earlier than the water comes over every floor of the path it floods just as the
  // slow player leaves it
  const needs = [];
  path.forEach((n, i) => {
    const h = floorLevel(n);
    if (i + 1 >= path.length || h >= to) return;
    const j = Math.max(0, Math.floor((h - from) / FLOOD.step)), up = Math.max(0, h - from - FLOOD.step * j) / FLOOD.step * FLOOD.rise;
    needs[j] = Math.max(needs[j] ?? 0, slowTime(arr.time.get(path[i + 1].id)) - up);
  });
  const timeline = fitFlood(from, to, needs);
  if (!timeline) return null;
  const deadline = n => floorLevel(n) >= to ? null : floodTime(timeline, floorLevel(n));
  const check = checkDeadlines(path, arr, deadline);
  if (!check.ok) return null;
  return { timeline, check: { ...margins(check), path: checkPath(path, arr, deadline) } };
}

// --- miasma -----------------------------------------------------------------------------------------

// The fog's timeline is a flood's turned upside down: its underside starts FOG.over levels over the
// highest floor one can get to from the entry (not the rock walls round the room) and sinks in pulses to just over a body's head on the valve's ledge; in `u`, the
// levels it has sunk, it is a flood (core/trials.js fogY). A floor's deadline: the fog's underside
// at its top + CHAR_H (a head there in it).
function finishMiasma(ctx, t, out) {
  const valve = t.goal, reach = reachFrom(ctx, [t.entry], true);
  const top = Math.max(...ctx.floors.filter(f => !f.fluid && reach.has(f.id)).map(f => f.landing ? f.top : Math.max(...f.cs) / LH));
  const head = CHAR_H / LH, from = Math.ceil(top) + FOG.over, to = valve.top + head + 0.5;
  const u = n => from - (floorLevel(n) + head);   // (the fog's sinking to reach a head on floor n)
  const arr = arrivals(ctx, t.entry), path = pathOf(arr, valve);
  if (!path) return null;
  const end = from - to, needs = [], step = Math.max(FLOOD.step, Math.ceil(end / FOG.pulses));
  path.forEach((n, i) => {
    if (i + 1 >= path.length || u(n) >= end) return;
    const j = Math.max(0, Math.floor(u(n) / step)), down = Math.max(0, u(n) - step * j) / step * FOG.rise;
    needs[j] = Math.max(needs[j] ?? 0, slowTime(arr.time.get(path[i + 1].id)) - down);
  });
  const tl = fitFlood(0, end, needs, step, FOG.rise);
  if (!tl) return null;
  const timeline = { ...tl, kind: 'miasma', top: from };
  const deadline = n => n === valve || u(n) >= end ? null : floodTime(tl, Math.max(0, u(n)));
  const check = checkDeadlines(path, arr, deadline);
  if (!check.ok) return null;
  const at = { x: valve.x + 0.5, y: floorY(valve, 0.5, 0.5), z: valve.z + 0.5 };
  return { timeline, valve: at, pit: t.pit, parts: [{ id: 'valve', type: 'valve', ...at }],
    check: { ...margins(check), path: checkPath(path, arr, deadline) } };
}

// --- cold ----------------------------------------------------------------------------------------------

// The cold meter of a player going along `path` (time(n): a perfect runner's arrival), lighting the
// braziers at the path's indices `lit` on the way (each USE_TIME s, warm), in a room that freezes
// in `freeze` s; slow: the slow player (core/trials.js slowTime), else a perfect runner. The meter
// runs from the clock running (ARM_TIME); a stretch is warm where its middle is in a lit brazier's
// circle. -> the meter on arriving at each node of the path (over 100: frozen on the way)
function coldTrace(path, time, lit, freeze, slow) {
  const rate = 100 / freeze, burning = [], meters = [0];
  let m = 0, shift = 0, prev = slow ? slowTime(0) : 0;
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1], b = path[k], now = (slow ? slowTime(time(b)) : time(b)) + shift, dt = Math.max(0, now - Math.max(prev, ARM_TIME));
    const warm = burning.some(w => Math.hypot((a.x + b.x) / 2 - w.x, (a.z + b.z) / 2 - w.z) <= COLD.radius);
    m = warm ? Math.max(0, m - rate * COLD.thaw * dt) : m + rate * dt;
    meters.push(m);
    prev = now;
    if (lit.has(k)) { burning.push(b); m = Math.max(0, m - rate * COLD.thaw * USE_TIME); shift += USE_TIME; prev += USE_TIME; }
  }
  return meters;
}

// The great fire at the end of the way (a perfect runner's fastest from the entry, round the ridges)
// and the room's freezing time, fitted: going straight for the fire, a perfect runner freezes at
// COLD.dash of the way, so it takes a brazier or more (a room too short for that is retried). The
// braziers along the way: each as far on as keeps the meter of a slow player lighting them on the
// way within COLD.reach, at least COLD.apart cells from every other one and the entry (a warm circle
// reaches through a ridge: none just across one from the last); the fire too is reached within
// COLD.reach. One or two more off the way. Each is lit once (F) and stays lit.
function finishCold(ctx, t, out) {
  const fire = t.goal, arr = arrivals(ctx, t.entry), path = pathOf(arr, fire);
  if (!path || path.length < COLD.least) return null;
  const at = n => ({ x: n.x + 0.5, y: n.landing ? n.top * LH : floorY(n, 0.5, 0.5), z: n.z + 0.5 });
  const time = n => arr.time.get(n.id), end = path.length - 1;
  const freeze = Math.round(Math.min(COLD.freeze, Math.max(COLD.quick, (time(fire) - ARM_TIME) * COLD.dash)) * 10) / 10;
  const dash = coldTrace(path, time, new Set(), freeze, false)[end];
  if (dash < 100) return null;
  const limit = COLD.reach * 100, picked = [];
  for (;;) {
    const meters = coldTrace(path, time, new Set(picked), freeze, true);
    if (meters[end] <= limit) break;
    // the farthest spot on that the meter allows, well apart from every brazier
    let best = -1;
    for (let k = (picked.at(-1) ?? 0) + 1; k < end; k++) {
      const n = path[k];
      if (meters[k] > limit) break;
      if (!n.landing && !ctx.trialKeep?.has(n.c) && [path[0], ...picked.map(i => path[i])].every(p => Math.hypot(p.x - n.x, p.z - n.z) >= COLD.apart)
        && Math.hypot(fire.x - n.x, fire.z - n.z) >= COLD.apart * 0.75) best = k;
    }
    if (best < 0 || picked.length >= COLD.along[1]) return null;
    picked.push(best);
  }
  if (picked.length < COLD.along[0]) return null;
  const worst = Math.max(...coldTrace(path, time, new Set(picked), freeze, true));
  const along = picked.map(k => path[k]);
  // one or two more off the way: dry ground 3-6 cells from it, reached from it, apart from the rest
  const on = new Set(path.map(n => n.id)), reach = reachFrom(ctx, [t.entry], true);
  const dist = f => Math.min(...path.map(n => Math.hypot(n.x - f.x, n.z - f.z)));
  const off = ctx.floors.filter(f => !f.fluid && f.layer === 0 && reach.has(f.id) && !on.has(f.id) && !ctx.trialKeep?.has(f.c) && dist(f) >= 3 && dist(f) <= 6);
  const extra = [];
  for (let k = 0; k < 1 + (ctx.R() < 0.5 ? 1 : 0) && off.length; k++) {
    const f = off.splice(Math.floor(ctx.R() * off.length), 1)[0];
    if ([...along, ...extra].every(e => Math.hypot(e.x - f.x, e.z - f.z) >= COLD.apart * 0.75)) extra.push(f);
  }
  const parts = [...along, ...extra].map((n, i) => ({ id: `warm${i}`, type: 'warm', ...at(n), i, off: i >= along.length }));
  parts.push({ id: 'fire', type: 'fire', ...at(fire) });
  // nobody waits in a warm circle
  for (const f of ctx.floors) if (parts.some(p => Math.hypot(f.x + 0.5 - p.x, f.z + 0.5 - p.z) <= COLD.radius + 0.5)) f.noSpawn = true;
  return { parts, fire: at(fire), freeze, check: { freeze, dash: Math.round(dash), worst: Math.round(worst), cells: path.length,
    path: checkPath(path, arr, () => null) } };
}

// --- storm --------------------------------------------------------------------------------------------

// The way up (the fastest from the entry to the lightning rod, round the hill) is out in the wind for
// stretches between the boulders' shelter: a slow player crosses each within the lull and the
// warning (a perfect runner within stormAllowance), and a perfect runner's longest takes STORM.wait
// at least (or the gusts need not be waited out). The hill's top must be its summit (the highest
// ground), and the way must climb it.
function finishStorm(ctx, t, out) {
  const rod = t.goal, exposed = new Set(t.exposed), safe0 = n => n.landing || !exposed.has(n.c);
  if (!t.hill.has(rod.c) || rod.top < t.top - 1) return null;
  const weighed = arrivals(ctx, t.entry, undefined, n => safe0(n) ? 1 : STORM.shun), path = pathOf(weighed, rod);
  if (!path || path.filter(n => t.hill.has(n.c)).length < 20) return null;
  const arr = { ...weighed, time: weighed.real }, safe = n => safe0(n) || n === path[0] || n === rod;
  let worst = 0, from = null;
  for (const n of path) {
    if (safe(n)) { if (from != null) worst = Math.max(worst, arr.time.get(n.id) - from); from = null; continue; }
    if (from == null) { const k = path.indexOf(n); from = arr.time.get(path[k - 1].id); }
  }
  if (worst > stormAllowance() || worst < STORM.wait) return null;
  const at = { x: rod.x + 0.5, y: floorY(rod, 0.5, 0.5), z: rod.z + 0.5 };
  for (const c of t.hill) for (const f of ctx.cols[c]) f.noSpawn = true;
  return { eye: t.eye, exposed: t.exposed, stones: t.stones, rod: at, parts: [{ id: 'rod', type: 'rod', ...at }],
    check: { exposed: Math.round(worst * 100) / 100, slow: Math.round(worst * SLACK * 100) / 100, climb: path.filter(n => t.hill.has(n.c)).length, path: checkPath(path, arr, () => null) } };
}

// --- siege --------------------------------------------------------------------------------------------

// The ring flat and dry; every mouth reaches it
function finishSiege(ctx, t, out) {
  const b = t.beacon, ring = t.ring.map(c => ctx.layerFloor(c, 0));
  if (ring.some(f => !f || f.fluid || f.top !== b.level || Math.max(...f.cs) - Math.min(...f.cs) > 0.2)) return null;
  const centre = ctx.layerFloor(b.c, 0), mouths = [];
  for (const m of t.mouths) {
    const f = ctx.layerFloor(idx(m.x, m.z), 0);
    if (!f || f.fluid || !reachFrom(ctx, [f], true).has(centre.id)) return null;
    mouths.push({ x: f.x + 0.5, y: floorY(f, 0.5, 0.5), z: f.z + 0.5, yaw: Math.atan2(b.x - m.x, b.z - m.z) });
  }
  for (const f of ring) f.noSpawn = true;
  const at = { x: b.x + 0.5, y: b.level * LH, z: b.z + 0.5 };
  return { beacon: at, ring: { x: at.x, z: at.z, r: RING, y: at.y }, mouths, parts: [{ id: 'beacon', type: 'beacon', ...at }] };
}

// --- chase: the relic -------------------------------------------------------------------------------

// The race: a slow player running from the relic (taken: the clock starts) to the lever (its slowTime
// of a perfect runner's way, without the REACT: it is taken when the player is ready) + USE_TIME is
// there before the warden, hunting at HUNTER.ratio x RUN_SPEED over an enemy's ways only, is at the
// gate. The warden's waking is fitted to that: as late as it must, so that it is at the gate just as
// the slow player pulls the lever (between HUNTER.wake and HUNTER.late s; else the room is retried),
// and it must get there at all (or it is no chase). The player's way is the checked path.
// Everything at the gate, the lever, the relic and the lair is on dry, walkable ground.
function finishChase(ctx, t, out) {
  const relic = t.goal, lever = ctx.layerFloor(t.lever.c, 0), gate = ctx.layerFloor(t.gate.c, 0), lair = ctx.layerFloor(t.lair.c, 0);
  if (!lever || !gate || !lair || [lever, gate, lair].some(f => f.fluid)) return null;
  if (!reachFrom(ctx, [t.entry], true).has(relic.id)) return null;
  const run = arrivals(ctx, relic, RUN_SPEED), path = pathOf(run, lever);
  if (!path || path.length < HUNTER.least || !path.some(n => n === gate)) return null;
  const hunter = arrivals(ctx, lair, RUN_SPEED * HUNTER.ratio, null, true);
  if (!hunter.time.has(gate.id) || !hunter.time.has(relic.id)) return null;
  const tLever = slowTime(run.time.get(lever.id)) - REACT + USE_TIME, wake = Math.ceil((tLever - hunter.time.get(gate.id)) * 10) / 10;
  if (wake < HUNTER.wake || wake > HUNTER.late) return null;
  const tGate = wake + hunter.time.get(gate.id);
  const at = f => ({ x: f.x + 0.5, y: floorY(f, 0.5, 0.5), z: f.z + 0.5 });
  const d = t.gate.dir, toward = [Math.PI / 2, -Math.PI / 2, 0, Math.PI][d];
  for (const c of [...t.altar.cells, t.lair.c]) for (const f of ctx.cols[c]) f.noSpawn = true;
  return { parts: [{ id: 'relic', type: 'relic', ...at(relic) },
      { id: 'lever', type: 'lever', ...at(lever), yaw: toward },
      { id: 'portcullis', type: 'portcullis', ...at(gate), side: d, w: 1 }],
    lair: { ...at(lair), yaw: t.lair.yaw, f: lair.id }, hall: [...t.hall], wake,
    check: { lever: Math.round(tLever * 100) / 100, hunter: Math.round(tGate * 100) / 100, run: Math.round(run.time.get(lever.id) * 100) / 100, cells: path.length, path: checkPath(path, run, () => null) } };
}

// --- collapse ----------------------------------------------------------------------------------------

// Every crust cell's distance from the entry apron over the crust (a gap jumped counts two cells),
// the wave fitted to a slow player (its speed: the one that follows that player closest; its delay:
// as little as keeps every crust cell of the fastest way to the exit apron standing until it is
// left), then checked on its own. Each dead end must be
// one: nothing but the crust it leaves leads off it.
function finishCollapse(ctx, t, out) {
  const crust = t.crust, apron = new Set(t.entryApron), exitApron = new Set(t.exitApron);
  const dist = new Map(t.entryApron.map(c => [c, 0])), queue = [...t.entryApron];
  const walkable = c => crust.has(c) || apron.has(c) || exitApron.has(c);
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i], x = c % N, z = (c / N) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const k of [1, 2]) {
      const nx = x + dx * k, nz = z + dz * k;
      if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
      const n = nz * N + nx;
      if (k === 2 && walkable(nz * N + nx - dx - dz * N)) continue;   // (only over a gap)
      if (!walkable(n) || dist.has(n)) continue;
      dist.set(n, dist.get(c) + k); queue.push(n);
    }
  }
  if ([...crust.keys()].some(c => !dist.has(c)) || t.exitApron.some(c => !dist.has(c))) return null;
  const floorOf = c => ctx.cols[c].find(f => f.layer === 0 && !f.fluid);
  const arr = arrivals(ctx, t.entry), path = pathOf(arr, t.goal);
  if (!path) return null;
  const onCrust = n => !n.landing && crust.has(n.c) && floorOf(n.c) === n;
  // when the slow player leaves each crust cell of the way, and how far along the crust it is
  const leave = [];
  path.forEach((n, i) => { if (i + 1 < path.length && onCrust(n)) leave.push({ d: dist.get(n.c), at: slowTime(arr.time.get(path[i + 1].id)) }); });
  if (!leave.length) return null;
  // the wave: of the speeds it may go at, the one that follows the slow player closest (the least
  // time to spare on the way, on the whole), its delay as little as lets that player off every cell
  let wave = null;
  for (let speed = WAVE.speed; speed <= WAVE.fastest + 1e-9; speed += 0.05) {
    const v = Math.round(speed * 100) / 100, at = d => crumbleTime({ speed: v, delay: 0 }, d);
    const delay = Math.ceil((Math.max(0, ...leave.map(q => q.at - at(q.d))) + WAVE.margin) * 10) / 10;
    const spare = leave.reduce((s, q) => s + at(q.d) + delay - q.at, 0);
    if (delay <= WAVE.most && (!wave || spare < wave.spare)) wave = { speed: v, delay, spare };
  }
  if (!wave) return null;
  delete wave.spare;
  const deadline = n => onCrust(n) ? crumbleTime(wave, dist.get(n.c)) : null;
  const check = checkDeadlines(path, arr, deadline);
  if (!check.ok) return null;
  // the crust floors: what crumbles, and when
  const cells = [];
  for (const [c, info] of crust) {
    const f = floorOf(c);
    if (!f) return null;
    f.crust = true; f.noSpawn = true;
    cells.push({ c, f: f.id, d: dist.get(c), branch: info.branch });
  }
  // each dead end is one: from its floors nothing leads anywhere but onto the crust (and the
  // crust of the way leads into it only where it leaves)
  const adj = graph(ctx, true);
  for (const q of cells) if (q.branch)
    for (const g of adj.get(q.f) || []) if (!g.crust && !g.fluid) return null;
  const centre = ctx.floors[t.goal.id];
  return { wave, crust: cells, entryApron: t.entryApron, exitApron: t.exitApron, gaps: t.gaps.length, branches: t.branches,
    keystone: { x: centre.x + 0.5, y: floorY(centre, 0.5, 0.5), z: centre.z + 0.5 },
    check: { ...margins(check), path: checkPath(path, arr, deadline) } };
}

// The slabs' kinds and the timed way across (cubegen/trials/balance.js balanceSlabs): the jumps
// the reach graph's own, not an assumed distance between drawings.
function finishBalance(ctx, t) {
  const floorOf = c => ctx.cols[c].find(f => f.layer === 0 && !f.fluid);
  const made = balanceSlabs(ctx, t, floorOf);
  if (!made) return null;
  const cells = [];
  for (const [c, q] of t.crust) {
    const f = floorOf(c);
    f.crust = true; f.noSpawn = true;
    cells.push({ c, f: f.id, stone: q.stone, form: q.form });
  }
  const goal = t.goal;
  return { basin: t.basin, crust: cells, slabs: made.slabs, entryApron: t.entryApron, exitApron: t.exitApron,
    keystone: { x: goal.x + 0.5, y: floorY(goal, 0.5, 0.5), z: goal.z + 0.5 }, check: made.check };
}

// --- puzzles -----------------------------------------------------------------------------------------

// the deck as plain data (game/trials.js, render/trials.js)
const deckOf = d => ({ x0: d.x0, z0: d.z0, w: d.w, h: d.h, level: d.level });
// a gate across a gap in the rim beside field cell (x, z) on side `side`: in the middle of the gap
// cell, across the way through
function gateAt(deck, x, z, side, id) {
  const [dx, dz] = [[1, 0], [-1, 0], [0, 1], [0, -1]][side];
  return { id, type: 'gate', x: deck.x0 + x + dx + 0.5, z: deck.z0 + z + dz + 0.5, y: deck.level * LH, side, w: 1 };
}

// Each puzzle of the room as plain data (map.trial.puzzles; its parts, `puzzle`: its index, also in
// map.trial.parts), checked against the built ground
const FINISH = { slide: finishSlide, mirror: finishGrid, braziers: finishGrid, crates: finishGrid, runes: finishGrid };
function finishPuzzles(ctx, t) {
  const puzzles = [], parts = [], start = {};
  for (const [i, pz] of t.puzzles.entries()) {
    const rec = FINISH[pz.kind](ctx, pz, `p${i}`);
    if (!rec) return null;
    rec.index = i;
    if (pz.approach != null) rec.approach = pz.approach;   // (where you stand to begin it: a combiner's, the crates')
    for (const part of rec.parts) { part.puzzle = i; parts.push(part); }
    Object.assign(start, rec.start || {});
    puzzles.push(rec);
  }
  for (const c of t.keep) for (const f of ctx.cols[c]) f.noSpawn = true;
  return { puzzles, parts, start };
}

// A grid puzzle (cubegen/trials/grid.js): its field flat at the deck's level (but a mirror field's
// rocks), nothing built over it; its parts and start
function finishGrid(ctx, pz, id) {
  const { deck } = pz, F = pz.made.field ?? {};
  const rocks = new Set([...(F.blockers || []).map(b => `${b}`), ...(F.walls || []).map(c => `${c % F.w},${Math.floor(c / F.w)}`)]);
  for (let z = 0; z < deck.h; z++) for (let x = 0; x < deck.w; x++) {
    const c = deck.cell(x, z), f = ctx.cols[c].find(g => g.layer === 0);
    if (ctx.pieces[c].length) return null;
    if (rocks.has(`${x},${z}`)) { if (!f || f.top !== deck.level + RIM) return null; continue; }
    if (!f || f.fluid || f.top !== deck.level || Math.max(...f.cs) - Math.min(...f.cs) > 0.2) return null;
    f.noSpawn = true;
  }
  const rec = gridRecord(pz, id);
  return { id, kind: pz.kind, deck: deckOf(deck), ...rec };
}

// The ice: flat, every field cell at the deck's level but the rocks (up at the rim's), nothing built
// over it; the goal plate at its cell, the gate in the rim's gap beside it
function finishSlide(ctx, pz, id) {
  const { deck, field: F } = pz;
  for (let z = 0; z < F.h; z++) for (let x = 0; x < F.w; x++) {
    const c = deck.cell(x, z), f = ctx.cols[c].find(g => g.layer === 0);
    if (ctx.pieces[c].length) return null;
    if (F.rock[z * F.w + x]) { if (!f || f.top !== deck.level + RIM) return null; continue; }
    if (!f || f.fluid || f.top !== deck.level || Math.max(...f.cs) - Math.min(...f.cs) > 0.2) return null;
    f.ice = true; f.noSpawn = true;
  }
  const g = pz.goalCell, y = deck.level * LH;
  return { id, kind: 'slide', deck: deckOf(deck), field: F, entryGap: pz.entryGap, goalGap: pz.goalGap,
    parts: [{ id: `${id}:goal`, type: 'plate', x: g % N + 0.5, y, z: Math.floor(g / N) + 0.5 }, gateAt(deck, F.goal.x, F.goal.z, F.goal.side, `${id}:gate`)],
    check: { solution: pz.solution.way, slides: pz.solution.slides, decoys: pz.solution.decoys, stops: pz.solution.stops } };
}

// --- the timed gate --------------------------------------------------------------------------------

// The lever on the entry's apron opens the exit's seal for T s: the run along the causeway to the
// exit at RUN_SPEED x TIMED.factor + TIMED.extra (tighter from depth 10); 6-22 s of running, or the
// room is retried. Its path is the checked one (no props in its way, nobody spawning on it).
export const TIMED = { factor: 1.15, extra: 0.5, deepFactor: 1.08, deepExtra: 0.3, least: 6, most: 22 };
function finishTimed(ctx, t, out) {
  const start = t.goal, exit = ctx.portalFloors[ctx.portals.findIndex(p => p.dir === ctx.spec.trial.exit)];
  if (!exit) return null;
  const arr = arrivals(ctx, start, RUN_SPEED), path = pathOf(arr, exit);
  if (!path) return null;
  const run = arr.time.get(exit.id);
  if (run < TIMED.least || run > TIMED.most) return null;
  const deep = ctx.spec.depth >= 10, T = Math.ceil((run * (deep ? TIMED.deepFactor : TIMED.factor) + (deep ? TIMED.deepExtra : TIMED.extra)) * 2) / 2;
  const y = floorY(start, 0.5, 0.5), pad = { x: exit.x + 0.5, y: floorY(exit, 0.5, 0.5), z: exit.z + 0.5 };
  const lever = { id: 'p0:lever', type: 'lever', x: start.x + 0.5, y, z: start.z + 0.5, puzzle: 0, yaw: 0 };
  for (const c of t.crust.keys()) for (const f of ctx.cols[c]) f.noSpawn = true;
  return { puzzles: [{ id: 'p0', kind: 'timedgate', index: 0, T, pad, parts: [lever], check: { run: Math.round(run * 100) / 100, gaps: t.gaps.length, branches: t.branches } }],
    parts: [lever], start: {}, check: { slack: Math.round((T - run) * 100) / 100, path: checkPath(path, arr, () => null) } };
}

// --- the runes' clue ---------------------------------------------------------------------------------

// The rune rooms' tablets in an ordinary room before them (spec.clues, world/trials.js): each on the
// dry, flat ground nearest the room's middle that leads to the exit, off the portals' pads and the
// spots, apart; no props on them. Chosen without the generator's random stream (the room is as it
// would be without them).
export function placeClues(ctx, safe) {
  const out = { clues: [], reservations: [] };
  for (const clue of ctx.spec.clues || []) {
    const one = placeClue(ctx, safe, clue, out.clues);
    if (one) { out.clues.push(one.clue); out.reservations.push(...one.reservations); }
  }
  return out;
}
function placeClue(ctx, safe, clue, taken) {
  const pads = new Set(ctx.portals.flatMap(p => p.cells || []));
  const ok = f => !f.fluid && f.layer === 0 && !f.landing && !pads.has(f.c) && (!safe || safe.has(f.id)) && Math.max(...f.cs) - Math.min(...f.cs) <= 0.2
    && !ctx.pieces[f.c].length && !(ctx.spots || []).some(s => s.cells?.includes(f.c)) && taken.every(t => Math.hypot(t.x - f.x - 0.5, t.z - f.z - 0.5) >= 2.5);
  const f = ctx.floors.filter(ok).sort((a, b) => Math.hypot(a.x - 7.5, a.z - 7.5) - Math.hypot(b.x - 7.5, b.z - 7.5))[0];
  if (!f) return null;
  f.noSpawn = true;
  const { glyphs, order } = runeOrder(clue.id, clue.depth);
  return { clue: { key: clue.key, x: f.x + 0.5, y: floorY(f, 0.5, 0.5), z: f.z + 0.5, glyphs: order.map(i => glyphs[i]) }, reservations: [{ c: f.c, layer: 0 }] };
}

// --- sunken ------------------------------------------------------------------------------------------

// The stage puzzles as any puzzle room's, and the water's levels; checked as the room drains: at
// every level W_i the next platform (the ground beyond its puzzle's entry gap) is dry and reached
// from the entry, the one after it not yet; drained, the exit and the entry reach each other.
function finishSunken(ctx, t, out) {
  const own = finishPuzzles(ctx, t);
  if (!own) return null;
  const adj = graph(ctx, true), W = t.water, n = t.puzzles.length;
  const dry = (f, w) => (f.landing ? f.top * LH : f.fluid ? -1 : Math.min(...f.cs)) >= w * LH - 0.01 && !f.fluid;
  const reach = (from, w) => {
    const seen = new Set([from.id]), stack = [from];
    while (stack.length) for (const g of adj.get(stack.pop().id) || []) if (!seen.has(g.id) && dry(g, w)) { seen.add(g.id); stack.push(g); }
    return seen;
  };
  const beyond = pz => ctx.layerFloor(pz.approach, 0);
  for (let i = 0; i < n; i++) {
    const seen = reach(t.entry, W[i]), here = beyond(t.puzzles[i]), later = t.puzzles[i + 1] && beyond(t.puzzles[i + 1]);
    if (!here || !seen.has(here.id) || (later && seen.has(later.id))) return null;
  }
  const exit = ctx.portalFloors[ctx.portals.findIndex(p => p.dir === ctx.spec.trial.exit)];
  if (!exit || !reach(t.entry, W[n]).has(exit.id) || !reach(exit, W[n]).has(t.entry.id)) return null;
  for (const f of ctx.floors) if (!dry(f, W[0])) f.noSpawn = true;   // (nobody waits under the water)
  return { ...own, water: W, levels: t.levels, stages: n };
}
