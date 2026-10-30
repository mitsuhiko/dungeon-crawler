import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from './fixtures.js';
import { World } from '../src/world/world.js';
import { makeLayouts } from '../src/world/layout.js';
import { step } from '../src/world/coords.js';
import { reachTo } from '../src/cubegen/reach.js';
import { floorY } from '../src/core/surfaces.js';
import { props } from '../src/core/propcatalog.js';
import { population } from '../src/core/spawns.js';
import { HORDE, swarmKind } from '../src/core/hordes.js';
import { ENEMY_KINDS, ENEMY_PROFILES, makeEnemy } from '../src/core/enemies.js';
import { hordeSpots, enemySpots } from '../src/game/enemyspawn.js';
import { createHordeGroups, coordinateHordes, tryHordeAttack } from '../src/game/hordes.js';
import { walkable, findPath, around } from '../src/physics/enemynav.js';
import { damageEnemy, weaponHit } from '../src/core/combat.js';
import { createPlayerStats, createRun, awardKill } from '../src/core/progression.js';
import { restoreDefeated, gateLocked } from '../src/core/guardians.js';
import { enemyDrops } from '../src/core/gear/drops.js';
import { placeProps } from '../src/render/propplace.js';
import { themeOf } from '../src/themes/depth.js';
import { buildCubeGeometry } from '../src/render/cubegeo.js';


function clearing(seed = 123, depth = 1) {
  const world = new World(seed), key = world.layout(depth).hordes.keys().next().value;
  const map = state.map = world.cube(key).map;
  return { world, map, list: hordeSpots(map).map(s => makeEnemy(s, s.kind, s.hordeSlot)) };
}
const heroAt = (map, f) => ({ x: f.x + .5, y: floorY(f, .5, .5), z: f.z + .5,
  hp: 100, grounded: true, support: f, ragdoll: null });
const signature = spots => spots.map(s => [s.id, s.level, s.coinDrop, s.kind.type, s.kind.hp, s.f.id, s.x, s.y, s.z]);

test('one stable main-route horde on every depth, outside safe/entry/guardian/reward rooms', () => {
  for (let seed = 0; seed < 100; seed++) {
    const layouts = makeLayouts(seed), reverse = makeLayouts(seed);
    for (let depth = 20; depth >= 0; depth--) {
      const L = layouts(depth);
      assert.deepEqual(L.hordes, reverse(depth).hordes);
      assert.equal(L.hordes.size, 1);
      for (const [key, horde] of L.hordes) {
        const i = L.route.indexOf(key);
        assert.ok(i >= (depth === 0 ? 3 : 2) && i < L.route.length - 1);
        assert.ok(!L.guardians.has(key) && !L.sitePlans.has(key));
        assert.notEqual(L.roles.get(key), 'horde');
        assert.ok(ENEMY_KINDS[horde.kind] && horde.count >= 6 && horde.count <= 24);
      }
      for (const [key, scale] of L.populationScale) {
        // (0: nobody, the hunter's room, docs/trials.md `chase`)
        assert.ok(scale >= 0 && scale < 1 && !L.guardians.has(key) && !L.hordes.has(key));
      }
    }
  }
});

