import { test } from 'node:test';
import assert from 'node:assert/strict';
import { N, CHAR_R, DIRS } from '../src/core/constants.js';
import { faceKey, step, OPP6 } from '../src/world/coords.js';
import { isFaceOpen, openedSides, faceDistance, approachingFace, boundaryArrival, discoveredFaces, visitedFaces } from '../src/core/boundaries.js';
import { flatMap, state } from './fixtures.js';
import { player } from '../src/game/state.js';
import { canMove, railedFace } from '../src/physics/canmove.js';
import { setAcross, groundAt, blockedAt, cellAt, spotAt } from '../src/physics/collide.js';
import { stepEnemy } from '../src/physics/enemynav.js';

const atFace = (dir, distance, along = 9.3, y = 7.2) => ({
  x: dir === 0 ? N - distance : dir === 1 ? distance : along,
  z: dir === 2 ? N - distance : dir === 3 ? distance : along,
  y, r: CHAR_R, vx: DIRS[dir][0], vz: DIRS[dir][1],
});

test('opening a face is shared in both directions, not with any other side or vertical face', () => {
  const key = '2,-3,4';
  for (let dir = 0; dir < 4; dir++) {
    const opened = new Set([faceKey(key, dir)]), neighbor = step(key, dir);
    assert.equal(faceKey(key, dir), faceKey(neighbor, OPP6[dir]));
    assert.equal(isFaceOpen(opened, neighbor, OPP6[dir]), true);
    assert.deepEqual(openedSides(opened, key), DIRS.map((_, d) => d === dir));
    for (const d of [4, 5]) {
      opened.add(faceKey(key, d));
      assert.equal(isFaceOpen(opened, key, d), false);
    }
    opened.clear();
    assert.deepEqual(openedSides(opened, key), [false, false, false, false]);
  }
});

test('all side faces open once both cubes are discovered, including gates never crossed', () => {
  const key = '2,-3,4', side = d => ({ kind: 'side', dir: d });
  const c = { key, visits: 1, map: { portals: [side(0)] } };
  const cubes = new Map([[key, c]]);
  for (let d = 0; d < 4; d++) cubes.set(step(key, d), { key: step(key, d), visits: d === 3 ? 0 : 1, map: { portals: [side(OPP6[d])] } });
  // E has a gate and all neighbours have gates: only undiscovered N stays closed.
  assert.deepEqual(discoveredFaces(cubes, c), [faceKey(key, 0), faceKey(key, 1), faceKey(key, 2)]);
  // the neighbour discovering later opens the same shared face
  const n = cubes.get(step(key, 3));
  n.visits = 1;
  assert.deepEqual(discoveredFaces(cubes, n).filter(f => f === faceKey(key, 3)), [faceKey(key, 3)]);
  assert.deepEqual(discoveredFaces(cubes, { ...c, visits: 0 }), []);
});

test('open-face approach respects the body radius and outward intent, not height or portal position', () => {
  for (let dir = 0; dir < 4; dir++) for (const y of [0, 2, 12]) for (const along of [0.5, 8, 15.5]) {
    const p = atFace(dir, CHAR_R + 0.1, along, y);
    assert.ok(Math.abs(faceDistance(p, dir) - CHAR_R - 0.1) < 1e-9);
    assert.equal(approachingFace(p, dir), true);
    p.vx = p.vz = 0;
    assert.equal(approachingFace(p, dir), false);
    assert.equal(approachingFace(p, dir, ...DIRS[dir]), true);
    const [nx, nz] = DIRS[dir];
    assert.equal(approachingFace(p, dir, -nz, nx), false);
    assert.equal(approachingFace(p, dir, -nx, -nz), false);
    assert.equal(approachingFace(atFace(dir, 0.5), dir), false);
  }
});

test('boundary arrival preserves height and position along the face with room for the whole body', () => {
  for (let dir = 0; dir < 4; dir++) {
    const p = atFace(dir, 0.3), arrival = boundaryArrival(p, dir), opposite = OPP6[dir];
    assert.equal(arrival.y, p.y);
    assert.equal(dir < 2 ? arrival.z : arrival.x, dir < 2 ? p.z : p.x);
    assert.ok(Math.abs(faceDistance(arrival, opposite) - 0.6) < 1e-9);
    assert.equal(approachingFace({ ...p, ...arrival }, opposite), false);
    assert.ok(arrival.x > CHAR_R && arrival.x < N - CHAR_R);
    assert.ok(arrival.z > CHAR_R && arrival.z < N - CHAR_R);
  }
});

test('opening faces does not change cube-local player collision or enemy containment', () => {
  flatMap();
  state.openedFaces.add(faceKey('0,0,0', 0));
  try {
    const f = state.map.cols[8 * N + N - 1][0];
    Object.assign(player, { x: N - 0.3, z: 8.5, y: 0, grounded: true, swimming: false, support: f });
    assert.equal(canMove(N - 0.1, player.z, 'x', 1), false);
    const e = { x: N - 0.3, z: 8.5, y: 0, f };
    stepEnemy(e, 1, 0, CHAR_R, 0.9);
    assert.equal(e.x, N - 0.3);
    assert.equal(e.f, f);
  } finally { state.openedFaces.clear(); }
});

