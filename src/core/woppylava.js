// Woppylava's fight as rules (game/woppylava.js runs it; his profiles are core/enemies.js WOPPYLAVA
// and WOPPYLAVA_TWO). docs/bosses.md tells the whole fight.
//
// Woppylava, from the kids' drawing: a walking volcano on seven stubby legs, his stone sides in
// waves, arms of lava bursting out of them sideways, a plume of lava spraying out of his crater and
// his face floating over it. His arena (cubegen/arenashapes.js `cinder`) is a wide basin of a cave
// with a low cracked mound in its middle, smoking, glowing from inside: a volcano asleep under it.
// He walks straight at you over everything (game/woppylava.js walks him: he is too big for the
// ways of the others, and lava does not burn him). Two phases (`splits`):
//   1   (full health to two thirds) he sweeps a lava arm at whoever is close (`swipe`), erupts
//       (`erupt`: his crater blasts lava bombs out onto the floor round about, each landing spot
//       glowing first), sends walls of lava in from the sides of the arena (`walls`: a wall across
//       the whole arena, a gap in it to escape through) and calls lava hands down from above
//       (`hands`: a glowing ring follows you, holds still, and a hand comes down on it). Every
//       eruption shakes the mound in the middle harder.
//   2   (two thirds to death) he rises (`rise` s, warded): the mound cracks open and a great volcano
//       rises out of the middle of the arena (core/mountains.js `volcano`: a cone with a road
//       winding up it to the crater), then the lava rises over the basin (`flood`): only the
//       volcano stands out of it. He calls fire creatures to defend him (`minions`) besides
//       everything of phase 1, and climbs the volcano after you. Once the lava is up a fuse burns
//       (`fuse` s, the bar under his): when it runs out the volcano erupts (`burst`): lava pours
//       down it from the crater and the basin's lava rises, till only a few islands on its road
//       stay dry (`isles`), and those go one by one. Beat him before that.
// His death drains the lava, brings the volcano down and takes his fire creatures along.
// Pure: no three.js, no game state, so the tests run it.
import { mulberry32 } from './util.js';
import { N, LH } from './constants.js';

export const WOPPYLAVA_FIGHT = Object.freeze({
  splits: [2 / 3],            // the share of his health phase 2 starts at
  rise: 3,                    // s he rises between the phases (his clip WoppylavaRise), warded
  appear: 0.6,                // s more nothing hurts him after it
  // walking: cells/s (phase by phase), how close he comes to whom he goes for (his middle to
  // theirs; `close` when they stand much higher or lower: up or down the volcano's road), how fast
  // he turns (rad/s), how fast his feet follow the ground up and down (units/s)
  walk: { speed: [1.2, 1.35], stop: 1.9, close: 0.6, turn: 2.2, climb: 5 },
  // the eruption: `count` lava bombs (phase by phase), `near` of them `spread` cells round a hero,
  // the rest anywhere in the fight; each lands `flight` s after it leaves his crater (its spot
  // glowing meanwhile), hitting within `r` with `power` of his damage; every `every` s
  erupt: { count: [7, 11], near: 3, spread: [0.4, 2.6], flight: [1.2, 1.9], r: 1, power: 0.6, first: 3, every: [8, 11] },
  // the walls of lava: each rises at a side of the arena (`warn` s) and rolls across it at `speed`
  // cells/s, `thick` cells of it, `height` over the ground (no jumping it), with a gap `gap` cells
  // wide `gapOff` cells (phase by phase) from where the hero stood; `count` walls a time (phase by
  // phase), `apart` s after each other; a wall hurts once (`power`), sets on fire and throws you
  // along (`push` cells/s for `pushTime` s); every `every` s
  walls: { warn: 1.5, speed: 3.4, thick: 1.1, height: 1.7, gap: 3.4, gapOff: [[2, 4.5], [0, 2]], count: [[1, 1], [1, 2]], apart: 2.8,
    power: 0.85, push: 7, pushTime: 0.5, first: 7, every: [13, 17] },
  // the lava hands: a glowing ring on the floor follows a hero (`track` s, at `speed` cells/s),
  // holds still (`lock` s), then a hand of lava comes down on it from above (`fall` s), clutches
  // there (`hold` s) and draws back up (`rise` s); who is within `r` as it lands is hit (`power`),
  // set on fire and knocked down. One on each hero and `extra` more round them (phase by phase),
  // `spread` cells off; every `every` s
  hands: { track: 1.5, speed: 3.6, lock: 0.6, fall: 0.3, hold: 0.8, rise: 0.7, r: 1.15, power: 0.8, extra: [[0, 1], [1, 2]], spread: [1.8, 4],
    first: 10, every: [11, 15] },
  // his fire creatures (phase 2): as many as fill up to `most`, every `every` s, the first `first`
  // s into the phase; a Magma-face or a Magma cat by turns
  minions: { most: [0, 4], every: 12, first: 6 },
  // the volcano: it cracks open `at` s into his rising (core/mountains.js times its crack and rise);
  // the lava rises over the basin `after` s once it is up, in `rise` s
  volcano: { at: 1.5 },
  flood: { after: 0.5, rise: 10 },
  fuse: 150,                  // s from the lava standing up to the eruption
  // the eruption: lava pours down the volcano from its crater (`pour` s, from the top down) and the
  // basin's lava rises a little more (`rise` levels); `isles` dry patches stay on its road, the
  // first gone `shrink` s after the lava has poured down and each next `shrink` s after it
  burst: { pour: 5, rise: 1, isles: 4, shrink: 14, depth: 0.3 },
  craterDepth: 0.35,          // units the lava stands over the floor of his crater (phase 2)
  leave: 0.5,                 // s a minion he takes along lingers, gone, before it is let go
});
const G = WOPPYLAVA_FIGHT;
export const PHASES = 2;
const ALL = ['swipe', 'erupt', 'walls', 'hands', 'summon', 'rise'];

