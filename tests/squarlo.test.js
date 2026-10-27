import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from './fixtures.js';
import { World } from '../src/world/world.js';
import { BOSSES, bossAt, BOSS_ARENAS } from '../src/core/bosses.js';
import { SQUARLO, SQUARLO_GIANT, SQUIRTLE, TIDE_SQUIRTLE, CORAL_SQUIRTLE, ENEMY_KINDS, GUARDIAN_TIERS, STAGE_PROFILES,
  makeEnemy, guardianLevel, attacksInReach, blowOf, waveBlowOf, fireAt, exposedBy, hurtBy, airborne, wardedNow, absent } from '../src/core/enemies.js';
import { SQUARLO_FIGHT, splitHp, summonCount, newTide, stepTide, raiseTide, drainTide, tideLevel, barred, jumpLift, waveRadius, waveOver, inWave } from '../src/core/squarlo.js';
import { damageEnemy, weaponHit, SWORD } from '../src/core/combat.js';
import { inGust } from '../src/core/gusts.js';
import { createRun } from '../src/core/progression.js';
import { guardianId, gateLocked, guardianTitle, guardianLockMessage } from '../src/core/guardians.js';
import { population, speciesIn, kindsIn, DEPTH_SPAWNS } from '../src/core/spawns.js';
import { guardianSpots } from '../src/game/enemyspawn.js';
import { TIDAL } from '../src/cubegen/arenashapes.js';
import { floorY } from '../src/core/surfaces.js';
import { LH, N, HEAD_Y, RUN_SPEED, WADE_SLOW, WATER, LAVA, ACID } from '../src/core/constants.js';
import { setTide, inFluid, enemyUnder, standingAt } from '../src/physics/fluid.js';
import { groundAt } from '../src/physics/collide.js';

const thirdDescent = seed => {
  const w = new World(seed), L = w.layout(2);
  return { w, L, map: state.map = w.cube(L.down).map };
};
const named = name => SQUARLO.attacks.find(a => a.name === name);
const indexOf = (p, name) => p.attacks.findIndex(a => a.name === name);

test('Squarlo takes the place of the descent guardian of depth 2, and only that one', () => {
  assert.equal(BOSSES[2], 'squarlo');
  assert.equal(bossAt(2), 'squarlo'); assert.equal(bossAt(2, 'side'), null);
  for (const seed of [0, 1, 7]) {
    const w = new World(seed);
    for (let d = 0; d < 4; d++) for (const [key, g] of w.layout(d).guardians) {
      const boss = d === 2 && g.role === 'descent';
      assert.equal(g.boss === 'squarlo', boss, `${seed} ${d} ${key}`);
      if (!boss) continue;
      const map = w.cube(key).map;
      assert.equal(map.guardian.boss, 'squarlo'); assert.equal(guardianLockMessage(map), 'Defeat Squarlo to unlock this descent');
    }
  }
});

test('he fights alone in his tidal hills, and brings his Squirtles', () => {
  for (const seed of [0, 1, 2, 7, 42]) {
    const { map } = thirdDescent(seed), spots = guardianSpots(map);
    assert.equal(map.arena.type, BOSS_ARENAS.squarlo.type);
    assert.equal(spots.length, 1);
    const [s] = spots;
    assert.equal(s.kind, SQUARLO); assert.equal(s.id, guardianId(map.key)); assert.equal(s.level, guardianLevel(2, 'descent'));
    assert.deepEqual(speciesIn(map).sort(), ['squarlo', 'squirtle']);
    assert.deepEqual(kindsIn(map).sort(), ['squarlo', 'tidesquirtle']);
    assert.ok(gateLocked(map, createRun()));
    // nothing in the zone blocks: a giant walks it and the water comes and goes
    for (const f of map.floors) if (f.encounter) assert.equal(map.staticBlockers[f.c].length, 0);
  }
});

