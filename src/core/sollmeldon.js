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
// His mud (game/mud.js, map.tide `mud`): it has a volume, not a level. Its surface is a plane over
// the basin (y + g · (p - PIVOT), cells), its height solved so that what stands over the ground
// under it is its volume (`mudLevel`). While the world is level the plane is flat and the mud
// shallow; tipped, the plane leans (the mud stays level in the world while the cube tips under it,
// render/game/tilt.js turns the view) and the low side is deep. The plane's lean follows the
// tilt on a spring (`stepSlosh`): the mud surges over, overshoots a little and settles. Every ball
// of mud he spits leaves a puddle that stays where it is (it only slows) until the world tips: then
// it runs downhill (`flowPuddle`) into the mud, and the mud grows by it. There is no limit to it;
// his death drains it back to what it was at first.
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
  // till he takes off), levelling in `back` s. The mud's lean follows it on a spring (`slosh`:
  // its frequency, Hz, and damping).
  tilt: { angle: 6 * Math.PI / 180, near: 1.5, tip: 1.6, hold: [8, 12], back: 2.6, slosh: { freq: 0.42, damp: 0.38 } },
  // His mud: a ball's worth (cells³ of mud; it lands as a puddle `radius` cells round, bigger the
  // more it holds, at most `most`), a head's; puddles that overlap by `merge` of their radii run
  // together; on a tilt they run downhill at up to `flow` cells/s (no step up over `climb`), and
  // into the mud where its surface reaches them. Wading through his mud slows (`wade`), and a
  // puddle slows too (`slow`).
  mud: { ball: 0.5, head: 5, radius: 0.7, most: 1.8, merge: 0.55, flow: 2.6, climb: 0.35,
    slow: { time: 0.35, slow: 0.7, source: 'mud' }, wade: { time: 0.35, slow: 0.75, source: 'mud' } },
  spit: { first: 3, every: [4.5, 7] },   // s into the fight before he first spits mud on the ground, then between (in between he comes to bite)
  minions: [2, 2, 3],         // the most Mud squirtles at once, phase by phase
  summonCool: [12, 11, 9],    // s from one summon to the next
  firstSummon: [6, 4, 3],     // s into a phase before its first summon
  rescue: 0.25,               // what drowning in his mud costs, of one's most health (game/fluidrescue.js)
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
// the lean of a surface that stays level in the world, in the cube's coordinates (rise per cell,
// towards the low side), the cube tipped by v
export const slopeOf = v => { const k = Math.tan(G.tilt.angle); return [v[0] * k, v[1] * k]; };

// The mud's lean on its spring: s = { g: [x, z], u: [x, z] (how fast it changes) }, towards `want`
// (slopeOf the tilt), one step of dt
export const newSlosh = () => ({ g: [0, 0], u: [0, 0] });
export function stepSlosh(s, want, dt) {
  const w = 2 * Math.PI * G.tilt.slosh.freq, z = G.tilt.slosh.damp, n = Math.max(1, Math.ceil(dt / 0.02)), h = dt / n;
  for (let i = 0; i < n; i++) for (const k of [0, 1]) {
    s.u[k] += (w * w * (want[k] - s.g[k]) - 2 * z * w * s.u[k]) * h;
    s.g[k] += s.u[k] * h;
  }
  return s;
}

// --- the mud -----------------------------------------------------------------------------------

// the middle of the cube, round which the mud's plane leans
export const PIVOT = N / 2;
// where the plane of the mud (y: its height at PIVOT, g: its lean) stands over (x, z)
export const planeY = (y, g, x, z) => y + g[0] * (x - PIVOT) + g[1] * (z - PIVOT);
// How much mud stands over the ground `samples` ({ x, z, h, a }: where, the ground's height, the
// area it stands for; world units), its plane at y (at PIVOT) leaning g
export function mudVolume(samples, y, g = [0, 0]) {
  let v = 0;
  for (const s of samples) {
    const d = planeY(y, g, s.x, s.z) - s.h;
    if (d > 0) v += d * s.a;
  }
  return v;
}
// The height (at PIVOT) of the plane leaning g over `samples` that holds `volume` of mud (bisected:
// the volume grows with the height). No mud: under the lowest ground.
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

// A puddle: { x, z, y (the ground under it), vol (cells³), r (how far round, cells) }.
export const puddleRadius = vol => Math.min(G.mud.most, G.mud.radius * Math.sqrt(Math.max(0, vol) / G.mud.ball));
export const newPuddle = (x, y, z, vol = G.mud.ball) => ({ x, y, z, vol, r: puddleRadius(vol) });
// puddles that overlap run together (their mud kept, the bigger one's middle drawn towards the
// smaller's by what it brings); returns the list
export function mergePuddles(list) {
  const out = [...list];
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
    const a = out[i], b = out[j];
    if (Math.hypot(a.x - b.x, a.z - b.z) > (a.r + b.r) * G.mud.merge || Math.abs(a.y - b.y) > 0.6) continue;
    const vol = a.vol + b.vol, k = b.vol / vol;
    Object.assign(a, { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, y: a.vol >= b.vol ? a.y : b.y, vol, r: puddleRadius(vol) });
    out.splice(j, 1); j = i;
  }
  return out;
}
// One step of a puddle running downhill on the tipped world (g: the mud's lean, the way the cube
// tips; ground(x, z, y): the height of the ground there for something at y, null: none; level(x,
// z): the mud's surface there, or -Infinity): it runs along g, as fast as the tilt is steep, never
// up a step higher than `climb` (then along whatever way of it is open). Returns 'still' (level),
// 'stuck', 'flow' or 'in' (it reached the mud).
export function flowPuddle(p, g, dt, ground, level) {
  const l = Math.hypot(g[0], g[1]);
  if (level(p.x, p.z) >= p.y - 0.02) return 'in';
  if (l < 1e-3) return 'still';
  const speed = G.mud.flow * Math.min(1, l / Math.tan(G.tilt.angle)), dx = g[0] / l * speed * dt, dz = g[1] / l * speed * dt;
  for (const [mx, mz] of [[dx, dz], [dx, 0], [0, dz]]) {
    if (Math.hypot(mx, mz) < 1e-6) continue;
    const h = ground(p.x + mx, p.z + mz, p.y);
    if (h == null || h - p.y > G.mud.climb) continue;
    p.x += mx; p.z += mz; p.y = h;
    return level(p.x, p.z) >= p.y - 0.02 ? 'in' : 'flow';
  }
  return 'stuck';
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