test('local wild patches keep normal terrain, hold their crowd and survive worker cloning', () => {
  for (const seed of [0, 7, 42, 123]) for (let depth = 0; depth <= 20; depth++) {
    const { world, map } = clearing(seed, depth), spots = hordeSpots(map), clone = structuredClone(map);
    assert.ok(!map.guardian && !map.enemyFree);
    assert.ok(map.horde.wild && map.archetype !== 'arena');
    assert.equal(map.K, world.wfc.tiles.get(map.key).K);
    assert.ok(map.horde.cells.length <= 49);
    assert.ok(map.floors.some(f => !f.hordeReserved && !f.prot));
    assert.equal(map.floors.filter(f => f.encounter).length, 0);
    const ctx = { ...map, nextAbove: f => map.cols[f.c][map.cols[f.c].indexOf(f) + 1],
      headOK: (f, h) => { const a = map.cols[f.c][map.cols[f.c].indexOf(f) + 1]; return !a || a.bottom >= Math.max(h, f.top) + 2; } };
    assert.ok(reachTo(ctx, map.horde.floor, true).has(map.horde.entryFloor));
    assert.ok(reachTo(ctx, map.floors[map.horde.exitFloor], true).has(map.horde.floor.id));
    assert.equal(gateLocked(map, createRun()), false);
    assert.equal(spots.length, map.horde.count);
    assert.deepEqual(signature(spots), signature(hordeSpots(map)));
    state.map = clone;
    assert.deepEqual(signature(spots), signature(hordeSpots(clone)));
    state.map = map;
    assert.equal(new Set(spots.map(s => s.id)).size, spots.length);
    assert.equal(clone.horde.floor, clone.floors[clone.horde.floor.id]);
    for (const a of spots) {
      assert.ok(!a.f.fluid && walkable(a.f, a.kind.height));
      assert.ok(findPath(a.f, map.horde.floor, 32, a.kind.height));
      for (const p of map.portals) {
        assert.ok(Math.hypot(a.f.x - p.x, a.f.z - p.z) >= 4);
      }
      for (const b of spots) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= a.kind.radius + b.kind.radius + .1);
    }
    for (const cfg of ENEMY_PROFILES) assert.equal(enemySpots(map, cfg).length, cfg.species === spots[0].kind.species ? spots.length : 0);
    const placed = placeProps(map, themeOf(map));
    for (const f of map.floors) if (f.hordeReserved) assert.equal(placed.blockers[f.c].length, 0);
    for (const q of placed.out) {
      const f = map.cols[Math.floor(q.z) * 16 + Math.floor(q.x)].find(f => f.hordeReserved && Math.abs(floorY(f, .5, .5) - q.y) < .1);
      if (f) assert.ok(props.byName.get(q.name).cover && !props.byName.get(q.name).blocking);
    }
    map.blockers = placed.blockers.map((list, c) => [...(map.staticBlockers?.[c] ?? []), ...list]);
    assert.deepEqual(signature(hordeSpots(map)), signature(spots), 'late-loaded props never move member slots');
    assert.equal(buildCubeGeometry(map).length, map.K);
    // Member identity/strength is independent of terrain floor indexing.
    const shifted = structuredClone(map);
    shifted.floors.forEach(f => f.id += 1000); state.map = shifted;
    assert.deepEqual(hordeSpots(shifted).map(s => [s.id, s.level, s.coinDrop]), spots.map(s => [s.id, s.level, s.coinDrop]));
  }
});

test('horde portal pads line up with neighbours regardless of preparation order', () => {
  for (const seed of [0, 7, 123]) for (const depth of [0, 1, 11, 19, 20]) {
    const world = new World(seed), key = world.layout(depth).hordes.keys().next().value;
    const fresh = new World(seed);
    fresh.prepare(key); const ordinaryFaces = fresh.spec(key).faces, dirs = fresh.spec(key).portals.map(p => p.dir);
    fresh.layout(depth).hordes.clear();
    assert.deepEqual(fresh.spec(key).faces, ordinaryFaces, 'a horde does not rewrite rivers, portal layers or shared faces');
    for (const dir of dirs) world.prepare(step(key, dir));
    const map = state.map = world.cube(key).map;
    for (const p of map.portals) {
      const other = world.cube(step(key, p.dir)).map.portals.find(q => q.dir === (p.dir ^ 1));
      assert.equal(other.layer, p.layer); assert.equal(other.y, p.y);
    }
  }
});

test('killing one scout rallies even out-of-aggro members; lost targets regroup without repeating the alarm', () => {
  const { map, list } = clearing(), groups = createHordeGroups(map, list), group = groups[0];
  const far = around(map.horde.floor, 10, list[0].profile.height).filter(f => f.hordeReserved)
    .sort((a, b) => Math.hypot(b.x - map.horde.floor.x, b.z - map.horde.floor.z) - Math.hypot(a.x - map.horde.floor.x, a.z - map.horde.floor.z))[0];
  const hero = heroAt(map, far);
  // Isolate damage alarms from sight alarms; returning must not replay old damage.
  for (const e of list) e.profile = { ...e.profile, aggro: .1 };
  coordinateHordes(groups, hero, .2); assert.equal(group.active, false);
  damageEnemy(list[0], list[0].hp);
  assert.equal(coordinateHordes(groups, hero, .01), 1);
  assert.ok(group.active && list.some(e => Math.hypot(hero.x - e.x, hero.z - e.z) > e.profile.aggro));
  assert.ok(list.every(e => e.horde.group === group && e.horde.wakeIn <= HORDE.reaction));
  hero.grounded = false;
  for (let i = 0; i < 9; i++) coordinateHordes(groups, hero, .2);
  assert.equal(group.active, false);
  hero.grounded = true;
  coordinateHordes(groups, hero, .2); assert.equal(group.active, false);
  const scout = list.find(e => e.mode !== 'dead');
  Object.assign(hero, heroAt(map, scout.f));
  assert.equal(coordinateHordes(groups, hero, .2), 1);
});

