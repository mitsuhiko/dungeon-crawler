// Foggery's fight as rules, his tower and the floating platforms round its top (game/foggery.js
// runs the fight, game/movers.js the platforms; cubegen/towerarena.js builds the tower; his
// profiles are core/enemies.js FOGGERY and FOGGERY_BALL). docs/bosses.md tells the whole fight.
//
// His arena is a caldera full of lava with a great round tower in the middle. You come in on a
// stone bridge over the lava; a ramp winds up round the tower from the ground to its top, and
// the bridge joins it on a flat stretch; the tower narrows as it rises, to half at the top. Once
// the lava has risen to its highest, stone platforms rise out of it round the top, in slots two by
// two cells each, and slide from slot to slot like a sliding puzzle (game/movers.js).
//
// Phase 1 (full health to a third): he waits at the foot of his tower. When the player sets foot
// on the ramp the fight starts: the lava rises from its rest to just under the top of the tower
// over `lava.rise` s, Fire-faces wait up the ramp (`lieInWait`) and he comes after the player,
// throwing his eyes (one at a time; each grows back) and calling up more Fire-faces (a summon
// fills up to `minions[0]`). No blow takes him below a third before he is on top: once there, he curls
// up into a ball with a shield (`morphTime`, nothing hurting him). Phase 2: two Fire-cats guard
// him; while one lives the shield holds and nothing hurts him; once both are dead it is down, and
// `catsAgain` s later he calls two new ones. He spits fireballs and makes fire geysers burst out
// of the floor. At a sixth of his health (phase 3) the lava rises over the top of the tower
// (`lava.flood` s): only the platforms are safe. He goes over them from one to another (mostly to
// one next to the player: a blade reaches him there), throws volleys of fireballs, still calls his
// cats and makes geysers burst through the platforms. His cats leap after a player on the
// platforms, from one to another, so a blade reaches them there too.
// His death drains the lava away for good and takes his minions along.
// Falling into his lava kills, as any lava does, unless the robot pulls one out (game/rescue.js:
// for a quarter of one's health, onto safe ground well over the lava, the top of the tower once
// nothing lower is, else a platform).
import { mulberry32 } from './util.js';

export const FOGGERY_FIGHT = Object.freeze({
  splits: [1 / 3, 1 / 6],     // the shares of his health phase 2 and phase 3 start at
  morphTime: 2.4,             // s he curls up into his ball, nothing hurting him
  floodTime: 2,               // s he rises up at a sixth of his health, nothing hurting him
  wake: 2.4,                  // cells: a player this close to him wakes him (or setting foot on the ramp, or a hit)
  lieInWait: 3,               // Fire-faces waiting up the ramp when the fight starts
  waitAggro: 4.5,             // cells: how far they notice the player from
  hurry: 2.2,                 // how much faster he climbs at a third of his health, not yet on top
  eyes: { grow: 2.5 },        // s an eye he threw takes to grow back
  lava: { rise: 60, flood: 6, drain: 7 },   // s the lava takes to rise, to flood the top, to drain away
  minions: [3, 2, 2],         // the most Fire-faces (phase 1) / Fire-cats (2, 3) at once
  summonCool: 10,             // s from one summon of Fire-faces to the next
  firstSummon: 4,             // s into the fight before his first summon
  catsAgain: 8,               // s after both cats are dead before he calls new ones
  geyser: { first: 2, every: [7, 10] },   // s into phase 2 before the first geysers, then between them
  orbit: { r: 2.3, speed: 0.22, lift: 0.4 },   // rising into phase 3: how far from the middle he circles (cells), how fast (rad/s), how high
  hop: { speed: 2.2, dwell: [2.5, 4], near: 0.7, lift: 0.02 },   // phase 3, over the platforms: cells/s, s on each, how often next to the player, over its top
  // his Fire-cats leap after a player on the platforms (and back down onto the top of the tower):
  // cells a leap goes at most (edge to edge), cells/s, how high (cells, and per cell of the leap),
  // s before they leap after the player, s before they leap again
  leap: { reach: 5, speed: 6, arc: [0.35, 0.12], react: [0.35, 0.8], again: 0.6 },
  leave: 0.5,                 // s a minion he takes along lingers, gone, before it is let go
});
const ALL = ['eyeL', 'eyeR', 'summon', 'spit', 'volley', 'geyser', 'cats'];