// The tide in his arena: at rest it stands in the flats (shallow), at high tide it drowns the
// flats; from every floor there is ground a body can wade within a few steps, reached in time
// by a player who runs (wading, slowed) when he starts calling it. The doorways stay dry.
test('the tidal hills: the flats drown at high tide, the hills do not, and every floor is in time to get out', () => {
  const cast = named('tide').hitAt, { rise } = SQUARLO_FIGHT.tide, slow = RUN_SPEED * (1 - WADE_SLOW);
  let drowned = 0, zones = 0, worst = Infinity;
  for (let seed = 0; seed < 24; seed++) {
    const { map } = thirdDescent(seed), t = map.tide, level = map.portals[0].y / LH;
    assert.equal(map.arena.type, 'tidal', `${seed}`);
    assert.deepEqual(t.box, [1, 1, N - 1, N - 1]);
    assert.ok(Math.abs(t.rest - (level + TIDAL.low + TIDAL.rest)) < 1e-9 && Math.abs(t.high - (level + TIDAL.high)) < 1e-9);
    assert.equal(t.fluid, WATER);
    const h = f => floorY(f, .5, .5), zone = map.floors.filter(f => f.encounter);
    // the bank inside the cube's edge holds the water in; the doorways stay dry
    for (const f of map.floors) if (f.arenaCell && !f.encounter) assert.ok(f.top * LH >= t.high * LH, `${seed}: bank ${f.x},${f.z}`);
    for (const p of map.portals) for (const c of p.cells) assert.ok(h(map.floors[c]) > t.high * LH, `${seed}: dry doorway`);
    assert.ok(zone.some(f => t.rest * LH - h(f) > 0.1), `${seed}: water in the flats at rest`);
    // at least four hills stand out of the high tide, dry, steep, each with a ramp up
    const tops = new Set(zone.filter(f => f.top === level + TIDAL.top)), seen = new Set();
    let hills = 0;
    for (const f of tops) {
      if (seen.has(f)) continue;
      hills++;
      const group = [f];
      seen.add(f);
      for (let i = 0; i < group.length; i++) for (const g of group[i].link) if (g && tops.has(g) && !seen.has(g)) { seen.add(g); group.push(g); }
      assert.ok(group.every(g => h(g) > t.high * LH), `${seed}: a dry hilltop`);
      assert.ok(group.some(g => g.link.some(n => n && n.encounter && n.top === g.top - 1)), `${seed}: a ramp up`);
    }
    assert.ok(hills >= TIDAL.peaks, `${seed}: ${hills} hills`);
    const wadeable = f => (t.high * LH - h(f)) < HEAD_Y - 0.1;
    const steps = new Map(zone.filter(wadeable).map(f => [f, 0])), queue = [...steps.keys()];
    for (let i = 0; i < queue.length; i++) for (const g of queue[i].link)
      if (g?.encounter && !steps.has(g)) { steps.set(g, steps.get(queue[i]) + 1); queue.push(g); }
    for (const f of zone) {
      zones++;
      const deep = t.high * LH - h(f) > HEAD_Y;
      if (!deep) continue;
      drowned++;
      assert.ok(steps.has(f), `${seed}: ${f.x},${f.z} has a way up`);
      // when the water gets over the head here (from the start of the cast) against the run
      const k = (h(f) + HEAD_Y - t.rest * LH) / ((t.high - t.rest) * LH), deadline = cast + Math.max(0, k) * rise;
      worst = Math.min(worst, deadline - steps.get(f) / slow);
    }
  }
  assert.ok(drowned / zones > 0.2, `the flats are wide: ${(drowned / zones).toFixed(2)}`);
  assert.ok(worst > 0.5, `time to spare everywhere: ${worst.toFixed(2)} s`);
});

test('the tide drowns the player over the head and inside its box only; he and his Squirtles swim', () => {
  const { map } = thirdDescent(3), t = map.tide;
  const flat = map.floors.filter(f => f.encounter).sort((a, b) => a.top - b.top)[0], y = floorY(flat, .5, .5);
  const gr = groundAt(flat.x + .5, flat.z + .5, y + 0.1, 0);
  setTide({ y: t.rest * LH, fluid: WATER, box: t.box });
  assert.equal(inFluid(gr, y), 0, 'at rest it is waded through');
  setTide({ y: y + HEAD_Y + 0.1, fluid: WATER, box: t.box });
  assert.equal(inFluid(gr, y), WATER, 'over the head it drowns');
  assert.equal(standingAt(0.5, 0.5), null, 'not outside its box');
  const q = makeEnemy({ id: 'q', x: flat.x + .5, y, z: flat.z + .5, level: 4, f: flat }, SQUARLO);
  const snake = makeEnemy({ id: 's', x: flat.x + .5, y, z: flat.z + .5, level: 4, f: flat }, ENEMY_KINDS.snake);
  assert.equal(enemyUnder(q), 0); assert.equal(enemyUnder(snake), WATER);
  setTide(null);
});