// the health below which no blow takes him in phase `phase` (0 in the last)
export const phaseFloor = (maxHp, phase) => phase <= G.splits.length ? Math.ceil(maxHp * G.splits[phase - 1]) : 0;
// how many fire creatures a summon brings in phase `phase` with `alive` of them about
export const summonCount = (phase, alive) => Math.max(0, (G.minions.most[phase - 1] ?? 0) - alive);
// How close phase 1 has come to its end (0 at full health .. 1 at the split): how hard the mound
// in the middle smokes and glows (render/woppylavafx.js)
export const stirOf = (hp, maxHp) => Math.max(0, Math.min(1, (maxHp - hp) / (maxHp * (1 - G.splits[0]))));
// The attacks he may not start now (names): the rising (only his fight starts it); the summon in
// phase 1; the eruption, the walls, the hands and the summon only when due, the walls and the
// hands not while some are still running (`busy`); one due first (walls, hands) and nothing else
// meanwhile
export function barred({ phase, eruptDue = false, wallsDue = false, handsDue = false, summonDue = false, wallsBusy = false, handsBusy = false }) {
  const no = new Set(['rise']);
  if (phase < 2 || !summonDue) no.add('summon');
  if (!eruptDue) no.add('erupt');
  if (!wallsDue || wallsBusy) no.add('walls');
  if (!handsDue || handsBusy) no.add('hands');
  for (const first of ['walls', 'hands']) if (!no.has(first)) return new Set(ALL.filter(n => n !== first));
  return no;
}

const range = ([a, b], r) => a + (b - a) * r;
const count = ([a, b], R) => a + Math.floor(R() * (b - a + 1));

// --- the walls ---------------------------------------------------------------------------------------

