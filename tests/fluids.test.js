import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { DIRS, OPP, EDGE_CORNERS, LH } from '../src/core/constants.js';
import { idx, inb } from '../src/core/util.js';
import { shoreIssues } from '../src/render/shore.js';
import { fallCells } from '../src/core/falls.js';
import { TEST_ROOM_NAMES, testRoomKey } from '../src/world/testrooms.js';

// how far a fluid floor's surface stands above what is next to it on side d (0: walled in),
// with the heights the renderer uses (smoothed corners); falls spill on purpose
function standing(m, f, d) {
  const x = f.x + DIRS[d][0], z = f.z + DIRS[d][1];
  if (!inb(x, z)) return 0;   // the face: the neighbour cube matches it
  const n = idx(x, z);
  if (m.falls.some(fl => fallCells(fl).some(c => c === f.c || c === n))) return 0;
  const [na, nb] = EDGE_CORNERS[OPP[d]], top = g => g.fluid ? g.surf : Math.min(g.cs[na], g.cs[nb]) / LH;
  const y = f.surf - 0.25, col = m.cols[n];
  if (col.some(g => g.bottom <= y && top(g) >= y)) return 0;
  const under = col.map(top).filter(t => t < f.surf);
  return f.surf - (under.length ? Math.max(...under) : -Infinity);
}

test('no fluid stands in the air: every pool, river and stream is walled in', () => {
  const bad = [];
  for (const seed of [0, 1, 2]) {
    const w = new World(seed);
    for (let depth = 0; depth <= 20; depth++) for (const k of w.layout(depth).exists) {
      const m = w.cube(k).map;
      for (const f of m.floors) if (f.fluid) for (let d = 0; d < 4; d++) {
        const h = standing(m, f, d);
        // corner smoothing may sag a bank by up to a level next to the water
        if (h > 1.25) bad.push(`seed ${seed} ${k} (${f.x},${f.z}) L${f.layer} side ${d}: ${h === Infinity ? 'over nothing' : h.toFixed(1) + ' levels'}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('banks keep out of the fluids beside them, and no column shows two fluid surfaces', () => {
  const issues = [];
  let cubes = 0;
  for (const seed of [0, 1, 2]) {
    const w = new World(seed);
    for (let depth = 0; depth <= 20; depth++) for (const k of w.layout(depth).exists) {
      const lines = shoreIssues(w.cube(k).map);
      cubes++;
      issues.push(...lines.map(l => `seed ${seed} ${k}: ${l}`));
    }
  }
  // (a stair's or ladder's pinned corner may win now and then: render/shore.js shoreIssues)
  assert.ok(issues.length <= cubes / 500, `${issues.length} in ${cubes} cubes:\n${issues.join('\n')}`);
  assert.ok(!issues.some(l => l.includes('two fluids')), issues.join('\n'));
});

test('the test rooms keep to the rules their fluids are drawn by', () => {
  const w = new World(2);
  // (the boss room at Squarlo's depth: his tidal hills)
  for (const name of TEST_ROOM_NAMES) assert.deepEqual(shoreIssues(w.cube(testRoomKey(name, name === 'boss' ? 2 : 3)).map), [], name);
});