test('he is as strong as a descent guardian, tiny and fast; a giant of six cells later', () => {
  const t = GUARDIAN_TIERS.descent;
  assert.ok(SQUARLO.hp >= t.hp); assert.equal(SQUARLO.xp, t.xp); assert.ok(SQUARLO.poise >= t.poise);
  assert.equal(ENEMY_KINDS.squarlo, SQUARLO); assert.equal(guardianTitle('descent', SQUARLO), '♛ Squarlo');
  assert.ok(SQUARLO.height < 0.85 && SQUARLO.chase > RUN_SPEED, 'smaller than the player, faster');
  assert.ok(SQUARLO.swims && SQUARLO_GIANT.swims);
  assert.equal(SQUARLO_GIANT.height, 6); assert.equal(SQUARLO_GIANT.label, SQUARLO.label);
  assert.equal(SQUARLO_GIANT.hp, SQUARLO.hp); assert.ok(SQUARLO_GIANT.giant);
  assert.deepEqual(STAGE_PROFILES.squarlo, [SQUARLO, SQUARLO_GIANT]);
  assert.deepEqual(SQUARLO.attacks.map(a => a.name), ['blow', 'tide', 'summon', 'rest']);
  assert.deepEqual(SQUARLO_GIANT.attacks.map(a => a.name), ['stomp', 'jump', 'kick', 'cannon', 'tide', 'summon', 'rest']);
  for (const a of [...SQUARLO.attacks, ...SQUARLO_GIANT.attacks]) assert.ok(a.attackTime > a.hitAt, a.name);
  // the jet hurts and knocks back; the tide and the rest are cast from anywhere
  const jet = blowOf(SQUARLO, named('blow'));
  assert.ok(jet.damage > 0 && jet.push.speed > 5 && !jet.knockDown);
  assert.ok(attacksInReach(SQUARLO, 25, 3).includes(indexOf(SQUARLO, 'tide')));
  // the stomp: its shadow shows long before, then holds still; the foot knocks the player down
  const stomp = SQUARLO_GIANT.attacks[0];
  assert.ok(fireAt(stomp) < 0.6 && stomp.beam.lock > 0.3 && blowOf(SQUARLO_GIANT, stomp).knockDown);
  assert.ok(stomp.beam.clear === false && stomp.beam.sky > 6 && stomp.beam.foot && stomp.trackUntil <= stomp.hitAt - stomp.beam.lock + 1e-9,
    'its shadow is where his foot comes down: it stops when he stops turning');
});

test('the giant: nothing staggers him, blows hurt him less unless he is exposed', () => {
  const e = makeEnemy({ id: 'q', x: 5, y: 0, z: 5, level: 4 }, SQUARLO_GIANT);
  assert.ok(damageEnemy(e, 10)); assert.equal(e.staggered, false);
  assert.ok(e.mode !== 'chase' || e.stun === 0, 'not stunned');
  const p = { hp: 100 }, stats = { ...SWORD, damage: 100, crit: 0 };
  assert.equal(hurtBy(e), SQUARLO_GIANT.armour);
  assert.equal(weaponHit(p, stats, e, 1).damage, Math.round(100 * SQUARLO_GIANT.armour));
  const i = SQUARLO_GIANT.attacks.findIndex(a => a.name === 'stomp'), stomp = SQUARLO_GIANT.attacks[i];
  Object.assign(e, { mode: 'attack', attack: i, t: stomp.hitAt + 0.1 });
  assert.equal(weaponHit(p, stats, e, 1).damage, Math.round(100 * stomp.exposed.damage), 'stuck: his guard is down');
  assert.ok(SQUARLO_GIANT.armour < 1 && !SQUARLO.armour && !SQUARLO.steadfast);
});