// side: 0 from -x along +x, 1 from +x along -x, 2 from -z along +z, 3 from +z along -z; box: the
// arena's ([x0, z0, x1, z1], cells, x1 / z1 past the last)
export const wallWay = side => [[1, 0], [-1, 0], [0, 1], [0, -1]][side];
// A volley of walls (seed: the same volley, the same walls): from sides at random (a second from
// another side), each with its gap round where a hero (`p`: { x, z }) stands, `gapOff` cells off,
// each `delay` s after the first. [{ side, gap (where along the other axis its middle is), delay }]
export function wallVolley(seed, phase, p, box = [2, 2, N - 2, N - 2]) {
  const W = G.walls, R = mulberry32(seed >>> 0), n = count(W.count[phase - 1], R), out = [], [x0, z0, x1, z1] = box;
  const first = Math.floor(R() * 4);
  for (let i = 0; i < n; i++) {
    const side = i === 0 ? first : (first + 1 + Math.floor(R() * 2) * 2) % 4;   // (the second across the first)
    const across = side < 2 ? p.z : p.x, [lo, hi] = side < 2 ? [z0, z1] : [x0, x1];
    const off = range(W.gapOff[phase - 1], R()) * (R() < 0.5 ? -1 : 1);
    let gap = across + off;
    if (gap - W.gap / 2 < lo + 0.3 || gap + W.gap / 2 > hi - 0.3) gap = across - off;   // (the gap inside the arena)
    gap = Math.max(lo + W.gap / 2 + 0.3, Math.min(hi - W.gap / 2 - 0.3, gap));
    out.push({ side, gap: Math.round(gap * 100) / 100, delay: i * W.apart });
  }
  return out;
}
// where along its way a wall is `t` s after it started (its warning first): { start (the coordinate
// it starts at), dir (+1 / -1 along its axis), front (how far it has come, cells), len (how far it
// goes in all), phase ('warn', 'roll', 'done') }
export function wallAt(w, t, box = [2, 2, N - 2, N - 2]) {
  const W = G.walls, [x0, z0, x1, z1] = box, dir = w.side % 2 === 0 ? 1 : -1;
  const start = w.side === 0 ? x0 : w.side === 1 ? x1 : w.side === 2 ? z0 : z1, len = (w.side < 2 ? x1 - x0 : z1 - z0) + W.thick;
  const front = Math.max(0, t - W.warn) * W.speed;
  return { start, dir, front: Math.min(front, len), len, phase: t < W.warn ? 'warn' : front < len ? 'roll' : 'done' };
}
// how long a wall takes from its start till it is through (s)
export const wallSpan = (box = [2, 2, N - 2, N - 2]) => G.walls.warn + (Math.max(box[2] - box[0], box[3] - box[1]) + G.walls.thick) / G.walls.speed;
// Is a body at (x, z) in wall w `t` s after it started? In its band (`thick` cells behind its front),
// not in its gap. (It stands `height` over the ground everywhere: nobody jumps it.)
export function inWall(w, t, x, z, box = [2, 2, N - 2, N - 2]) {
  const at = wallAt(w, t, box);
  if (at.phase !== 'roll') return false;
  const along = ((w.side < 2 ? x : z) - at.start) * at.dir, across = w.side < 2 ? z : x;
  return along <= at.front && along >= at.front - G.walls.thick && Math.abs(across - w.gap) > G.walls.gap / 2;
}

// --- the hands -----------------------------------------------------------------------------------------

// A hand: { x, z (its ring's middle), t (s since it started) }: 'track' (the ring follows its hero),
// 'lock' (it holds still), 'fall' (the hand comes down), 'hold' (it clutches the floor), 'rise', 'done'
export function handPhase(t) {
  const H = G.hands;
  let at = 0;
  for (const [name, d] of [['track', H.track], ['lock', H.lock], ['fall', H.fall], ['hold', H.hold], ['rise', H.rise]]) {
    if (t < (at += d)) return name;
  }
  return 'done';
}
// s from a hand's start till it lands (its blow)
export const handLands = () => G.hands.track + G.hands.lock + G.hands.fall;
export const handSpan = () => handLands() + G.hands.hold + G.hands.rise;
// the hands of a volley (seed): one on each hero (`ps`: [{ x, z }], `follow`: the index of whom its
// ring follows) and `extra` round them at random, `spread` cells off, held still from the start.
// box: where they may come down
export function handVolley(seed, phase, ps, box = [2, 2, N - 2, N - 2]) {
  const H = G.hands, R = mulberry32(seed >>> 0), [x0, z0, x1, z1] = box, out = [];
  const clamp = (v, lo, hi) => Math.max(lo + 0.6, Math.min(hi - 0.6, v));
  ps.forEach((p, i) => out.push({ follow: i, x: p.x, z: p.z }));
  const extra = count(H.extra[phase - 1], R);
  for (let i = 0; i < extra && ps.length; i++) {
    const p = ps[Math.floor(R() * ps.length)], a = R() * Math.PI * 2, d = range(H.spread, R());
    out.push({ follow: -1, x: Math.round(clamp(p.x + Math.cos(a) * d, x0, x1) * 100) / 100, z: Math.round(clamp(p.z + Math.sin(a) * d, z0, z1) * 100) / 100 });
  }
  return out;
}
// the ring follows its hero at `speed` cells/s while it tracks
export function trackHand(h, p, dt) {
  const dx = p.x - h.x, dz = p.z - h.z, d = Math.hypot(dx, dz), step = G.hands.speed * dt;
  if (d <= step) { h.x = p.x; h.z = p.z; return; }
  h.x += dx / d * step; h.z += dz / d * step;
}
// does a hand landing now catch a body at (x, z)?
export const underHand = (h, x, z) => Math.hypot(x - h.x, z - h.z) < G.hands.r;

