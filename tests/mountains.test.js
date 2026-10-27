// Monteur's mountains (core/mountains.js; game/mountains.js raises them, docs/bosses.md "Monteur"):
// out of the floor of his arena, each shape its own, a way up or none, rising and falling apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from './fixtures.js';
import { World } from '../src/world/world.js';
import { N, LH, DIRS, OPP, EDGE_CORNERS } from '../src/core/constants.js';
import { MOUNTAIN, SHAPES, PHASES, freeCells, placeMountain, planMountain, sunk, cornersAt, stepMountain, bringDown } from '../src/core/mountains.js';
import { MONTEUR, MONTEUR_SUN } from '../src/core/enemies.js';
import { barred } from '../src/core/monteur.js';

const arena = seed => { const w = new World(seed); return state.map = w.cube(w.layout(7).down).map; };
const spec = (shape, seed, x = 8, z = 8) => ({ n: 1, seed, shape, a: 0.6, x, z, phase: 'crack', t: 0, life: 25 });
function planned(map, shape, seed) {
  const s = spec(shape, seed), at = placeMountain(map, s);
  return at && planMountain(map, Object.assign(s, at));
}

test('only as the sun, when due, and one at a time', () => {
  const m = MONTEUR_SUN.attacks.find(a => a.name === 'mountain');
  assert.ok(m && m.cast === 'mountain' && !MONTEUR.attacks.some(a => a.name === 'mountain'));
  assert.ok(barred({ phase: 2 }).has('mountain'), 'not before it is due');
  assert.ok(!barred({ phase: 2, mountainDue: true }).has('mountain'));
  assert.ok(barred({ phase: 1, mountainDue: true }).has('mountain'), 'not as the moose');
  assert.ok(barred({ phase: 2, mountainDue: true, spinDue: true }).has('mountain'), 'the world turns first');
});

test('it takes the free ground of his arena only, never what is built or stands on it, and is the same in every game', () => {
  for (const seed of [3, 7, 11]) {
    const map = arena(seed), ok = freeCells(map);
    for (const [i, shape] of SHAPES.entries()) {
      const plan = planned(map, shape, 1000 + seed * 7 + i);
      assert.ok(plan, `${shape} fits in ${seed}'s arena`);
      assert.ok(plan.cells.size >= MOUNTAIN.least);
      for (const m of plan.cells.values()) {
        assert.ok(ok[m.c] && map.cols[m.c].length === 1 && m.f.encounter && !m.f.fluid, `${shape}: free ground`);
        assert.ok(m.h >= 1 && m.top === plan.ref + m.h && m.top > m.baseTop, `${shape}: it rises`);
        assert.ok(!map.portals.some(p => p.cells?.includes(m.c)), 'not on a portal');
      }
      // the same spec, the same mountain (every game raises it after his row)
      const again = planMountain(map, plan.spec);
      assert.deepEqual([...again.cells.values()].map(m => [m.c, m.h, m.cs]), [...plan.cells.values()].map(m => [m.c, m.h, m.cs]));
    }
  }
});

test('its slopes join cells no more than a level apart, and the ground beside it only where that was walked onto before', () => {
  const map = arena(7);
  for (const [i, shape] of SHAPES.entries()) {
    const plan = planned(map, shape, 55 + i);
    for (const m of plan.cells.values()) m.link.forEach((l, d) => {
      if (!l) return;
      const [dx, dz] = DIRS[d];
      assert.ok(l.f.x === m.x + dx && l.f.z === m.z + dz, 'a neighbour');
      if (l.up) {
        const n = plan.cells.get(l.f.c);
        assert.ok(Math.abs(n.top - m.top) <= 1);
        assert.ok(n.link[OPP[d]]?.f === m.f, 'both ways');
        // joined: their corners along the side they share meet
        const [a, b] = EDGE_CORNERS[d], [c, e] = EDGE_CORNERS[OPP[d]];
        assert.ok(Math.abs(m.cs[a] - n.cs[c]) < 1e-9 && Math.abs(m.cs[b] - n.cs[e]) < 1e-9, `${shape}: a smooth slope`);
      } else {
        assert.ok(m.f.link[d] === l.f && Math.abs(l.f.top - m.top) <= 1, 'down onto the ground it was joined to');
        const [a, b] = EDGE_CORNERS[d], [c, e] = EDGE_CORNERS[OPP[d]];
        assert.ok(m.cs[a] >= l.f.cs[c] - 1e-9 && m.cs[b] >= l.f.cs[e] - 1e-9, 'meeting the ground');
      }
    });
  }
  // a terraced cone is walked up from the ground
  const cone = planned(map, 'terraces', 3);
  assert.ok([...cone.cells.values()].some(m => m.link.some(l => l && !l.up)));
});

