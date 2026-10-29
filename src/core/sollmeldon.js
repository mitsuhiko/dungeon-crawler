// Sollmeldon's fight as rules (game/sollmeldon.js runs it, game/mud.js his mud; his profiles are
// core/enemies.js SOLLMELDON, SOLLMELDON_TWO and SOLLMELDON_ONE). docs/bosses.md tells the whole
// fight.
//
// Sollmeldon, the boss of depth 10 (core/bosses.js): a dinosaur of black mud with three heads on
// long necks (cat's eyes, beige-yellow), bat wings and three legs (two behind, one in front). He
// fights in his mire (cubegen/arenashapes.js `mire`), a basin with mud standing in its low middle.
// Three phases, one a head: no blow takes him below the next phase's share (`splits`), and there a
// head is cut off (`cut` s, nothing hurting him meanwhile): the one nearest whoever struck the blow
// (`headToCut`). It flies off and lands as a big puddle of mud. His death takes the last one.
//   1 (three heads)  on the ground: a head lunges forward and bites (never the same head twice
//                    running, `nextHead`), every head spits a ball of mud (it leaves a puddle where
//                    it lands), Mud squirtles come up out of the mud (`minions`)
//   2 (two heads)    and he flies (`flight`): up out of a blade's reach a few seconds, mud raining
//                    from him, then down with a thump; where he lands the world tips (`tilt`)
//   3 (one head)     the last head bites faster; he flies more often, longer
//
// His mud (game/mud.js, map.tide `mud`): mud that flows over the ground of the basin (a field of
// depths, MUD_RES samples a cell, `stepMud`: each sample passes mud on to its neighbours as the
// surface stands higher than theirs, with some inertia, so it runs downhill and sloshes). The
// world's tilt pulls it to the low side (the cube tips, the mud stays level in the world: it runs
// to where the cube went down, game/tilt.js turns the view), deep there. Every ball of mud he
// spits lands as a dome of it (`depositMud`): thin mud holds still while the world is level (a
// puddle, `film`), it all runs when it tips; deep mud always levels out. There is no limit to it;
// his death drains it back to what it was at first (`drainMud`).
import { N } from './constants.js';
import { mulberry32 } from './util.js';

export const SOLLMELDON_FIGHT = Object.freeze({
  splits: [2 / 3, 1 / 3],     // the shares of his health phase 2 and phase 3 start at
  cut: 2.6,                   // s a head is being cut off (nothing hurting him)
  cutAt: 33 / 30,             // s into it the head comes off and flies (blender/sollmeldon.py CUT_AT)
  cutLand: 52 / 30,           // s into it the head lands, a big puddle of mud (core/enemies.js SOLLMELDON_AT.cut; CUT_LAND)
  appear: 0.5,                // s more nothing hurts him once it is off
  // flying, phases 2 and 3 (phase 1 never): s into the phase before his first flight, s between
  // landing and taking off again, s up in the air
  flight: [null, { first: 5, every: [12, 16], up: [3.5, 4.5] }, { first: 3, every: [8, 11], up: [4, 5.5] }],
  // how high he flies (cells over his floor), how fast he goes up and down (cells/s); and while up
  // a ball of mud falls from him every `drop` s at a player (game/sollmeldon.js)
  lift: { up: 2.4, rise: 2.6, fall: 5, drop: [0.9, 0.7] },
  // landing: whoever is within `reach` cells of him is knocked back (`power` of his damage)
  land: { reach: 2.6, power: 0.5, knock: 6 },
  // The world's tilt where he lands: `angle` (rad) towards him from the middle of the cube (where he
  // lands within `near` cells of it: the way he faces), tipping over in `tip` s, held `hold` s (or
  // till he takes off), levelling in `back` s.
  tilt: { angle: 6 * Math.PI / 180, near: 1.5, tip: 1.6, hold: [8, 12], back: 2.6 },
  // His mud: a ball's worth (cells³ of mud, landing as a dome `radius` cells round), a head's (as
  // big round); how it flows (MUD_FLOW). Wading through his mud slows (`wade`), and so does a puddle.
  mud: { ball: 0.5, head: 5, radius: 0.8, headRadius: 1.6, wade: { time: 0.35, slow: 0.72, source: 'mud' } },
  spit: { first: 3, every: [4.5, 7] },   // s into the fight before he first spits mud on the ground, then between (in between he comes to bite)
  minions: [2, 2, 3],         // the most Mud squirtles at once, phase by phase
  summonCool: [12, 11, 9],    // s from one summon to the next
  firstSummon: [6, 4, 3],     // s into a phase before its first summon
  leave: 0.5,                 // s a minion he takes along lingers, gone, before it is let go
});
export const PHASES = 3;
const G = SOLLMELDON_FIGHT;
const between = ([a, b], r) => a + (b - a) * r;

