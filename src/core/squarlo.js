// Squarlo's fight as rules (game/squarlo.js runs it; his profiles are core/enemies.js SQUARLO and
// SQUARLO_GIANT). docs/bosses.md tells the whole fight.
//
// Phase 1 (full health to half): tiny and super fast, he blows jets of water and summons
// Squirtles (a summon fills up to `minions[0]`). In both phases he calls the tide: once it is due
// he starts nothing else (`tide.first` s into the fight, then `tide.every` s after it drained).
// While he casts nothing hurts him; at the cast's hit frame the water starts to rise (`rise` s,
// from his arena's rest level to its high tide: cubegen/guardian.js map.tide), stands `high` s
// and falls back (`fall` s). While it is up (rising, standing or falling) he blows no water.
// After every tide, and after every `restAfter` other attacks (of his phase), he has to rest: then
// nothing else.
// At half his health he stops (no blow takes him below it): a fog rolls in and he grows into a
// giant for `morphTime` s, nothing hurting him, and fights on (phase 2): stomping, jumping onto
// the player, kicking and blasting his water cannon (core/enemies.js SQUARLO_GIANT), with up to
// `minions[1]` Squirtles. His death drains the tide and takes the Squirtles along.
// His tide is water: over the head, one swims in it (physics/move.js), slowly, and strikes nothing
// meanwhile; the hills stay out of it.
export const SQUARLO_FIGHT = Object.freeze({
  split: 0.5,             // the share of his health he turns into a giant at
  morphTime: 3.2,         // s the fog rolls in and he grows
  appear: 0.6,            // s more nothing hurts him once he is a giant
  tide: { first: 8, every: [13, 19], rise: 3.5, high: 6, fall: 3.6 },
  minions: [3, 2],        // the most Squirtles at once, phase 1 / 2: a summon fills up to that
  summonCool: [9, 11],    // s from one summon to the next, phase 1 / 2
  firstSummon: 4,         // s into the fight before his first summon
  restAfter: [3, 5],      // other attacks before he has to rest, phase 1 / 2
  leave: 0.5,             // s a Squirtle he takes along lingers, gone, before it is let go
});
const ALL = ['blow', 'tide', 'summon', 'rest', 'stomp', 'jump', 'kick', 'cannon'];

// the health he turns into a giant at (and cannot be taken below before)
export const splitHp = maxHp => Math.ceil(maxHp * SQUARLO_FIGHT.split);
// how many Squirtles a summon brings in phase `phase` with `alive` of them about
export const summonCount = (phase, alive) => Math.max(0, SQUARLO_FIGHT.minions[phase - 1] - alive);

// The tide: { phase: 'rest' | 'rise' | 'high' | 'fall', t (s into the phase), k (0 at rest .. 1
// at high tide) }. One step of dt; returns what started ('high', 'fall', 'rest') or null.
export const newTide = () => ({ phase: 'rest', t: 0, k: 0 });
export function stepTide(w, dt) {
  const T = SQUARLO_FIGHT.tide;
  w.t += dt;
  if (w.phase === 'rise') {
    w.k = Math.min(1, w.k + dt / T.rise);
    if (w.k >= 1) { w.phase = 'high'; w.t = 0; return 'high'; }
  } else if (w.phase === 'high') {
    if (w.t >= T.high) { w.phase = 'fall'; w.t = 0; return 'fall'; }
  } else if (w.phase === 'fall') {
    w.k = Math.max(0, w.k - dt / T.fall);
    if (w.k <= 0) { w.phase = 'rest'; w.t = 0; return 'rest'; }
  }
  return null;
}
// the tide called: it rises from wherever it stands
export function raiseTide(w) { w.phase = 'rise'; w.t = 0; }
// let it fall (his death)
export function drainTide(w) { if (w.phase !== 'rest') { w.phase = 'fall'; w.t = 0; } }
// the level (in levels) the arena's water stands at for the share k: map.tide's rest to high
export const tideLevel = (tide, k) => tide.rest + (tide.high - tide.rest) * k;

// The attacks he may not start now (names): only the tide when it is due (and he has a tide),
// else only a rest when it is due; no tide otherwise, no jet while the water is up, a summon
// only when it is due.
export function barred({ tideDue, restDue, summonDue, waterUp }) {
  if (tideDue) return new Set(ALL.filter(n => n !== 'tide'));
  if (restDue) return new Set(ALL.filter(n => n !== 'rest'));
  return new Set(ALL.filter(n => n === 'tide' || n === 'rest' || (n === 'blow' && waterUp) || (n === 'summon' && !summonDue)));
}

// A giant's jump (core/enemies.js SQUARLO_GIANT's `jump`): how high over the straight line from
// where he sprang off to where he lands he is at the share u (0..1) of the flight: up fast, a
// little longer at the top, and down faster than up.
export function jumpLift(jump, u) {
  const v = Math.min(1, Math.max(0, u)) ** 0.8;
  return jump.height * 4 * v * (1 - v);
}

// A shockwave (an attack's `wave`: a stomp, a landing; game/quakes.js) running out over the floor
// from where it struck: { x, y, z, t (s since), spec }. Its front is `speed` × t out, up to `reach`;
// it catches a body on the ground (the caller's: not one in the air) whose feet are within `rise`
// of its level and whose body the front passed over between `r0` (its radius a step ago) and now,
// `width` included.
export const waveRadius = w => Math.min(w.spec.reach, w.spec.speed * w.t);
export const waveOver = w => w.spec.speed * w.t >= w.spec.reach + w.spec.width;
export function inWave(w, r0, p) {
  const r = waveRadius(w), d = Math.hypot(p.x - w.x, p.z - w.z), pr = p.r ?? 0.3;
  if (Math.abs(p.y - w.y) > w.spec.rise || r0 >= w.spec.reach) return false;
  return d + pr >= Math.max(0, r0 - w.spec.width) && d - pr <= r;
}
