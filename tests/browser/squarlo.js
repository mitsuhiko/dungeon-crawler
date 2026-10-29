// In devtools: await (await import('./tests/browser/squarlo.js')).runSquarloChecks()
// Squarlo's whole fight in his real arena (the descent of depth 2, his tidal hills): the water
// standing in the flats, his jet pushing the player back, Squirtles popping out of his water and
// diving into it, the tide (he cannot be hurt while he calls it) going over the flats but not the
// hills (the player swims in it there, unhurt, carried up with it), the
// rest after it, growing into a giant at half his health, the giant's stomp, its shockwave and
// his jump, and his death draining the water and taking the Squirtles along.
import { paused } from './combat.js';
import { state, player } from '../../src/game/state.js';
import { makeLayouts } from '../../src/world/layout.js';
import { createRun } from '../../src/core/progression.js';
import { damageEnemy } from '../../src/core/combat.js';
import { attackOf, exposedBy, hurtBy, SQUARLO_GIANT } from '../../src/core/enemies.js';
import { gateLocked } from '../../src/core/guardians.js';
import { SQUARLO_FIGHT, splitHp } from '../../src/core/squarlo.js';
import { LH, HEAD_Y, SWIM_FEET } from '../../src/core/constants.js';
import { allEnemies, updateEnemies, drawEnemies } from '../../src/game/enemies.js';
import { beams } from '../../src/game/beams.js';
import { updatePlayer } from '../../src/game/update.js';
import { enterCube, spawnAt } from '../../src/game/flow.js';
import { loadSpecies } from '../../src/render/enemies.js';
import { groundY, walkable } from '../../src/physics/enemynav.js';
import { muzzleAt } from '../../src/core/beams.js';
import { fitting, put as putBody } from '../../src/game/bossfight.js';
import { wetAt } from '../../src/physics/dwell.js';

const check = (value, message) => { if (!value) throw Error(message); };
const run = (seconds, dt = 1 / 30, also = () => {}) => { for (let t = 0; t < seconds; t += dt) { updateEnemies(dt); also(dt); } };
const withPlayer = dt => updatePlayer(dt);
function strike(e, name, at = null) {
  const i = e.profile.attacks.findIndex(a => a.name === name), a = e.profile.attacks[i];
  Object.assign(e, { mode: 'attack', attack: i, t: at ?? a.hitAt - 0.02, bit: false, attacks: e.attacks + 1, stun: 0 });
  return a;
}
const alive = type => allEnemies().filter(e => e.type === type && e.mode !== 'dead' && e.mode !== 'gone');

