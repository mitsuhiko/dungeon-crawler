// In devtools (?dev=1): await (await import('./tests/browser/bossroom.js')).runBossRoomChecks()
// Every boss's test room (/testroom boss <boss>, cubegen/testrooms.js): the boss alone in his own
// arena, idle while the player walks up to him (no dark, no tide, no minions), awake and fighting
// once hit, his minions on the fight's ground; back idle after the cube resets, and nothing of it
// remembered by the run.
import { paused } from './combat.js';
import { state, player } from '../../src/game/state.js';
import { BOSSES, BOSS_ARENAS } from '../../src/core/bosses.js';
import { damageEnemy } from '../../src/core/combat.js';
import { allEnemies, updateEnemies, resetEnemies, drawEnemies } from '../../src/game/enemies.js';
import { updatePlayer } from '../../src/game/update.js';
import { goTestRoom, leaveTestRoom } from '../../src/game/dev.js';
import { spawnAt } from '../../src/game/flow.js';
import { loadSpecies } from '../../src/render/enemies.js';
import { groundY, walkable } from '../../src/physics/enemynav.js';
import { idx } from '../../src/core/util.js';

const check = (value, message) => { if (!value) throw Error(message); };
const run = (seconds, dt = 1 / 30, also = () => {}) => { for (let t = 0; t < seconds; t += dt) { updatePlayer(dt); updateEnemies(dt); also(); } };
const MINIONS = { gusto: ['custotriangle'], totnar: ['snapskull', 'totspider', 'totstunder'], squarlo: ['squirtle'], flip: ['wolla'], foggery: ['fireface', 'firecat'], renew: ['spider', 'fireface'], mansk: ['tornado'], slomo: ['slug', 'bolime', 'squirtle'] };

export async function runBossRoomChecks(only = null) {   // only: the bosses to check (names), else all
  return paused(async () => {
    const results = [], defeated = state.run.defeated.size, gates = state.run.unlockedGates.size, hero = { ...player };
    try {
      for (const [depth, boss] of Object.entries(BOSSES)) {
        if (only && !only.includes(boss)) continue;
        await goTestRoom('boss', Number(depth));
        const map = state.map;
        check(map.testRoom?.name === 'boss' && map.depth === Number(depth) && !map.guardian && !map.portals.length, `${boss}: his test room`);
        await loadSpecies([boss, ...MINIONS[boss]]);
        const list = allEnemies(), b = list[0], spot = map.testRoom.lineup[0];
        check(list.length === 1 && b.boss === boss && b.dormant && !b.guardianGate, `${boss} alone, dormant, no gate`);
        check(Math.hypot(b.x - spot.x, b.z - spot.z) < 1e-6, `${boss} on the guardian's spot`);
        if (BOSS_ARENAS[boss]?.type) check(map.arena.type === BOSS_ARENAS[boss].type, `${boss}: his own arena`);
        if (boss === 'squarlo') check(map.tide && state.tide !== undefined, 'the tidal water');
        if (boss === 'totnar') check(map.arenaPlacements.some(p => p.name.includes('brazier')), 'the braziers');
        drawEnemies(0);
        check(b.view?.label.visible, `${boss}: his name over his bar`);
        // the player walks up to him: he stays put, nothing of his fight starts
        player.hp = player.maxHp = 1e5; state.enemyGrace = 0;
        const near = map.floors.filter(f => f.encounter && walkable(f, 1)).sort((p, q) =>
          Math.abs(Math.hypot(p.x + .5 - b.x, p.z + .5 - b.z) - 2.5) - Math.abs(Math.hypot(q.x + .5 - b.x, q.z + .5 - b.z) - 2.5))[0];
        spawnAt(near.x + .5, groundY(near, near.x + .5, near.z + .5), near.z + .5);
        const at = { x: b.x, z: b.z };
        run(12);
        check(b.mode === 'idle' && b.dormant && Math.hypot(b.x - at.x, b.z - at.z) < 0.05, `${boss} idle beside the player: ${b.mode}`);
        check(allEnemies().length === 1 && !state.dark && !(b.tide > 0) && player.hp === player.maxHp, `${boss}: no minions, no dark, no tide, no harm`);
        // hit: he wakes and fights
        damageEnemy(b, 1); run(0.5);
        check(!b.dormant && ['chase', 'attack'].includes(b.mode), `${boss} awake once hit: ${b.mode}`);
        // his fight goes on as in his arena: Totnar makes it dark, Squarlo calls the tide
        let dark = 0, tide = 0, hurt = false;
        run(20, 1 / 30, () => { dark = Math.max(dark, state.dark); tide = Math.max(tide, b.tide ?? 0); hurt ||= player.hp < player.maxHp; player.ragdoll = null; });
        check(hurt, `${boss} fights the player`);
        if (boss === 'totnar') check(dark > 0.5, 'Totnar makes it dark');
        if (boss === 'squarlo') check(tide > 0.5, 'Squarlo calls the tide: ' + tide);
        const minions = allEnemies().filter(e => e.summoned);
        check(minions.every(e => map.cols[idx(Math.floor(e.x), Math.floor(e.z))].some(f => f.encounter)), `${boss}: his minions on the fight's ground`);
        results.push(`${boss}: idle until hit, then fights (${minions.length} minions)`);
        // a reset (a death) puts him back, idle
        resetEnemies();
        check(allEnemies().length === 1 && allEnemies()[0].dormant && allEnemies()[0].hp === allEnemies()[0].profile.hp, `${boss} back, idle, whole`);
      }
      check(state.run.defeated.size === defeated && state.run.unlockedGates.size === gates, 'the run remembers nothing of it');
      await leaveTestRoom();
      return results;
    } finally { Object.assign(player, hero); }
  });
}