test('a side walked across: the body steps into the cube beyond, as it lies there; enemies stay in', () => {
  const other = flatMap(2), m = flatMap();
  // the cube beyond (east) a level higher at its edge row but one cell, a tree just past the face
  for (let z = 0; z < N; z++) if (z !== 4) Object.assign(other.cols[z * N][0], { top: 2, cs: [2, 2, 2, 2] });
  other.blockers[6 * N].push({ x: 0.5, z: 6.5, r: 0.3, bottom: 0, top: 9 });
  const f = m.cols[8 * N + N - 1][0];
  try {
    setAcross(m, [other, null, null, null]);
    assert.equal(cellAt(N + 0.3, 8.5), -1, 'cellAt knows its own map only');
    const q = spotAt(N + 0.3, 8.5);
    assert.ok(q.m === other && q.i === 8 * N && Math.abs(q.x - 0.3) < 1e-9 && q.z === 8.5 && q.d === 0);
    assert.equal(spotAt(N + 1.3, 8.5), null, 'not further than a cell');
    assert.equal(spotAt(-0.3, 8.5), null, 'nor across a side not walked across');
    assert.equal(groundAt(N + 0.3, 4.5, 9, 0).h, 0);
    assert.equal(groundAt(N + 0.3, 4.5, 9, 0).i, -1, 'not a cell of this map');
    assert.equal(blockedAt(N + 0.5, 6.5, 0, 0.3), true, 'the tree beyond');
    Object.assign(player, { x: N - 0.3, z: 4.5, y: 0, grounded: true, swimming: false, support: m.cols[4 * N + N - 1][0] });
    assert.equal(canMove(N + 0.1, 4.5, 'x', 1), true, 'across where the ground goes on');
    Object.assign(player, { z: 8.5, support: f });
    assert.equal(canMove(N + 0.1, 8.5, 'x', 1), false, 'not up a cliff past the face');
    const e = { x: N - 0.3, z: 4.5, y: 0, f: m.cols[4 * N + N - 1][0] };
    stepEnemy(e, 1, 0, CHAR_R, 0.9);
    assert.equal(e.x, N - 0.3, 'an enemy stays in its cube');
    setAcross(other, [m, null, null, null]);
    assert.equal(canMove(N + 0.1, 4.5, 'x', 1), false, 'the sides are the cube played in\'s');
  } finally { setAcross(null); }
});

test('a stair or bridge along an open face keeps its side rail there, not its ends or what is under it', () => {
  const m = flatMap(), other = flatMap(2);
  state.map = m;
  // a bridge deck at height 2 along the east face (running along z), one along the south face
  // (running along x), and a landing on the east face
  const piece = (map, x, z, kind, dx, dz) => {
    const p = { kind, c: z * N + x, j: 0, dx, dz, run: { kind, y0: 2, y1: 2, k: 1, sag: 0 }, base: 0 };
    map.pieces[p.c].push(p);
  };
  piece(m, N - 1, 8, 'bridge', 0, 1); piece(m, 5, N - 1, 'stair', 1, 0); piece(m, N - 1, 3, 'landing', 1, 0);
  piece(other, 0, 8, 'bridge', 0, 1);
  Object.assign(player, { grounded: true, swimming: false });
  assert.equal(railedFace(N - 0.3, 8.5, 2, 0), true);     // its side lies on the face
  player.grounded = false;
  assert.equal(railedFace(N - 0.3, 8.5, 2.5, 0), false);  // a jump goes over the rail
  player.grounded = true;
  assert.equal(railedFace(N - 0.3, 8.5, 0, 0), false);    // walking under it
  assert.equal(railedFace(N - 0.3, 9.5, 2, 0), false);    // beside it, on the ground
  assert.equal(railedFace(5.5, N - 0.3, 2, 2), true);     // the other axis
  assert.equal(railedFace(N - 0.3, N - 0.3, 2, 2), false);
  piece(m, 8, N - 1, 'bridge', 0, 1);                     // a run leaving through the face: its end
  assert.equal(railedFace(8.5, N - 0.3, 2, 2), false);
  assert.equal(railedFace(N - 0.3, 3.5, 2, 0), false);    // landings are not railed on faces
  // where a crossing would arrive: the neighbour's map
  assert.equal(railedFace(0.6, 8.5, 2, 1, other), true);
  assert.equal(railedFace(0.6, 8.5, 2, 1), false);
  // walking along the bridge's deck, the body does not step off its side into the cube beyond
  try {
    setAcross(m, [other, null, null, null]);
    Object.assign(player, { x: N - 0.4, z: 8.5, y: 2, grounded: true, swimming: false, support: m.pieces[8 * N + N - 1][0] });
    assert.equal(canMove(N - 0.2, 8.5, 'x', 1), false);
    player.grounded = false;
    assert.equal(canMove(N - 0.2, 8.5, 'x', 1), true, 'a jump goes over the rail');
  } finally { setAcross(null); }
});

// a saved world (or the host's run) brings only faces whose cubes were both visited: a save from
// before large areas were discovered a cube at a time held their inner faces open unvisited
test('carried-over open faces keep only those between two visited cubes', () => {
  const a = '0,-5,0', b = step(a, 0), c = step(a, 2), d = step(b, 2);
  const faces = [faceKey(a, 0), faceKey(a, 2), faceKey(b, 2), faceKey(c, 0), faceKey(d, 1)];
  assert.deepEqual(visitedFaces(faces, new Set([a, b])), [faceKey(a, 0)]);
  assert.deepEqual(visitedFaces(faces, new Set([a, b, c])), [faceKey(a, 0), faceKey(a, 2)]);
  assert.deepEqual(visitedFaces(faces, new Set([a, b, c, d])), faces);
});
