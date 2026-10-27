// What the real bosses' fights share (game/gusto.js, game/totnar.js): the players in the fight,
// sending a body into it, the floors a body fits on, putting minions down round their boss and
// letting bodies go. Only the game that runs the enemies runs a fight; the others see its result
// (net/foes.js).
import { player, state } from './state.js';
import { party, alive } from './party.js';
import { makeEnemy } from '../core/enemies.js';
import { playerFloor } from './enemycombat.js';
import { walkable, floorAt, groundY } from '../physics/enemynav.js';
import { walker, standY } from '../physics/dwell.js';
import { removeEnemyViews } from '../render/enemies.js';

export const players = () => party().filter(b => alive(b) && (b === player || b.here));
export const living = b => b.mode !== 'dead' && b.mode !== 'gone';
export function nearest(b) {
  const list = players();
  return list.reduce((best, p) => Math.hypot(p.x - b.x, p.z - b.z) < Math.hypot(best.x - b.x, best.z - b.z) ? p : best, list[0] ?? player);
}
// into the fight at once, after the nearest player
export function engage(b) {
  const p = nearest(b);
  Object.assign(b, { mode: 'chase', think: 0, path: null, target: p, provoked: 6, lost: 0,
    seen: { x: p.x, y: p.y, z: p.z, f: playerFloor(b.profile.height, p) }, yaw: Math.atan2(p.x - b.x, p.z - b.z) });
}
export function put(b, s) {
  Object.assign(b, { f: s, x: s.x + 0.5, z: s.z + 0.5, y: standY(b.profile, s, s.x + 0.5, s.z + 0.5), path: null, kbx: 0, kbz: 0 });
}
// floors a body of kind `cfg` fits on (in a guardian's arena, its fight zone; the boss test
// room is one too, cubegen/testrooms.js); a fluid dweller's: in its fluid as it stands now (its
// body probed a little inside a cell's half-width, as it moves: physics/enemynav.js)
export function fitting(cfg) {
  const arena = !!state.map.arena, h = cfg.dwells ? walker(cfg) : cfg.height, r = cfg.dwells ? Math.min(cfg.radius, 0.42) : cfg.radius;
  return state.map.floors.filter(f => (!arena || f.encounter) && walkable(f, h)
    && [[r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dz]) => floorAt(f, f.x + 0.5 + dx, f.z + 0.5 + dz, h)));
}
// a body its boss takes along (or that goes by itself): gone at once (a cloud, render/enemies.js),
// let go after `time` s; it pays nothing
export function leave(b, time) { Object.assign(b, { mode: 'gone', speed: 0, path: null, noReward: true, leaving: time }); }
// Up to n free floors for minions of `kind` round body b: within `within` cells of it, on about
// its level, clear of the bodies `others`, a body apart (a cell at least), the nearest to a point
// `ahead` cells in front of it first. A fluid dweller's are in its fluid: the nearest of it, further
// off and further down if need be (`wide` cells, two levels and more).
export function minionFloors(b, kind, n, others, { ahead = 2.2, within = 4.5, wide = 10 } = {}) {
  const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw), tx = b.x + fx * ahead, tz = b.z + fz * ahead, spots = [];
  const most = kind.dwells ? Math.max(within, wide) : within, rise = kind.dwells ? 2.5 : 1.2, apart = Math.max(1, kind.radius * 2);
  const floors = fitting(kind).filter(g => {
    const x = g.x + 0.5, z = g.z + 0.5, d = Math.hypot(x - b.x, z - b.z);
    return d > b.profile.radius + 0.6 && d < most && Math.abs(groundY(g, x, z) - b.y) < rise
      && others.every(o => Math.hypot(o.x - x, o.z - z) > o.profile.radius + kind.radius + 0.2);
  }).sort((p, q) => Math.hypot(p.x + 0.5 - tx, p.z + 0.5 - tz) - Math.hypot(q.x + 0.5 - tx, q.z + 0.5 - tz));
  for (const g of floors) {
    if (spots.length === n) break;
    if (spots.every(s => Math.hypot(s.x - g.x, s.z - g.z) >= apart)) spots.push(g);
  }
  return spots;
}
// a minion of boss e on floor s, summoned (it pays a little XP once, core/progression.js), into
// the fight at once
export function minion(e, id, kind, s, yaw, i) {
  const m = makeEnemy({ id, level: e.level, coinDrop: 0, kind, summoned: true,
    f: s, x: s.x + 0.5, y: standY(kind, s, s.x + 0.5, s.z + 0.5), z: s.z + 0.5, yaw }, kind, i);
  engage(m);
  return m;
}
// the bodies of a fight's list still to keep: not gone and let go, nor dead and lain their time
export function sweep(list, dt) {
  return list.filter(e => {
    const over = e.mode === 'gone' ? e.leaving !== undefined && (e.leaving -= dt) <= 0
      : e.mode === 'dead' && e.deadT >= e.profile.corpseTime;
    if (over) removeEnemyViews([e]);
    return !over;
  });
}