// the health phase `phase` + 1 starts at (no blow takes him below it before)
export const splitHp = (maxHp, phase) => Math.ceil(maxHp * FOGGERY_FIGHT.splits[phase - 1]);
// how many minions a summon brings in phase `phase` with `alive` of them about
export const summonCount = (phase, alive) => Math.max(0, FOGGERY_FIGHT.minions[phase - 1] - alive);
// The attacks he may not start now (names). Phase 1: the eye throws (each only while he has that
// eye) and the summon of Fire-faces when due. Phases 2 and 3: only the cats while they are due;
// else the fireball (phase 2) or the volley (phase 3) and the geysers when due.
export function barred({ phase, eyes = [1, 1], summonDue = false, catsDue = false, geyserDue = false }) {
  if (phase === 1) return new Set(ALL.filter(n => !(n === 'eyeL' && eyes[0] >= 1) && !(n === 'eyeR' && eyes[1] >= 1) && !(n === 'summon' && summonDue)));
  if (catsDue) return new Set(ALL.filter(n => n !== 'cats'));
  return new Set(ALL.filter(n => !(n === 'spit' && phase === 2) && !(n === 'volley' && phase === 3) && !(n === 'geyser' && geyserDue)));
}

// --- his tower ------------------------------------------------------------------------------
// Heights are in levels (half a cell). The tower stands in the middle of the cube (MID, MID): a
// stepped cone, `base` cells round at the bottom and half that (`crown`) at the top, and a ramp
// `path` cells wide winding up round it, inward as it climbs. At a point r cells from the middle
// the ramp passes once: each turn lies `path` further in than the one below, a wall between them.
// The lava fills the whole cube, out to its sides (no walls); the platforms float a level over the
// top.
export const TOWER = Object.freeze({
  mid: 8,
  ground: 1,                // the caldera's floor
  top: 20,                  // the top of the tower
  base: 6.2,                // cells: how far the tower reaches out at its foot
  crown: 2.6,               // cells: its top, round the middle (with the last of the ramp about half the foot)
  path: 1.5,                // cells: how wide the ramp is
  junction: 0.12,           // turns of the ramp kept flat where the bridge joins it
  slab: 2,                  // levels thick: the bridge
  pit: [0, 16],             // the caldera's cells (each way: from, past the last): the whole cube
  lava: { rest: 2, high: 19, flood: 20.6, gone: -1 },   // levels: the lava at rest, under the top, over it, drained
});
export const PLATFORMS = Object.freeze({
  top: 21,                  // levels: where their tops float
  thick: 0.32,              // cells
  size: 2,                  // cells each way: a slot
  count: 22,                // platforms in the slots round the top
  every: 2,                 // s between steps of the puzzle
  move: 1.2,                // s a step's slides take
  moves: 3,                 // platforms that may slide at once
  near: 3,                  // the least that touch the top of the tower
  clear: 2.5,               // levels under the platforms' tops nothing of the tower may reach where they float
});

const TAU = Math.PI * 2;
export const wrap = a => a - Math.floor(a + 0.5);   // turns into -0.5 .. 0.5
// where along the ramp (turns from its foot) things are: the flat at the bridge (j0 .. j1), the
// top (t); door: the bridge's level. Its middle is r(u) cells from the middle of the tower.
export function rampMarks(door) {
  const T = TOWER, t = (T.base - T.crown - T.path) / T.path, pitch = (T.top - T.ground) / (t - T.junction);
  const j0 = (door - T.ground) / pitch, j1 = j0 + T.junction;
  return { j0, j1, jc: (j0 + j1) / 2, t, pitch };
}
export const rampRadius = u => TOWER.base - TOWER.path / 2 - TOWER.path * u;
// the ramp's height (levels) u turns from its foot (under 0: the caldera's floor; over t: the top)
export function rampHeight(u, door) {
  const T = TOWER, m = rampMarks(door);
  if (u <= 0) return T.ground;
  if (u < m.j0) return T.ground + u * m.pitch;
  if (u < m.j1) return door;
  if (u < m.t) return door + (u - m.j1) * m.pitch;
  return T.top;
}
// The ramp turns round the middle the way `spin` says (1 or -1) and the bridge joins it on the
// side of the doorway (angle `at`, radians: atan2(dz, dx)). The turns u the ramp is at where it
// passes the point r cells from the middle at angle `angle` (null: the ramp never passes there)
export function rampAt(r, angle, at, spin, door) {
  const m = rampMarks(door), d = wrap(spin * (angle - at) / TAU);
  const k = Math.round((TOWER.base - TOWER.path / 2 - r) / TOWER.path - (m.jc + d));
  return m.jc + d + k;
}
// the angle (radians) the ramp is at u turns from its foot
export const rampAngle = (u, at, spin, door) => at + spin * (u - rampMarks(door).jc) * TAU;
// the point on the middle of the ramp u turns from its foot: { x, z } (cells), y in levels
export function rampPoint(u, at, spin, door) {
  const a = rampAngle(u, at, spin, door), r = rampRadius(u);
  return { x: TOWER.mid + Math.cos(a) * r, z: TOWER.mid + Math.sin(a) * r, y: rampHeight(u, door) };
}