// --- his heads ---------------------------------------------------------------------------------

// His heads: 0 the left, 1 the middle, 2 the right one (as he sees it), a bit each in his `heads`;
// where each sits across him (model space x: + his left) and its bite's name.
export const HEAD_SIDE = Object.freeze([1, 0, -1]);
export const BITES = Object.freeze(['biteL', 'biteM', 'biteR']);
export const ALL_HEADS = 7;
export const headsOf = mask => [0, 1, 2].filter(i => mask & (1 << i));
// The head that bites next: one he still has, never the one that bit last (with two or three
// left); r in 0..1 picks among the others
export function nextHead(mask, last, r = Math.random()) {
  const have = headsOf(mask), may = have.length > 1 ? have.filter(i => i !== last) : have;
  return may.length ? may[Math.min(may.length - 1, Math.floor(r * may.length))] : -1;
}
// The head cut off: of those he has, the one nearest `side` (across him, model space x: where the
// blow came from, + his left)
export function headToCut(mask, side) {
  const have = headsOf(mask);
  return have.reduce((best, i) => Math.abs(HEAD_SIDE[i] - side) < Math.abs(HEAD_SIDE[best] - side) ? i : best, have[0] ?? -1);
}
// across him (model space x, + his left) a point (x, z) lies, for him at (ex, ez) facing yaw
export const sideOf = (ex, ez, yaw, x, z) => (x - ex) * Math.cos(yaw) - (z - ez) * Math.sin(yaw);

// --- his phases --------------------------------------------------------------------------------

// the health below which no blow takes him in phase `phase` (0 in the last)
export const phaseFloor = (maxHp, phase) => phase <= G.splits.length ? Math.ceil(maxHp * G.splits[phase - 1]) : 0;
// how many Mud squirtles a summon brings in phase `phase` with `alive` of them about
export const summonCount = (phase, alive) => Math.max(0, (G.minions[phase - 1] ?? 0) - alive);
const ALL = [...BITES, 'spit', 'summon', 'rain'];
const MINE = [[...BITES, 'spit', 'summon'], [...BITES, 'spit', 'summon', 'rain'], [...BITES, 'spit', 'summon', 'rain']];
// The attacks he may not start now (names): those of the other phases; of the bites all but the
// next head's (`next`, nextHead); up in the air all but the mud he rains (`rain`), down on the
// ground that one; the spit and the summon only when due (between spits he comes to bite).
export function barred({ phase, next = 1, up = false, summonDue = false, spitDue = true }) {
  const mine = new Set(MINE[phase - 1]);
  if (up) return new Set(ALL.filter(n => n !== 'rain' || !mine.has(n)));
  return new Set(ALL.filter(n => !mine.has(n) || n === 'rain' || (BITES.includes(n) && n !== BITES[next]) || (n === 'summon' && !summonDue)
    || (n === 'spit' && !spitDue)));
}
// his lift moved on by dt towards `want` (rising slower than he drops)
export function stepLift(lift, want, dt) {
  const L = G.lift, d = want - lift, max = (d > 0 ? L.rise : L.fall) * dt;
  return lift + Math.max(-max, Math.min(max, d));
}
// is he up out of a blade's reach?
export const flying = lift => lift > 1;
// s on the ground before he next takes off in phase `phase` (Infinity: never), r in 0..1;
// first: the first of the phase
export const groundTime = (phase, r = Math.random(), first = false) => {
  const F = G.flight[phase - 1];
  return !F ? Infinity : first ? F.first : between(F.every, r);
};
export const airTime = (phase, r = Math.random()) => between(G.flight[phase - 1]?.up ?? [0, 0], r);