test('the shapes look different: a mesa high and flat, a needle over its ledge, a cone of slopes', () => {
  const map = arena(3);
  const tops = p => [...p.cells.values()].map(m => m.h);
  const mesa = planned(map, 'mesa', 9), tiers = planned(map, 'tiers', 9), cone = planned(map, 'terraces', 9);
  assert.ok(Math.min(...tops(mesa).filter(h => h > 1)) >= 7, 'a mesa is high all over');
  assert.equal(new Set(tops(tiers)).size, 2, 'two tiers');
  assert.ok(Math.max(...tops(tiers)) - Math.min(...tops(tiers)) >= 5, 'the needle stands well over the ledge');
  assert.ok(new Set(tops(cone)).size >= 4, 'a cone steps up');
});

test('a ladder now and then: against a cliff, its foot and top on level edges', () => {
  let n = 0;
  for (const seed of [3, 7, 11]) {
    const map = arena(seed);
    for (let s = 0; s < 12; s++) for (const shape of ['mesa', 'tiers', 'ridge']) {
      const plan = planned(map, shape, seed * 100 + s);
      for (const l of plan?.ladders ?? []) {
        n++;
        const [dx, dz] = DIRS[l.d], hi = plan.cells.get((l.z + dz) * N + l.x + dx);
        assert.ok(hi && hi.f.id === l.hi && map.cols[l.c].some(f => f.id === l.lo), 'from its foot up to a cell of it');
        assert.ok(l.y1 - l.y0 >= 3 * LH - 0.1 && Math.abs(l.y1 - hi.top * LH) < 1e-9, 'up a cliff');
        for (const k of EDGE_CORNERS[OPP[l.d]]) assert.ok(Math.abs(hi.cs[k] - l.y1) < 1e-9, 'its top edge level');
        const lo = plan.cells.get(l.c);
        if (lo) for (const k of EDGE_CORNERS[l.d]) assert.ok(Math.abs(lo.cs[k] - l.y0) < 1e-9, 'its foot level');
      }
    }
  }
  assert.ok(n > 5, 'some have one');
});

test('it rises out of the floor, stands, and falls apart in jolts, never under the ground it rose from', () => {
  const map = arena(11), plan = planned(map, 'mesa', 4), m = [...plan.cells.values()][0];
  assert.equal(sunk(plan, 'crack', 0.5), plan.drop);
  assert.ok(sunk(plan, 'rise', 0.2) < plan.drop && sunk(plan, 'rise', 1) < sunk(plan, 'rise', 0.5) && sunk(plan, 'rise', MOUNTAIN.rise) === 0);
  assert.equal(sunk(plan, 'up', 10), 0);
  assert.ok(Math.abs(sunk(plan, 'fall', MOUNTAIN.fall) - plan.drop) < 1e-9);
  // in jolts: down quickly, then still a moment
  const q = MOUNTAIN.fall / MOUNTAIN.jolts;
  assert.equal(sunk(plan, 'fall', q * 0.6), sunk(plan, 'fall', q * 0.9));
  assert.ok(sunk(plan, 'fall', q * 1.2) > sunk(plan, 'fall', q * 0.9));
  assert.deepEqual(cornersAt(m, plan.drop), m.base, 'all of it under the ground');
  assert.deepEqual(cornersAt(m, 0), m.cs);
  // its clock: cracks, rises, stands its life, falls, gone
  const s = { ...plan.spec, phase: 'crack', t: 0, life: 20 }, seen = [];
  for (let t = 0; t < 40; t += 0.1) { const p = stepMountain(s, 0.1); if (p) seen.push(p); }
  assert.deepEqual(seen, [...PHASES.slice(1), 'gone']);
  // brought down early: from as high as it got; one only cracking is gone at once
  const r = { ...s, phase: 'rise', t: MOUNTAIN.rise / 2 };
  const high = sunk(plan, 'rise', r.t);
  bringDown(r);
  assert.equal(r.phase, 'fall');
  assert.ok(Math.abs(sunk(plan, 'fall', r.t) - high) < plan.drop / MOUNTAIN.jolts + 1e-9);
  const c = { ...s, phase: 'crack', t: 0.3 };
  bringDown(c);
  assert.equal(c.phase, 'gone');
});