// --- the lava ------------------------------------------------------------------------------
// His `tide` (game/tide.js): the share k of the way from the lava's rest level to just under the
// top; more than 1 over the top, less than 0 drained (map.tide: rest and high, core/squarlo.js
// tideLevel)
export const lavaShare = level => (level - TOWER.lava.rest) / (TOWER.lava.high - TOWER.lava.rest);
export const LAVA = Object.freeze({ rest: 0, high: 1, flood: lavaShare(TOWER.lava.flood), gone: lavaShare(TOWER.lava.gone) });
// His lava: { k, from, to, t, time }: from `from` to `to` over `time` s. One step of dt.
export const newLava = () => ({ k: 0, from: 0, to: 0, t: 0, time: 0 });
export function moveLava(w, to, time) { Object.assign(w, { from: w.k, to, t: 0, time }); }
export function stepLava(w, dt) {
  w.t += dt;
  w.k = w.time > 0 ? w.from + (w.to - w.from) * Math.min(1, w.t / w.time) : w.to;
  return w.k;
}

// --- the platforms -------------------------------------------------------------------------
// The slots (map.movers.slots, cubegen/towerarena.js): the cube's 14 x 14 cells inside its outer
// ring cut into 7 x 7 slots of 2 x 2, less the middle 3 x 3 (the top of the tower) and any where the tower reaches up
// too close under them; `next`: the slots next to each (along the grid). Slot -> { i, j (slot
// grid), x, z (its first cell) }.
export function slotGrid() {
  const out = [];
  for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) if (i < 2 || j < 2 || i > 4 || j > 4)
    out.push({ i, j, x: 1 + i * PLATFORMS.size, z: 1 + j * PLATFORMS.size });
  return out;
}
export const slotNext = slots => slots.map(a => slots.flatMap((b, k) => Math.abs(a.i - b.i) + Math.abs(a.j - b.j) === 1 ? [k] : []));