// --- the tilt ----------------------------------------------------------------------------------

// The tilt: { v: [x, z] (the way and how far it is tipped now: the low side, 1 at `angle`), from,
// to (where it goes from and to), phase ('level' | 'tip' | 'hold' | 'back'), t (s into it), hold
// (s it holds) }. The cube tips down towards v.
export const newTilt = () => ({ v: [0, 0], from: [0, 0], to: [0, 0], phase: 'level', t: 0, hold: 0 });
// where he lands (dx, dz from the middle of the cube, PIVOT) the world tips that way (within `near`
// of the middle: the way he faces, fx, fz); r in 0..1: how long it holds
export function tiltToward(w, dx, dz, fx = 0, fz = 1, r = Math.random()) {
  const l = Math.hypot(dx, dz), fl = Math.hypot(fx, fz) || 1;
  const to = l > G.tilt.near ? [dx / l, dz / l] : [fx / fl, fz / fl];
  Object.assign(w, { from: [...w.v], to, phase: 'tip', t: 0, hold: between(G.tilt.hold, r) });
  return to;
}
// it levels again (he takes off, or dies), from wherever it is
export function levelTilt(w) {
  if (w.phase === 'level' || (w.phase === 'back')) return;
  Object.assign(w, { from: [...w.v], to: [0, 0], phase: 'back', t: 0 });
}
const ease = u => u * u * (3 - 2 * u);
// One step of dt; returns what started ('hold', 'back', 'level') or null
export function stepTilt(w, dt) {
  const T = G.tilt;
  w.t += dt;
  const go = span => {
    const u = ease(Math.min(1, w.t / span));
    w.v = [w.from[0] + (w.to[0] - w.from[0]) * u, w.from[1] + (w.to[1] - w.from[1]) * u];
    return u >= 1;
  };
  if (w.phase === 'tip' && go(T.tip)) { Object.assign(w, { phase: 'hold', t: 0 }); return 'hold'; }
  if (w.phase === 'hold' && w.t >= w.hold) { Object.assign(w, { from: [...w.v], to: [0, 0], phase: 'back', t: 0 }); return 'back'; }
  if (w.phase === 'back' && go(T.back)) { Object.assign(w, { v: [0, 0], phase: 'level', t: 0 }); return 'level'; }
  return null;
}
// how far it is tipped (0 level .. 1 at `angle`)
export const tipped = v => Math.hypot(v[0], v[1]);
// the lean the mud settles to in the cube's coordinates (rise per cell, towards the low side), the
// cube tipped by v: that of a surface level in the world, `MUD_FLOW.lean` times over (at the tilt
// alone the basin's bumps would hold most of it where it lay; it runs to the low side, heaped there)
export const slopeOf = v => { const k = Math.tan(G.tilt.angle) * MUD_FLOW.lean; return [v[0] * k, v[1] * k]; };

// --- the mud -----------------------------------------------------------------------------------

