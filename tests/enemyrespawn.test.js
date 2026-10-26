import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from './fixtures.js';
import { World } from '../src/world/world.js';
import { RESPAWN, noteKill, shareKill, respawnCube, lifeOf, liveAgain, dropSource, sourceEnemy, packKills, unpackKills }
  from '../src/core/respawn.js';
import { SNAKE, ENEMY_KINDS, makeEnemy, coinRange } from '../src/core/enemies.js';
import { createRun, createPlayerStats, awardKill } from '../src/core/progression.js';
import { restoreDefeated } from '../src/core/guardians.js';
import { enemyDrops, weaponDrops } from '../src/core/gear/drops.js';
import { enemySpots, hordeSpots, guardianSpots } from '../src/game/enemyspawn.js';
import { createWorld, checkWorld } from '../src/core/save.js';
import { START_CLOCK } from '../src/core/daycycle.js';

const KEY = '3,-1,2';
// an ordinary snake of cube KEY, killed (its health 0, dead)
function snake(n = 0, id = `${KEY}:snake:41`) {
  const e = makeEnemy({ id, level: 1, coinDrop: 5, kind: SNAKE, respawn: KEY, x: 0, y: 0, z: 0 }, SNAKE);
  e.wave = n;
  return e;
}
const kill = (run, e, hero = createPlayerStats()) => { e.mode = 'dead'; e.hp = 0; return awardKill(hero, run, e); };

test('a killed enemy comes back once it has been dead long enough and its cube is entered', () => {
  const run = createRun(), e = snake();
  assert.ok(kill(run, e));
  assert.ok(run.defeated.has(e.id));
  const at = run.clock;   // (a world's clock starts at noon: core/daycycle.js START_CLOCK)
  assert.deepEqual(run.kills.get(e.id), { n: 0, at, cube: KEY });
  run.clock = at + RESPAWN - 1;
  assert.equal(respawnCube(run, KEY), 0, 'not yet');
  run.clock = at + RESPAWN;
  assert.equal(respawnCube(run, 'other'), 0, 'only when its own cube is entered');
  assert.equal(respawnCube(run, KEY), 1);
  assert.ok(!run.defeated.has(e.id));
  assert.equal(lifeOf(run, e.id), 1, 'in its second life');
  assert.equal(respawnCube(run, KEY), 0, 'once');
  // and it pays again, and is remembered again in that life
  const again = snake(lifeOf(run, e.id));
  assert.ok(kill(run, again));
  assert.deepEqual(run.kills.get(e.id), { n: 1, at: at + RESPAWN, cube: KEY });
});

test('guardians, defenders, bounties, raiders and summoned minions never come back', () => {
  const run = createRun();
  let i = 0;
  const make = extra => makeEnemy({ id: `x:${i++}`, level: 1, coinDrop: 1, kind: SNAKE, x: 0, y: 0, z: 0, ...extra }, SNAKE);
  // a guardian; one without a cube to come back to (a defender, a bounty, a raider, a dev spawn); a minion
  for (const e of [make({ guardian: true, guardianGate: KEY }), make({}), make({ summoned: true })]) kill(run, e);
  assert.equal(run.kills.size, 0);
  run.clock = 1e9;
  assert.equal(respawnCube(run, KEY), 0);
});

test('only a cube\'s own enemies and its horde have a cube to come back to', () => {
  const w = new World(123);
  const L1 = w.layout(1), plain = L1.route.find(k => !L1.guardians.has(k) && !L1.hordes.has(k)
    && enemySpots(state.map = w.cube(k).map, SNAKE).length);
  assert.ok(plain, 'a depth-1 cube with snakes');
  const map = state.map = w.cube(plain).map;
  for (const s of enemySpots(map, SNAKE)) assert.equal(s.respawn, map.key);
  const horde = state.map = w.cube(L1.hordes.keys().next().value).map;
  for (const s of hordeSpots(horde)) assert.equal(s.respawn, horde.key);
  for (const [k] of L1.guardians) for (const s of guardianSpots(state.map = w.cube(k).map)) assert.equal(s.respawn, undefined, `${k} ${s.id}`);
});