// --- the eruption --------------------------------------------------------------------------------------

// Where the bombs of an eruption land (seed: the same eruption, the same spots): `near` round the
// heroes (`ps`), the rest on floors of the fight at random (`floors`: [{ x, z }], cell middles), each
// with its flight time. [{ x, z, flight }]
export function bombSpots(seed, phase, ps, floors) {
  const E = G.erupt, R = mulberry32(seed >>> 0), n = E.count[phase - 1], out = [];
  for (let i = 0; i < n; i++) {
    const flight = Math.round(range(E.flight, R()) * 100) / 100;
    if (i < E.near && ps.length) {
      const p = ps[i % ps.length], a = R() * Math.PI * 2, d = range(E.spread, R());
      out.push({ x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d, flight });
    } else if (floors.length) {
      const f = floors[Math.floor(R() * floors.length)];
      out.push({ x: f.x + (R() - 0.5) * 0.6, z: f.z + (R() - 0.5) * 0.6, flight });
    }
  }
  return out.map(b => ({ x: Math.round(b.x * 100) / 100, z: Math.round(b.z * 100) / 100, flight: b.flight }));
}

// --- the lava ------------------------------------------------------------------------------------------

// The dry patches the eruption leaves on the volcano's road (`road`: [{ c, x, z, top }] its cells, top
// in levels): `isles` of them spread up the road (by height), each a road cell and the road cells
// touching it. [[c, ...], ...], the first to go first.
export function islesOf(road, seed) {
  const n = G.burst.isles;
  if (!road.length) return [];
  const R = mulberry32(seed >>> 0), up = [...road].sort((a, b) => a.top - b.top || a.c - b.c), out = [], used = new Set();
  for (let i = 0; i < n; i++) {
    const k = Math.min(up.length - 1, Math.floor((i + 0.25 + R() * 0.5) / n * up.length));
    const m = up[k];
    if (used.has(m.c)) continue;
    const isle = [m.c, ...road.filter(o => o !== m && Math.abs(o.x - m.x) + Math.abs(o.z - m.z) === 1 && !used.has(o.c)).map(o => o.c)].slice(0, 4);
    isle.forEach(c => used.add(c));
    out.push(isle);
  }
  // (the lowest go first: the lava climbs)
  return out;
}
// how many of the isles are still dry `since` s after the eruption began
export const islesLeft = since => Number.isFinite(since) ? Math.max(0, G.burst.isles - Math.max(0, Math.floor((since - G.burst.pour) / G.burst.shrink))) : G.burst.isles;
// How far (0..1) the eruption's lava has poured down from the crater `since` s after it began
export const poured = since => Number.isFinite(since) ? Math.max(0, Math.min(1, since / G.burst.pour)) : 0;
// The lava standing over each cell (world units; NaN: dry), for the physics (physics/fluid.js setTide
// `ys`) and render/woppylavafx.js: the basin's lava at `level` (units) inside `box`; the volcano's
// crater (`crater`: its cells, once it is up); and after the eruption (`since` s ago) the lava pouring
// down over every cell of the fight (`cells`: [{ c, y (its highest corner, units) }]), the highest
// first, but the isles still dry; the basin's a little higher.
export function lavaSurfaces({ level = -Infinity, box = [2, 2, N - 2, N - 2], crater = [], cells = [], since = NaN, isles = [] }) {
  const ys = new Float64Array(N * N).fill(NaN), [x0, z0, x1, z1] = box, B = G.burst;
  const flood = level + (Number.isFinite(since) ? B.rise * LH * poured(since) : 0);
  if (Number.isFinite(level)) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) ys[z * N + x] = flood;
  const up = (c, y) => { if (!(ys[c] >= y)) ys[c] = y; };
  for (const { c, y } of crater) up(c, y + G.craterDepth);
  if (Number.isFinite(since) && cells.length) {
    const dry = new Set(islesOrNone(isles, since)), hi = Math.max(...cells.map(m => m.y)), lo = Math.min(...cells.map(m => m.y)), k = poured(since);
    for (const { c, y } of cells) {
      if (dry.has(c)) continue;
      // (from the top down: a cell is reached once the pour has come down to it)
      if (hi - lo > 1e-6 && (hi - y) / (hi - lo) > k) continue;
      up(c, y + B.depth);
    }
  }
  return ys;
}
// the cells of the isles still dry `since` s after the eruption (the first ones go first)
function islesOrNone(isles, since) {
  const left = islesLeft(since);
  return isles.slice(isles.length - left).flat();
}
