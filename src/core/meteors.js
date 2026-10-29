// Slime meteorites: at the world's night (core/daycycle.js) in a theme with `meteors` (the slime marsh),
// lumps of glowing slime fall out of the sky. Pure rules; game/meteors.js lets them fall,
// render/meteors.js draws them.
//
// When and where they come down is the world's and the cube's (its seed, its key, which night of
// the world's play time it is), so every game playing together sees the same ones: every so often
// (`every` s) through the night, each on a floor of the cube open to the sky. A share of them
// (`aimed`) comes down near the player instead, in each game near its own (those a friend does
// not see). Each one first shows where it will land (a shadow growing for `warn` s), then falls
// the last `fall` of them; where it lands, whoever is within `radius` is hit (the blow: its damage
// grows with the depth like the enemies'; knocked back, slowed: core/status.js), the enemies too,
// and a splat of slime is left that slows whoever wades through it for `splat.time` s. Under a
// roof (a slab, an arch, a tunnel) nothing reaches you.
import { mulberry32, hash32 } from './util.js';
import { DAY } from './daycycle.js';
import { GROWTH, depthLevel } from './enemies.js';
import { msg } from '../i18n/i18n.js';

export const METEOR = {
  every: [2, 4],       // s between two in a cube
  warn: 1.7,           // s its shadow shows before it lands
  notice: 0.6,         // s its shadow must have shown for it to hit the player (game/meteors.js)
  fall: 0.55,          // s it falls (the end of the warning)
  sky: 14,             // how high over its spot it comes from
  aimed: 1 / 3,        // the share that comes down near the player
  near: 0.9,           // how far beside the player an aimed one lands at most
  radius: 1.1,         // whom it hits where it lands
  damage: 16, knock: 3.5, slow: { time: 2, slow: 0.55, source: 'slime' },
  splat: { radius: 0.9, time: 6, slow: { time: 0.4, slow: 0.65, source: 'slime' } },
};

const keyHash = key => { let h = 2166136261; for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619); return h >>> 0; };

// the meteorites of night n (counted from 0) of cube `key`: [{ id, t (the time of day's clock,
// game/daycycle.js dayClock, it lands), u, v (0..1: where, game/meteors.js), aimed }]
export function nightMeteors(seed, key, n) {
  const R = mulberry32(hash32((seed >>> 0) ^ keyHash(key) ^ Math.imul(n + 1, 0x2c1b3c6d) ^ 0x3e7e0));
  // (landing from once it is all night to the dawn, their shadows from late in the dusk:
  // core/daycycle.js)
  const night = n * DAY.length + DAY.day + DAY.dusk, start = night + 0.5, end = night + DAY.night;
  const [lo, hi] = METEOR.every, out = [];
  for (let t = start + R() * lo; t < end; t += lo + R() * (hi - lo)) out.push({ id: `${n}:${out.length}`, t, u: R(), v: R(), aimed: R() < METEOR.aimed });
  return out;
}
// those showing at `clock`: from their warning on until they have landed (and `after` s more)
export function meteorsAt(seed, key, clock, after = 0.1) {
  const n = Math.floor(clock / DAY.length);
  return [n - 1, n].filter(i => i >= 0).flatMap(i => nightMeteors(seed, key, i))
    .filter(m => clock >= m.t - METEOR.warn && clock < m.t + after);
}
// how far a meteorite has fallen at `clock`: 0 up in the sky (or not falling yet), 1 landed
export const fallAt = (m, clock) => Math.min(1, Math.max(0, (clock - (m.t - METEOR.fall)) / METEOR.fall));
// how far its warning has got: 0 when it starts, 1 as it lands
export const warnAt = (m, clock) => Math.min(1, Math.max(0, (clock - (m.t - METEOR.warn)) / METEOR.warn));

// the blow of one landing at depth `depth` of a world of level `world`, along (nx, nz) from its spot
export function meteorBlow(depth, world = 1) {
  const level = depthLevel(depth, world);
  return { damage: Math.round(METEOR.damage * (1 + GROWTH.damage * (level - 1))), knock: METEOR.knock, knockDown: false, hop: 3,
    reason: msg('Hit by a slime meteorite!'), burn: null, chill: null, toxin: null, slow: METEOR.slow };
}
// what one landing on an enemy does to it: a little more than to a player (they have more health)
export const enemyMeteorDamage = (depth, world = 1) => Math.round(meteorBlow(depth, world).damage * 1.6);
