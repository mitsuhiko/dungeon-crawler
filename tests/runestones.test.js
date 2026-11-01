// The rune stones (docs/map.md): where the world puts them (world/spots.js, cubegen/spots.js), their
// guards (game/enemyspawn.js), and what is kept of them (core/save.js, core/chronicle.js). Their
// spots are checked with every other spot too (tests/spots.test.js: placed, clear, level, reachable).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from './fixtures.js';
import { worldOf } from './worlds.js';
import { makeLayouts } from '../src/world/layout.js';
import { planSpots, RUNESTONES } from '../src/world/spots.js';
import { isTown } from '../src/world/town.js';
import { parse } from '../src/world/coords.js';
import { runestonesIn, runeDepth, runeCube, wokenAt, arrivalAt } from '../src/core/runestones.js';
import { createWorld, checkWorld, checkRunes } from '../src/core/save.js';
import { cleanNews, NEWS } from '../src/core/chronicle.js';
import { runestoneGuards, GUARDS } from '../src/game/enemyspawn.js';
import { population } from '../src/core/spawns.js';
import { ENEMY_KINDS } from '../src/core/enemies.js';
import { N } from '../src/core/constants.js';

const SEEDS = [1, 3, 77];

test('every depth but the town has three rune stones, in rooms of their own spread over it', () => {
  for (const seed of SEEDS) {
    const L = makeLayouts(seed);
    assert.deepEqual(L(0).runestones, [], 'none by the town');
    let spread = 0;
    for (let d = 1; d <= 20; d++) {
      const l = L(d), stones = l.runestones;
      const rooms = l.cells.length;
      assert.ok(stones.length === RUNESTONES || stones.length < RUNESTONES && rooms < 16, `seed ${seed} depth ${d}: ${stones.length} stones in ${rooms} rooms`);
      assert.equal(new Set(stones.map(s => s.key)).size, stones.length, 'each in a room of its own');
      for (const s of stones) {
        assert.equal(s.kind, 'runestone');
        assert.equal(s.depth, d);
        assert.ok(l.exists.has(s.key) && !isTown(s.key, seed), 'in a room of the depth');
        assert.ok(!l.guardians.has(s.key) && !l.hordes.has(s.key) && !l.trialCells?.has(s.key), "not a guardian's, the horde's or a trial's room");
        assert.ok(s.key !== l.annex?.key && s.key !== l.firstGlass);
        assert.ok(!l.spots.get(s.key).some(x => x.kind === 'outpost' || x.kind === 'camp'), 'not by an outpost or a camp');
        assert.ok(l.spots.get(s.key).includes(s), 'the generator places it');
        assert.ok(!l.spotList.includes(s), 'never a quest\'s');
        assert.equal(runeDepth(s.id), d);
        assert.equal(runeCube(s.id), s.key);
      }
      const at = stones.map(s => parse(s.key));
      const nearest = Math.min(...at.flatMap((a, i) => at.slice(i + 1).map(b => Math.hypot(a[0] - b[0], a[2] - b[2]))));
      if (nearest >= 2) spread++;
    }
    assert.ok(spread >= 16, `seed ${seed}: the stones of most depths at least two cubes apart (${spread} of 20)`);
    assert.deepEqual(planSpots(seed, L(7)).runestones, L(7).runestones, 'the same plan again');
  }
});

test('a rune stone stands in its cube where it can be walked up to and pressed, guarded', () => {
  const world = worldOf(3);
  for (const d of [1, 6, 12]) for (const plan of world.layout(d).runestones) {
    const map = state.map = world.cube(plan.key).map;
    map.blockers = map.staticBlockers;
    const [s] = runestonesIn(map).filter(x => x.id === plan.id);
    assert.ok(s, `${plan.key}: the stone is placed`);
    const f = map.floors[s.floor], access = map.floors[s.accessFloor];
    assert.ok(!f.fluid && !access.fluid, 'on dry ground');
    assert.equal(map.safe[access.id], 1, 'where you press it leads on to the exit');
    assert.ok(map.staticBlockers[f.c].some(b => b.spot === s.id), 'the stone blocks its cell');
    assert.ok(map.portals.every(p => Math.hypot(p.x - f.x, p.z - f.z) >= 2), 'off the portals');
    const a = arrivalAt(s);
    assert.ok(Math.abs(a.y - s.anchor.y) < 1.2 && Math.hypot(a.x - s.anchor.x, a.z - s.anchor.z) === 1, 'travelling there puts you beside it');
    assert.ok(Math.abs(Math.atan2(s.anchor.x - a.x, s.anchor.z - a.z) - a.yaw) < 1e-9, 'facing it');
    // its guards: a few of one walking kind of the room's, round it, the same every time
    const guards = [...population(map).keys()].flatMap(t => runestoneGuards(map, ENEMY_KINDS[t])).filter(g => g.runestone === s.id);
    assert.ok(guards.length >= 1 && guards.length <= GUARDS(d), `${plan.key}: ${guards.length} guards`);
    assert.equal(new Set(guards.map(g => g.kind.species)).size, 1, 'one kind of them');
    assert.equal(new Set(guards.map(g => g.id)).size, guards.length);
    for (const g of guards) {
      assert.ok(Math.hypot(g.x - s.anchor.x, g.z - s.anchor.z) <= 4.01, 'near the stone');
      assert.ok(!s.cells.includes(g.f.z * N + g.f.x) && !g.f.spot, 'not on its cells');
      assert.equal(g.respawn, map.key, 'they come back like the room\'s own');
      assert.ok(!g.kind.dwells);
    }
    const again = [...population(map).keys()].flatMap(t => runestoneGuards(map, ENEMY_KINDS[t])).filter(g => g.runestone === s.id);
    assert.deepEqual(again.map(g => [g.id, g.x, g.z, g.kind.type]), guards.map(g => [g.id, g.x, g.z, g.kind.type]));
  }
});

test('the rune stones woken are kept with the world', () => {
  const w = createWorld(3, { id: 'w-test' });
  assert.deepEqual(w.run.runes, []);
  const ids = ['3:-2,-1,3:spot:1', '3:4,-12,0:spot:5'];
  w.run.runes = [...ids, ids[0], 'nonsense', 42, '3:town:spot:1'];
  const back = checkWorld(JSON.parse(JSON.stringify(w)));
  assert.deepEqual(back.run.runes, ids, 'each once, nothing else');
  assert.deepEqual(checkWorld({ ...JSON.parse(JSON.stringify(w)), run: { ...w.run, runes: undefined } }).run.runes, [], 'a world saved before them');
  assert.deepEqual(checkRunes(ids), ids);
  assert.deepEqual(wokenAt(new Set(ids), 12), [ids[1]]);
  // a friend is told (core/chronicle.js NEWS)
  assert.ok(NEWS.has('rune'));
  assert.deepEqual(cleanNews('rune', { depth: 4 }), { depth: 4 });
  assert.equal(cleanNews('rune', { depth: 'deep' }), null);
});
