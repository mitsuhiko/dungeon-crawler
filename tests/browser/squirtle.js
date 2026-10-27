// In devtools: await (await import('./tests/browser/squirtle.js')).runSquirtleChecks()
// The Squirtles live in fluids (physics/dwell.js, game/enemyai.js): in the shores test room's lake
// one fights from its water, leaps out of it at a hero standing near on the bank and crashes down
// on them, shrinks there, dissolves into a puddle nothing touches, runs back into the lake and
// rises again; it is never shoved out of the water; put on the bank it does the same; in the
// lineup room, with no water anywhere, it seeps away. In Squarlo's tidal hills his Squirtles
// pop out of his water, and when his tide falls, one left on what dries goes back into the water
// that stays.
import { paused } from './combat.js';
import { state, player } from '../../src/game/state.js';
import { LH, WATER } from '../../src/core/constants.js';
import { ENEMY_KINDS, makeEnemy, attackOf, absent } from '../../src/core/enemies.js';
import { SQUARLO_FIGHT } from '../../src/core/squarlo.js';
import { createRun } from '../../src/core/progression.js';
import { makeLayouts } from '../../src/world/layout.js';
import { put as putBody } from '../../src/game/bossfight.js';
import { allEnemies, addEnemies, detachEnemies, updateEnemies, drawEnemies } from '../../src/game/enemies.js';
import { spawnAt, enterCube } from '../../src/game/flow.js';
import { goTestRoom } from '../../src/game/dev.js';
import { loadSpecies, removeEnemyViews } from '../../src/render/enemies.js';
import { standY, wetAt, livesOn, SHALLOW } from '../../src/physics/dwell.js';

const check = (value, message) => { if (!value) throw Error(message); };
const run = (seconds, also = () => {}, dt = 1 / 30) => { for (let t = 0; t < seconds; t += dt) { updateEnemies(dt); also(); } };
const T0 = performance.now(), log = (...a) => console.log('[squirtle]', ((performance.now() - T0) / 1000).toFixed(1), ...a);

