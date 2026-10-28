// In devtools (?dev=1): await (await import('./tests/browser/moose.js')).runMooseChecks()
// The Moose (core/enemies.js MOOSE) in the enemies' test room: its antlers toss the player in front
// of it; a player behind it gets its tail, swung as it stands, without it turning round to them,
// and one at its side gets neither until it has turned; from further off it charges and tramples
// the player, and a charge that runs into the room's edge with nobody run over leaves it dazed,
// every blow hurting it more.
import { paused } from './combat.js';
import { state, player } from '../../src/game/state.js';
import { updateEnemies } from '../../src/game/enemies.js';
import { updatePlayer } from '../../src/game/update.js';
import { goTestRoom, leaveTestRoom } from '../../src/game/dev.js';
import { spawnAt } from '../../src/game/flow.js';
import { spawnEnemies, clearEnemies } from '../../src/game/devspawn.js';
import { loadSpecies } from '../../src/render/enemies.js';
import { groundY } from '../../src/physics/enemynav.js';
import { attackOf, exposedBy } from '../../src/core/enemies.js';
import { idx } from '../../src/core/util.js';

const check = (value, message) => { if (!value) throw Error(message); };
const run = (seconds, dt = 1 / 30, until = () => false) => {
  for (let t = 0; t < seconds; t += dt) { updatePlayer(dt); updateEnemies(dt); if (until()) return true; }
  return false;
};
const turned = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

export async function runMooseChecks() {
  return paused(async () => {
    const hero = { ...player }, out = {};
    try {
      await goTestRoom('enemies', 4);
      await loadSpecies(['moose']);
      clearEnemies();
      const map = state.map, x = 8.5, z = 8.5, f = map.cols[idx(Math.floor(x), Math.floor(z))].at(-1), low = groundY(f, x, z);
      // a Moose at (x, z) facing `yaw`, the player `d` cells off at angle `at` (0: straight ahead of it)
      const fresh = (yaw, d, at, type = 'moose') => {
        clearEnemies();
        const px = x + Math.sin(yaw + at) * d, pz = z + Math.cos(yaw + at) * d;
        spawnAt(px, low, pz); player.yaw = 0;
        Object.assign(player, { hp: player.maxHp, held: null, ragdoll: null, stun: 0, vx: 0, vz: 0 });
        const [e] = spawnEnemies(type, { level: 4, at: { x, y: low, z } });
        Object.assign(e, { x, z, y: low, yaw, mode: 'chase', cool: 0, target: player, lost: 0 });
        state.enemyGrace = 0;
        return e;
      };
      const attacking = e => () => e.mode === 'attack';

      // behind it: its tail, as it stands
      let e = fresh(0, 1.6, Math.PI), yaw0 = e.yaw, hp = player.hp;
      check(run(1, 1 / 30, attacking(e)), 'it strikes at a player behind it');
      check(attackOf(e).name === 'tail', `its tail (not ${attackOf(e).name})`);
      check(turned(e.yaw, yaw0) < 0.3, 'without turning round first');
      run(attackOf(e).hitAt - e.t + 0.05);
      check(player.hp < hp, 'clubbed by the ball');
      out.tail = hp - player.hp;

      // at its side: neither its tail nor its antlers, until it has turned to face the player
      e = fresh(0, 1.4, Math.PI / 2);
      run(1, 1 / 30, attacking(e));
      check(e.mode !== 'attack' || attackOf(e).name === 'toss', 'no tail at its side');
      if (e.mode === 'attack') check(turned(e.yaw, Math.atan2(player.x - e.x, player.z - e.z)) < 0.8, 'tosses only once it faces the player');
      out.sideTurn = +turned(e.yaw, 0).toFixed(2);

      // in front, close: its antlers
      e = fresh(0, 1.2, 0); hp = player.hp;
      check(run(1, 1 / 30, attacking(e)) && attackOf(e).name === 'toss', 'tosses a player in front of it');
      run(attackOf(e).hitAt - e.t + 0.05);
      check(player.hp < hp, 'tossed');
      out.toss = hp - player.hp;

      // further off: it charges, and tramples a player who stands still
      e = fresh(0, 4.5, 0); hp = player.hp;
      check(run(1, 1 / 30, attacking(e)) && attackOf(e).name === 'charge', 'charges from further off');
      run(attackOf(e).roll.to - e.t, 1 / 30, () => player.hp < hp);
      check(player.hp < hp && player.ragdoll, 'trampled and knocked down');
      out.trampled = hp - player.hp;

      // a charge into the room's edge, nobody in the way: dazed, blows hurting it more
      e = fresh(0, 3, Math.PI / 2);
      Object.assign(e, { x: 8.5, z: 12.5 });
      const i = e.profile.attacks.findIndex(a => a.name === 'charge'), c = e.profile.attacks[i];
      Object.assign(e, { mode: 'attack', attack: i, t: c.roll.from - 0.02, bit: false, attacks: e.attacks + 1, stun: 0 });
      player.x = 2.5; player.z = 3.5;
      run(c.roll.to - e.t, 1 / 30, () => attackOf(e).name === 'dazed');
      check(e.mode === 'attack' && attackOf(e).name === 'dazed', `crashed into its daze (${e.mode} ${attackOf(e).name})`);
      run(0.3);
      check(exposedBy(e) > 1, 'blows hurt it more while it is dazed');
      out.dazed = true;
      out.ok = true;
      return out;
    } finally {
      clearEnemies();
      player.held = null; player.ragdoll = null;
      await leaveTestRoom();
      Object.assign(player, hero);
    }
  });
}
