// Local endboss prototype: five HP-gated phases, eleven reusable attacks.
// Native level 22 (depth 20 descent tier). HP is twice Slomo's native 3380 HP.
import { QUALMOS_GRAB } from './qualmos-grip.js';
export const AMPHIBIAN_MAX_HP = 6760;
export const AMPHIBIAN_LEVEL = 22;
export const amphibianPhase = (hp, maxHp) => Math.min(5, Math.max(1, 1 + Math.floor((1 - hp / maxHp + 1e-9) * 5)));
export const amphibianFloor = (phase, hp) => phase < 5 ? hp * (5 - phase) / 5 : 0;
const reason = 'Hit by the amphibian!';
const attack = (name, clip, phase, duration, hitAt, rest = {}) => ({
  name, clip, phase, weight: 1, reach: 3.2, hitReach: 3.5, minReach: 0,
  attackTime: duration, hitAt, trackUntil: Math.max(.1, hitAt - .45),
  arc: .25, power: 1, knock: 4, knockDown: false, hop: 3, reason, ...rest,
});
export const AMPHIBIAN_ATTACKS = [
  attack('whip', 'whip', 1, 1.8, 1.05, { hitReach: 3.6, arc: -.1 }),
  attack('grab', 'grab', 1, 3.4, .9, { reach: 3.6, hitReach: 2.9, power: 1.05, weight: 6,
    knockDown: true, hop: 0, recover: 1.2, grab: QUALMOS_GRAB,
    lunge: { from: .25, to: .65, max: .9, stop: 1.5 } }),
  attack('doubleSlam', 'doubleSlam', 1, 2.2, 1.2, { arc: -.2, power: 1.2, knockDown: true }),
  attack('waterJet', 'waterJet', 2, 3.2, 1.2, { reach: 8, minReach: 2, hitReach: 0, power: .7,
    gust: { kind: 'jet', thunder: [], time: 1.1, range: 8.5, width: .35, spread: .12, push: 7, pushTime: .4, muzzle: [0, 2.6, .36] } }),
  attack('dive', 'dive', 2, 2.8, 1.5, { reach: 6, hitReach: 3, power: 1.15, knockDown: true,
    lunge: { from: .8, to: 1.4, max: 3.5, stop: 1.4 } }),
  attack('inkBurst', 'inkBurst', 2, 2.4, 1.3, { reach: 7, minReach: 2.5, hitReach: 0, power: .6,
    projectile: { kind: 'slimeball', speed: 6, radius: .22, range: 9, muzzle: [0, 2.6, .35], slow: { time: 1.5, slow: .65, source: 'slime' } } }),
  attack('tailSpin', 'tailSpin', 3, 2.4, 1.3, { arc: -1, hitReach: 3.6, power: 1.15, knockDown: true }),
  attack('undertow', 'undertow', 3, 3, 1, { reach: 7, hitReach: 0, power: 0,
    pull: { time: 1.3, range: 7.5, width: .6, spread: .35, speed: 2.8, hold: .7, stop: 2.2, muzzle: [0, 1, .4] } }),
  attack('spikeVolley', 'spikeVolley', 4, 2.8, 1.2, { reach: 9, minReach: 2, hitReach: 0, power: .5,
    projectile: { kind: 'iceball', speed: 8, radius: .15, range: 11, volley: 3, fan: .22, muzzle: [0, 2.9, .2] } }),
  attack('tidalSurge', 'tidalSurge', 5, 3.2, 1.7, { reach: 8, hitReach: 0, power: .9,
    gust: { kind: 'jet', thunder: [], time: .8, range: 9, width: 1.1, spread: .22, push: 9, pushTime: .5, muzzle: [0, 1.2, .5] } }),
  attack('bellyFlop', 'bellyFlop', 5, 4.5, 2.3, { reach: 4.5, hitReach: 4.6, arc: -1, power: 1.5, knockDown: true,
    exposed: { from: 2.65, until: 3.7, damage: 1.5 }, recover: 2.2 }),
  attack('rage', 'rage', 1, 2.5, 2, { weight: 0, reach: 0, hitReach: 0, power: 0, cast: 'transition', ward: true }),
];
export const amphibianBarred = phase => new Set(AMPHIBIAN_ATTACKS.filter(a => a.phase > phase || a.name === 'rage').map(a => a.name));
// Escalation is derived from the original profile, never multiplied onto itself every frame.
export function amphibianPressure(stage) {
  const k=Math.max(0,Math.min(4,stage-1));
  return { damage:1+.12*k, chase:1+.14*k, cooldown:1-.1*k };
}
export const AMPHIBIAN_WATER_SECONDS = 6.4;
// A bounded retreat: swim to the lagoon, hide under its surface, then come back to the bank.
// It never heals the boss or leaves the fight permanently unreachable.
export function amphibianWaterPose(seconds, from, lagoon) {
  const smooth = t => { t=Math.max(0,Math.min(1,t));return t*t*(3-2*t); };
  const out=smooth(seconds/1.4), back=smooth((seconds-5)/1.4);
  const sink=smooth((seconds-1.4)/.9)*(1-smooth((seconds-4.1)/.9));
  const swim=out*(1-back);
  return { x:from.x+(lagoon.x-from.x)*swim, z:from.z+(lagoon.z-from.z)*swim,
    y:from.y+(lagoon.bed-from.y)*sink, under:sink>.95, done:seconds>=AMPHIBIAN_WATER_SECONDS };
}