test('the giant jumps onto the player, kicks them away and blasts his water cannon', () => {
  const named = name => SQUARLO_GIANT.attacks.find(a => a.name === name), at = name => SQUARLO_GIANT.attacks.findIndex(a => a.name === name);
  // the jump: from afar, up onto a hill too; landing on the player squashes and dazes them
  const jump = named('jump'), j = jump.jump;
  assert.ok(attacksInReach(SQUARLO_GIANT, 8, 2).includes(at('jump')), 'onto a player far off, up a hill');
  assert.ok(!attacksInReach(SQUARLO_GIANT, 1.5, 0).includes(at('jump')), 'not onto one at his feet');
  const squash = blowOf(SQUARLO_GIANT, jump);
  assert.equal(squash.daze, 3); assert.ok(!squash.knockDown && squash.damage > blowOf(SQUARLO_GIANT, named('kick')).damage);
  assert.ok(j.track < RUN_SPEED, 'a player who keeps running gets out from under his shadow');
  assert.ok(fireAt(jump) < j.from && j.from < jump.hitAt - jump.beam.lock, 'the shadow shows before he springs off, holds still before he lands');
  assert.equal(jumpLift(j, 0), 0); assert.ok(Math.abs(jumpLift(j, 1)) < 1e-9);
  const top = Math.max(...Array.from({ length: 41 }, (_, i) => jumpLift(j, i / 40)));
  assert.ok(Math.abs(top - j.height) < 0.01 && jumpLift(j, 0.4) > jumpLift(j, 0.6), 'up fast, down faster');
  const e = makeEnemy({ id: 'q', x: 5, y: 0, z: 5, level: 4 }, SQUARLO_GIANT);
  Object.assign(e, { mode: 'attack', attack: at('jump'), t: 0.3 });
  assert.ok(!airborne(e)); e.t = j.from + 0.1; assert.ok(airborne(e)); e.t = jump.hitAt; assert.ok(!airborne(e));
  // the kick: at his legs, flinging the player away
  const kick = named('kick');
  assert.ok(Math.abs(kick.reach - 2.8) < 1e-9 && kick.hitReach > kick.reach);
  assert.ok(attacksInReach(SQUARLO_GIANT, 1.5, 0).includes(at('kick')) && !attacksInReach(SQUARLO_GIANT, 4, 0).includes(at('kick')));
  assert.ok(blowOf(SQUARLO_GIANT, kick).knockDown && kick.knock >= 8);
  // the cannon: down onto the floor ahead, from a little way out to its reach, up a hill too
  const cannon = named('cannon'), g = cannon.gust;
  Object.assign(e, { yaw: 0, x: 5, y: 1, z: 2 });
  const body = (dz, y = 1, dx = 0) => ({ x: 5 + dx, y, z: 2 + dz, r: 0.3, h: 0.9 });
  assert.ok(inGust(e, g, body(6)) && inGust(e, g, body(9, 2)), 'on the floor ahead, and up a hill');
  assert.ok(!inGust(e, g, body(1)) && !inGust(e, g, body(-3)) && !inGust(e, g, body(6, 1, 3)), 'not at his feet, behind him or off to the side');
  assert.ok(!inGust(e, g, body(6, -1)), 'not down in a pit');
  assert.ok(g.sweep > 0.5 && blowOf(SQUARLO_GIANT, cannon).push.speed > 9);
});

test('a stomp or a landing sends out a shockwave over the floor', () => {
  const spec = SQUARLO_GIANT.attacks.find(a => a.name === 'jump').wave, w = { x: 0, y: 0, z: 0, t: 0, spec };
  const dt = 1 / 30, p = { x: 4, y: 0, z: 0, r: 0.3 }, hill = { ...p, y: 1 }, far = { ...p, x: spec.reach + 1.5 };
  let caught = null, high = false, beyond = false;
  for (let i = 0; i < 120 && !waveOver(w); i++) {
    const r0 = waveRadius(w);
    w.t += dt;
    if (inWave(w, r0, p) && caught === null) caught = w.t;
    high ||= inWave(w, r0, hill); beyond ||= inWave(w, r0, far);
  }
  assert.ok(waveOver(w), 'it spends itself');
  assert.ok(Math.abs(caught - (4 - 0.3) / spec.speed) < 2 * dt, 'it reaches a body at its speed: ' + caught);
  assert.ok(!high && !beyond, 'not one up a step, nor one past its reach');
  const blow = waveBlowOf(SQUARLO_GIANT, { wave: spec });
  assert.ok(blow.knockDown && blow.damage > 0);
});

test('the fight: split at half, a ward while he calls the tide, exposed while he rests', () => {
  const e = makeEnemy({ id: 'q', x: 5, y: 0, z: 5, level: 4 }, SQUARLO);
  e.hpFloor = splitHp(e.profile.hp);
  damageEnemy(e, e.hp * 10);
  assert.equal(e.hp, Math.ceil(e.profile.hp / 2));
  Object.assign(e, { mode: 'attack', attack: indexOf(SQUARLO, 'tide'), t: 0.5 });
  assert.ok(wardedNow(e)); const hp = e.hp; assert.equal(damageEnemy(e, 50), false); assert.equal(e.hp, hp);
  Object.assign(e, { attack: indexOf(SQUARLO, 'rest'), t: 0.1 });
  assert.equal(exposedBy(e), 1, 'not at once');
  e.t = 1; assert.ok(exposedBy(e) > 1);
  assert.equal(summonCount(1, 1), 2); assert.equal(summonCount(2, 2), 0);
  // what he may start
  assert.deepEqual([...barred({ tideDue: true })].sort(), ['blow', 'cannon', 'jump', 'kick', 'rest', 'stomp', 'summon']);
  assert.deepEqual([...barred({ restDue: true })].sort(), ['blow', 'cannon', 'jump', 'kick', 'stomp', 'summon', 'tide']);
  assert.ok(barred({ waterUp: true, summonDue: true }).has('blow'));
  assert.ok(!barred({ waterUp: false, summonDue: true }).has('summon'));
  for (const n of ['stomp', 'jump', 'kick', 'cannon']) assert.ok(!barred({ waterUp: true }).has(n), n);
});