test('group attack starts are staggered and capped, without cancelling committed attacks', () => {
  const { map, list } = clearing(), groups = createHordeGroups(map, list), hero = heroAt(map, map.horde.floor);
  coordinateHordes(groups, hero, .2);
  for (const e of list) e.horde.wakeIn = 0;
  assert.ok(tryHordeAttack(list[0])); list[0].mode = 'attack';
  assert.equal(tryHordeAttack(list[1]), false);
  for (let i = 1; i < HORDE.attackers; i++) {
    coordinateHordes(groups, hero, HORDE.startGap + .001);
    assert.ok(tryHordeAttack(list[i])); list[i].mode = 'attack';
  }
  coordinateHordes(groups, hero, HORDE.startGap + .001);
  assert.equal(tryHordeAttack(list[HORDE.attackers]), false);
  hero.hp = 0; coordinateHordes(groups, hero, .2);
  assert.equal(tryHordeAttack(list[HORDE.attackers]), false);
  assert.ok(list.slice(0, HORDE.attackers).every(e => e.mode === 'attack'));
  assert.ok(tryHordeAttack({})); // ordinary enemies are unchanged
});

test('swarm rewards stay within the replaced room budget, with reduced drops and life on hit', () => {
  for (const depth of [0, 1, 11, 19, 20]) {
    const { map, list } = clearing(123, depth), spec = [...population(map).values()][0];
    const base = ENEMY_KINDS[map.horde.kind], kind = list[0].kind;
    assert.ok(kind.hp < base.hp && kind.damage < base.damage && kind.chase > base.chase);
    assert.ok(spec.rewardScale > 0 && spec.rewardScale <= 1);
    assert.equal(kind.dropScale, spec.rewardScale);
    const normal = population({ ...map, horde: null });
    const budget = [...normal.values()].reduce((n, p) => {
      const entries = Object.entries(p.kinds), weights = entries.reduce((n, [, w]) => n + w, 0);
      return n + p.count * entries.reduce((n, [k, w]) => n + ENEMY_KINDS[k].xp * w, 0) / weights;
    }, 0);
    assert.ok(kind.xp * list.length <= budget + list.length / 2);
    const hero = { hp: 50, maxHp: 100 };
    weaponHit(hero, { damage: 1, leech: 8 }, list[0], 1);
    assert.equal(hero.hp, 50 + 8 * spec.rewardScale);
  }
  const base = ENEMY_KINDS.snake, kind = swarmKind(base, .25);
  let ordinary = 0, swarm = 0;
  for (let i = 0; i < 2000; i++) {
    const enemy = { id: `drop:${i}`, level: 1 };
    ordinary += enemyDrops({ ...enemy, kind: base }, 123).length;
    swarm += enemyDrops({ ...enemy, kind }, 123).length;
  }
  assert.ok(swarm < ordinary * .4 && swarm > 0);
});

test('partial clears retain stable survivors and existing death rollback, without duplicate kill rewards', () => {
  const { map, list } = clearing(), run = createRun(), hero = createPlayerStats(), visit = new Set(run.defeated);
  const e = list[0]; damageEnemy(e, e.hp);
  assert.ok(awardKill(hero, run, e)); assert.equal(awardKill(hero, run, e), null);
  const survivorIds = hordeSpots(map).filter(s => !run.defeated.has(s.id)).map(s => s.id);
  assert.equal(survivorIds.length, list.length - 1);
  const survivors = hordeSpots(map).filter(s => !run.defeated.has(s.id)).map(s => makeEnemy(s, s.kind));
  assert.equal(createHordeGroups(map, survivors)[0].active, false);
  assert.ok(!survivorIds.includes(e.id));
  restoreDefeated(run, visit);
  assert.equal(hordeSpots(map).filter(s => !run.defeated.has(s.id)).length, list.length);
});
