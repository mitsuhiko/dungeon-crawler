// Where an enemy can fight a player from, and where it takes cover from one it cannot get at
// (game/enemyai.js). Both search the floor graph breadth-first (physics/enemynav.js nearest),
// so the answer is the nearest such floor by steps, and the path there.
// A fluid dweller's (physics/dwell.js) are all in its fluid, and it stands as high there as it
// floats.
import { nearest, clearLine } from '../physics/enemynav.js';
import { walkerOf, standY } from '../physics/dwell.js';
import { shotOf } from '../core/enemies.js';

export const CHEST = 0.6;   // how far above a player's feet their chest (and eyes) are, near enough
const eyes = profile => Math.min(profile.bodyHeight, 1) * 0.8;
const middle = (f, profile) => { const x = f.x + 0.5, z = f.z + 0.5; return [x, standY(profile, f, x, z), z]; };

// Can a body of this profile start an attack from floor f on a player standing at s (x, y, z)?
// A blow: s near enough in height and within the attack's reach of where it can stand in the
// cell (up to its edge); a throw (or a beam, or a gust): within its reach from the middle of the
// cell, near enough in height, beyond its minReach, with a clear line from its muzzle.
export function strikesFrom(profile, s) {
  const list = profile.attacks ?? [profile], edge = 0.5 - Math.min(profile.radius, 0.42);
  return f => {
    const [x, y, z] = middle(f, profile), d = Math.hypot(s.x - x, s.z - z), dy = Math.abs(s.y - y);
    return list.some(a => {
      const shot = shotOf(a), reach = a.reach ?? profile.reach;
      if (d < (a.minReach ?? 0)) return false;
      if (!shot) return !a.ride && dy < 0.75 && d < reach + edge;   // (a hop away is no place to strike from)
      return dy < 1.5 && d < reach - 0.3 && clearLine(x, y + shot.muzzle[1], z, s.x, s.y + CHEST, s.z);
    });
  };
}
// the path to the nearest floor e can attack a player at s from (its own one included), or null
export const postPath = (e, s, maxLen) => nearest(e.f, strikesFrom(e.profile, s), maxLen, walkerOf(e));
// A fluid dweller's way up to the shore near a player at s with a short weapon: to the nearest
// floor of its fluid it can attack them from within `close` of them; with none, to the one nearest
// them it can get to
export function shorePath(e, s, close, maxLen) {
  const strikes = strikesFrom(e.profile, s), off = f => Math.hypot(f.x + 0.5 - s.x, f.z + 0.5 - s.z);
  return nearest(e.f, f => off(f) <= close && strikes(f), maxLen, walkerOf(e), f => -off(f));
}

// Is a body of this profile on floor f safe from a player at p (x, y, z), who can hit from
// `danger` cells away? Further than that, or out of their sight.
export function covered(profile, p, danger) {
  return f => {
    const [x, y, z] = middle(f, profile);
    return Math.hypot(x - p.x, z - p.z) > danger || !clearLine(p.x, p.y + CHEST, p.z, x, y + eyes(profile), z);
  };
}
// The path to the nearest floor where e is safe from p; with none in maxLen steps, to the one
// furthest from p (or none, where it stands is as good as it gets).
export function coverPath(e, p, danger, maxLen) {
  const far = f => Math.hypot(f.x + 0.5 - p.x, f.z + 0.5 - p.z);
  return nearest(e.f, covered(e.profile, p, danger), maxLen, walkerOf(e), far);
}
