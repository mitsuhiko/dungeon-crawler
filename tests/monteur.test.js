// Monteur, the stone moose who crumbles into a sun of stone (core/monteur.js, game/monteur.js,
// docs/bosses.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from './fixtures.js';
import { World } from '../src/world/world.js';
import { BOSSES, bossAt } from '../src/core/bosses.js';
import { MONTEUR, MONTEUR_SUN, MONT_MOOSE, MOOSE, SLOMO, ENEMY_KINDS, STAGE_PROFILES, makeEnemy, enemyProfile, guardianLevel,
  exposedBy, hurtBy, attacksInReach } from '../src/core/enemies.js';
import { MONTEUR_FIGHT, STONES_OF, phaseFloor, summonCount, barred, takeStones, growStones, nextQuarter } from '../src/core/monteur.js';
import { damageEnemy } from '../src/core/combat.js';
import { kindsIn, speciesIn } from '../src/core/spawns.js';
import { guardianLockMessage } from '../src/core/guardians.js';
import { RUN_SPEED, CHAR_R, CHAR_H } from '../src/core/constants.js';
import { launch, stepProjectile } from '../src/core/projectiles.js';

const named = (p, name) => p.attacks.find(a => a.name === name);
const ALL = ['throw', 'volley', 'charge', 'stuck', 'summon', 'rain', 'spin'];
const allowed = o => ALL.filter(n => !barred(o).has(n));

test('Monteur takes the place of the descent guardian of depth 7, the first of act II', () => {
  assert.equal(BOSSES[7], 'monteur'); assert.equal(bossAt(7), 'monteur'); assert.equal(bossAt(7, 'side'), null);
  const w = new World(3), map = state.map = w.cube(w.layout(7).down).map;
  assert.equal(map.guardian.boss, 'monteur'); assert.equal(guardianLockMessage(map), 'Defeat Monteur to unlock this descent');
  for (const k of ['monteur', 'montmoose']) assert.ok(kindsIn(map).includes(k), k);
  assert.deepEqual(speciesIn(map).sort(), ['monteur', 'moose']);
  assert.ok(MONT_MOOSE.minion && MONT_MOOSE.plain && MONT_MOOSE.species === MOOSE.species && ENEMY_KINDS.montmoose === MONT_MOOSE);
});

test('twice the health of a boss of his level, half a phase: the moose, then the sun', () => {
  assert.deepEqual(STAGE_PROFILES.monteur, [MONTEUR, MONTEUR_SUN]);
  const level = guardianLevel(7, 'descent');
  assert.equal(level, 9);
  assert.equal(enemyProfile(MONTEUR, level).hp, 2 * enemyProfile(SLOMO, level).hp);
  assert.equal(enemyProfile(MONTEUR, level).hp, 4720);
  const e = makeEnemy({ id: 'm', level, x: 0, y: 0, z: 0 }, MONTEUR);
  e.hpFloor = phaseFloor(e.profile.hp, 1);
  damageEnemy(e, 1e6);
  assert.equal(e.hp, e.profile.hp / 2, 'no blow takes him below half in phase 1');
  assert.equal(phaseFloor(1000, 2), 0);
  assert.equal(MONTEUR_SUN.gait, 'sun');
  for (const name of ['rain', 'spin']) assert.ok(named(MONTEUR_SUN, name) && !named(MONTEUR, name), `${name} only as the sun`);
});

test('what he may do when: a throw with the stones for it, the charge, the summon, the rain when due, the spin before all', () => {
  assert.deepEqual(allowed({ phase: 1 }), ['throw', 'volley']);
  assert.deepEqual(allowed({ phase: 1, stones: 2.5 }), ['throw'], 'three stones for a volley');
  assert.deepEqual(allowed({ phase: 1, stones: 0.9 }), [], 'none for a throw');
  assert.deepEqual(allowed({ phase: 1, chargeDue: true, summonDue: true, rainDue: true, spinDue: true }), ['throw', 'volley', 'charge', 'summon'],
    'no rain and no turning the world as the moose');
  assert.deepEqual(allowed({ phase: 2, rainDue: true }), ['throw', 'volley', 'rain']);
  assert.deepEqual(allowed({ phase: 2, chargeDue: true, rainDue: true, spinDue: true }), ['spin'], 'the world turns first');
  assert.ok(!allowed({ phase: 2, chargeDue: true }).includes('stuck'), 'only a charge that crashes starts it');
  assert.equal(summonCount(1, 0), 2); assert.equal(summonCount(2, 1), 1); assert.equal(summonCount(2, 5), 0);
});