export async function runSquirtleChecks() {
  return paused(async () => {
    const hero = { ...player }, out = [], oldCube = state.cubes.cubes.get(state.cubeKey), opened = new Set(state.openedFaces);
    const saved = Object.fromEntries(['run', 'arrival', 'visit', 'portalLock', 'boundaryLock', 'transitioning', 'enemyGrace', 'devPassive'].map(k => [k, state[k]]));
    try {
      const kind = ENEMY_KINDS.squirtle;
      await loadSpecies(['squirtle']);
      const into = async name => {
        state.transitioning = false;
        const why = await goTestRoom(name, 3);
        check(!why && state.map?.testRoom, why ?? 'into the test room ' + name);
        removeEnemyViews(detachEnemies());
        state.enemyGrace = 0; state.devPassive = false;
        return state.map;
      };
      const put = (f, id) => {
        const e = makeEnemy({ id, level: 3, coinDrop: 0, kind, f, x: f.x + 0.5, z: f.z + 0.5, y: standY(kind, f, f.x + 0.5, f.z + 0.5), yaw: 0 }, kind);
        addEnemies([e]);
        return e;
      };
      const hero_ = (x, z, top) => { spawnAt(x, top * LH, z); Object.assign(player, { hp: 1e5, maxHp: 1e5 }); };
      const at = (m, x, z, wet) => m.floors.find(f => f.x === x && f.z === z && !f.kind && !!f.fluid === wet);

      // the shores room: a lake (x 4..10, z 5..11, its surface at level 3), its bank at level 4
      let m = await into('shores');
      const e = put(at(m, 5, 9, true), 'sq:a');
      hero_(3.6, 8.5, 4);
      let leapt = false, landed = false, puddle = false, untouchable = true, rose = false, hurt = false;
      const until = (seconds, done, also) => { for (let t = 0; t < seconds && !done(); t += 1 / 30) { updateEnemies(1 / 30); also(); } };
      until(30, () => rose && hurt, () => {
        hurt ||= player.hp < 1e5; Object.assign(player, { hp: 1e5, ragdoll: null, getUp: null });
        if (e.mode === 'attack' && attackOf(e).name === 'leap') leapt = true;
        if (e.mode === 'ashore' && !e.under) landed = true;
        if (e.mode === 'ashore' && e.under) { puddle = true; untouchable &&= absent(e); }
        if (puddle && wetAt(e.profile, e.f) !== null && !e.under) rose = true;
      });
      check(leapt && hurt, `it leaps at the hero near it on the bank, and crashes down on them (leapt ${leapt}, hurt ${hurt}; ${e.mode} at ${e.x.toFixed(2)}, ${e.z.toFixed(2)}, attacks ${e.attacks})`);
      check(landed && puddle && untouchable, 'on the land it dissolves into a puddle nothing touches');
      check(rose && e.mode !== 'dead', 'and rises again in the lake');
      out.push('leapt, crashed, dissolved, back in the lake');
      // shoved towards the bank, it stays in the water
      for (let i = 0; i < 10; i++) { e.kbx = -6; e.kbz = 0; run(0.1); }
      check(e.f.fluid === WATER, 'never shoved out of the water');

      // put on the bank, it hurries back into the lake over the land
      removeEnemyViews(detachEnemies());
      const b = put(at(m, 2, 6, false), 'sq:b');
      hero_(13.5, 13.5, 4);
      let ashore = false;
      run(6, () => { ashore ||= b.mode === 'ashore' && b.under; player.hp = 1e5; });
      check(ashore && livesOn(b.profile, b.f) && b.mode !== 'dead', 'back into the lake from the bank, a puddle');
      out.push('back into the lake from the bank');

      // the lineup room has no water: it dries up
      m = await into('enemies');
      const c = put(m.floors.find(f => f.x === 8 && f.z === 6), 'sq:c');
      hero_(8.5, 1.5, m.floors.find(f => f.x === 8 && f.z === 1).top);
      run(4);
      check(c.mode === 'dead' && c.noReward, 'with no water to get back to, it seeps away');
      out.push('seeps away with no water');
      drawEnemies(0);
      log('test rooms done');

      // Squarlo's tidal hills (the descent of depth 2)
      const sq = await state.cubes.get(makeLayouts(state.cubes.seed)(2).down);
      state.run = createRun(); state.transitioning = false;
      enterCube(sq, sq.map.portals.find(p => p.kind === 'side').dir);
      await loadSpecies(['squarlo', 'squirtle']);
      m = state.map;
      const q = allEnemies().find(e => e.boss === 'squarlo');
      const hill = m.floors.filter(f => f.encounter && !f.prot && f.top >= m.tide.high + 1).sort((a, b) => Math.hypot(b.x - q.x, b.z - q.z) - Math.hypot(a.x - q.x, a.z - q.z))[0];
      hero_(hill.x + 0.5, hill.z + 0.5, hill.top);
      Object.assign(q, { mode: 'chase', think: 0, target: player, cool: 99 });
      run(0.1);
      q.summon(q.profile.attacks.find(a => a.name === 'summon'));
      const tides = allEnemies().filter(e => e.type === 'squarlosquirtle');
      check(tides.length && tides.every(s => wetAt(s.profile, s.f) !== null), 'his Squirtles pop out of his water: ' + tides.length);
      log('summoned');
      q.cast({ cast: 'tide' });
      run(SQUARLO_FIGHT.tide.rise + 1, () => { player.hp = 1e5; q.cool = 99; });
      const tide = ENEMY_KINDS.squarlosquirtle, rest = m.tide.rest * LH;
      const high = m.floors.find(f => f.encounter && livesOn(tide, f) && f.top * LH > rest - SHALLOW + 0.1 && Math.hypot(f.x - q.x, f.z - q.z) > 3);
      check(high, 'a floor in the water at high tide only');
      log('high tide');
      const s1 = tides[0];
      putBody(s1, high);
      // (held there, `waiting`, while the tide stands, then let go as it falls)
      s1.waiting = true;
      run(SQUARLO_FIGHT.tide.high - 0.5, () => { player.hp = 1e5; q.cool = 99; });
      s1.waiting = false;
      let left = false;
      run(SQUARLO_FIGHT.tide.fall + 6, () => { player.hp = 1e5; q.cool = 99; left ||= s1.mode === 'ashore'; });
      check(left && s1.mode !== 'dead' && s1.mode !== 'ashore' && wetAt(s1.profile, s1.f) !== null,
        `the tide fell: back into the water that stays (${left}, ${s1.mode}, under ${s1.under}, ${s1.x.toFixed(2)}, ${s1.z.toFixed(2)})`);
      out.push(`Squarlo: ${tides.length} out of his water, back into it as the tide fell`);
      return out;
    } finally {
      removeEnemyViews(detachEnemies());
      state.transitioning = false; state.openedFaces = opened;
      if (oldCube) enterCube(oldCube, null, { arrival: saved.arrival, visit: saved.visit, portalLock: saved.portalLock, boundaryLock: saved.boundaryLock });
      else enterCube(await state.cubes.get(state.cubes.start), null);
      Object.assign(state, saved);
      Object.assign(player, hero);
    }
  });
}
