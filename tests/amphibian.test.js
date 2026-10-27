import './fixtures.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { BOSSES } from '../src/core/bosses.js';
import { voyagePlanetKey, VOYAGE_LAGOON } from '../src/core/qualmos-voyage.js';
import { AMPHIBIAN, ENEMY_KINDS, enemyProfile, guardianLevel, makeEnemy } from '../src/core/enemies.js';
import { AMPHIBIAN_ATTACKS, amphibianBarred, amphibianFloor, amphibianPhase, amphibianWaterPose, AMPHIBIAN_WATER_SECONDS } from '../src/core/amphibian.js';
import { population, speciesIn } from '../src/core/spawns.js';
import { guardianSpots } from '../src/game/enemyspawn.js';
import { damageEnemy } from '../src/core/combat.js';
import { readGlb, isCompressed } from '../tools/glb.mjs';

test('Qualmos has twice the strongest previous boss native HP, exactly 6760 at depth 20', () => {
  const hp = Object.entries(BOSSES).filter(([depth]) => +depth < 20).map(([d, k]) => enemyProfile(ENEMY_KINDS[k], guardianLevel(+d, 'descent')).hp);
  assert.equal(enemyProfile(AMPHIBIAN, guardianLevel(20, 'descent')).hp, 2 * Math.max(...hp));
  assert.equal(enemyProfile(AMPHIBIAN, 22).hp, 6760);
  assert.equal(AMPHIBIAN.label, 'Qualmos');
});
test('five phases gate the eleven attacks, and a phase cannot be skipped by a heavy hit', () => {
  assert.equal(AMPHIBIAN_ATTACKS.filter(a => a.name !== 'rage').length, 11);
  const e = makeEnemy({ level: 22 }, AMPHIBIAN);
  for (let phase = 1; phase <= 5; phase++) {
    e.hpFloor = amphibianFloor(phase, e.profile.hp);
    const blocked = amphibianBarred(phase);
    assert.ok(blocked.has('rage'));
    for (const a of AMPHIBIAN_ATTACKS.filter(a => a.name !== 'rage')) assert.equal(blocked.has(a.name), a.phase > phase);
    damageEnemy(e, 1e9);
    assert.equal(e.hp, e.hpFloor);
  }
  assert.equal(e.mode, 'dead');
  assert.equal(amphibianPhase(6760, 6760), 1);
  assert.equal(amphibianPhase(1352, 6760), 5);
});
test('the core leads to the rescue route and Qualmos spawns alone on each glass world', () => {
  for (const seed of [1, 123, 456]) {
    const w = new World(seed), L = w.layout(20);
    const k = [...L.guardians].find(([, g]) => g.boss === 'qualmos')[0];
    assert.equal(k, '0,-20,0');
    const room = w.cube(k).map;
    assert.equal(room.qualmos.kind, 'room');
    assert.equal(room.guardian, null);
    assert.equal(room.portals.length, 1); assert.ok(room.portals.every(p => p.dir !== 4));
    assert.deepEqual(speciesIn(room), []);
    for (let chapter = 1; chapter <= 3; chapter++) {
      const m = w.cube(voyagePlanetKey(chapter)).map;
      assert.equal(m.depth, 20); assert.equal(m.guardian.final, true);
      assert.equal(m.qualmos.chapter, chapter);
      assert.equal(m.portals.length, 0);
      assert.equal(m.exit, null);
      assert.deepEqual([...population(m).keys()], ['amphibian']);
      assert.deepEqual(speciesIn(m), ['amphibian']);
      const spots = guardianSpots(m);
      assert.equal(spots.length, 1); assert.equal(spots[0].kind, AMPHIBIAN);
      assert.equal(makeEnemy(spots[0], AMPHIBIAN).hp, 6760);
    }
  }
});
test('Qualmos retreats into deep water, cannot be hit while hidden, then returns without healing', () => {
  const from={x:8.5,y:2,z:8.5};
  const start=amphibianWaterPose(0,from,VOYAGE_LAGOON);
  assert.equal(start.x,from.x);assert.equal(start.y,from.y);assert.equal(start.z,from.z);
  const hidden=amphibianWaterPose(3,from,VOYAGE_LAGOON);
  assert.equal(hidden.x,VOYAGE_LAGOON.x);assert.equal(hidden.z,VOYAGE_LAGOON.z);
  assert.equal(hidden.y,VOYAGE_LAGOON.bed);assert.equal(hidden.under,true);
  const e=makeEnemy({level:22},AMPHIBIAN);e.under=+hidden.under;
  const hp=e.hp;assert.equal(damageEnemy(e,100),false);assert.equal(e.hp,hp);
  const back=amphibianWaterPose(AMPHIBIAN_WATER_SECONDS,from,VOYAGE_LAGOON);
  assert.equal(back.x,from.x);assert.equal(back.y,from.y);assert.equal(back.z,from.z);
  assert.equal(back.under,false);assert.equal(back.done,true);
  e.under=0;damageEnemy(e,100);assert.equal(e.hp,hp-100);
});

test('Qualmos model is compressed, skinned, and contains every attack and a real death clip', () => {
  const { json: j } = readGlb(new URL('../assets/amphibian.glb', import.meta.url));
  assert.ok(isCompressed(j)); assert.equal(j.skins.length, 1);
  assert.ok(j.materials.length <= 12);
  const clips = new Set(j.animations.map(a => a.name));
  for (const n of ['BossWalk', 'BossDeath', 'BossWhip', 'BossGrab', 'BossWaterJet', 'BossDive', 'BossTailSpin', 'BossDoubleSlam', 'BossInkBurst', 'BossUndertow', 'BossSpikeVolley', 'BossTidalSurge', 'BossBellyFlop', 'BossRage']) assert.ok(clips.has(n), n);
});
