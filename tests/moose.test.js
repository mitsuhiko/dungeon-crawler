// The Moose (core/enemies.js MOOSE): antlers in front, a tail with a ball behind, a charge from
// further off that leaves it dazed when it runs into something; in herds, in the forests, the
// highlands, the snow and the swamps. (What its AI does with that, in the game: tests/browser/moose.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatMap } from './fixtures.js';
import { MOOSE, FROST_MOOSE, BOG_MOOSE, ENEMY_KINDS, makeEnemy, attacksInReach, exposedBy, hurtBy, behind, BACK } from '../src/core/enemies.js';
import { DEPTH_SPAWNS, population, livesIn } from '../src/core/spawns.js';
import { RUN_SPEED } from '../src/core/constants.js';

const named = (p, n) => p.attacks.find(a => a.name === n);
const names = (p, d) => attacksInReach(p, d, 0).map(i => p.attacks[i].name);

test('up close it tosses, from further off it charges, and its tail is for whoever stands behind it', () => {
  const toss = named(MOOSE, 'toss'), charge = named(MOOSE, 'charge'), dazed = named(MOOSE, 'dazed'), tail = named(MOOSE, 'tail');
  assert.deepEqual(names(MOOSE, 1.2), ['toss', 'tail']);
  assert.deepEqual(names(MOOSE, 1.8), ['tail']);
  assert.deepEqual(names(MOOSE, 2.6), [], 'too far for a blow, too close for a charge');
  assert.deepEqual(names(MOOSE, 5), ['charge']);
  assert.ok(MOOSE.height > 1.5, 'twice the player\'s height');
  assert.ok(MOOSE.reach === charge.reach && MOOSE.style === 'brute');
  // its tail lands behind it, and only a player behind it draws it
  assert.ok(tail.back && !toss.back && !charge.back);
  assert.ok(tail.hitReach > toss.hitReach, 'the tail is long');
  const e = makeEnemy({ id: 'm', level: 3, x: 0, y: 0, z: 0 }, MOOSE);
  e.yaw = 0;   // facing +z
  assert.ok(behind(e, 0, -3) && behind(e, 1.2, -2.4), 'behind it');
  assert.ok(!behind(e, 0, 3) && !behind(e, 3, 0), 'not ahead of it, nor at its side');
  assert.ok(BACK < 0);
  // it turns slowly: its sides are where to stand
  assert.ok(MOOSE.turnSpeed < 3);
  // the charge: a run straight ahead, faster than the player runs, that tramples and knocks down,
  // and crashes into its daze when it runs into something with nobody run over
  assert.ok(charge.roll.speed > RUN_SPEED * 2 && charge.roll.steer < 0.5, 'fast, and hardly steering');
  assert.equal(charge.roll.bounces, 0); assert.equal(charge.roll.crash, 'dazed');
  assert.ok(charge.knockDown && charge.minReach > tail.reach, 'not up close');
  assert.equal(dazed.weight, 0, 'only a crash starts it');
  Object.assign(e, { mode: 'attack', attack: MOOSE.attacks.indexOf(dazed), t: 0.5 });
  assert.ok(exposedBy(e) > 1 && hurtBy(e) > 1, 'dazed, every blow hurts it more');
  e.t = dazed.exposed.until + 0.01;
  assert.equal(exposedBy(e), 1);
});

test('three kinds, each saying its own name when it hurts you; the Bog moose wades through the slime', () => {
  const kinds = Object.values(ENEMY_KINDS).filter(k => k.species === 'moose' && !k.guardian && !k.minion);
  assert.deepEqual(kinds.map(k => k.type).sort(), ['bogmoose', 'frostmoose', 'moose']);
  for (const k of kinds) for (const a of k.attacks.filter(a => a.power > 0))
    assert.ok(a.reason.includes(` ${k.label}`), `${k.type} ${a.name}: ${a.reason}`);
  assert.ok(BOG_MOOSE.slimeborn && !MOOSE.slimeborn && !FROST_MOOSE.slimeborn);
  assert.ok(FROST_MOOSE.hp > MOOSE.hp && BOG_MOOSE.damage > MOOSE.damage);
  // and Monteur's (core/enemies.js MONT_MOOSE): Mont Moose, plain Moose but weaker, that he calls up round him
  const mont = ENEMY_KINDS.montmoose;
  assert.ok(mont.minion && mont.plain && mont.label === 'Mont Moose' && mont.hp < MOOSE.hp && mont.damage < MOOSE.damage);
  for (const a of mont.attacks.filter(a => a.power > 0)) assert.ok(a.reason.includes(' Mont Moose'), a.reason);
});

test('Moose come in herds, each kind in its own themes, from depth 2 on', () => {
  const where = { moose: ['darkforest', 'highlands'], frostmoose: ['peaks', 'frozen'], bogmoose: ['swamp', 'slime'] };
  const rows = DEPTH_SPAWNS.flatMap((d, depth) => d.roster.map(r => ({ ...r, depth }))).filter(r => r.type === 'moose');
  assert.ok(rows.length && rows.every(r => r.depth >= 2 && r.depth <= 13));
  for (const r of rows) {
    assert.ok(r.lo >= 2 && r.pack >= 2, `a herd at depth ${r.depth}`);
    for (const k of Object.keys(r.kinds)) assert.ok(r.where.every(w => where[k].includes(w)), `${k} at depth ${r.depth}: ${r.where}`);
  }
  // never two of its entries in one theme of a depth
  for (const d of DEPTH_SPAWNS) for (const biome of Object.values(where).flat())
    assert.ok(d.roster.filter(r => r.type === 'moose' && livesIn(r, biome)).length <= 1, biome);
  // a cube of its own theme has a herd of them now and then, one elsewhere never
  let herds = 0;
  for (let seed = 0; seed < 200; seed++) {
    const forest = population(Object.assign(flatMap(seed), { depth: 4, biome: 'darkforest' })).get('moose');
    if (forest) { herds++; assert.ok(forest.count >= 2, 'a herd'); }
    assert.ok(!population(Object.assign(flatMap(seed), { depth: 4, biome: 'badlands' })).has('moose'));
  }
  assert.ok(herds > 30, `${herds} of 200`);
});