test('every life rolls its own drops and coins, the same again in the same life', () => {
  const seed = 99, lives = Array.from({ length: 400 }, (_, n) => liveAgain(lifeRun(n), snake(0)));
  assert.equal(lives[0].coinDrop, 5, 'the first life keeps the coins of its spot');
  // the first life drops what it always did: the wave does not touch it
  const first = snake(0);
  delete first.wave;
  assert.deepEqual(enemyDrops(lives[0], seed), enemyDrops(first, seed));
  const [lo, hi] = coinRange(SNAKE, 1);
  for (const e of lives) {
    if (e.wave) assert.ok(e.coinDrop >= lo && e.coinDrop <= hi, `${e.coinDrop} in ${lo}..${hi}`);
    assert.deepEqual(enemyDrops(e, seed), enemyDrops({ ...e }, seed), 'the same life drops the same');
  }
  const weapons = lives.map(e => weaponDrops(e, seed)).filter(d => d.length);
  assert.ok(weapons.length > 5 && weapons.length < 50, `a weapon now and then: ${weapons.length} of 400`);
  assert.ok(new Set(lives.map(e => e.coinDrop)).size > 1, 'coins vary');
  assert.deepEqual(lives.map(dropSource).slice(0, 3), [`e:${KEY}:snake:41`, `e:${KEY}:snake:41~1`, `e:${KEY}:snake:41~2`]);
  for (const e of lives.slice(0, 3)) assert.equal(sourceEnemy(dropSource(e)), e.id);
  assert.equal(sourceEnemy('c:site'), null);
});
// a run where the snake is in life n
function lifeRun(n) {
  const run = createRun();
  run.kills.set(`${KEY}:snake:41`, { n, at: 0, cube: KEY });
  return run;
}

test('a death brings the enemy back in the same life: dying re-rolls nothing', () => {
  const run = createRun(), before = new Set(run.defeated);
  run.clock = 50;
  const e = snake();
  kill(run, e);
  restoreDefeated(run, before);   // died in the cube
  assert.ok(!run.defeated.has(e.id));
  assert.equal(lifeOf(run, e.id), 0);
  run.clock = 1e6;
  assert.equal(respawnCube(run, KEY), 0, 'it is alive: nothing to bring back');
  assert.equal(lifeOf(run, e.id), 0);
});

test('another player\'s kill comes back here too, never in an older life', () => {
  const run = createRun();
  run.clock = 10;
  shareKill(run, 'a', KEY, 2);
  assert.deepEqual(run.kills.get('a'), { n: 2, at: 10, cube: KEY });
  shareKill(run, 'a', KEY, 1);
  assert.equal(run.kills.get('a').n, 2);
  shareKill(run, 'b', 7, 0); shareKill(run, 'c', KEY, -1);
  assert.equal(run.kills.size, 1, 'nonsense is left out');
});

test('the kills and the play time are saved with the world', () => {
  const run = createRun();
  run.clock = 123.45;
  noteKill(run, snake(3));
  const w = createWorld(5);
  assert.equal(checkWorld(w).run.clock, START_CLOCK, 'a new world starts at noon');
  assert.deepEqual(checkWorld(w).run.kills, []);
  w.run.clock = run.clock; w.run.kills = [...packKills(run.kills), ['bad'], [1, 2, 3, 4]];
  const back = checkWorld(JSON.parse(JSON.stringify(w)));
  assert.equal(back.run.clock, 123.45);
  assert.deepEqual([...unpackKills(back.run.kills)], [[`${KEY}:snake:41`, { n: 3, at: 123.5, cube: KEY }]]);
  // a world saved before enemies came back
  delete w.run.clock; delete w.run.kills;
  assert.equal(checkWorld(w).run.clock, 0);
  assert.deepEqual(checkWorld(w).run.kills, []);
});

test('every kind of the road and the first depths can come back with coins of its own', () => {
  for (const kind of Object.values(ENEMY_KINDS)) {
    if (kind.minion || kind.boss) continue;
    const e = makeEnemy({ id: `${KEY}:${kind.species}:1`, level: 3, coinDrop: 0, kind, respawn: KEY, x: 0, y: 0, z: 0 }, kind);
    liveAgain(lifeRun(0), e);
    const run = createRun();
    run.kills.set(e.id, { n: 4, at: 0, cube: KEY });
    liveAgain(run, e);
    const [lo, hi] = coinRange(kind, 3);
    assert.ok(e.wave === 4 && e.coinDrop >= lo && e.coinDrop <= hi, kind.type);
  }
});
