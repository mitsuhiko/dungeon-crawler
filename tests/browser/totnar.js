// In devtools: await (await import('./tests/browser/totnar.js')).runTotnarChecks()
// Totnar's whole fight in his real arena (the descent of depth 1): the dark coming and going,
// thrown skulls that push and come to life (and crumble), losing a skull at two thirds of his
// health, the twig spiders and the roll, losing another at a third, the storm and the bramble
// Stunders, and his death taking them along and bringing the light back.
import { paused } from './combat.js';
import { state, player } from '../../src/game/state.js';
import { makeLayouts } from '../../src/world/layout.js';
import { createRun } from '../../src/core/progression.js';
import { damageEnemy } from '../../src/core/combat.js';
import { attackOf, TOTNAR } from '../../src/core/enemies.js';
import { gateLocked } from '../../src/core/guardians.js';
import { TOTNAR_FIGHT, stageFloor } from '../../src/core/totnar.js';
import { allEnemies, updateEnemies, drawEnemies } from '../../src/game/enemies.js';
import { projectiles } from '../../src/game/projectiles.js';
import { beams } from '../../src/game/beams.js';
import { updatePlayer } from '../../src/game/update.js';
import { enterCube, spawnAt } from '../../src/game/flow.js';
import { loadSpecies } from '../../src/render/enemies.js';
import { groundY, walkable, clearLine } from '../../src/physics/enemynav.js';

const check = (value, message) => { if (!value) throw Error(message); };
const run = (seconds, dt = 1 / 30, also = () => {}) => { for (let t = 0; t < seconds; t += dt) { updateEnemies(dt); also(dt); } };
const withPlayer = dt => updatePlayer(dt);
// make e start attack `name` just before its hit frame (or `at` into it)
function strike(e, name, at = null) {
  const i = e.profile.attacks.findIndex(a => a.name === name), a = e.profile.attacks[i];
  Object.assign(e, { mode: 'attack', attack: i, t: at ?? a.hitAt - 0.02, bit: false, attacks: e.attacks + 1, stun: 0 });
  return a;
}
const TOTNAR_ROLL = () => TOTNAR.attacks.find(a => a.roll);
const alive = type => allEnemies().filter(e => e.type === type && e.mode !== 'dead' && e.mode !== 'gone');