// One step of the puzzle: up to `moves` platforms slide into an empty slot next to theirs (not
// back where they just came from, unless nothing else can move: the puzzle never stops), and the
// platforms touching the top of the tower stay at least `near`. It leans towards slides that
// leave nobody alone: a platform with none next to it slides to one, or one slides next to it, so
// whoever stands on one can always (soon) jump on to another. occ: slot -> platform (or -1);
// last: platform -> the slot it left on its last slide; touch: the slots touching the top;
// next: the slots next to each; R: random numbers. -> [{ p, from, to }]
export function puzzleMoves(occ, last, touch, next, R, back = false) {
  const P = PLATFORMS, held = s => occ[s] >= 0;
  const alone = (s, but = -1) => next[s].every(c => c === but || !held(c));
  const cand = [];
  for (let a = 0; a < occ.length; a++) if (held(a)) for (const b of next[a]) if (!held(b) && (back || last[occ[a]] !== b)) {
    const after = next[b].filter(c => c !== a && held(c));
    let score = 1;
    if (after.length) score += alone(a) ? 6 : 1;                                       // (it was alone: now it is not)
    score += 4 * after.filter(c => alone(c, a)).length;                               // (it joins one that was alone)
    score -= 3 * next[a].filter(c => c !== b && held(c) && alone(c, a) && !next[b].includes(c)).length;   // (it leaves one alone)
    cand.push({ a, b, w: Math.max(0.2, score) });
  }
  const moves = [], used = new Set(), all = [...cand];
  let near = touch.filter(s => held(s)).length;
  const take = c => {
    if (moves.length >= P.moves || used.has(c.a) || used.has(c.b)) return false;
    const change = (touch.includes(c.b) ? 1 : 0) - (touch.includes(c.a) ? 1 : 0);
    if (near + change < P.near) return false;
    near += change; used.add(c.a); used.add(c.b);
    moves.push({ p: occ[c.a], from: c.a, to: c.b });
    return true;
  };
  // first, one for each platform that is alone: it slides next to another, or another next to it
  for (let s = 0; s < occ.length && moves.length < P.moves; s++) if (held(s) && alone(s)) {
    const fix = cand.filter(c => (c.a === s && next[c.b].some(x => x !== s && held(x) && !used.has(x))) || (c.a !== s && !used.has(s) && next[c.b].includes(s)));
    let done = false;
    while (fix.length && !done) {
      const c = fix.splice(Math.floor(R() * fix.length), 1)[0];
      if (!take(c)) continue;
      // (and whom it is next to now stays where it is this step)
      for (const x of next[c.b]) if (x !== c.a && held(x)) used.add(x);
      done = true;
    }
    if (done) continue;
    // none slides next to it at once: the nearest one (over empty slots) comes a slot closer
    const from = new Map([[s, -1]]), queue = [s];
    let found = -1;
    for (let i = 0; i < queue.length && found < 0; i++) for (const c of next[queue[i]]) {
      if (from.has(c)) continue;
      from.set(c, queue[i]);
      if (held(c)) { if (!used.has(c)) { found = c; break; } } else queue.push(c);
    }
    if (found >= 0 && !used.has(s)) {
      const path = [found];
      while (path[0] !== s) path.unshift(from.get(path[0]));
      // (both come a slot closer while there are two empty ones between them, else only the other)
      if (path.length > 3 && !(last[occ[s]] === path[1] && R() < 0.5)) take({ a: s, b: path[1] });
      if (take({ a: found, b: path.at(-2) })) used.add(s);
    }
  }
  while (cand.length && moves.length < P.moves) {
    let r = R() * cand.reduce((n, c) => n + c.w, 0), i = 0;
    while (i < cand.length - 1 && (r -= cand[i].w) > 0) i++;
    take(cand.splice(i, 1)[0]);
  }
  if (moves.length) return moves;
  if (!back) return puzzleMoves(occ, last, touch, next, R, true);
  // (and should nothing else move at all, one leaves the top: they must not stop)
  const any = all[0] ?? null;
  return any ? [{ p: occ[any.a], from: any.a, to: any.b }] : [];
}
// the platforms' first slots (count of them, at least `near` touching the top)
export function puzzleStart(slots, touch, R) {
  const order = slots.map((_, k) => [k, R()]).sort((a, b) => a[1] - b[1]).map(([k]) => k);
  const near = order.filter(k => touch.includes(k)).slice(0, PLATFORMS.near), rest = order.filter(k => !near.includes(k));
  return [...near, ...rest].slice(0, Math.min(PLATFORMS.count, slots.length - 4)).sort((a, b) => a - b);
}
const ease = u => u * u * (3 - 2 * u);
// The puzzle at time t (s): { occ, moves (this step's), u (how far they are) }, replayed from the
// start (`movers`: the map's, cubegen/towerarena.js) and cached in `cache` (an object kept by the
// caller) for the next call. Every game that knows t sees the same.
export function puzzleAt(movers, t, cache) {
  const P = PLATFORMS, n = Math.max(0, Math.floor(t / P.every));
  if (!cache.occ || cache.n > n || cache.movers !== movers) {
    cache.movers = movers; cache.n = 0;
    cache.occ = new Int8Array(movers.slots.length).fill(-1);
    movers.start.forEach((s, p) => { cache.occ[s] = p; });
    cache.last = new Array(movers.start.length).fill(-1);
    cache.moves = null;
  }
  const stepMoves = k => puzzleMoves(cache.occ, cache.last, movers.touch, movers.next, mulberry32(movers.seed ^ Math.imul(k + 1, 0x9e3779b1)));
  if (!cache.moves) cache.moves = stepMoves(cache.n);
  while (cache.n < n) {
    for (const m of cache.moves) { cache.occ[m.from] = -1; cache.occ[m.to] = m.p; cache.last[m.p] = m.from; }
    cache.n++;
    cache.moves = stepMoves(cache.n);
  }
  return { occ: cache.occ, moves: cache.moves, u: ease(Math.min(1, Math.max(0, (t - n * P.every) / P.move))) };
}
// Where each platform is at time t: [{ p, x, z }] (its first corner, cells)
export function platformsAt(movers, t, cache) {
  const { occ, moves, u } = puzzleAt(movers, t, cache), out = [], S = movers.slots;
  for (let s = 0; s < S.length; s++) if (occ[s] >= 0) {
    const m = moves.find(m => m.from === s), a = S[s], b = m ? S[m.to] : a;
    out.push({ p: occ[s], x: a.x + (b.x - a.x) * (m ? u : 0), z: a.z + (b.z - a.z) * (m ? u : 0) });
  }
  return out.sort((a, b) => a.p - b.p);
}
