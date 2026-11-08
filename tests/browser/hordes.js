// Devtools: await (await import('./tests/browser/hordes.js')).runHordeChecks()
// Real worker, group AI, crowd movement/attacks, models and visit/death persistence.
import { paused } from './combat.js';
import { player, state } from '../../src/game/state.js';
import { enterCube, spawnAt, die } from '../../src/game/flow.js';
import { allEnemies, updateEnemies, drawEnemies } from '../../src/game/enemies.js';
import { damageEnemy, cancelSwing } from '../../src/core/combat.js';
import { createRun } from '../../src/core/progression.js';
import { HORDE } from '../../src/core/hordes.js';
import { spiderModel } from '../../src/render/spidermodel.js';
import { snakeModel } from '../../src/render/snakemodel.js';
import { renderer, scene, camera } from '../../src/render/scene.js';
import { portalLocked } from '../../src/core/guardians.js';
import { around } from '../../src/physics/enemynav.js';
import { floorY } from '../../src/core/surfaces.js';
import { answerDeath } from '../../src/game/deathask.js';

const check = (value, message) => { if (!value) throw Error(message); };

export async function runHordeChecks() {
  await Promise.all([spiderModel.load(), snakeModel.load()]);
  check(spiderModel.ready && snakeModel.ready, 'horde models loaded');
  return paused(async () => {
    const oldCube = state.cubes.cubes.get(state.cubeKey), hero = { ...player };
    const fields = ['run', 'arrival', 'visit', 'portalLock', 'portalCharge', 'boundaryLock', 'transitioning',
      'inventoryOpen', 'fallFrom', 'enemyGrace', 'devPassive', 'statusMsg', 'statusUntil'];
    const saved = Object.fromEntries(fields.map(k => [k, state[k]])), opened = new Set(state.openedFaces);
    const visits = new Map([...state.cubes.cubes].map(([k, c]) => [k, c.visits])), results = [];
    try {
      for (const depth of [0, 1, 11, 19, 20]) {
        state.run = createRun(); state.openedFaces = new Set();
        state.transitioning = state.inventoryOpen = state.devPassive = false; state.fallFrom = null;
        const key = state.cubes.layout(depth).hordes.keys().next().value, c = await state.cubes.get(key);
        enterCube(c, c.map.portals[0].dir); cancelSwing(player, true);
        const map = state.map, list = allEnemies(), ids = list.map(e => e.id);
        check(list.length === map.horde.count && list.every(e => e.hordeId === map.horde.id), 'full crowd and group survive worker loading');
        check(!portalLocked(map, state.run, map.portals.find(p => p.dir === map.exit)), 'horde adds no onward gate');
        player.hp = player.maxHp = 10000; player.god = false; state.enemyGrace = 60;
        check(map.archetype !== 'arena' && map.horde.wild, 'horde lives in normal terrain, not a new arena');
        const approach = around(map.horde.floor, 10, list[0].profile.height).filter(f => f.hordeReserved)
          .sort((a, b) => Math.hypot(b.x - map.horde.floor.x, b.z - map.horde.floor.z) - Math.hypot(a.x - map.horde.floor.x, a.z - map.horde.floor.z))[0];
        spawnAt(approach.x + .5, floorY(approach, .5, .5), approach.z + .5);
        const initial = list.map(e => [e, e.x, e.z]);
        // Keep a survivor outside its own awareness even when the species' range is tuned.
        const distant = list.at(-1);
        distant.profile = { ...distant.profile, aggro: .1 };
        damageEnemy(list[0], list[0].hp); updateEnemies(.05);
        check(list[1].horde.group.active, 'killing a scout wakes surviving group');
        check(list.some(e => Math.hypot(player.x - e.x, player.z - e.z) > e.profile.aggro), 'alarm reaches beyond individual aggro');
        for (let i = 0; i < 20; i++) updateEnemies(.05);
        check(list.filter(e => e.mode === 'chase').length >= (list.length - 1) * .8, 'crowd pursues together within a second');
        check(initial.filter(([e, x, z]) => e.mode !== 'dead' && Math.hypot(e.x - x, e.z - z) > .1).length >= (list.length - 1) * .8, 'crowd actually moves, not just changes mode');
        drawEnemies(.05);
        check(list.every(e => e.view), 'every horde member has an animated model');
        check(list.filter(e => e.mode !== 'dead').every(e => !e.view.label.visible), 'crowd does not become a wall of labels');
        renderer.compile(scene, camera);
        spawnAt(map.horde.anchor.x, map.horde.anchor.y, map.horde.anchor.z); state.enemyGrace = 0;
        let peak = 0;
        const start = performance.now();
        for (let i = 0; i < 100; i++) {
          updateEnemies(.05); peak = Math.max(peak, allEnemies().filter(e => e.mode === 'attack').length);
        }
        const simulationMs = performance.now() - start;
        check(peak > 1 && peak <= HORDE.attackers, 'several attackers overlap, within group budget');
        check(player.hp < player.maxHp, 'group attacks really deal damage');
        // Re-entering preserves the scout kill; death rolls back only the new visit's kills.
        const scoutId = ids[0]; enterCube(c, map.portals[0].dir);
        check(!allEnemies().some(e => e.id === scoutId), 'revisit retains killed member identity');
        check(!allEnemies()[0].horde.group.active, 'revisit starts with a quiet survivor group');
        const victim = allEnemies()[0]; damageEnemy(victim, victim.hp); updateEnemies(.001);
        check(state.run.defeated.has(victim.id), 'kill is rewarded once');
        die(); answerDeath(true);   // "You died": respawn (game/deathask.js)
        check(allEnemies().some(e => e.id === victim.id) && !allEnemies().some(e => e.id === scoutId), 'death restores only this visit, not prior kills');
        results.push({ depth, count: list.length, peakAttackers: peak, simulationMs: Math.round(simulationMs) });
      }
      return results;
    } finally {
      state.run = saved.run; state.openedFaces = opened;
      for (const [k, c] of state.cubes.cubes) c.visits = visits.get(k) || 0;
      enterCube(oldCube, null, { arrival: saved.arrival, visit: saved.visit,
        portalLock: saved.portalLock, boundaryLock: saved.boundaryLock });
      Object.assign(state, saved); Object.assign(player, hero);
    }
  });
}
