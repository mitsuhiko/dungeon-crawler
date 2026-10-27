// Qualmos, the boss at the core of the world (core/qualmos.js, game/qualmos.js, docs/bosses.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from './fixtures.js';
import { World } from '../src/world/world.js';
import { BOSSES, bossAt } from '../src/core/bosses.js';
import { QUALMOS, ENEMY_KINDS, enemyProfile, guardianLevel, makeEnemy } from '../src/core/enemies.js';
import { QUALMOS_PHASES, PHASES, phaseFloor, barred, phaseDue, enterPhase } from '../src/core/qualmos.js';
import { damageEnemy } from '../src/core/combat.js';
import { population, speciesIn } from '../src/core/spawns.js';
import { guardianSpots } from '../src/game/enemyspawn.js';

const named = name => QUALMOS.attacks.find(a => a.name === name);

test('Qualmos waits at the core, depth 20, with twice the health of Slomo at his own level', () => {
  assert.equal(BOSSES[20], 'qualmos'); assert.equal(bossAt(20), 'qualmos'); assert.equal(ENEMY_KINDS.qualmos, QUALMOS);
  assert.equal(guardianLevel(20, 'descent'), 22);
  assert.equal(enemyProfile(QUALMOS, 22).hp, 2 * enemyProfile(ENEMY_KINDS.slomo, guardianLevel(13, 'descent')).hp);
  assert.equal(enemyProfile(QUALMOS, 22).hp, 6760);
  // (more than any other boss: Monteur, twice a boss of his level, too)
  const others = Object.entries(BOSSES).filter(([, k]) => k !== 'qualmos').map(([d, k]) => enemyProfile(ENEMY_KINDS[k], guardianLevel(+d, 'descent')).hp);
  assert.ok(enemyProfile(QUALMOS, 22).hp > Math.max(...others));
});

test('the core\'s last cube is his arena: him alone, its entrance and no way on', () => {
  for (const seed of [1, 123, 456]) {
    const w = new World(seed), L = w.layout(20);
    const [k, g] = [...L.guardians].find(([, x]) => x.boss === 'qualmos');
    assert.equal(k, '0,-20,0'); assert.equal(g.final, true); assert.equal(L.down, null);
    const map = state.map = w.cube(k).map;
    assert.equal(map.guardian.final, true); assert.equal(map.guardian.portalId, null);
    assert.equal(map.exit, null); assert.equal(map.portals.length, 1); assert.ok(map.portals[0].dir < 4);
    assert.deepEqual([...population(map).keys()], ['qualmos']);
    assert.deepEqual(speciesIn(map), ['qualmos']);
    const spots = guardianSpots(map);
    assert.equal(spots.length, 1); assert.equal(spots[0].kind, QUALMOS);
    assert.equal(makeEnemy(spots[0], QUALMOS).hp, 6760);
    // the route ends at him
    assert.equal(map.moves.at(-1).to, map.guardian.floor);
  }
});

test('five phases, a fifth of his health each: each brings attacks of its own on top of the ones before', () => {
  assert.equal(PHASES, 5);
  const all = QUALMOS.attacks.map(a => a.name).filter(n => n !== 'rage');
  assert.deepEqual(QUALMOS_PHASES.flat().sort(), all.sort());
  assert.equal(all.length, 11);
  for (let phase = 1; phase <= PHASES; phase++) {
    const no = barred(phase), open = QUALMOS_PHASES.slice(0, phase).flat();
    assert.ok(no.has('rage'));
    for (const n of all) assert.equal(no.has(n), !open.includes(n), `${n} in phase ${phase}`);
  }
  assert.deepEqual([1, 2, 3, 4, 5].map(p => phaseFloor(6760, p)), [5408, 4056, 2704, 1352, 0]);
});

test('no blow takes him past a phase: he rages into the next one (nothing hurts him meanwhile), and dies in the last', () => {
  const e = makeEnemy({ id: 'q', x: 8, y: 0, z: 8, level: 22 }, QUALMOS);
  enterPhase(e, 1);
  for (let phase = 1; phase <= PHASES; phase++) {
    assert.equal(e.stage, phase);
    damageEnemy(e, 1e9);
    assert.equal(e.hp, phaseFloor(e.profile.hp, phase));
    if (phase === PHASES) break;
    e.mode = 'attack'; assert.equal(phaseDue(e), false, 'not in the middle of an attack');
    e.mode = 'chase'; assert.equal(phaseDue(e), true);
    enterPhase(e, e.stage + 1);
    assert.equal(e.mode, 'attack'); assert.equal(QUALMOS.attacks[e.attack].name, 'rage');
    assert.equal(damageEnemy(e, 1), false, 'warded while he rages');
    assert.ok(!e.barred.has(QUALMOS_PHASES[phase][0]));
    e.mode = 'chase';
  }
  assert.equal(e.mode, 'dead');
});

test('after his belly flop he lies exposed and takes more; the jet and the wave push, the undertow pulls, the ink slows', () => {
  const flop = named('bellyFlop');
  assert.ok(flop.exposed.damage > 1 && flop.exposed.from > flop.hitAt && flop.exposed.until < flop.attackTime);
  for (const n of ['waterJet', 'tidalSurge']) assert.equal(named(n).gust.kind, 'jet');
  assert.ok(named('undertow').pull);
  assert.ok(named('inkBurst').projectile.slow);
  assert.equal(named('spikeVolley').projectile.volley, 3);
  assert.ok(named('dive').lunge);
});
