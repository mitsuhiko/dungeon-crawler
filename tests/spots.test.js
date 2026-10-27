import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { makeLayouts } from '../src/world/layout.js';
import { planSpots, SPOT_KINDS, MAX_TIER, SEATS, HIDES, campDepth, OUTPOST_BANDS } from '../src/world/spots.js';
import { isClearing } from '../src/world/town.js';
import { glassAt } from '../src/core/glass.js';
import { N } from '../src/core/constants.js';
import { placeProps } from '../src/render/propplace.js';
import { themeOf } from '../src/themes/depth.js';

const layoutsOf = new Map();
const layouts = seed => layoutsOf.get(seed) ?? layoutsOf.set(seed, makeLayouts(seed)).get(seed);

test('every depth plans its spots from the seed: hiding places, two seats, a camp every third depth', () => {
  for (const seed of [1, 123, 4242]) {
    const L = layouts(seed);
    for (let d = 0; d <= 20; d++) {
      const l = L(d), list = l.spotList, count = k => list.filter(s => s.kind === k).length;
      assert.ok(count('hide') >= HIDES[0] && count('hide') <= HIDES[1], `depth ${d}: ${count('hide')} hiding places`);
      assert.equal(count('seat'), SEATS);
      assert.equal(count('camp'), d > 0 && campDepth(d) ? 1 : 0, `depth ${d}'s camp`);
      // the glassmaker's glass: one on the way, one hidden off it, in rooms of their own
      const glass = list.filter(s => s.kind === 'glass');
      assert.deepEqual(glass.map(s => s.glass), glassAt(seed, d).map((_, i) => i), `depth ${d}'s glass`);
      if (glass.length) {
        assert.ok(l.route.includes(glass[0].key) && glass[0].way, `depth ${d}: a glass on the way`);
        assert.ok(glass[1].tier >= glass[0].tier && glass[1].key !== glass[0].key, `depth ${d}: one hidden`);
      }
      assert.equal(new Set(list.map(s => s.id)).size, list.length);
      for (const s of list) {
        assert.ok(SPOT_KINDS.includes(s.kind) && s.tier >= 0 && s.tier <= MAX_TIER && s.depth === d);
        assert.ok(l.exists.has(s.key), 'in a room of the depth');
        assert.ok(!isClearing(s.key, seed) && !l.guardians.has(s.key), 'not in the town, the camp or an arena');
        assert.notEqual(l.spanCells.get(s.key)?.role, 'gorge');
        assert.deepEqual(l.spots.get(s.key).filter(x => x.id === s.id), [s]);
      }
      // a camp where the depth begins, the hiding places from easy to hard
      const camp = list.find(s => s.kind === 'camp');
      if (camp) assert.ok(l.routeIndex.get(camp.key) <= 2, `depth ${d}: the camp near the start`);
      const tiers = list.filter(s => s.kind === 'hide').map(s => s.tier);
      if (d > 0) assert.ok(Math.max(...tiers) > Math.min(...tiers), `depth ${d}: hiding places of several tiers`);
    }
    assert.deepEqual(planSpots(seed, L(5)).list, L(5).spotList, 'the same plan again');
    const outposts = Array.from({ length: 21 }, (_, d) => L(d).spotList.filter(x => x.kind === 'outpost' && !x.annex)).flat();
    const annexes = Array.from({ length: 21 }, (_, d) => L(d)).filter(l => l.annex);
    assert.equal(annexes.length, 3, 'three annexes');
    for (const l of annexes) assert.deepEqual(l.spots.get(l.annex.key).map(s => [s.kind, s.annex]), [['outpost', l.annex.gate]], 'an annex has its outpost, nothing else');
    assert.equal(outposts.length, OUTPOST_BANDS.length, 'an outpost in every stretch of depths');
    for (const [i, [a, b]] of OUTPOST_BANDS.entries()) assert.equal(outposts.filter(o => o.depth >= a && o.depth <= b).length, 1, `stretch ${i}`);
    for (const o of outposts) assert.ok(!L(o.depth).hordes.has(o.key) && L(o.depth).route.includes(o.key), 'on the way, not the horde\'s room');
  }
});