test('his stones: thrown one or three at a time, growing back one by one', () => {
  const most = MONTEUR_FIGHT.stones.most;
  assert.equal(STONES_OF.throw, named(MONTEUR, 'throw').projectile.stones);
  assert.equal(STONES_OF.volley, named(MONTEUR, 'volley').projectile.stones);
  assert.equal(named(MONTEUR, 'volley').projectile.volley, 3);
  let s = takeStones(most, 3);
  assert.equal(s, 2);
  s = growStones(s, MONTEUR_FIGHT.stones.grow);
  assert.ok(Math.abs(s - 3) < 1e-9, 'one grows back in its time');
  assert.equal(growStones(most, 10), most, 'never more than he has room for');
  assert.equal(takeStones(0.5, 1), 0);
  assert.ok(MONTEUR_FIGHT.stones.grow <= 1, 'they grow back quickly');
});

test('his stones come down on a player however close they stand, as the moose and as the sun', () => {
  for (const p of [MONTEUR, MONTEUR_SUN]) for (const d of [p.radius + CHAR_R + 0.02, 2, 3.5, 7]) {
    const e = { x: 0, y: 0, z: 0, yaw: 0 }, body = { x: 0, y: 0, z: d, r: CHAR_R, h: CHAR_H };
    const pr = launch(e, named(p, 'throw').projectile, { x: body.x, y: body.y + body.h * 0.55, z: body.z });
    let end = null;
    for (let t = 0; t < 3 && !end; t += 1 / 30) end = stepProjectile(pr, 1 / 30, body, (x, y) => y < 0);
    assert.equal(end, 'hit', `${p.type} at ${d.toFixed(2)} cells`);
  }
});

test('his charge: a run straight at you, faster than you run, that crashes into his daze when it misses', () => {
  for (const p of [MONTEUR, MONTEUR_SUN]) {
    const c = named(p, 'charge'), stuck = named(p, 'stuck');
    assert.ok(c.roll.speed > RUN_SPEED * 3 && c.roll.steer < 1, 'fast, and hardly steering');
    assert.equal(c.roll.bounces, 0); assert.equal(c.roll.crash, 'stuck');
    assert.ok(c.knockDown && c.minReach > 2, 'not up close');
    assert.equal(stuck.weight, 0, 'only a crash starts it');
    // dazed: every blow hurts double for a while
    const e = makeEnemy({ id: 'm', level: 9, x: 0, y: 0, z: 0 }, p);
    Object.assign(e, { mode: 'attack', attack: p.attacks.indexOf(stuck), t: 0.5 });
    assert.equal(exposedBy(e), 2); assert.equal(hurtBy(e), 2);
    e.t = stuck.exposed.until + 0.01;
    assert.equal(exposedBy(e), 1);
  }
  const e = makeEnemy({ id: 'm', level: 9, x: 0, y: 0, z: 0 }, MONTEUR);
  assert.ok(!attacksInReach(e.profile, 1.5, 0).map(i => e.profile.attacks[i].name).includes('charge'), 'no charge from too close');
  assert.ok(attacksInReach(e.profile, 6, 0).map(i => e.profile.attacks[i].name).includes('charge'));
});

test('the world turns a quarter either way or half round, never staying where it is', () => {
  for (let at = 0; at < 4; at++) {
    const to = [0, 0.4, 0.8].map(r => nextQuarter(at, r));
    assert.deepEqual(to.sort(), [(at + 1) % 4, (at + 2) % 4, (at + 3) % 4].sort());
  }
  const spin = named(MONTEUR_SUN, 'spin'), rain = named(MONTEUR_SUN, 'rain');
  assert.equal(spin.cast, 'spin'); assert.equal(rain.rain.look, 'stone');
  assert.ok(rain.rain.count >= 8, 'a lot of stones');
});