export async function runSquarloChecks() {
  return paused(async () => {
    const oldCube = state.cubes.cubes.get(state.cubeKey), hero = { ...player };
    const saved = Object.fromEntries(['run', 'arrival', 'visit', 'portalLock', 'portalCharge', 'boundaryLock', 'transitioning', 'inventoryOpen', 'fallFrom', 'enemyGrace', 'statusMsg', 'statusUntil'].map(k => [k, state[k]]));
    const opened = new Set(state.openedFaces), key = makeLayouts(state.cubes.seed)(2).down;
    const c = await state.cubes.get(key), visits = c.visits;
    try {
      state.run = createRun(); state.transitioning = state.inventoryOpen = false; state.fallFrom = null;
      enterCube(c, c.map.portals.find(p => p.kind === 'side').dir);
      await loadSpecies(['squarlo', 'squirtle']);
      const map = state.map, list = allEnemies(), q = list[0], level = map.portals[0].y / LH;
      check(list.length === 1 && q.boss === 'squarlo' && q.guardianGate === map.key && q.stage === 1, 'Squarlo alone guards the descent of depth 2');
      check(map.arena.type === 'tidal' && map.tide, 'in his tidal hills');
      run(0.05);
      check(Math.abs(state.tide - map.tide.rest) < 1e-6 && state.world.trialView?.water?.visible, 'the water stands in the flats');
      drawEnemies(0);
      check(q.view && !q.view.bar.visible && q.view.size === 1, 'his bar on the screen, not over him; his size');
      player.hp = player.maxHp = 1e5; state.enemyGrace = 0;
      const level0 = f => groundY(f, f.x + .5, f.z + .5);
      const put = f => {
        spawnAt(f.x + .5, level0(f), f.z + .5); player.vx = player.vz = 0; player.gust = null;
        player.ragdoll = null; player.getUp = null; player.fluidDeath = 0; player.hp = player.maxHp = 1e5;
      };
      // the player on a floor about d from him, level with him; he faces them
      const stand = d => {
        const dist = f => Math.hypot(f.x + .5 - q.x, f.z + .5 - q.z);
        const f = map.floors.filter(f => f.encounter && walkable(f, 1) && Math.abs(level0(f) - q.y) < 0.2 && dist(f) > 1.2)
          .sort((a, b) => Math.abs(dist(a) - d) - Math.abs(dist(b) - d))[0];
        check(f, 'a floor ' + d + ' from him');
        put(f);
        q.yaw = Math.atan2(player.x - q.x, player.z - q.z);
      };

      // the jet: it hurts and pushes the player back
      stand(2.5);
      player.lastHurt = null;
      const blow = strike(q, 'blow');
      let pushed = false;
      run(blow.gust.time + 0.1, 1 / 30, dt => { updatePlayer(dt); pushed ||= !!player.gust; });
      check(player.lastHurt?.reason === blow.reason && pushed, 'the jet hit and pushed the player back');

      // Squirtles pop out of his water, at most three; under it nothing hurts them
      run(1);
      strike(q, 'summon'); run(0.05);
      let squirtles = alive('squarlosquirtle');
      check(squirtles.length >= 1 && squirtles.length <= SQUARLO_FIGHT.minions[0] && squirtles.every(s => s.under), 'Squirtles, under the surface: ' + squirtles.length);
      check(squirtles.every(s => wetAt(s.profile, s.f) !== null), 'in his water');
      check(!damageEnemy(squirtles[0], 1), 'nothing hurts one under the floor');
      run(0.8);
      check(squirtles.every(s => !s.under), 'they pop out');
      drawEnemies(0);
      check(squirtles.every(s => s.view && s.view.sink < 1), 'and show');
      run(5);
      check(squirtles.some(s => s.under) || squirtles.some(s => s.attacks > 0), 'they dive again, or throw');
      for (const s of squirtles) { s.under = 0; damageEnemy(s, s.hp); }

      // the tide: when it is due he calls it, warded; the flats drown, the hills stay dry
      run(0.1);
      Object.assign(q, { mode: 'chase', cool: 0, think: 0, target: player });
      q.barred = new Set(['blow', 'summon', 'rest', 'stomp']);
      const tide = strike(q, 'tide', 0.3);
      check(!damageEnemy(q, 10) && q.view, 'nothing hurts him while he calls the tide');
      run(tide.hitAt - q.t + 0.05);
      check(q.tide > 0, 'the water starts to rise');
      const flat = map.floors.filter(f => f.encounter && f.top <= level - 3 && walkable(f, 1))[0];
      const hill = map.floors.filter(f => f.encounter && f.top >= level && walkable(f, 1) && !f.prot)[0];
      check(flat && hill, 'flats and a hill');
      put(flat);
      let swam = false, seen = q.attacks, before = player.hp;
      const after = [];   // the attacks he starts after it
      const watch = () => { if (q.attacks !== seen) { seen = q.attacks; if (q.mode === 'attack') after.push(attackOf(q).name); } };
      run(SQUARLO_FIGHT.tide.rise + 0.5, 1 / 30, dt => { watch(); updatePlayer(dt); swam ||= player.swimming; });
      // the water lifts the player off the flats: they swim, unhurt, up with it
      check(swam && player.swimming && player.hp === before && !player.fluidDeath && !player.rescue,
        'on the flats the tide lifts the player: they swim (' + (before - player.hp) + ' hurt)');
      check(Math.abs(player.y + SWIM_FEET - state.tide * LH) < 0.1, 'afloat on the high tide: ' + player.y);
      check(q.tide === 1 && Math.abs(state.tide - map.tide.high) < 0.05, 'high tide: ' + state.tide);
      check(q.barred.has('blow'), 'no jet while the water is up');
      put(hill);
      run(2, 1 / 30, dt => { watch(); updatePlayer(dt); });
      check(player.hp > 0 && !player.fluidDeath, 'on a hill the player stays dry');
      check(state.tide * LH - level0(hill) < HEAD_Y, 'the water there is not over the head');
      // after the tide he has to rest, and blows hurt more meanwhile
      check(after[0] === 'rest', 'he rests after the tide: ' + after);
      strike(q, 'rest', 0.5);
      check(exposedBy(q) > 1, 'out of breath, he is hit harder');
      run(3, 1 / 30, withPlayer);

      // half his health: the fog rolls in and he grows into a giant
      damageEnemy(q, q.hp * 10);
      check(q.hp === splitHp(q.profile.hp), 'no blow takes him below half');
      run(0.05);
      check(q.mode === 'split' && state.mist === 1 && !damageEnemy(q, 10), 'he grows in a fog, nothing hurts him');
      run(SQUARLO_FIGHT.morphTime / 2); drawEnemies(0);
      check(q.view.size > 2, 'growing: ' + q.view.size.toFixed(2));
      run(SQUARLO_FIGHT.morphTime / 2 + 0.2); drawEnemies(0);
      check(q.mode !== 'split' && q.stage === 2 && q.profile.giant && Math.abs(q.view.size - SQUARLO_GIANT.size) < 1e-6 && state.mist === 0, 'a giant');

      // the giant: on the flats, where there is room round him (wherever his fight took him)
      run(SQUARLO_FIGHT.tide.high + SQUARLO_FIGHT.tide.fall + 1);
      const room = f => map.floors.filter(g => g.encounter && walkable(g, 1) && Math.abs(level0(g) - level0(f)) < 0.2
        && Math.hypot(g.x - f.x, g.z - f.z) < 5).length;
      const flats = fitting(q.profile).sort((a, b) => room(b) - room(a) || level0(a) - level0(b));
      putBody(q, flats[0]); Object.assign(q, { mode: 'chase', cool: 1, think: 0 }); q.barred = new Set(['tide', 'summon', 'rest']);
      // (none of his Squirtles about while his own blows are tried: they would leap onto the player
      // and crash down on them)
      const calm = () => { for (const s of alive('squarlosquirtle')) { s.under = 0; damageEnemy(s, s.hp); } };
      calm();
      // nothing staggers him, and blows hurt him less
      const hp0 = q.hp;
      check(damageEnemy(q, 20) && !q.staggered && hurtBy(q) < 1, 'the giant does not stagger, his skin is thick');
      q.hp = hp0;

      // the stomp: his foot's shadow lies where his foot comes down; the foot comes down there
      calm(); stand(3);
      let stomp = strike(q, 'stomp', 0);
      run(stomp.hitAt - stomp.beam.time + 0.05);
      const ring = beams.find(b => b.enemy === q);
      check(ring?.kind === 'stomp', 'his foot\'s shadow');
      run(stomp.beam.time - stomp.beam.lock + 0.05, 1 / 30, withPlayer);
      const foot = muzzleAt(q, stomp.beam.muzzle);
      check(Math.hypot(foot.x - ring.ax, foot.z - ring.az) < 0.05, 'his foot over its shadow: ' + Math.hypot(foot.x - ring.ax, foot.z - ring.az).toFixed(2));
      spawnAt(ring.ax, ring.ey, ring.az); player.lastHurt = null;
      run(stomp.hitAt - q.t + 0.15, 1 / 30, withPlayer);
      check(player.lastHurt?.reason === stomp.reason, 'stomped the player under his foot: ' + player.lastHurt?.reason);
      check(exposedBy(q) > 1 && hurtBy(q) > 1, 'his foot stuck, he is hit harder');
      run(stomp.attackTime, 1 / 30, withPlayer);
      // its shockwave throws a player further off off their feet
      calm(); stand(3.6); player.lastHurt = null;
      stomp = strike(q, 'stomp', 0);
      run(stomp.hitAt + 0.8, 1 / 30, withPlayer);
      check(/shockwave/.test(player.lastHurt?.reason ?? ''), 'the shockwave: ' + player.lastHurt?.reason);
      run(2, 1 / 30, withPlayer);

      // the jump: his shadow follows the player; he flies onto it and squashes them, dazed
      calm(); stand(6); player.lastHurt = null;
      const jump = strike(q, 'jump', 0), from = { x: q.x, z: q.z };
      let high = 0;
      run(jump.hitAt + 0.05, 1 / 30, dt => { high = Math.max(high, q.y - level0(q.f)); withPlayer(dt); });
      check(high > jump.jump.height * 0.8, 'up in the air: ' + high.toFixed(2));
      check(Math.hypot(q.x - from.x, q.z - from.z) > 3, 'over to the player');
      check(player.lastHurt?.reason === jump.reason && player.dazed > 2.5 && player.stun > 2.5, 'squashed flat and dazed: ' + player.lastHurt?.reason);
      run(jump.attackTime, 1 / 30, withPlayer);
      player.ragdoll = null; player.getUp = null; player.stun = 0; player.dazed = 0;

      // his death drains the water, takes the Squirtles along and opens the gate
      strike(q, 'summon'); run(0.1);
      check(alive('squarlosquirtle').length >= 1, 'a giant summons too');
      strike(q, 'tide', 0); run(q.profile.attacks.find(a => a.name === 'tide').hitAt + 1);
      check(q.tide > 0, 'the tide rises in phase 2 too');
      check(gateLocked(map, state.run), 'locked while he lives');
      damageEnemy(q, q.hp); run(0.05);
      check(!gateLocked(map, state.run), 'his death opens the descent');
      run(SQUARLO_FIGHT.tide.fall + 0.5);
      check(Math.abs(state.tide - map.tide.rest) < 0.05, 'and the water drains: ' + state.tide);
      check(!allEnemies().some(e => e.summoned && e.mode !== 'dead' && e.mode !== 'gone'), 'his Squirtles go with him');
      return { jet: true, squirtles: squirtles.length, tide: true, swim: true, giant: true, stomp: true, jump: true, gate: true };
    } finally {
      state.run = saved.run; state.openedFaces = opened; c.visits = visits;
      enterCube(oldCube, null, { arrival: saved.arrival, visit: saved.visit,
        portalLock: saved.portalLock, boundaryLock: saved.boundaryLock });
      Object.assign(state, saved); Object.assign(player, hero);
    }
  });
}
