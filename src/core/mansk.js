// Mansk's fight as rules (game/mansk.js runs it; his profiles are core/enemies.js MANSK, MANSK_SKY
// and MANSK_RIBBONS). docs/bosses.md tells the whole fight.
//
// Mansk, from the kids' drawing: a white mask floating with nobody behind it, a big round mouth
// with darkness behind it, two dots for eyes, a blue diamond on his forehead and two long wavy
// beige horns. He waits on the stage of a museum, like a mask on show (his arena, cubegen/arenashapes.js `stage`). Three phases, a third of his health each;
// no blow takes him below the next phase's share (`splits`), and there he changes (`change` s,
// nothing hurting him meanwhile):
//   1 (horns)       he floats low and lands now and then (`lift`); he breathes in (`inhale`): what
//                   is in front of his mouth is pulled in, and one it gets into his mouth is
//                   chewed (a lot of damage) and spat out; out of his horns he calls glowing balls
//                   that hang there a moment, then shoot at the player and burst where they hit,
//                   hurting all round (`orbs`); and Tornados (`minions`)
//   2 (horns, up)   he roars and flies up high, out of reach of a blade, and comes down to land
//                   for a while, then up again (`flight`); up there he throws balls and calls
//                   Tornados, down he breathes in; and now and then he slows time (`slow`): the
//                   players and his Tornados go slower for a while, he does not
//   3 (ribbons)     his horns crack and break off, and out of their stumps come long red ribbons
//                   that fly round him like a mask's ties (core/ribbon.js): they reach out, grab a player, squeeze
//                   them and let them go (`lash`), and he whirls round, the ribbons sweeping all
//                   round him (`whirl`); he breathes in, calls Tornados and slows time, more
//                   often; the balls are gone with the horns
// His death takes his Tornados along.
export const MANSK_FIGHT = Object.freeze({
  splits: [2 / 3, 1 / 3],     // the shares of his health phase 2 and phase 3 start at
  change: [2.2, 2.8],         // s he changes into phase 2 (a roar, up into the air) and 3 (the horns break)
  breakAt: 36 / 30,           // s into his change to phase 3 the horns break (the clip ManskBreak)
  grow: 1.4,                  // s the ribbons take to come all the way out of the stumps after that
  appear: 0.5,                // s more nothing hurts him once he has changed
  // how high he floats over the floor (cells): low, landed (a blade reaches him), up (only shots
  // do); how fast he goes up and down (cells/s)
  lift: { low: 0.35, landed: 0, up: 2.1, rise: 1.6, fall: 3 },
  // phases 2 and 3: s up in the air, s down on the floor; phase 1: s between landings, s landed
  flight: [{ up: [9, 13], down: [3, 4] }, { up: [6, 8], down: [5, 6.5] }, { up: [4.5, 6], down: [5, 6.5] }],
  // breathing in: what gets this close to his mouth (cells, its middle to the body) goes in; s into a
  // phase before he first breathes in, then between one breath and the next (longer after a gulp)
  gulp: 0.75,
  inhale: { first: [5, 4, 4], every: [10, 14], gulped: 16 },
  orbs: { count: [2, 3, 0], hang: 1, speed: 8, bob: 0.08, every: [5, 8] },   // balls of a cast, phase by phase; s they hang; cells/s
  minions: [2, 5, 4],         // the most Tornados at once, phase by phase
  summonCool: [12, 9, 10],    // s from one summon to the next
  firstSummon: [6, 3, 4],     // s into a phase before its first summon
  // slowing time: phases 2 and 3; s it lasts, how slow the players and his Tornados go
  slow: { first: [Infinity, 5, 4], every: [Infinity, 16, 12], time: [0, 4, 5], players: 0.5, minions: 0.4 },
  leave: 0.5,                 // s a minion he takes along lingers, gone, before it is let go
});
export const PHASES = 3;
const ALL = ['inhale', 'spit', 'orbs', 'summon', 'slow', 'lash', 'whirl'];
const MINE = [['inhale', 'orbs', 'summon'], ['inhale', 'orbs', 'summon', 'slow'], ['inhale', 'lash', 'whirl', 'summon', 'slow']];
// what he can only do down low (his mouth and his ribbons reach the floor from there)
const LOW = new Set(['inhale', 'lash', 'whirl']);

// the health below which no blow takes him in phase `phase` (0 in the last)
export const phaseFloor = (maxHp, phase) => phase <= MANSK_FIGHT.splits.length ? Math.ceil(maxHp * MANSK_FIGHT.splits[phase - 1]) : 0;
// how many Tornados a summon brings in phase `phase` with `alive` of them about
export const summonCount = (phase, alive) => Math.max(0, (MANSK_FIGHT.minions[phase - 1] ?? 0) - alive);
// The attacks he may not start now (names): those of the other phases; the spit (only a gulp
// starts it: game/mansk.js); up in the air what needs him low; breathing in, the summon, the balls
// and the slowing only when due.
export function barred({ phase, low = true, inhaleDue = false, summonDue = false, orbsDue = true, slowDue = false }) {
  const mine = new Set(MINE[phase - 1]);
  return new Set(ALL.filter(n => !mine.has(n) || n === 'spit' || (LOW.has(n) && !low) || (n === 'inhale' && !inhaleDue)
    || (n === 'summon' && !summonDue) || (n === 'orbs' && !orbsDue) || (n === 'slow' && !slowDue)));
}
// how high he wants to float: phase 1 low (landed while `down`), phases 2 and 3 up or landed
export function liftFor(phase, down) {
  const L = MANSK_FIGHT.lift;
  return down ? L.landed : phase === 1 ? L.low : L.up;
}
// his lift moved on by dt towards `want` (rising slower than he drops)
export function stepLift(lift, want, dt) {
  const L = MANSK_FIGHT.lift, d = want - lift, max = (d > 0 ? L.rise : L.fall) * dt;
  return lift + Math.max(-max, Math.min(max, d));
}
// is he low enough for his mouth and his ribbons (and a blade)?
export const lowEnough = lift => lift < 0.6;
// where a ball hangs before it shoots (model space: x, up, forward), the i-th of n: at the tips
// of his horns (`tips`: [left, right]), a third over his diamond; bobbing a little at time t
export function orbSpot(tips, diamond, i, t) {
  const at = i < 2 ? tips[i] : [diamond[0], diamond[1] + 0.45, diamond[2] + 0.2], b = MANSK_FIGHT.orbs.bob;
  return [at[0], at[1] + b * Math.sin(t * 7 + i * 2.1), at[2]];
}