// the middle of the cube, round which the tilt pulls
export const PIVOT = N / 2;
// where a level surface stands over (x, z) in the cube tipped so (y: its height at PIVOT, g: its
// lean, slopeOf the tilt)
export const planeY = (y, g, x, z) => y + g[0] * (x - PIVOT) + g[1] * (z - PIVOT);
// How much mud stands over the ground `samples` ({ x, z, h, a }: where, the ground's height, the
// area it stands for; world units) up to a plane at y (at PIVOT) leaning g
export function mudVolume(samples, y, g = [0, 0]) {
  let v = 0;
  for (const s of samples) {
    const d = planeY(y, g, s.x, s.z) - s.h;
    if (d > 0) v += d * s.a;
  }
  return v;
}
// The height (at PIVOT) of the plane leaning g over `samples` that holds `volume` of mud (bisected).
// No mud: under the lowest ground.
export function mudLevel(samples, volume, g = [0, 0]) {
  let lo = Infinity, hi = -Infinity, area = 0;
  for (const s of samples) {
    const base = s.h - g[0] * (s.x - PIVOT) - g[1] * (s.z - PIVOT);
    lo = Math.min(lo, base); hi = Math.max(hi, base); area += s.a;
  }
  if (!samples.length) return 0;
  if (volume <= 0) return lo - 0.01;
  hi += volume / Math.max(area, 1e-6) + 0.01;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (mudVolume(samples, mid, g) < volume) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// How the mud flows (stepMud), every `step` s: each link between two samples carries what it
// carried (`keep` of it: the mud's weight) and `pull` of the difference of their surfaces (less
// through mud thinner than `thin`: it drags on the ground); thinner than `film`, it holds still
// while the world is level (puddles). Where it is under `wet` deep a sample counts as dry.
// Tipped, the tilt pulls it `lean` times as hard as a level surface would lean (slopeOf), and what
// a hollow keeps of it over the surface all of it would settle to (`mudLevel`, as though it were
// all one pool) seeps out of it to the low side, `seep` of it a second: it all gathers there.
export const MUD_RES = 4;
export const MUD_FLOW = Object.freeze({ step: 1 / 60, most: 6, pull: 0.03, keep: 0.94, thin: 0.12, film: 0.07, wet: 0.012, tipped: 0.15,
  lean: 2, seep: 0.5 });

// A field of mud over the cells of `box` ([x0, z0, x1, z1]): groundAt(x, z) is the height of the
// ground there (null: none, a wall to the mud). { x0, z0, w, h (samples), ground, depth, qx, qz
// (what each sample passes to its +x and +z neighbour a step), acc }
export function newMudField(box, groundAt) {
  const [x0, z0, x1, z1] = box, R = MUD_RES, w = (x1 - x0) * R, h = (z1 - z0) * R, n = w * h;
  const f = { x0, z0, w, h, ground: new Float32Array(n), depth: new Float32Array(n), qx: new Float32Array(n), qz: new Float32Array(n), acc: 0 };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const g = groundAt(x0 + (i + 0.5) / R, z0 + (j + 0.5) / R);
    f.ground[j * w + i] = g == null ? Infinity : g;
  }
  return f;
}
const AREA = 1 / (MUD_RES * MUD_RES);
// where sample k is (cube coordinates)
export const sampleX = (f, k) => f.x0 + ((k % f.w) + 0.5) / MUD_RES;
export const sampleZ = (f, k) => f.z0 + (Math.floor(k / f.w) + 0.5) / MUD_RES;
// how much mud there is (cells³)
export function mudTotal(f) {
  let v = 0;
  for (let k = 0; k < f.depth.length; k++) v += f.depth[k];
  return v * AREA;
}
// the samples as mudLevel wants them
const samplesOf = f => Array.from(f.ground, (h, k) => ({ x: sampleX(f, k), z: sampleZ(f, k), h, a: AREA })).filter(s => Number.isFinite(s.h));
// filled level with `volume` of mud (its first mud: game/mud.js)
export function fillMud(f, volume) {
  const y = mudLevel(samplesOf(f), volume);
  for (let k = 0; k < f.depth.length; k++) f.depth[k] = Number.isFinite(f.ground[k]) ? Math.max(0, y - f.ground[k]) : 0;
  f.qx.fill(0); f.qz.fill(0);
}
// `vol` of mud landing at (x, z), a dome `r` cells round (on what ground there is under it)
export function depositMud(f, x, z, vol, r) {
  const R = MUD_RES, ks = [], ws = [];
  const i0 = Math.max(0, Math.floor((x - r - f.x0) * R)), i1 = Math.min(f.w - 1, Math.ceil((x + r - f.x0) * R));
  const j0 = Math.max(0, Math.floor((z - r - f.z0) * R)), j1 = Math.min(f.h - 1, Math.ceil((z + r - f.z0) * R));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const k = j * f.w + i, d = Math.hypot(sampleX(f, k) - x, sampleZ(f, k) - z);
    if (d < r && Number.isFinite(f.ground[k])) { ks.push(k); ws.push(1 - (d / r) ** 2); }
  }
  const sum = ws.reduce((a, b) => a + b, 0);
  if (!sum) return false;
  ks.forEach((k, n) => { f.depth[k] += vol / AREA * ws[n] / sum; });
  return true;
}
// One step of dt (in fixed steps of MUD_FLOW.step, at most `most` of them a call): g the pull of the
// tilt (slopeOf it: the surface it settles to rises towards the low side by g a cell), tipped:
// whether the world is tipped enough that even thin mud runs
export function stepMud(f, g, tipped, dt) {
  const F = MUD_FLOW;
  f.acc = Math.min(f.acc + dt, F.step * F.most);
  let n = 0;
  while (f.acc >= F.step) { f.acc -= F.step; flow(f, g, tipped); n++; }
  if (n && tipped && (g[0] || g[1])) seep(f, g, Math.min(1, F.seep * F.step * n));
}
// Tipped: `share` of what each sample holds over the surface all the mud would settle to (the plane
// leaning g that holds it: mudLevel) goes to those under it, as each lacks (none lost or made): the
// hollows the low side's mud cannot reach empty into it
function seep(f, g, share) {
  const { ground: G, depth: D } = f, n = D.length;
  f.samples ??= samplesOf(f);
  const total = mudTotal(f);
  if (total <= 0) return;
  const y = mudLevel(f.samples, total, g);
  f.want ??= new Float32Array(n);
  let over = 0, under = 0;
  for (let k = 0; k < n; k++) {
    const w = f.want[k] = Number.isFinite(G[k]) ? Math.max(0, planeY(y, g, sampleX(f, k), sampleZ(f, k)) - G[k]) : 0;
    if (D[k] > w) over += D[k] - w; else under += w - D[k];
  }
  const move = Math.min(over, under) * share;
  if (move <= 1e-9) return;
  const out = move / over, into = move / under;
  for (let k = 0; k < n; k++) {
    const w = f.want[k];
    D[k] += D[k] > w ? -(D[k] - w) * out : (w - D[k]) * into;
  }
}
function flow(f, g, tipped) {
  const F = MUD_FLOW, { w, h, ground: G, depth: D, qx, qz } = f, n = w * h;
  const gx = g[0] / MUD_RES, gz = g[1] / MUD_RES;   // (the pull across one sample)
  // a link's flow, from a to b (their surfaces less the tilt's pull)
  const link = (q, a, b, slope) => {
    if (!Number.isFinite(G[a]) || !Number.isFinite(G[b])) return 0;
    const drop = G[a] + D[a] - G[b] - D[b] + slope, up = drop > 0 ? D[a] : D[b];
    let v = q * F.keep + F.pull * drop * Math.min(1, up / F.thin);
    if (!tipped && ((v > 0 && D[a] < F.film) || (v < 0 && D[b] < F.film))) v = 0;
    return v;
  };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i;
    qx[k] = i + 1 < w ? link(qx[k], k, k + 1, gx) : 0;
    qz[k] = j + 1 < h ? link(qz[k], k, k + w, gz) : 0;
  }
  // no sample gives more than it has
  for (let k = 0; k < n; k++) {
    const i = k % w, out = Math.max(0, qx[k]) + Math.max(0, qz[k]) + (i > 0 ? Math.max(0, -qx[k - 1]) : 0) + (k >= w ? Math.max(0, -qz[k - w]) : 0);
    if (out <= D[k] || out <= 0) continue;
    const s = D[k] / out;
    if (qx[k] > 0) qx[k] *= s;
    if (qz[k] > 0) qz[k] *= s;
    if (i > 0 && qx[k - 1] < 0) qx[k - 1] *= s;
    if (k >= w && qz[k - w] < 0) qz[k - w] *= s;
  }
  for (let k = 0; k < n; k++) {
    const i = k % w;
    D[k] = Math.max(0, D[k] - qx[k] - qz[k] + (i > 0 ? qx[k - 1] : 0) + (k >= w ? qz[k - w] : 0));
  }
}
// Down to `volume` of mud (his death: what it was at first), `rate` of what is too much a second
export function drainMud(f, volume, rate, dt) {
  const total = mudTotal(f);
  if (total <= volume + 1e-6) return false;
  const k = Math.max(volume / total, 1 - rate * dt);
  for (let i = 0; i < f.depth.length; i++) f.depth[i] *= k;
  return true;
}
// how deep it stands at (x, z) (0 outside the field), and its surface there (-Infinity: dry)
const sampleAt = (f, x, z) => {
  const i = Math.floor((x - f.x0) * MUD_RES), j = Math.floor((z - f.z0) * MUD_RES);
  return i < 0 || j < 0 || i >= f.w || j >= f.h ? -1 : j * f.w + i;
};
export const depthAt = (f, x, z) => { const k = sampleAt(f, x, z); return k < 0 ? 0 : f.depth[k]; };
export const surfaceAt = (f, x, z) => { const k = sampleAt(f, x, z); return k >= 0 && f.depth[k] > MUD_FLOW.wet ? f.ground[k] + f.depth[k] : -Infinity; };
// Its surface in each cell of the cube (N × N, NaN: dry): where a quarter of the cell's samples or
// more are wet, the mean of their surfaces (physics/fluid.js: wading, drowning, the Mud squirtles)
export function cellSurfaces(f) {
  const out = new Float32Array(N * N).fill(NaN), R = MUD_RES;
  for (let cz = 0; cz < f.h / R; cz++) for (let cx = 0; cx < f.w / R; cx++) {
    let wet = 0, sum = 0;
    for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
      const k = (cz * R + j) * f.w + cx * R + i;
      if (f.depth[k] > MUD_FLOW.wet) { wet++; sum += f.ground[k] + f.depth[k]; }
    }
    if (wet >= R * R / 4) out[(f.z0 + cz) * N + f.x0 + cx] = sum / wet;
  }
  return out;
}

