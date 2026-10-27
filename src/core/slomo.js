// Slomo's fight as rules (game/slomo.js runs it; his profiles are core/enemies.js SLOMO,
// SLOMO_LEGS and SLOMO_SLUG). docs/bosses.md tells the whole fight.
//
// Two phases, half his health each. No blow takes him below the slug's share of his health
// (`splits`); there he changes (`morphTime` s, nothing hurting him meanwhile: the blob bursts and
// the slug inside it turns round) and fights on with the slug's attacks:
//   1 (a blob)      a great see-through blob of slime with two slug arms: he throws the slugs at
//                   the end of his arms (each lands where it flies and comes to life: an arm slug
//                   that crawls after the player, latches on and dies; the arm grows a new one,
//                   `arms.grow`) and spits slime meteorites up into the sky that come down round
//                   the player (`rain`)
//   2 (the slug)    the slug alone, on its legs: he spits slime, calls slimes out of himself (up to
//                   `minions.slimes`: Ooze slugs and Ooze bolimes) and Slime squirtles (up to
//                   `minions.squirtles`), floods the bowl with slime from one side (`flood`) and
//                   the meteorites
// The flood comes in from a side of his bowl (a different one each time, at random): its front
// runs across in `surge` s, the slime stands `high` s and drains away in `drain` s. It never stands
// over anyone's head; it slows whoever wades through it (`slow`: the slime's, on top of the wading).
// His death drains the flood and takes his minions along. His arena is always at night.
import { mulberry32 } from './util.js';

export const SLOMO_FIGHT = Object.freeze({
  splits: [1 / 2],           // the share of his health phase 2 starts at
  morphTime: 3.2,            // s he changes into the slug, nothing hurting him
  appear: 0.5,               // s more nothing hurts him once he has changed
  arms: { grow: 3 },         // s a slug arm he threw takes to grow back
  armSlugs: 4,               // the most arm slugs about at once (more thrown ones melt where they land)
  armLife: 8,                // s an arm slug crawls after the player before it melts away
  // an arm slug that reaches the player latches on (`reach` cells from it): it bites every `bite` s
  // (`power` of its damage, slowing), and after `hold` s it drops off dead
  latch: { reach: 0.75, bite: 0.6, hold: 2.4, power: 0.5, slow: { time: 0.8, slow: 0.6, source: 'slime' } },
  // the meteorites he spits up: when the first one is due after the fight starts, then between
  // casts (s); they come down round the player (game/meteors.js rainOf)
  rain: { first: 4, every: [8, 12] },
  flood: { first: 5, every: [13, 19], surge: 2.4, high: 1.5, drain: 10, slow: { time: 0.35, slow: 0.72, source: 'slime' } },
  minions: { slimes: 5, squirtles: 2 },   // phase 2: the most slimes (Ooze slugs, Ooze bolimes) / Slime squirtles at once
  summonCool: { slimes: 8, squirtles: 12 },   // s from one summon of each to the next
  firstSummon: 2,            // s into phase 2 before his first summons
  leave: 0.5,                // s a minion he takes along lingers, gone, before it is let go
});
const ALL = ['armL', 'armR', 'meteor', 'flood', 'spit', 'summon', 'squirtle'];
const MINE = [['armL', 'armR', 'meteor'], ['spit', 'summon', 'squirtle', 'flood', 'meteor']];