export async function runTotnarChecks() {
  return paused(async () => {
    const oldCube = state.cubes.cubes.get(state.cubeKey), hero = { ...player };
    const saved = Object.fromEntries(['run', 'arrival', 'visit', 'portalLock', 'portalCharge', 'boundaryLock', 'transitioning', 'inventoryOpen', 'fallFrom', 'enemyGrace', 'statusMsg', 'statusUntil'].map(k => [k, state[k]]));
    const opened = new Set(state.openedFaces), key = makeLayouts(state.cubes.seed)(1).down;
    const c = await state.cubes.get(key), visits = c.visits;
    try {
      state.run = createRun(); state.transitioning = state.inventoryOpen = false; state.fallFrom = null;
      enterCube(c, c.map.portals.find(p => p.kind === 'side').dir);
      await loadSpecies(['totnar', 'snapskull', 'spider', 'stunder']);
      const map = state.map, list = allEnemies(), t = list[0];
      check(list.length === 1 && t.boss === 'totnar' && t.guardianGate === map.key && t.stage === 1, 'Totnar alone guards the descent of depth 1');
      check(map.arenaPlacements.filter(p => p.name.includes('brazier')).length >= 3, 'braziers light his arena');
      drawEnemies(0);
      check(t.view && !t.view.bar.visible && t.view.ball && t.view.shed.length === 2, 'his bar on the screen, not over him; his ball and what he sheds');
      player.hp = player.maxHp = 1e5; state.enemyGrace = 0;
      // the player on a floor about d from him, level with him, in his sight; he faces them
      const stand = d => {
        const dist = f => Math.hypot(f.x + .5 - t.x, f.z + .5 - t.z);
        let f = null;
        for (const slack of [0.6, 1.2, 2.5]) {   // (as near to d as the arena allows)
          f = map.floors.filter(f => f.encounter && walkable(f, 2) && Math.abs(dist(f) - d) < slack && dist(f) > 1.7
            && Math.abs(groundY(f, f.x + .5, f.z + .5) - t.y) < 0.3 && clearLine(t.x, t.y + 1.1, t.z, f.x + .5, t.y + 0.6, f.z + .5))
            .sort((a, b) => Math.abs(dist(a) - d) - Math.abs(dist(b) - d))[0];
          if (f) break;
        }
        check(f, 'a floor ' + d + ' from him');
        spawnAt(f.x + .5, groundY(f, f.x + .5, f.z + .5), f.z + .5); player.vx = player.vz = 0; player.gust = null;
        player.ragdoll = null; player.getUp = null; player.hp = player.maxHp = 1e5;   // (a kill's XP sets the most back)
        t.yaw = Math.atan2(player.x - t.x, player.z - t.z);
      };
      stand(4);

      // the dark: he makes it dark, and later light again
      Object.assign(t, { mode: 'chase', cool: 0, think: 0, target: player });
      let waited = 0;
      while (!(t.mode === 'attack' && attackOf(t).cast) && waited < 8) { run(0.1); waited += 0.1; }
      check(t.mode === 'attack' && attackOf(t).cast === 'gloom', 'he casts the gloom: ' + waited.toFixed(1));
      run(attackOf(t).hitAt - t.t + 0.05);
      check(t.dark === 1 && state.dark === 1, 'it is dark');
      strike(t, 'gloom'); run(0.1);
      check(t.dark === 0 && state.dark === 0, 'and light again');

      // a thrown skull pushes back, hurts and comes to life where it lands
      for (const e of allEnemies()) if (e.summoned) damageEnemy(e, e.hp);   // (those he threw while we waited)
      run(0.1);
      stand(3);
      player.lastHurt = null;
      const throwA = strike(t, 'throw');
      let pushed = false;
      run(0.05);
      check(projectiles.some(p => p.kind === 'skull'), 'a skull flies');
      run(1, 1 / 30, dt => { updatePlayer(dt); pushed ||= !!player.gust; });
      check(player.lastHurt?.reason === throwA.reason && pushed, 'it hit, and pushed the player back');
      let skulls = alive('snapskull');
      check(skulls.length === 1 && skulls[0].summoned && ['chase', 'attack'].includes(skulls[0].mode), 'a snapping skull, after the player: ' + skulls.length + ' ' + skulls[0]?.mode);
      drawEnemies(0);
      check(skulls[0].view, 'drawn');
      for (let i = 0; i < TOTNAR_FIGHT.skulls + 2; i++) { strike(t, 'throw'); run(throwA.attackTime); }
      check(alive('snapskull').length <= TOTNAR_FIGHT.skulls, 'never more than ' + TOTNAR_FIGHT.skulls);
      run(TOTNAR_FIGHT.skullLife + 1.5);
      check(!skulls.some(s => alive('snapskull').includes(s)), 'they crumble after a while');

      // two thirds of his health: no further, then a skull bursts off and the light comes back
      t.dark = 1;
      damageEnemy(t, t.hp * 10);
      check(t.hp === stageFloor(t.profile.hp, 1), 'no blow takes him below two thirds');
      run(0.05);
      check(t.mode === 'split' && t.stage === 2 && t.dark === 0 && !damageEnemy(t, 10), 'he loses a skull, it is light, nothing hurts him');
      drawEnemies(0);
      run(TOTNAR_FIGHT.shedTime + 0.1);
      check(t.mode === 'chase', 'and fights on');
      check(t.barred.has('storm') && !t.barred.has('roll'), 'now he rolls, and no storm yet');

      // stage 2: the twig spiders, by the dozen
      strike(t, 'spiders'); run(0.1);
      const spiders = alive('totspider');
      check(spiders.length >= 8 && spiders.length <= TOTNAR_FIGHT.minions.spiders, 'twig spiders: ' + spiders.length);
      drawEnemies(0);
      check(spiders.every(s => s.view && Math.abs(s.view.size - 0.55) < 1e-9), 'small');
      for (const s of spiders) { s.mode = 'idle'; s.stun = 99; }

      // the roll: it runs him over and he cannot be staggered meanwhile (one can bounce off
      // something before it gets there: a few tries)
      run(1);
      const roll = TOTNAR_ROLL();
      let runOver = false, farthest = 0;
      for (let i = 0; i < 4 && !runOver; i++) {
        stand(4);
        player.lastHurt = null;
        strike(t, 'roll', 0);
        let way = 0, was = { x: t.x, z: t.z };
        const rolling = dt => { updatePlayer(dt); way += Math.hypot(t.x - was.x, t.z - was.z); was = { x: t.x, z: t.z }; runOver ||= player.lastHurt?.reason === roll.reason; };
        run(roll.roll.from + 0.1, 1 / 30, rolling);
        check(t.mode === 'attack' && attackOf(t) === roll, 'rolling');
        damageEnemy(t, 5);
        check(t.mode === 'attack' && attackOf(t) === roll, 'and a blow does not stop him');
        run(1.2, 1 / 30, rolling);
        run(roll.attackTime, 1 / 30, rolling);
        farthest = Math.max(farthest, way);
        player.ragdoll = null; player.getUp = null;
      }
      check(runOver, 'and ran the player over');
      check(farthest > 2, 'he covers ground: ' + farthest.toFixed(1));

      // a third: the last skull but one, then the storm and the Stunders
      damageEnemy(t, t.hp * 10); run(0.05);
      check(t.stage === 3 && t.mode === 'split', 'another skull bursts off');
      run(TOTNAR_FIGHT.shedTime + 0.1);
      check(!t.barred.has('storm') && t.barred.has('throw') && t.barred.has('roll'), 'the storm instead of throws and rolls');
      stand(4);
      const storm = strike(t, 'storm', 0);
      run(storm.hitAt - storm.beam.time + 0.05);
      const bolts = beams.filter(b => b.enemy === t);
      check(bolts.length === storm.beam.bolts && bolts.every(b => b.y > player.y + 3), 'bolts out of the sky: ' + bolts.length);
      player.lastHurt = null;
      run(storm.beam.time, 1 / 30, withPlayer);
      check(player.lastHurt?.reason === storm.reason, 'one struck the player');
      run(1);
      strike(t, 'stunders'); run(0.1);
      check(alive('totstunder').length === TOTNAR_FIGHT.minions.stunders, 'bramble Stunders: ' + alive('totstunder').length);

      // his death takes the rest along, brings the light back and opens the gate
      check(gateLocked(map, state.run), 'locked while he lives');
      t.dark = 1;
      damageEnemy(t, t.hp); run(0.05);
      check(!gateLocked(map, state.run) && state.dark === 0, 'his death opens the descent, and it is light');
      run(TOTNAR_FIGHT.leave + 0.1);
      check(!allEnemies().some(e => e.summoned && e.mode !== 'dead' && e.mode !== 'gone'), 'his minions go with him');
      return { dark: true, skulls: true, shed: true, spiders: spiders.length, rolled: true, storm: true, gate: true };
    } finally {
      player.held = null;
      state.run = saved.run; state.openedFaces = opened; c.visits = visits;
      enterCube(oldCube, null, { arrival: saved.arrival, visit: saved.visit,
        portalLock: saved.portalLock, boundaryLock: saved.boundaryLock });
      Object.assign(state, saved); Object.assign(player, hero);
    }
  });
}