test('the tide rises, stands and falls; his death drains it', () => {
  const T = SQUARLO_FIGHT.tide, w = newTide(), dt = 1 / 30;
  assert.equal(w.k, 0);
  raiseTide(w);
  let t = 0;
  while (w.phase === 'rise') { stepTide(w, dt); t += dt; }
  assert.ok(Math.abs(t - T.rise) < 0.05 && w.k === 1 && w.phase === 'high');
  for (t = 0; w.phase === 'high'; t += dt) stepTide(w, dt);
  assert.ok(Math.abs(t - T.high) < 0.05);
  for (t = 0; w.phase === 'fall'; t += dt) stepTide(w, dt);
  assert.ok(Math.abs(t - T.fall) < 0.05 && w.k === 0);
  raiseTide(w); stepTide(w, 1); drainTide(w);
  assert.equal(w.phase, 'fall');
  assert.equal(tideLevel({ rest: 1, high: 3 }, 0.5), 2);
});

test('Squirtles burrow (nothing touches one under the surface) and live in the fluids: water, slime and lava', () => {
  const e = makeEnemy({ id: 's', x: 5, y: 0, z: 5, level: 2 }, SQUIRTLE);
  e.under = 1;
  assert.ok(absent(e)); assert.equal(damageEnemy(e, 5), false);
  e.under = 0; assert.ok(damageEnemy(e, 5));
  assert.ok(SQUIRTLE.burrow.speed > SQUIRTLE.chase && SQUIRTLE.swims);
  const ball = blowOf(SQUIRTLE);
  assert.ok(ball.push.speed * ball.push.time < 0.5, 'a tiny, tiny push');
  assert.ok(TIDE_SQUIRTLE.minion && TIDE_SQUIRTLE.coins[1] === 0);
  assert.ok(CORAL_SQUIRTLE.hp > SQUIRTLE.hp);
  // at every depth the lagoons, the sunken grotto and the cenote (water), the slime marsh (acid)
  // and the volcanic caves and the abyss (lava) may appear at (themes/index.js acts), each kind in
  // its own fluid
  const where = DEPTH_SPAWNS.flatMap((r, d) => r.roster.filter(e => e.type === 'squirtle').map(e => [d, e.where]));
  assert.deepEqual(where, [1, 2, 3, 4, 5, 6].map(d => [d, ['lagoon']])
    .concat([7, 8, 9, 10, 11, 12, 13].flatMap(d => [[d, ['grotto', 'cenote']], [d, ['slime']]]))
    .concat([14, 15, 16, 17, 18, 19].map(d => [d, ['volcanic', 'abyss']])));
  const fluids = { lagoon: WATER, grotto: WATER, cenote: WATER, slime: ACID, volcanic: LAVA, abyss: LAVA };
  for (const r of DEPTH_SPAWNS) for (const e of r.roster.filter(e => e.type === 'squirtle'))
    for (const k of Object.keys(e.kinds)) for (const w of e.where) assert.deepEqual(ENEMY_KINDS[k].dwells, [fluids[w]], `${k} in ${w}`);
  assert.deepEqual(TIDE_SQUIRTLE.dwells, [WATER]); assert.deepEqual(ENEMY_KINDS.slimesquirtle.dwells, [ACID]);
  assert.ok(CORAL_SQUIRTLE.lavaproof && CORAL_SQUIRTLE.fireproof);
  for (let seed = 0; seed < 60; seed++) {
    assert.ok(!population({ seed, depth: 2, biome: 'meadow' }).has('squirtle'));
  }
  assert.ok([...Array(60).keys()].some(seed => population({ seed, depth: 2, biome: 'lagoon' }).has('squirtle')));
});
