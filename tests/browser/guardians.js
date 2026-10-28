// In devtools: await (await import('./tests/browser/guardians.js')).runGuardianChecks()
// Real worker, models, gate charging, defender AI, death rollback and portal travel.
import { paused } from './combat.js';
import { state, player } from '../../src/game/state.js';
import { makeLayouts } from '../../src/world/layout.js';
import { createRun } from '../../src/core/progression.js';
import { GUARDIAN_KINDS, DESCENT_GUARDIAN_KINDS, makeEnemy } from '../../src/core/enemies.js';
import { damageEnemy } from '../../src/core/combat.js';
import { gateLocked, portalLocked } from '../../src/core/guardians.js';
import { bossBarred } from '../../src/core/bossbar.js';
import { DIRS, N } from '../../src/core/constants.js';
import { faceKey, step } from '../../src/world/coords.js';
import { allEnemies, updateEnemies, drawEnemies } from '../../src/game/enemies.js';
import { walkable, findPath, groundY } from '../../src/physics/enemynav.js';
import { enterCube, spawnAt, die } from '../../src/game/flow.js';
import { checkPortals } from '../../src/game/portals.js';
import { startTravel, travelling, updateTravel } from '../../src/game/travel.js';
import { animateEnemies, loadSpecies, removeEnemyViews } from '../../src/render/enemies.js';
import { animateWorld } from '../../src/render/world.js';
import { renderer, scene, camera } from '../../src/render/scene.js';
import { answerDeath } from '../../src/game/deathask.js';

