// Dev tools (?dev=1): spawn any enemy kind, at any level, into the current cube; kill or
// remove them all. The console's /spawn, /kill, /remove and /passive (game/devcommands.js).
// Spawns are ordinary enemies with ids of their own (never in the run's defeated set) and
// vanish when the cube resets. Guardian kinds get their bars and drops but no gate. The test
// rooms that line every kind up (cubegen/testrooms.js) are filled here as well: spawnLineup.
import { N } from '../core/constants.js';
import { idx } from '../core/util.js';
import { ENEMY_KINDS, enemyRoll, coinRange, guardianLevel, makeEnemy } from '../core/enemies.js';
import { damageEnemy } from '../core/combat.js';
import { walkable, floorAt } from '../physics/enemynav.js';
import { walker, standY } from '../physics/dwell.js';
import { removeEnemyViews } from '../render/enemies.js';
import { player, state } from './state.js';
import { addEnemies, allEnemies, detachEnemies } from './enemies.js';
import { addGustos } from './gusto.js';
import { addTotnars } from './totnar.js';
import { addSquarlos } from './squarlo.js';
import { addFlips } from './flip.js';
import { addFoggerys } from './foggery.js';
import { addRenews } from './renew.js';
import { addSlomos } from './slomo.js';
import { addMansks } from './mansk.js';
import { addSollmeldons } from './sollmeldon.js';
import { addMonteurs } from './monteur.js';
import { addQualmoses } from './qualmos.js';
import { pickFloor, pointer } from './pointer.js';

const SPREAD = 1.1;   // the least distance between enemies of one spawn
let serial = 0;

// the n floors nearest (x, y, z) that fit the kind's body, apart from each other (a fluid
// dweller's: in its fluid, physics/dwell.js, if the cube has any; else on land, where it dries up)
function spotsNear(kind, x, y, z, n) {
  const wet = kind.dwells ? walker(kind) : null, r = wet ? Math.min(kind.radius, 0.42) : kind.radius;
  const fitsAs = h => f => walkable(f, h) && [[r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dz]) => floorAt(f, f.x + 0.5 + dx, f.z + 0.5 + dz, h));
  let floors = wet ? state.map.floors.filter(fitsAs(wet)) : [];
  if (!floors.length) floors = state.map.floors.filter(fitsAs(kind.height));
  const near = floors.map(f => {
    const fy = standY(kind, f, f.x + 0.5, f.z + 0.5);
    return { f, y: fy, d: Math.hypot(f.x + 0.5 - x, f.z + 0.5 - z) + Math.abs(fy - y) * 2 };
  }).sort((a, b) => a.d - b.d);
  const out = [];
  for (const c of near) {
    if (out.length >= n) break;
    if (out.every(o => Math.hypot(o.f.x - c.f.x, o.f.z - c.f.z) >= SPREAD || Math.abs(o.y - c.y) > 1)) out.push(c);
  }
  return out;
}

// spawn n enemies of kind `type` around at = { x, y, z } (default: the cursor, else in front of
// the player); level: a whole number, else the level this depth gives the kind. A kind that comes
// in troops (the Flimmers) comes n troops strong, unless `single`. Returns them.
export function spawnEnemies(type, { level = null, n = 1, at = null, single = false } = {}) {
  const kind = ENEMY_KINDS[type];
  if (!kind) throw Error('Unknown enemy kind: ' + type);
  if (kind.troop && !single) n *= kind.troop;
  if (!state.map || state.transitioning) return [];
  at ??= (pointer.inside && pickFloor()) || { x: player.x + Math.sin(player.yaw) * 2.5, y: player.y, z: player.z + Math.cos(player.yaw) * 2.5 };
  const x = Math.min(N - 0.5, Math.max(0.5, at.x)), z = Math.min(N - 0.5, Math.max(0.5, at.z));
  const list = spotsNear(kind, x, at.y, z, n).map(({ f, y }, i) => {
    const ex = f.x + 0.5, ez = f.z + 0.5;
    return spawned(kind, f, ex, y, ez, Math.atan2(player.x - ex, player.z - ez), level, i);
  });
  enlist(kind, list);
  return list;
}
// one enemy of kind standing on floor f at (x, y, z), facing yaw
function spawned(kind, f, x, y, z, yaw, level, i) {
  const lv = level ?? (kind.guardian ? guardianLevel(state.map.depth, kind.guardianRole) : enemyRoll(state.map, kind, f.id).level);
  const [lo, hi] = coinRange(kind, lv);
  return makeEnemy({
    id: `dev:${++serial}`, level: lv, coinDrop: lo + Math.floor(Math.random() * (hi - lo + 1)), kind, f, x, y, z, yaw,
    ...(kind.guardian && { guardian: true, guardianRole: kind.guardianRole, bossPlaceholder: kind.bossPlaceholder, boss: kind.boss }),
  }, kind, i);
}
// a boss fights its own fight (game/gusto.js, game/totnar.js, game/squarlo.js, game/flip.js, game/foggery.js,
// game/renew.js, game/slomo.js, game/mansk.js, game/monteur.js, game/qualmos.js)
function enlist(kind, list) {
  if (kind.boss) ({ gusto: addGustos, totnar: addTotnars, squarlo: addSquarlos, flip: addFlips, foggery: addFoggerys, renew: addRenews, slomo: addSlomos, mansk: addMansks, monteur: addMonteurs, sollmeldon: addSollmeldons, qualmos: addQualmoses })[kind.boss](list);
  else addEnemies(list);
}

// A test room's lineup (map.testRoom.lineup, cubegen/testrooms.js): every kind where it stands,
// at the level this depth gives it, `dormant`: idle until it is hit (game/enemyai.js). Each time
// the cube's enemies are reset (game/enemies.js), so they are all back after a death.
export function spawnLineup() {
  for (const [i, { type, x, z, yaw }] of (state.map?.testRoom?.lineup ?? []).entries()) {
    const kind = ENEMY_KINDS[type], f = state.map.cols[idx(Math.floor(x), Math.floor(z))].at(-1);
    const e = spawned(kind, f, x, standY(kind, f, x, z), z, yaw, null, i);
    e.dormant = true;
    enlist(kind, [e]);
  }
}

// every living enemy dies (and pays out as if slain)
export function killEnemies() {
  let n = 0;
  for (const e of allEnemies()) { e.hpFloor = 0; e.shield = 0; if (damageEnemy(e, e.hp)) n++; }
  return n;
}

// every enemy (and projectile) leaves the cube, without XP or loot
export function clearEnemies() {
  const list = detachEnemies();
  removeEnemyViews(list);
  return list.length;
}
