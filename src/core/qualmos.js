// Qualmos's fight as rules (game/qualmos.js runs it; his profile is core/enemies.js QUALMOS).
// docs/bosses.md tells the whole fight.
//
// Qualmos, from a child's drawing: a slender blue-green amphibian on six tentacles with suckers,
// two clawed arms, hard spines on his head and back and a wide grin full of teeth. He waits at the
// core of the world (depth 20), alone in its last cube, and nothing goes on below him
// (world/layout.js, cubegen/guardian.js `final`). Five phases, a fifth of his health each; no blow
// takes him below the next phase's share (`phaseFloor`), and there he rages (his `rage`: warded,
// nothing hurts him meanwhile) and fights on with the next phase's attacks on top of the ones before:
//   1  whip (a tentacle's sweep), grab (an arm reaches out), doubleSlam (two tentacles slam down)
//   2  waterJet (a jet that pushes you away), dive (a leap at you), inkBurst (ink that slows you),
//      bellyFlop (he flops onto you, then lies exposed and takes more)
//   3  tailSpin (all his tentacles sweep round), undertow (a pull towards him)
//   4  spikeVolley (three spines at once, fanned)
//   5  tidalSurge (a wide wave that shoves)
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
// Into phase `phase` (1 at the start): its floor and what it bars; from the second on he rages first.
export function enterPhase(e, phase) {
  Object.assign(e, { stage: phase, hpFloor: phaseFloor(e.profile.hp, phase), barred: barred(phase) });
  if (phase === 1) return;
  Object.assign(e, { mode: 'attack', attack: e.profile.attacks.findIndex(a => a.name === 'rage'), t: 0, bit: false, speed: 0, path: null });
  e.attacks++;
}
