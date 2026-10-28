// Qualmos's fight as rules (game/qualmos.js runs it; his profile is core/enemies.js QUALMOS).
// docs/bosses.md tells the whole fight.
//
// Qualmos, from a child's drawing: a slender blue-green amphibian on six tentacles with suckers,
// two clawed arms, hard spines on his head and back and a wide grin full of teeth. He waits at the
// core of the world (depth 20), alone in its last cube, and nothing goes on below him
// (world/layout.js, cubegen/guardian.js `final`). Five phases, a fifth of his health each; no blow
// takes him below the next phase's share (`phaseFloor`), and there he rages (his `rage`: warded,
// nothing hurts him meanwhile) and fights on with the next phase's attacks on top of the ones before,
// harder each time (core/enemies.js QUALMOS_STAGES):
//   1  whip (a tentacle's sweep), grab (his hand catches you, lifts you and slams you down),
//      doubleSlam (two tentacles slam down)
//   2  waterJet (a jet that pushes you away), dive (a leap at you), inkBurst (ink that slows you),
//      bellyFlop (blown up, he flops onto you: then he lies there a moment, exposed, and takes
//      more); and from now on he slips into his lagoon now and then (QUALMOS_DIVE)
//   3  tailSpin (all his tentacles sweep round), undertow (a pull towards him)
//   4  spikeVolley (three spines at once, fanned)
//   5  tidalSurge (a wide wave that shoves)
import { QUALMOS_STAGES, enemyProfile, attacksInReach } from './enemies.js';

export const QUALMOS_PHASES = Object.freeze([
  ['whip', 'grab', 'doubleSlam'],
  ['waterJet', 'dive', 'inkBurst', 'bellyFlop'],
  ['tailSpin', 'undertow'],
  ['spikeVolley'],
  ['tidalSurge'],
]);
export const PHASES = QUALMOS_PHASES.length;

// the health below which no blow takes him in phase `phase` (0 in the last)
export const phaseFloor = (maxHp, phase) => phase < PHASES ? Math.ceil(maxHp * (PHASES - phase) / PHASES) : 0;
// the attacks he may not start in phase `phase` (names): the later phases', and his rage (only a
// new phase starts it: game/qualmos.js)
export const barred = phase => new Set(['rage', ...QUALMOS_PHASES.slice(phase).flat()]);
// Is it time for his next phase? Brought down to his floor, and not in the middle of an attack.
export const phaseDue = e => e.mode !== 'attack' && e.mode !== 'dead' && e.mode !== 'gone' && e.stage < PHASES && e.hp <= e.hpFloor;
// Into phase `phase` (1 at the start): its profile (QUALMOS_STAGES: harder each phase, his health
// the same), its floor and what it bars; from the second on he rages first.
export function enterPhase(e, phase) {
  Object.assign(e, { stage: phase, profile: enemyProfile(QUALMOS_STAGES[phase - 1], e.level || 1) });
  Object.assign(e, { hpFloor: phaseFloor(e.profile.hp, phase), barred: barred(phase) });
  if (phase === 1) return;
  Object.assign(e, { mode: 'attack', attack: e.profile.attacks.findIndex(a => a.name === 'rage'), t: 0, bit: false, speed: 0, path: null });
  e.attacks++;
}

// His belly flop is the hero's opening (he lies exposed after it), so it comes in a rhythm and only
// so: once his phase brings it, the first attack he starts with the hero in its reach is a flop,
// and after it the next one with them in reach once he has started FLOP_EVERY other attacks (his
// rages do not count); never in between. Out of its reach he fights on as ever (his jets, his ink,
// his spines).
export const FLOP_EVERY = 2;
// he starts attack `name`: counted towards the next flop (e.sinceFlop: attacks since the last)
export function counted(e, name) {
  if (name === 'rage') return;
  e.sinceFlop = name === 'bellyFlop' ? 0 : (e.sinceFlop ?? FLOP_EVERY) + 1;
}
export const flopDue = e => !barred(e.stage).has('bellyFlop') && (e.sinceFlop ?? FLOP_EVERY) >= FLOP_EVERY;
// what he may not start now, with the hero d cells away and dy above or below: his phase's bars;
// while a flop is due and the hero in its reach, everything but the flop; while none is, the flop
export function choices(e, d, dy) {
  const base = barred(e.stage), list = e.profile.attacks, flop = list.findIndex(a => a.name === 'bellyFlop');
  if (!flopDue(e)) return new Set([...base, 'bellyFlop']);
  if (!attacksInReach(e.profile, d, dy).includes(flop)) return base;
  return new Set(list.map(a => a.name).filter(n => n !== 'bellyFlop'));
}

// Into his lagoon (game/qualmos.js; its water: cubegen/guardian.js, core/bosses.js BOSS_ARENAS):
// from phase `from` on, every `every` s of the fight (between the two) he heads for the nearest of
// its water (no further than `far` steps; if he is not in it within `go` s he gives up), slips
// under its surface (`under` on him: nothing sees, hits or touches him, and he heals nothing) and
// swims under it, fast (his `burrow.speed`), to where his leap out of it lands him nearest the hero
// (with none that does, where it comes nearest them). After `hide` s (and once there, or after
// `most` s anyway) he comes up there, and if the hero is in his leap's reach and it takes him out
// of the water, leaps out at them (his `dive`); else he walks out.
export const QUALMOS_DIVE = Object.freeze({ from: 2, every: [12, 16], far: 40, go: 8, hide: [2.5, 3.5], most: 7 });
