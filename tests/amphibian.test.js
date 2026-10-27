import './fixtures.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { BOSSES } from '../src/core/bosses.js';
import { AMPHIBIAN, ENEMY_KINDS, enemyProfile, guardianLevel, makeEnemy } from '../src/core/enemies.js';
import { AMPHIBIAN_ATTACKS, amphibianBarred, amphibianFloor, amphibianPhase } from '../src/core/amphibian.js';
import { population, speciesIn } from '../src/core/spawns.js';
import { guardianSpots } from '../src/game/enemyspawn.js';
import { damageEnemy } from '../src/core/combat.js';
import { readGlb, isCompressed } from '../tools/glb.mjs';

test('Qualmos has twice the strongest previous boss native HP, exactly 6760 at depth 20', () => {
  const hp = Object.entries(BOSSES).filter(([, k]) => k !== 'amphibian').map(([d, k]) => enemyProfile(ENEMY_KINDS[k], guardianLevel(+d, 'descent')).hp);
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
test('the final boss spawns alone in the real core, with no portal below depth 20', () => {
  for (const seed of [1, 123, 456]) {
    const w = new World(seed), L = w.layout(20);
    const k = [...L.guardians].find(([, g]) => g.boss === 'amphibian')[0];
    assert.equal(k, '0,-20,0');
    const m = w.cube(k).map;
    assert.equal(m.depth, 20); assert.equal(m.guardian.final, true);
    assert.equal(m.portals.length, 1); assert.ok(m.portals.every(p => p.dir !== 4));
    assert.equal(m.exit, null);
    assert.deepEqual([...population(m).keys()], ['amphibian']);
    assert.deepEqual(speciesIn(m), ['amphibian']);
    const spots = guardianSpots(m);
    assert.equal(spots.length, 1); assert.equal(spots[0].kind, AMPHIBIAN);
    assert.equal(makeEnemy(spots[0], AMPHIBIAN).hp, 6760);
  }
});
test('Qualmos model is compressed, skinned, and contains every attack and a real death clip', () => {
  const { json: j } = readGlb(new URL('../assets/qualmos.glb', import.meta.url));
  assert.ok(isCompressed(j)); assert.equal(j.skins.length, 1);
  assert.ok(j.materials.length <= 12);
  const clips = new Set(j.animations.map(a => a.name));
  for (const n of ['BossWalk', 'BossDeath', 'BossWhip', 'BossGrab', 'BossWaterJet', 'BossDive', 'BossTailSpin', 'BossDoubleSlam', 'BossInkBurst', 'BossUndertow', 'BossSpikeVolley', 'BossTidalSurge', 'BossBellyFlop', 'BossRage']) assert.ok(clips.has(n), n);
});
