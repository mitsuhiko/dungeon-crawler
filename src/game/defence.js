// Room-level intentions only. The normal species AI still owns movement, attack
// wind-ups and damage. Posts are actual reachable floors, not points across gaps.
import { gateLocked } from '../core/guardians.js';
import { walkable, clearLine } from '../physics/enemynav.js';
import { walker } from '../physics/dwell.js';
import { isRanged } from '../core/enemies.js';

export function coordinateDefence(map, run, list, player) {
  const guardian = list.find(e => e.guardianGate && e.mode !== 'dead');   // not a dev-spawned one
  if (!gateLocked(map, run) || !guardian) {
    for (const e of list) {
      if (e.raid || e.siege) continue;   // a raid's (game/defense.js): posted at the cart they raid; a siege's (game/trialevents.js): at the beacon
      if (e.defence && e.mode === 'defend') { e.mode = 'idle'; e.t = 1; e.path = null; }
      e.defence = null;
    }
    return;
  }
  const g = map.guardian, [dx, dz] = g.approach;
  const alive = player.hp > 0 && !player.ragdoll;
  const distance = Math.hypot(player.x - g.x, player.z - g.z);
  const ahead = (player.x - g.x) * dx + (player.z - g.z) * dz;
  const advancing = alive && distance < 8 && ahead < 6;
  const alarm = guardian.hp < guardian.profile.hp;
  // (a boss's summoned minions are no defenders: they go for the player)
  const defenders = list.filter(e => !e.guardian && !e.summoned && !e.raid && !e.siege && e.mode !== 'dead');
  const nearest = [...defenders].sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z));
  const pursuers = new Set(nearest.slice(0, Math.max(1, Math.ceil(defenders.length / 3))));
  // a boss, once hurt or once it has struck, fights on wherever the player goes (game/gusto.js,
  // game/totnar.js: his skulls push the player back out of the 4.5 cells)
  guardian.defence = { post: guardian.home, engage: alive && (distance < 4.5 || !!guardian.boss && (alarm || guardian.attacks > 0)) };
  const claimed = [{ x: guardian.x, z: guardian.z, radius: guardian.profile.radius }];
  for (const e of defenders) {
    const cfg = e.profile, dist = Math.hypot(e.x - player.x, e.z - player.z);
    // Only a minority can be pulled away. The rest intercept the approach or cover it.
    const local = alive && pursuers.has(e) && dist < cfg.aggro + 1
      && Math.hypot(player.x - e.home.x - .5, player.z - e.home.z - .5) < 4.5;
    const engage = local || advancing && (alarm || distance < 3 || dist < cfg.aggro + 1);
    let tx = e.home.x + .5, tz = e.home.z + .5;
    if (advancing || alarm) {
      const vx = player.x - g.x, vz = player.z - g.z, d = Math.hypot(vx, vz) || 1;
      const front = isRanged(cfg) ? .5 : Math.min(4.5, d * .6);
      const flank = ((nearest.indexOf(e) % 5) - 2) * 1.3;
      tx = g.x + vx / d * front - vz / d * flank;
      tz = g.z + vz / d * front + vx / d * flank;
    }
    // (a fluid dweller's posts are in its pond)
    const body = cfg.dwells ? walker(cfg) : cfg.height;
    const floors = map.floors.filter(f => f.encounter && walkable(f, body)
      && claimed.every(s => Math.hypot(f.x + .5 - s.x, f.z + .5 - s.z) >= cfg.radius + s.radius + .15));
    floors.sort((a, b) => Math.hypot(a.x + .5 - tx, a.z + .5 - tz) - Math.hypot(b.x + .5 - tx, b.z + .5 - tz));
    const post = floors[0] || e.home;
    claimed.push({ x: post.x + .5, z: post.z + .5, radius: cfg.radius });
    // Ranged defenders hold covering posts while they already have a clear shot.
    const shooting = isRanged(cfg) && dist < cfg.reach && clearLine(e.x, e.y + .4, e.z, player.x, player.y + .6, player.z);
    e.defence = { post, engage: engage || !!shooting && advancing };
  }
}