// the health below which no blow takes him in phase `phase` (0 in the last)
export const phaseFloor = (maxHp, phase) => phase <= SLOMO_FIGHT.splits.length ? Math.ceil(maxHp * SLOMO_FIGHT.splits[phase - 1]) : 0;
// how many a summon of `name` ('slimes' or 'squirtles') brings with `alive` of them about
export const summonCount = (name, alive) => Math.max(0, (SLOMO_FIGHT.minions[name] ?? 0) - alive);
// The attacks he may not start now (names): those of the other phases; the flood when it is due,
// and then nothing else; the Slime squirtles when due (his flood is up for them to live in,
// game/slomo.js), and then nothing else either; the meteorites and the summons only when due; an
// arm throw only while he has that slug arm.
export function barred({ phase, arms = [1, 1], floodDue = false, rainDue = false, slimesDue = false, squirtlesDue = false }) {
  const mine = new Set(MINE[phase - 1]);
  if (floodDue && mine.has('flood')) return new Set(ALL.filter(n => n !== 'flood'));
  if (squirtlesDue && mine.has('squirtle')) return new Set(ALL.filter(n => n !== 'squirtle'));
  return new Set(ALL.filter(n => !mine.has(n) || n === 'flood' || (n === 'meteor' && !rainDue) || (n === 'armL' && arms[0] < 1)
    || (n === 'armR' && arms[1] < 1) || (n === 'summon' && !slimesDue) || (n === 'squirtle' && !squirtlesDue)));
}

// The flood: { phase: 'dry' | 'surge' | 'high' | 'drain', t (s into the phase), k (0 dry .. 1 its
// height), front (0 .. 1: how far across the bowl its front has come), side (0..3: where it comes
// in from, cubegen/arenashapes.js floodBox) }. One step of dt; returns what started, or null.
export const newFlood = () => ({ phase: 'dry', t: 0, k: 0, front: 0, side: 0 });
export function stepFlood(w, dt) {
  const T = SLOMO_FIGHT.flood;
  w.t += dt;
  if (w.phase === 'surge') {
    w.k = 1;
    w.front = Math.min(1, w.front + dt / T.surge);
    if (w.front >= 1) { w.phase = 'high'; w.t = 0; return 'high'; }
  } else if (w.phase === 'high') {
    if (w.t >= T.high) { w.phase = 'drain'; w.t = 0; return 'drain'; }
  } else if (w.phase === 'drain') {
    w.k = Math.max(0, w.k - dt / T.drain);
    if (w.k <= 0) { Object.assign(w, { phase: 'dry', t: 0, front: 0 }); return 'dry'; }
  }
  return null;
}
// the flood called, from side `side` (another than the last one, r in 0..1)
export function raiseFlood(w, r = Math.random()) {
  const side = (w.side + 1 + Math.floor(r * 3)) % 4;
  Object.assign(w, { phase: 'surge', t: 0, k: 1, front: 0, side });
  return side;
}
// let it drain (his death), from wherever it stands
export function drainFlood(w) { if (w.phase !== 'dry') Object.assign(w, { phase: 'drain', t: 0, front: 1 }); }
// the part of `box` ([x0, z0, x1, z1]) the flood has reached: from side `side` (0 +x, 1 -x, 2 +z,
// 3 -z: the side it comes in from, the way DIRS go) to `front` of the way across
export function floodBox(box, side, front) {
  const [x0, z0, x1, z1] = box, u = Math.min(1, Math.max(0, front));
  if (side === 0) return [x1 - (x1 - x0) * u, z0, x1, z1];
  if (side === 1) return [x0, z0, x0 + (x1 - x0) * u, z1];
  if (side === 2) return [x0, z1 - (z1 - z0) * u, x1, z1];
  return [x0, z0, x1, z0 + (z1 - z0) * u];
}

// The meteorites of one cast (an attack's `rain`: count, spread [least, most cells from the
// player], stagger s between them), as offsets from where the player stands when he spits them:
// the first right on them (a little off), the rest round them. seed: the same cast, the same rain.
export function rainOf(rain, seed) {
  const R = mulberry32(seed >>> 0), out = [], [lo, hi] = rain.spread;
  for (let i = 0; i < rain.count; i++) {
    const a = R() * Math.PI * 2, d = i === 0 ? R() * 0.5 : lo + R() * (hi - lo);
    out.push({ dx: Math.cos(a) * d, dz: Math.sin(a) * d, delay: i * rain.stagger });
  }
  return out;
}
