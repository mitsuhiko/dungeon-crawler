import { test } from 'node:test';
import assert from 'node:assert/strict';
import { N } from '../src/core/constants.js';
import { key } from '../src/world/coords.js';
import { VIEW_DISTANCE, VIEW_FADE, discoveredCubes, distanceFade } from '../src/core/viewdistance.js';

const cube = (x, y, z, visits = 1) => ({ key: key(x, y, z), visits, geo: [] });
const store = list => new Map(list.map(c => [c.key, c]));

test('discovery includes diagonals and distant visited cubes, never other strata or prefetches', () => {
  // (east: the farthest cube along a row whose near side is in reach)
  const far = Math.ceil(VIEW_DISTANCE / N);
  const list = [cube(5, -2, -6), cube(6, -2, -5), cube(5 + far, -2, -6), cube(3, -2, -8),
    cube(6, -1, -6), cube(5, -3, -6), cube(4, -2, -6, 0), cube(10, -2, -6)];
  const result = discoveredCubes(store(list), list[0].key);
  assert.deepEqual(new Set(result.map(c => c.key)), new Set([list[1].key, list[2].key, list[3].key]));
  const east = result.find(c => c.key === list[2].key);
  assert.equal(east.dx, far); assert.equal(east.dz, 0); assert.equal(east.geo, list[2].geo);
});

test('candidate selection covers the radius from any point in the active footprint', () => {
  const cubes = store(Array.from({ length: 121 }, (_, i) => cube(i % 11 - 5, 0, Math.floor(i / 11) - 5)));
  const selected = new Set(discoveredCubes(cubes, '0,0,0').map(c => c.key));
  for (const x of [0, N / 2, N]) for (const z of [0, N / 2, N]) for (const c of cubes.values()) {
    if (c.key === '0,0,0') continue;
    const [cx, , cz] = c.key.split(',').map(Number);
    const dx = Math.max(cx * N - x, 0, x - (cx + 1) * N);
    const dz = Math.max(cz * N - z, 0, z - (cz + 1) * N);
    if (Math.hypot(dx, dz) < VIEW_DISTANCE) assert.ok(selected.has(c.key), c.key);
  }
  assert.ok(!selected.has('4,0,4'), 'far corners are outside the circular budget');
});

test('distance fade is smooth, bounded, and only affects the outer half-cube band', () => {
  assert.equal(distanceFade(0), 1);
  assert.equal(distanceFade(VIEW_DISTANCE - VIEW_FADE), 1);
  assert.equal(distanceFade(VIEW_DISTANCE - VIEW_FADE / 2), 0.5);
  assert.equal(distanceFade(VIEW_DISTANCE), 0);
  assert.equal(distanceFade(VIEW_DISTANCE + 100), 0);
  for (let d = 0; d < VIEW_DISTANCE + 10; d++) assert.ok(distanceFade(d) >= distanceFade(d + 1));
});

test('a gorge span shows no cube before it is visited (its far side included)', () => {
  const gorge = cube(6, -1, 0, 0), far = cube(7, -1, 0, 0);
  const result = discoveredCubes(store([cube(5, -1, 0), gorge, far]), key(5, -1, 0));
  assert.deepEqual(result.map(c => c.key), []);
});