const check = (value, message) => { if (!value) throw Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function runGuardianChecks() {
  return paused(async () => {
    const oldCube = state.cubes.cubes.get(state.cubeKey), hero = { ...player };
    const saved = Object.fromEntries(['run', 'arrival', 'visit', 'portalLock', 'portalCharge', 'boundaryLock', 'transitioning', 'inventoryOpen', 'fallFrom', 'enemyGrace', 'statusMsg', 'statusUntil'].map(k => [k, state[k]]));
    const opened = new Set(state.openedFaces), key = makeLayouts(state.cubes.seed)(2).down;
    const c = await state.cubes.get(key), visits = c.visits, samples = [];
    try {
      state.run = createRun(); state.transitioning = state.inventoryOpen = false; state.fallFrom = null;
      const entry = c.map.portals.find(p => p.kind === 'side');
      enterCube(c, entry.dir);
      const map = state.map, down = map.portals.find(p => p.kind === 'down');
      let list = allEnemies(), guard = list.find(e => e.guardian);
      check(guard && list.length > 1, 'one guardian and defenders load from worker');
      check(guard.guardianRole === 'descent' && guard.bossPlaceholder, 'descent kind exposes the future-boss hook');
      const population = list.length;
      drawEnemies(0);
      check(guard.view && !guard.view.bar.visible && !guard.view.label.visible, 'a Temp Boss: its bar on the screen, nothing over its head');
      const defender = list.find(e => !e.guardian);
      defender.hovered = true; drawEnemies(0);
      check(defender.view?.bar.visible && defender.view.label.visible, 'its defenders keep their own bars');
      defender.hovered = false;
      const fx = state.world.portalFx.find(f => f.obj.userData.portal.id === down.id);
      const swirl = fx.obj.children.find(o => o.geometry?.type === 'CircleGeometry');
      check(swirl.material.color.getHexString() === 'ff3547', 'locked well shines red');
      spawnAt(down.x + .5, down.y, down.z + .5);
      state.portalLock = 0; state.portalCharge = null;
      check(!checkPortals(0, 0, 2) && !state.portalCharge, 'locked well cannot charge');
      startTravel(down);
      check(!state.transitioning && !travelling(), 'direct travel cannot bypass the guardian');
      // shot at from beyond its post's reach, the guardian goes for the shooter
      player.hp = player.maxHp = 10000; state.enemyGrace = 60;
      const g = map.guardian, h = guard.profile.height;
      const stand = map.floors.find(f => f.encounter && walkable(f, h) && walkable(f, 0.9, true)
        && Math.hypot(f.x + .5 - g.x, f.z + .5 - g.z) > 6 && findPath(guard.f, f, 40, h));
      check(stand, 'a floor to shoot the guardian from');
      spawnAt(stand.x + .5, groundY(stand, stand.x + .5, stand.z + .5), stand.z + .5);
      for (let i = 0; i < 10; i++) updateEnemies(.05);
      const off = Math.hypot(guard.x - player.x, guard.z - player.z);
      check(!guard.defence.engage && guard.mode !== 'chase', 'out of its reach the guardian keeps to its post');
      damageEnemy(guard, 1);
      for (let i = 0; i < 40; i++) updateEnemies(.05);
      check(guard.mode === 'chase' || guard.mode === 'attack', 'shot, it goes for the shooter: ' + guard.mode);
      check(Math.hypot(guard.x - player.x, guard.z - player.z) < off - 1, 'and comes closer');
      spawnAt(down.x + .5, down.y, down.z + .5);
      const before = allEnemies().map(e => [e, e.x, e.z]);
      damageEnemy(guard, 1); updateEnemies(.3);
      check(allEnemies().filter(e => !e.guardian).every(e => e.defence.engage), 'attacking guardian rallies every defender');
      for (let i = 0; i < 20; i++) updateEnemies(.05);
      check(before.some(([e, x, z]) => !e.guardian && Math.hypot(e.x - x, e.z - z) > .2), 'defenders actually navigate towards the fight');
      damageEnemy(guard, guard.hp); updateEnemies(.001);
      check(!gateLocked(map, state.run), 'guardian death alone unlocks the well');
      for (let i = 0; i < 40; i++) animateWorld(state.world, 1 / 60, i / 60);
      check(swirl.material.color.getHexString() !== 'ff3547', 'well visibly changes colour on unlock');
      die(); answerDeath(true);   // "You died": respawn (game/deathask.js)
      check(!allEnemies().some(e => e.guardian), 'guardian never respawns after death rollback');
      check(allEnemies().length === population - 1, 'ordinary defenders return on death');
      enterCube(c, entry.dir);
      check(!allEnemies().some(e => e.guardian) && !gateLocked(map, state.run), 'revisit keeps gate unlocked');
      state.run = createRun(); enterCube(c, entry.dir);
      guard = allEnemies().find(e => e.guardian);
      check(guard && gateLocked(map, state.run), 'new run restores guardian and seal');
      // Exercise every guardian model/material, not just this seed's selected species.
      for (const kind of [...Object.values(GUARDIAN_KINDS), ...Object.values(DESCENT_GUARDIAN_KINDS)]) {
        const e = makeEnemy({ f: map.guardian.floor, x: map.guardian.x, y: map.guardian.y, z: map.guardian.z,
          level: 8, guardian: true, guardianRole: kind.guardianRole, bossPlaceholder: kind.bossPlaceholder, yaw: 0 }, kind);
        samples.push(e);
      }
      await loadSpecies([...new Set(samples.map(e => e.profile.species))]);   // (loaded when first needed)
      animateEnemies(samples, 0);
      check(samples.every(e => e.view && e.view.label.visible === !bossBarred(e)), 'every guardian kind has a loaded model; a side guardian a label, a Temp Boss the bar on the screen');
      renderer.compile(scene, camera);
      removeEnemyViews(samples); samples.length = 0;
      damageEnemy(guard, guard.hp); updateEnemies(.001);
      spawnAt(down.x + .5, down.y, down.z + .5); state.portalLock = 0;
      check(checkPortals(0, 0, 2), 'unlocked well charges and initiates real travel');
      for (let i = 0; i < 100 && !travelling(); i++) await delay(50);
      check(travelling(), 'destination builds and travel starts');
      for (let i = 0; i < 30 && travelling(); i++) updateTravel(.1);
      check(state.cubeKey !== map.key && !state.transitioning, 'unlocked well reaches the next depth');
      return { guardianKinds: 14, population, deathPersistence: true, defenders: true, travelled: true };
    } finally {
      removeEnemyViews(samples);
      state.run = saved.run; state.openedFaces = opened; c.visits = visits;
      enterCube(oldCube, null, { arrival: saved.arrival, visit: saved.visit,
        portalLock: saved.portalLock, boundaryLock: saved.boundaryLock });
      Object.assign(state, saved); Object.assign(player, hero);
    }
  });
}

export async function runSideGuardianChecks() {
  return paused(async () => {
    const oldCube = state.cubes.cubes.get(state.cubeKey), hero = { ...player };
    const saved = Object.fromEntries(['run', 'arrival', 'visit', 'portalLock', 'portalCharge', 'boundaryLock', 'transitioning', 'inventoryOpen', 'fallFrom', 'enemyGrace', 'statusMsg', 'statusUntil'].map(k => [k, state[k]]));
    const opened = new Set(state.openedFaces), visits = new Map([...state.cubes.cubes].map(([k, c]) => [k, c.visits]));
    const results = [];
    try {
      for (const depth of [0, 1, 19]) {
        state.run = createRun(); state.openedFaces = new Set();
        state.transitioning = state.inventoryOpen = false; state.fallFrom = null;
        const L = state.cubes.layout(depth), key = [...L.guardians].find(([, g]) => g.role === 'side')[0];
        const c = await state.cubes.get(key), entry = c.map.portals[0], exit = c.map.portals[1];
        enterCube(c, entry.dir);
        const guard = allEnemies().find(e => e.guardian);
        check(guard?.guardianRole === 'side' && !guard.bossPlaceholder, 'worker preserves side guardian identity');
        check(!portalLocked(c.map, state.run, entry), 'entry permits retreat');
        drawEnemies(0);
        check(guard.view?.bar.visible && guard.view.label.visible, 'side guardian indicators stay visible');
        const fx = state.world.portalFx.find(f => f.obj.userData.portal.id === exit.id);
        check(fx.obj.userData.guardianRole === 'side' && !fx.obj.userData.bossPlaceholder, 'gate carries recognizable identity');
        const curtain = fx.obj.children.find(o => o.geometry?.type === 'PlaneGeometry');
        check(curtain.material.color.getHexString() === 'ff3547', 'side gate shines red while locked');
        startTravel(exit);
        check(!state.transitioning && !travelling(), 'debug activation cannot bypass side guardian');
        // Even a stale/opened face may not circumvent the runtime lock.
        state.openedFaces.add(faceKey(key, exit.dir));
        const [dx, dz] = DIRS[exit.dir];
        spawnAt(dx ? dx > 0 ? N - .25 : .25 : exit.x + .5, exit.y,
          dz ? dz > 0 ? N - .25 : .25 : exit.z + .5);
        state.portalLock = 0; state.boundaryLock = -1;
        check(!checkPortals(dx, dz, 1) && !state.transitioning, 'full-face crossing cannot bypass side guardian');
        state.openedFaces.delete(faceKey(key, exit.dir));
        damageEnemy(guard, guard.hp); updateEnemies(.001);
        check(!gateLocked(c.map, state.run), 'side guardian death unlocks passage');
        for (let i = 0; i < 40; i++) animateWorld(state.world, 1 / 60, i / 60);
        check(curtain.material.color.getHexString() !== 'ff3547', 'side gate visibly changes on unlock');
        die(); answerDeath(true);   // "You died": respawn (game/deathask.js)
        check(!allEnemies().some(e => e.guardian), 'side guardian stays dead after rollback');
        startTravel(exit);
        for (let i = 0; i < 100 && !travelling(); i++) await delay(50);
        check(travelling(), 'unlocked side travel starts');
        for (let i = 0; i < 30 && travelling(); i++) updateTravel(.1);
        check(state.cubeKey === step(key, exit.dir) && !state.transitioning, 'unlocked side gate travels onward');
        results.push({ depth, role: 'side', lockedCrossing: true, persistentUnlock: true, travelled: true });
      }
      renderer.compile(scene, camera);
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
