// Qualmos, the boss at the core of the world (core/qualmos.js, game/qualmos.js, docs/bosses.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from './fixtures.js';
import { World } from '../src/world/world.js';
import { BOSSES, bossAt } from '../src/core/bosses.js';
import { QUALMOS, QUALMOS_STAGES, STAGE_PROFILES, ENEMY_KINDS, enemyProfile, guardianLevel, makeEnemy, attacksInReach } from '../src/core/enemies.js';
import { QUALMOS_PHASES, PHASES, phaseFloor, barred, phaseDue, enterPhase, counted, flopDue, choices, FLOP_EVERY, QUALMOS_DIVE } from '../src/core/qualmos.js';
import { WATER } from '../src/core/constants.js';
import { nearest, stepEnemy, findPath } from '../src/physics/enemynav.js';
import { wetAt, livesOn, walkerOf } from '../src/physics/dwell.js';
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

test('each phase he hits harder, moves faster and rests less, his health and his attacks the same; a friend\'s game tells them by their phase', () => {
  assert.equal(STAGE_PROFILES.qualmos, QUALMOS_STAGES);
  assert.equal(QUALMOS_STAGES.length, PHASES); assert.equal(QUALMOS_STAGES[0], QUALMOS);
  const e = makeEnemy({ id: 'q', x: 8, y: 0, z: 8, level: 22 }, QUALMOS), seen = [];
  for (let phase = 1; phase <= PHASES; phase++) {
    enterPhase(e, phase);
    const p = e.profile, was = seen.at(-1);
    assert.equal(p.type, 'qualmos'); assert.equal(p.hp, 6760); assert.equal(p.phase ?? 1, phase);
    assert.deepEqual(p.attacks.map(a => a.name), QUALMOS.attacks.map(a => a.name));
    if (was) {
      assert.ok(p.damage > was.damage && p.chase > was.chase && p.cooldown < was.cooldown, `phase ${phase}`);
      const flop = a => a.attacks.find(x => x.name === 'bellyFlop').recover;
      assert.ok(flop(p) < flop(was));
    }
    seen.push(p);
  }
});

test('his belly flop comes in a rhythm: from phase 2, first in its reach, then again after two other attacks and never in between; out of its reach he fights on', () => {
  const e = makeEnemy({ id: 'q', x: 8, y: 0, z: 8, level: 22 }, QUALMOS), flop = QUALMOS.attacks.find(a => a.name === 'bellyFlop');
  enterPhase(e, 1);
  assert.ok(QUALMOS_PHASES[1].includes('bellyFlop'));
  assert.equal(flopDue(e), false, 'not in phase 1');
  assert.ok(choices(e, 2, 0).has('bellyFlop'));
  enterPhase(e, 2); counted(e, 'rage');
  assert.equal(flopDue(e), true, 'due once his phase brings it (his rage does not count)');
  const near = choices(e, 2, 0);
  assert.deepEqual(QUALMOS.attacks.map(a => a.name).filter(n => !near.has(n)), ['bellyFlop']);
  // out of its reach: his ranged attacks, as ever
  const far = choices(e, flop.reach + 1, 0);
  assert.deepEqual(far, barred(2));
  assert.ok(attacksInReach(e.profile, flop.reach + 1, 0).some(i => !far.has(QUALMOS.attacks[i].name)));
  counted(e, 'bellyFlop'); counted(e, 'rage');
  for (let i = 0; i < FLOP_EVERY; i++) { assert.equal(flopDue(e), false); assert.deepEqual(choices(e, 2, 0), new Set([...barred(2), 'bellyFlop']), 'never in between'); counted(e, 'whip'); }
  assert.equal(flopDue(e), true);
});

test('his grab holds: his hand catches, lifts and slams the hero down at its throw, along the grip read off his clip', () => {
  const grab = QUALMOS.attacks.find(a => a.name === 'grab');
  assert.ok(grab.grab && grab.knockDown);
  assert.ok(grab.hitAt < grab.grab.throwAt && grab.grab.throwAt < grab.attackTime);
  assert.ok(grab.lunge.to < grab.hitAt, 'he leans in before his hand closes');
  for (const [x, y, z] of grab.grab.grip) assert.ok(Math.abs(x) < 1 && y > 1 && y < QUALMOS.height && z > 0.4 && z < 2, 'in his hand, before him');
  assert.ok(Math.max(...grab.grab.grip.map(([, y]) => y)) - grab.grab.hold > 1.5, 'held up off the floor');
});

test('his arena has a lagoon: he walks into its water and floats there, dives under it and keeps to it there, and walks out again', () => {
  assert.deepEqual(QUALMOS.wades, [WATER]);
  assert.ok(QUALMOS.burrow && !QUALMOS.burrow.up, 'he dives only when his fight sends him');
  assert.ok(QUALMOS_DIVE.from >= 2);
  for (const seed of [1, 123, 456]) {
    const map = state.map = new World(seed).cube('0,-20,0').map;
    const e = makeEnemy(guardianSpots(map)[0], QUALMOS), wet = f => wetAt(e.profile, f) !== null && livesOn(e.profile, f);
    const lagoon = map.floors.filter(wet), land = e.f;
    assert.ok(lagoon.length >= 8 && lagoon.every(f => f.fluid === WATER && f.encounter), `seed ${seed}`);
    assert.equal(wet(land), false);
    // in, along his way there
    const path = nearest(e.f, wet, QUALMOS_DIVE.far, walkerOf(e));
    assert.ok(path, `a way into the water, seed ${seed}`);
    for (const g of path.slice(1)) for (let i = 0; i < 60; i++) {
      const dx = g.x + 0.5 - e.x, dz = g.z + 0.5 - e.z, d = Math.hypot(dx, dz);
      if (d < 0.05) break;
      stepEnemy(e, dx / d * Math.min(0.1, d), dz / d * Math.min(0.1, d));
    }
    assert.ok(wet(e.f), `in the water, seed ${seed}`);
    assert.ok(e.y < e.f.surf * 0.5 && e.y > e.f.top * 0.5, 'floating, his feet under its surface, over its bed');
    // under: the water alone; up: the land again
    e.under = 1;
    assert.equal(findPath(e.f, land, 60, walkerOf(e)), null);
    assert.ok(nearest(e.f, () => false, QUALMOS_DIVE.far, walkerOf(e), f => f.x).every(wet));
    e.under = 0;
    assert.ok(findPath(e.f, land, 60, walkerOf(e)), `out again, seed ${seed}`);
  }
});