test('the spots do not depend on the order the depths are made', () => {
  const a = makeLayouts(77), b = makeLayouts(77);
  const ids = L => L.spotList.map(s => `${s.id}:${s.kind}:${s.tier}`);
  const deepFirst = [20, 9, 3, 0].map(d => ids(b(d)));
  assert.deepEqual([0, 3, 9, 20].map(d => ids(a(d))), deepFirst.reverse());
});

function checkSpots(world, map, plans) {
  assert.deepEqual(map.spots.map(s => s.id).sort(), plans.map(s => s.id).sort(), `${map.key}: every spot placed`);
  // (a place is a cell on a layer: a site up on a slab may stand over a spot on the ground)
  const used = new Set(), sites = new Set(map.rewardSites.flatMap(s => s.cells.map(c => `${c}:${s.layer}`)));
  const props = placeProps(map, themeOf(map));
  for (const s of map.spots) {
    const f = map.floors[s.floor], access = map.floors[s.accessFloor];
    assert.equal(map.safe[f.id], 1, 'it leads on to the exit');
    assert.equal(map.safe[access.id], 1);
    for (const c of s.cells) {
      assert.ok(!used.has(c) && !sites.has(`${c}:${s.layer}`), 'spots and reward sites never share a cell');
      used.add(c);
      const g = map.cols[c].find(h => h.spot === s.id);
      assert.ok(g && !g.fluid && !g.prot && !g.hordeReserved, 'dry, off pads and the horde');
      assert.equal(map.pieces[c].length, 0, 'nothing built on it');
      assert.ok(Math.max(...g.cs) - Math.min(...g.cs) < 0.2, 'level');
      const y = s.anchor.y;
      assert.deepEqual(props.blockers[c].filter(b => b.bottom < y + 1.2 && b.top > y), [], 'no prop in the way');
    }
    // ambient props keep off it (the camp's own fire and pack are its)
    for (const q of props.out) {
      const c = Math.floor(q.z) * N + Math.floor(q.x);
      if (q.spot !== s.id && s.cells.includes(c) && Math.abs(q.y - s.anchor.y) < 0.3) assert.fail(`${q.name} on ${s.id}`);
    }
    if (s.kind === 'camp') {
      assert.equal(s.places.length, 3);
      assert.ok(props.out.some(q => q.spot === s.id && q.name.includes('campfire')), 'the camp has its fire');
    }
    if (s.kind === 'seat') assert.ok(Math.hypot(s.anchor.x - s.approach.x, s.anchor.z - s.approach.z) === 1);
    if (s.kind === 'glass') assert.ok(s.cells.length === 1 && [0, 1].includes(s.glass), 'a glass floats over one cell');
    if (s.kind === 'outpost') {
      assert.equal(s.cells.length, 9);
      assert.equal(s.places.length, 1, 'its keeper');
      assert.ok(props.out.some(q => q.spot === s.id && q.name.includes('ore_cart')), 'the supply cart');
      assert.ok(map.staticBlockers[s.cells[0]].some(b => b.spot === s.id), 'the cart is in the way');
    }
  }
}

test('every planned spot is placed: clear, level, reachable both ways, nobody in the way', () => {
  for (const seed of [123, 4242]) {
    const world = new World(seed);
    for (let d = 0; d <= 20; d++) for (const [k, plans] of world.layout(d).spots) checkSpots(world, world.cube(k).map, plans);
  }
});

test('a cube makes the same spots whichever cube was made first', () => {
  const a = new World(9), b = new World(9);
  const keys = [...a.layout(2).spots.keys()].slice(0, 3);
  const pick = m => JSON.stringify(m.spots);
  const first = keys.map(k => pick(a.cube(k).map));
  const backwards = [...keys].reverse().map(k => pick(b.cube(k).map)).reverse();
  assert.deepEqual(first, backwards);
});
