import { test } from 'node:test';
import assert from 'node:assert/strict';
import { N, LH } from '../src/core/constants.js';
import { edgeKey } from '../src/core/util.js';
import { flatMap, state } from './fixtures.js';
import { SPIDER, STUNDER, ENEMY_PROFILES, ENEMY_KINDS, makeEnemy, isRanged } from '../src/core/enemies.js';
import { enemySpots } from '../src/game/enemyspawn.js';
import { DEPTH_SPAWNS, population, livesIn, comesTo, entryWorth, budgetAt, SPREAD } from '../src/core/spawns.js';
import { walkable, neighbors, findPath, pathToward, stepEnemy, clearLine } from '../src/physics/enemynav.js';
import { topOf } from '../src/core/surfaces.js';
import { World } from '../src/world/world.js';

const signature = spots => spots.map(s => [s.f.id, s.x, s.y, s.z, s.yaw]);
const at = (seed, depth) => Object.assign(flatMap(seed), { depth });

test('seeded Stunder population is repeatable, spans 0-2 and stays away from entrances', () => {
  const counts = new Set();
  for (let seed = 0; seed < 150; seed++) {
    const map = at(seed, 3), a = enemySpots(map, STUNDER);
    counts.add(a.length);
    assert.ok(a.length <= 2);
    assert.deepEqual(signature(a), signature(enemySpots(map, STUNDER)));
    for (const e of a) {
      assert.ok(walkable(e.f, STUNDER.height));
      assert.ok(Math.hypot(e.f.x, e.f.z) >= 4);
    }
    if (a.length === 2) assert.ok(Math.hypot(a[0].x - a[1].x, a[0].z - a[1].z) >= STUNDER.spacing);
    const spiders = signature(enemySpots(map, SPIDER));
    enemySpots(map, STUNDER);
    assert.deepEqual(signature(enemySpots(map, SPIDER)), spiders);
  }
  assert.deepEqual([...counts].sort(), [0, 1, 2]);
});
test('no dry safe floor means no Stunders, never an unsafe fallback spawn', () => {
  const map = at(3, 4);
  assert.ok(population(map).size);
  for (const f of map.floors) f.fluid = true;
  assert.deepEqual(enemySpots(map, STUNDER), []);
});
test('height-specific navigation cache does not grant spider clearance to Stunder', () => {
  const map = flatMap(), f = map.floors[5 * N + 5];
  const roof = { bottom: 1.5 / LH, top: 2 / LH, cs: [2, 2, 2, 2] };
  map.cols[f.c].push(roof);
  assert.ok(walkable(f, SPIDER.height));
  assert.equal(walkable(f, STUNDER.height), false);
  assert.ok(walkable(f, SPIDER.height));
  assert.equal(findPath(f, f.link[0], 2, STUNDER.height), null);
});
test('Stunder cannot move its body over a cliff or through a prop', () => {
  const map = flatMap(), f = map.floors[5 * N + 5];
  const e = makeEnemy({ f, x: f.x + 0.5, z: f.z + 0.5, y: 0 }, STUNDER);
  map.blockers[f.link[0].c].push({ x: f.x + 1.5, z: f.z + 0.5, r: 0.3, bottom: 0, top: 2 });
  assert.equal(stepEnemy(e, 1, 0), true); // axis fallback can stand still, but cannot enter it
  assert.equal(e.x, f.x + 0.5);
  f.link[0] = null;
  stepEnemy(e, 1, 0);
  assert.equal(e.x, f.x + 0.5);
});
test('navigation respects fences, melee line of sight respects props and slabs', () => {
  const map = flatMap(), f = map.floors[5 * N + 5], g = f.link[0];
  map.fences.set(edgeKey(f.x, f.z, g.x, g.z), [{ ymin: 0, ymax: 1 }]);
  assert.ok(!neighbors(f).includes(g));
  assert.equal(findPath(f, g, 1), null);
  assert.ok(clearLine(4.5, 0.4, 5.5, 7.5, 0.4, 5.5));
  map.blockers[5 * N + 6].push({ x: 6.5, z: 5.5, r: 0.3, bottom: 0, top: 2 });
  assert.equal(clearLine(4.5, 0.4, 5.5, 7.5, 0.4, 5.5), false);
});
test('enemies walk stairs, bridges and landings: every structure joins its ends', () => {
  let runs = 0, landings = 0;
  for (const seed of [1, 2, 3]) {
    const world = new World(seed);
    for (const key of [1, 2, 5].flatMap(d => [...world.layout(d).exists].slice(0, 3))) {
      const map = state.map = world.cube(key).map;
      const landing = new Map(map.runs.filter(r => r.kind === 'landing').map(r => [r.from, r.pieces[0]]));
      for (const r of map.runs) {
        if (r.kind === 'landing') continue;
        const a = landing.get(r.from) ?? r.from, b = landing.get(r.to) ?? r.to;
        if (![a, b, ...r.pieces].every(n => walkable(n, SPIDER.height))) continue;
        const path = findPath(a, b, r.k + 1, SPIDER.height);
        // (a short bridge over a dip the ground beside it also crosses: the ground is as short)
        if (path?.length === r.k + 2 && path.every(n => !n.kind)) continue;
        assert.deepEqual(path, [a, ...r.pieces, b], `${key} ${r.kind}`);
        if (r.from.landing || r.to.landing) { landings++; continue; }
        runs++;
        // a body steered from cell to cell along it gets to the other end, at the surface's height
        const e = makeEnemy({ f: a, x: a.x + .5, z: a.z + .5, y: topOf(a, .5, .5) }, SPIDER);
        for (let i = 0; i < 2000 && e.f !== b; i++) {
          const next = path[path.indexOf(e.f) + 1], dx = next.x + .5 - e.x, dz = next.z + .5 - e.z, d = Math.hypot(dx, dz) || 1;
          stepEnemy(e, dx / d * 0.03, dz / d * 0.03);
          assert.ok(Math.abs(e.y - topOf(e.f, e.x - e.f.x, e.z - e.f.z)) < 1e-9);
        }
        assert.equal(e.f, b, `${key} ${r.kind}: walked across`);
      }
    }
  }
  assert.ok(runs > 50 && landings > 0, `${runs} runs, ${landings} with landings`);
});
test('a target out of reach: the path goes as close as it gets', () => {
  const map = flatMap(), f = map.floors[5 * N + 5];
  for (let x = 0; x < N; x++) map.floors[8 * N + x].fluid = true;   // a river across the cube
  const far = map.floors[12 * N + 5];
  assert.equal(findPath(f, far, 20), null);
  const path = pathToward(f, far.x + .5, 0, far.z + .5, 20);
  assert.equal(path[0], f);
  assert.equal(path.at(-1), map.floors[7 * N + 5]);
});
test('real generated levels keep the population cap and species clearance', () => {
  for (const seed of [1, 2, 3, 8, 17, 42, 123, 456]) {
    const world = new World(seed);
    const map = state.map = world.cube(world.start).map;
    const spots = enemySpots(map, STUNDER);
    assert.ok(spots.length <= 2);
    assert.deepEqual(signature(spots), signature(enemySpots(map, STUNDER)));
    for (const e of spots) assert.ok(walkable(e.f, STUNDER.height));
  }
});
test('each depth draws its species from its own roster, within the mix, worth about its budget', () => {
  const index = new Map(ENEMY_PROFILES.map(p => [p.type, p]));
  for (const [depth, row] of DEPTH_SPAWNS.entries()) {
    const seen = new Set();
    let worth = 0, cubes = 0;
    for (const e of row.roster) assert.ok(index.has(e.type) && e.lo >= 1 && e.hi >= e.lo && e.pack >= 1 && e.chance > 0 && e.world >= 1, `${depth} ${e.type}`);
    // (a species that keeps to some themes, `where`: cubes of those and of others; one that comes
    // to worlds of a higher level only, `world`: worlds of level 1 and of level 10)
    const biomes = [undefined, ...new Set(row.roster.flatMap(e => (e.where ?? []).map(w => w.replace(/^!/, ''))))];
    for (let seed = 0; seed < 200; seed++) {
      const map = Object.assign(at(seed, depth), { biome: biomes[seed % biomes.length], level: seed % 3 ? 1 : 10 }), pop = population(map);
      // (a species with entries of its own in and out of a theme: only the one that lives here)
      for (const e of row.roster) if (!comesTo(e, map) && row.roster.every(o => o.type !== e.type || !comesTo(o, map)))
        assert.ok(!pop.has(e.type), `${e.type} out of its waters, or its world`);
      assert.deepEqual([...pop], [...population(map)]);
      assert.ok(pop.size >= 1 && pop.size <= row.mix, `depth ${depth}`);
      assert.equal([...pop.values()].filter(p => p.lead).length, 1);
      for (const [type, { count }] of pop) {
        const e = row.roster.find(e => e.type === type && comesTo(e, map));
        // (the shooters stay few: never more than the row says)
        assert.ok(e && count >= 1 && (!isRanged(ENEMY_KINDS[type]) || count <= e.hi), `${type} at depth ${depth}: ${count}`);
        worth += count * entryWorth(e);
        seen.add(type);
      }
      cubes++;
      for (const p of ENEMY_PROFILES) {
        const spots = enemySpots(map, p);
        assert.ok(spots.length <= (pop.get(p.type)?.count ?? 0));
        for (const e of spots) assert.ok(walkable(e.f, p.height) && Math.hypot(e.f.x, e.f.z) >= 4);
      }
    }
    assert.deepEqual([...seen].sort(), [...new Set(row.roster.map(e => e.type))].sort(), `depth ${depth}`);
    // (on average: the rooms of shooters alone stay under it, see core/spawns.js fitBudget)
    const mean = worth / cubes, budget = budgetAt(depth);
    assert.ok(mean > budget * (1 - SPREAD) && mean < budget * (1 + SPREAD), `depth ${depth}: ${mean.toFixed(0)} for ${budget}`);
  }
  assert.equal(new Set(ENEMY_PROFILES.map(p => p.seedSalt)).size, ENEMY_PROFILES.length);
  assert.equal(new Set(ENEMY_PROFILES.map(p => p.type)).size, ENEMY_PROFILES.length);
});
test('the surface rosters: snakes, a rare Stunder and a lonely Wolk first, then a few spiders, then a lot', () => {
  const share = (depth, type) => { let n = 0; for (let s = 0; s < 400; s++) n += population(at(s, depth)).has(type); return n / 400; };
  const mean = (depth, type) => { let n = 0; for (let s = 0; s < 400; s++) n += population(at(s, depth)).get(type)?.count ?? 0; return n / 400; };
  // (in a world of level 1: the guests of the higher ones, `world`, aside)
  const first = d => DEPTH_SPAWNS[d].roster.filter(e => e.world === 1);
  assert.deepEqual(first(1).map(e => e.type), ['snake', 'stunder', 'wolk', 'squirtle', 'spider', 'fireface']);
  assert.deepEqual(first(0).map(e => e.type), ['snake']);
  // the dark forest has spiders and Lantern-faces of its own (and only its own spiders)
  for (const d of [1, 2]) for (const e of DEPTH_SPAWNS[d].roster) if (e.kinds.gloomspider || e.kinds.lanternface)
    assert.deepEqual(e.where, ['darkforest']);
  const forest = (s, d) => population({ ...at(s, d), biome: 'darkforest' });
  let gloom = 0;
  for (let s = 0; s < 200; s++) if (forest(s, 1).get('spider')?.kinds.gloomspider) gloom++;
  assert.ok(gloom > 60, `${gloom} forests with gloom spiders`);
  assert.ok(DEPTH_SPAWNS[2].roster.filter(e => e.type === 'spider').every(e => e.where), 'spiders of the forest and of the rest');
  assert.equal(share(1, 'snake'), 1);
  assert.ok(share(1, 'stunder') > 0.1 && share(1, 'stunder') < 0.35);
  // the Wolk lives under the open sky only (the meadows, the snowy peaks, the canyons), alone or in twos
  assert.ok(share(1, 'wolk') > 0.1 && share(1, 'wolk') < 0.35);
  assert.ok(share(3, 'wolk') > share(1, 'wolk'));
  assert.deepEqual(DEPTH_SPAWNS.flatMap((r, d) => r.roster.some(e => e.type === 'wolk' && e.world === 1) ? [d] : []), [1, 2, 3, 4, 5, 6]);
  assert.ok(Math.max(...DEPTH_SPAWNS.map(r => r.roster.find(e => e.type === 'wolk')?.hi ?? 0)) <= 2);
  assert.ok(mean(2, 'spider') > 0.5 && mean(2, 'spider') < 3);
  assert.equal(share(3, 'spider'), 1);
  assert.ok(mean(3, 'spider') > 3 * mean(2, 'spider'));
  assert.ok(share(3, 'stunder') > share(1, 'stunder'));
  assert.ok(share(3, 'triangle') > 0.05 && share(3, 'triangle') < 0.25);
  for (const type of ['snake', 'spider', 'stunder']) assert.ok(share(4, type) > 0.4, type);
});
test('melee swarms grow with depth and spawn in packs, ranged species stay few', () => {
  const most = type => DEPTH_SPAWNS.map(r => r.roster.find(e => e.type === type)?.hi ?? 0);
  for (const type of ['fireface', 'triangle']) assert.ok(Math.max(...most(type)) <= 4, type);
  const spiders = most('spider');
  assert.ok(spiders[15] > spiders[3] && spiders[3] > spiders[2] && spiders[20] > spiders[3]);
  let packed = 0;
  for (let seed = 0; seed < 20; seed++) {
    const map = at(seed, 15), spots = enemySpots(map, SPIDER);
    assert.equal(spots.length, population(map).get('spider').count);
    for (const a of spots) for (const b of spots) if (a !== b) {
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      assert.ok(d >= 1.2 - 1e-9);
      if (d < SPIDER.spacing) packed++;
    }
  }
  assert.ok(packed > 0);
});
