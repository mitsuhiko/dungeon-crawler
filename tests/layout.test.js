import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLayouts, routeRooms } from '../src/world/layout.js';
import { key, faceKey, step } from '../src/world/coords.js';
import { discoveredFaces } from '../src/core/boundaries.js';
import { portalLocked } from '../src/core/guardians.js';
import { createRun } from '../src/core/progression.js';
import { INTRO_GATES, skipIntro } from '../src/core/intro.js';

// Model all rooms as already discovered, including rooms reached accidentally by falls.
// This exercises the extra full-face paths, not merely the authored portal graph.
function rooms(L) {
  return new Map([...L.exists].map(k => [k, { key: k, visits: 1, map: {
    key: k, exit: L.exit.get(k), guardian: L.guardians.get(k), routeIndex: L.routeIndex.get(k), route: L.route, annexRoom: L.annex?.key === k,
    trialRoom: !!L.trialCells?.has(k), town: L.town?.tiles.has(k) ? {} : undefined,
    gateKeys: [0, 1, 2, 3].map(d => L.gateFaces.get(faceKey(k, d))),
    portals: [0, 1, 2, 3].filter(d => L.portals.has(faceKey(k, d))).map(dir => ({ dir, kind: 'side' })),
  } }]));
}

function distances(L, cubes, run, from, avoid = null) {
  const dist = new Map([[from, 1]]), queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const c = cubes.get(queue[i]), open = new Set(discoveredFaces(cubes, c, run));
    for (let dir = 0; dir < 4; dir++) {
      const n = step(c.key, dir);
      if (!cubes.has(n) || n === avoid || dist.has(n) || portalLocked(c.map, run, { dir })) continue;
      if (!L.portals.has(faceKey(c.key, dir)) && !open.has(faceKey(c.key, dir))) continue;
      dist.set(n, dist.get(c.key) + 1); queue.push(n);
    }
  }
  return dist;
}

test('all depths have routes within their band, the core all nine rooms; discovery joins neighbours only over explored, unguarded ground', () => {
  for (let seed = 0; seed < 1000; seed++) {
    const get = makeLayouts(seed);
    for (let d = 0; d <= 20; d++) {
      const L = get(d), run = createRun(), cubes = rooms(L);
      const [min, max] = routeRooms(d);
      assert.ok(L.spine >= min && L.spine <= max, `seed ${seed}, depth ${d}: ${L.spine} rooms`);
      assert.ok(L.cells.length <= max);
      if (d === 20) assert.equal(L.spine, 9);
      assert.equal(L.route.length, L.spine);
      const entry = key(L.start[0], -d, L.start[1]), goal = L.route.at(-1);
      if (d) {
        assert.equal(L.up, entry);
        assert.deepEqual(L.start, get(d - 1).end);
      }
      if (d < 20) assert.equal(goal, L.down);
      for (const k of L.guardians.keys()) run.unlockedGates.add(k);
      for (const t of L.trials) run.unlockedGates.add(t.gate);   // (trial rooms, world/trials.js: resolved)
      // the beginning (core/intro.js): the town (all its tiles, world/town.js) is walked through, its
      // gate shut until the sword is taken, the rock's room's until his glass on it is found
      if (d === 0) {
        assert.equal(entry, L.town.gate);
        assert.equal(distances(L, cubes, run, entry).size, L.town.keys.length, `seed ${seed}: the town's gate is shut`);
        run.unlockedGates.add(INTRO_GATES.sword);
        const reach = distances(L, cubes, run, entry);
        assert.ok(reach.has(L.route[1]) && !reach.has(L.route[2]), `seed ${seed}: the rock's gate is shut`);
        skipIntro(run);
      }
      // an annex (a quest's room beside the way) is sealed until a quest opens it
      if (L.annex) {
        assert.equal(distances(L, cubes, run, entry).has(L.annex.key), false, `seed ${seed}, depth ${d}: the annex is sealed`);
        run.unlockedGates.add(L.annex.gate);
      }
      const forward = distances(L, cubes, run, entry), back = distances(L, cubes, run, goal);
      assert.equal(forward.size, L.exists.size); assert.equal(back.size, L.exists.size);
      // Fully explored and unlocked, every pair of neighbouring rooms is joined (an annex, a trial
      // room and the town only through their own portals).
      const apart = (a, b) => a.annexRoom || b.annexRoom || a.trialRoom || b.trialRoom || !!a.town !== !!b.town;
      for (const c of cubes.values()) for (let dir = 0; dir < 4; dir++)
        if (cubes.has(step(c.key, dir)) && !(apart(c.map, cubes.get(step(c.key, dir)).map) && !L.portals.has(faceKey(c.key, dir)) && !L.portals.has(faceKey(step(c.key, dir), dir ^ 1))))
          assert.ok(discoveredFaces(cubes, c, run).includes(faceKey(c.key, dir)), `seed ${seed}, depth ${d}: ${c.key} ${dir} sealed`);
      // An undiscovered route room cannot be skipped, whatever else was discovered
      // (rooms beyond it reached by a fall or the town portal).
      for (const k of L.route.slice(1, -1)) {
        cubes.get(k).visits = 0;
        assert.equal(distances(L, cubes, run, entry, k).has(goal), false, `seed ${seed}, depth ${d}: ${k} skipped`);
        cubes.get(k).visits = 1;
      }
      // Every side guardian cuts all paths to the descent, even after discovery elsewhere.
      for (const [k, g] of L.guardians) if (g.role === 'side') {
        run.unlockedGates.delete(k);
        assert.equal(distances(L, cubes, run, entry).has(goal), false);
        const c = cubes.get(k);
        assert.equal(discoveredFaces(cubes, c, run).includes(faceKey(k, g.exit)), false);
        run.unlockedGates.add(k);
      }
      // ... and so does every trial on the route until it is resolved
      for (const t of L.trials) if (t.exit != null) {
        run.unlockedGates.delete(t.gate);
        assert.equal(distances(L, cubes, run, entry).has(goal), false, `seed ${seed}, depth ${d}: past the trial in ${t.key}`);
        run.unlockedGates.add(t.gate);
      }
      if (L.down) {
        run.unlockedGates.delete(L.down);
        assert.equal(portalLocked(cubes.get(L.down).map, run, { kind: 'down', dir: 4 }), true);
      }
    }
  }
});

// docs/world.md, "Only where you have been": the next cube is behind a portal until you have been
// there, whatever stands on the way (a gorge span, a large area, a tableland)
test('every step of every route crosses a portal, through spans and large areas too', () => {
  for (let seed = 0; seed < 200; seed++) {
    const get = makeLayouts(seed);
    for (let d = 0; d <= 20; d++) {
      const L = get(d);
      for (let i = 1; i < L.route.length; i++) {
        const a = L.route[i - 1], b = L.route[i], dir = [0, 1, 2, 3].find(x => step(a, x) === b);
        if (dir === undefined) continue;   // (a way down or up between depths)
        assert.ok(L.portals.has(faceKey(a, dir)), `seed ${seed}, depth ${d}: no portal from ${a} to ${b}`);
      }
    }
  }
});
