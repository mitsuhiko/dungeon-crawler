// Monteur's fight as rules (game/monteur.js runs it; his profiles are core/enemies.js MONTEUR and
// MONTEUR_SUN). docs/bosses.md tells the whole fight.
//
// Monteur, from the kids' drawing: a moose of stone with stones floating between his antlers, who
// crumbles into a sun of stone with antlers all round it like rays. Twice the health of a boss of
// his level, half a phase. No blow takes him below half his health in phase 1 (`splits`); there he
// changes (`morphTime` s, nothing hurting him meanwhile) and fights on as the sun:
//   1 (the moose)  he throws the stones floating between his antlers, one or three at once
//                  (`stones`: he has at most `most`, each grows back in `grow` s), and charges
//                  you with his head (`charge`, now and then: a run straight at you; one that
//                  misses and runs into something leaves him dazed, `stuck`, and every blow
//                  hurts him double); Moose come up out of the floor round him (`minions`)
//   2 (the sun)    the same as a sun: the stones, rolling at you instead of charging; and he
//                  makes stones rain out of the sky round you (`rain`), turns the world
//                  (`spin`): the view turns slowly a quarter or half round and stays there
//                  (gravity stays with the floor, core/roll.js), till he turns it again; and
//                  pulls a mountain out of the floor under the fight (`mountain`, core/mountains.js:
//                  one at a time, the next a while after it is gone)
// His death turns the world back the right way up, brings his mountain down and takes his Moose
// along.
export const MONTEUR_FIGHT = Object.freeze({
  splits: [1 / 2],           // the share of his health phase 2 starts at
  morphTime: 3,              // s he changes into the sun (the clip MonteurChange), nothing hurting him
  appear: 0.5,               // s more nothing hurts him once he has changed
  stones: { most: 5, grow: 0.6 },   // the stones floating between his antlers; s one takes to grow back
  // s into the fight (phase 2: into it) before the first charge, rain and turn of the world, then
  // between one and the next
  charge: { first: [3, 4], every: [6, 9] },
  rain: { first: 3, every: [9, 12] },
  spin: { first: 5, every: [13, 18] },
  minions: [2, 2],           // the most Moose at once, phase by phase
  summonCool: [10, 12],      // s from one summon to the next
  firstSummon: [4, 7],       // s into a phase before its first summon
  leave: 0.5,                // s a minion he takes along lingers, gone, before it is let go
});
export const PHASES = 2;
const ALL = ['throw', 'volley', 'charge', 'stuck', 'summon', 'rain', 'spin', 'mountain'];
const MINE = [['throw', 'volley', 'charge', 'summon'], ['throw', 'volley', 'charge', 'summon', 'rain', 'spin', 'mountain']];
// how many stones a throw takes
export const STONES_OF = Object.freeze({ throw: 1, volley: 3 });

// the health below which no blow takes him in phase `phase` (0 in the last)
export const phaseFloor = (maxHp, phase) => phase <= MONTEUR_FIGHT.splits.length ? Math.ceil(maxHp * MONTEUR_FIGHT.splits[phase - 1]) : 0;
// how many Moose a summon brings in phase `phase` with `alive` of them about
export const summonCount = (phase, alive) => Math.max(0, (MONTEUR_FIGHT.minions[phase - 1] ?? 0) - alive);
// The attacks he may not start now (names): those of the other phases; the crash (only a charge
// that runs into something starts it, game/enemyai.js); a throw without the stones for it; the
// charge, the summon, the rain and the mountain only when due; the turn of the world when due,
// and then nothing else first.
export function barred({ phase, stones = MONTEUR_FIGHT.stones.most, chargeDue = false, summonDue = false, rainDue = false, spinDue = false, mountainDue = false }) {
  const mine = new Set(MINE[phase - 1]);
  if (spinDue && mine.has('spin')) return new Set(ALL.filter(n => n !== 'spin'));
  return new Set(ALL.filter(n => !mine.has(n) || n === 'stuck' || (STONES_OF[n] && stones < STONES_OF[n])
    || (n === 'charge' && !chargeDue) || (n === 'summon' && !summonDue) || (n === 'rain' && !rainDue) || (n === 'mountain' && !mountainDue)
    || n === 'spin'));
}
// his stones: `n` thrown (the one growing back stays as far as it got), and dt later
export const takeStones = (stones, n) => Math.max(0, stones - n);
export const growStones = (stones, dt) => Math.min(MONTEUR_FIGHT.stones.most, stones + dt / MONTEUR_FIGHT.stones.grow);
// The quarter (0..3: how far round the world is turned, game/roll.js) he turns it to next from
// `at` (r: 0..1): a quarter either way or half round, never staying where it is
export function nextQuarter(at, r) {
  const steps = [1, 3, 2];
  return (at + steps[Math.min(2, Math.floor(r * 3))]) % 4;
}