// --- his music (music/sollmeldon.scrim, core/bossmusic.js) -------------------------------------

// The moods of his song, the first before he fights, and the one playing now, from what every
// game sees of him: a head being cut off, the world tipped (his `tilt`, the way and how far: over
// a third), else his phase; before he fights (and never hurt) he lurks.
export const SOLLMELDON_MUSIC = Object.freeze(['lurk', 'phase1', 'sever', 'phase2', 'phase3', 'tilt']);
export function sollmeldonMusic(e, proxies, seen) {
  if (e.mode === 'split') return 'sever';
  const on = e.mode === 'chase' || e.mode === 'attack' || e.mode === 'alert' || e.hp < e.profile.hp || e.roused || seen.has('phase1');
  if (!on) return 'lurk';
  if (e.tilt && tipped(e.tilt) > 0.35) return 'tilt';
  return ['phase1', 'phase2', 'phase3'][Math.min(3, Math.max(1, e.stage ?? 1)) - 1];
}

// Where the balls of mud he rains while flying fall (offsets from the player, cells), seed: the same
// drop, the same spot: on the player, give or take a little
export function dropOf(seed) {
  const R = mulberry32(seed >>> 0), a = R() * Math.PI * 2, d = R() * 1.2;
  return { dx: Math.cos(a) * d, dz: Math.sin(a) * d };
}
