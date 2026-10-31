import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { assets } from './paths.js';
import { readGlb, rootBounds, roots } from '../tools/glb.mjs';
import { N, LH, CHAR_R, CHAR_H, EDGE_CORNERS, DIRS } from '../src/core/constants.js';
import { containsXZ, viewBlockedAt } from '../src/core/blockers.js';
import { World } from '../src/world/world.js';
import { step, faceKey } from '../src/world/coords.js';
import { BUILDINGS, MERCHANTS, HOMES, TOWN_LEVEL, TOWN_PORTAL_SPOT, TOWN_ACROSS, TOWN_DEEP, VILLAGERS, VILLAGER_R, SEAM_CLEAR, STREET,
  PORTAL_TILE, START_TILE, enemyFreeAt, townOf, townLand, isTown, rotateTownPoint, TILE_NAMES } from '../src/world/town.js';
import { INN_STAIR, UPPER, WALL, WATER_FROM } from '../src/world/townland.js';
import { floorY, runY } from '../src/core/surfaces.js';
import { ITEMS, outfitOf } from '../src/core/items.js';
import { state } from './fixtures.js';
import { ENEMY_PROFILES } from '../src/core/enemies.js';
import { enemySpots } from '../src/game/enemyspawn.js';
import { blockedAt, insideSolid, ceilingAt, cellAt, groundAt, setAcross } from '../src/physics/collide.js';
import { canMove } from '../src/physics/canmove.js';
import { mapInfo } from '../src/game/cutinfo.js';
import { player } from '../src/game/state.js';
import { buildCubeGeometry } from '../src/render/cubegeo.js';
import { propMetadata } from '../src/core/propcatalog.js';
import { discoveredFaces } from '../src/core/boundaries.js';
import { createRun } from '../src/core/progression.js';

const overlaps = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
const signature = m => ({ town: m.town, portals: m.portals.map(p => [p.kind, p.dir, p.x, p.z]),
  ground: m.floors.map(f => [f.top, f.fluid, f.cs]), routes: m.routes, seams: m.seams });
const quarterTurn = yaw => Math.abs(Math.sin(yaw * 2)) < 1e-9;
const LEVEL = TOWN_LEVEL * LH;
// the height of map m's ground (a water cell's bed) at (x, z)
const groundOf = (m, x, z) => {
  const cx = Math.min(N - 1, Math.max(0, Math.floor(x))), cz = Math.min(N - 1, Math.max(0, Math.floor(z)));
  return floorY(m.cols[cz * N + cx][0], x - cx, z - cz);
};
// is the ground of map m level at (x, z), at height y (its own level, units)?
const level = (m, x, z, y = m.town.level * LH) => m.cols[Math.floor(z) * N + Math.floor(x)][0].cs.every(h => Math.abs(h - y) < 1e-9);
const isHome = name => name in HOMES;
const isWall = name => name.startsWith('town_wall') || name === 'town_gatehouse_a';
const isMill = name => name.startsWith('town_water');
// the town's tiles of a world: [{ k, i, j, m }]
const tilesOf = w => townOf(w.seed).keys.map(k => ({ k, ...townOf(w.seed).tiles.get(k), m: w.cube(k).map }));

function checkStraightPaths(m) {
  for (const path of m.town.paths) for (const [i, b] of path.points.slice(1).entries()) {
    const a = path.points[i];
    assert.ok(Math.abs(a[0] - b[0]) < 1e-9 || Math.abs(a[1] - b[1]) < 1e-9, 'paths run along the grid');
    for (let t = 0; t <= 1; t += .1) {
      const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      const hit = new Set(m.staticBlockers.flat()).values().find(b => containsXZ(b, x, z, CHAR_R + .03));
      assert.ok(!hit, `path must clear bodies and clutter, not just look connected: ${hit?.name} at ${x}, ${z} on ${m.key}`);
      const c = Math.min(N - 1, Math.max(0, Math.floor(z))) * N + Math.min(N - 1, Math.max(0, Math.floor(x)));
      // (over water only on a bridge, or a ford)
      const f = m.cols[c][0];
      if (f.fluid) assert.ok(m.pieces[c].some(p => p.kind === 'bridge') || f.surf - f.top <= 1, `a way into the water at ${x}, ${z} on ${m.key}`);
    }
  }
}

function checkWalkingRoutes(m) {
  state.map = m;
  Object.assign(player, { y: LEVEL, visY: LEVEL, h: .85, r: CHAR_R, grounded: true, swimming: false });
  for (const route of m.routes) for (const [i, b] of route.slice(1).entries()) {
    const a = route[i];
    player.x = a.x; player.z = a.z; player.support = m.cols[Math.floor(a.z) * N + Math.floor(a.x)][0];
    player.y = player.visY = groundOf(m, a.x, a.z);
    for (let t = .1; t <= 1.001; t += .1) {
      const nx = a.x + (b.x - a.x) * t, nz = a.z + (b.z - a.z) * t;
      assert.equal(canMove(nx, nz, a.x === b.x ? 'z' : 'x', Math.sign(b.x - a.x || b.z - a.z)), true,
        `${m.key}: from ${a.x}, ${a.z} to ${nx.toFixed(2)}, ${nz.toFixed(2)} (${m.cols[Math.floor(a.z) * N + Math.floor(a.x)][0].cs}) -> (${m.cols[Math.floor(nz) * N + Math.floor(nx)][0].cs}) ${m.cols[Math.floor(nz) * N + Math.floor(nx)][0].fluid}`);
      player.x = nx; player.z = nz; player.y = groundOf(m, nx, nz);
    }
  }
}

test('the town is TOWN_ACROSS by TOWN_DEEP tiles of the depth-0 grid round its gate, turned with it', () => {
  const exits = new Set();
  for (let seed = 0; seed < 80; seed++) {
    const t = townOf(seed);
    exits.add(t.exit);
    assert.equal(t.keys.length, TOWN_ACROSS * TOWN_DEEP);
    assert.equal(t.gate, '0,0,0');
    assert.ok(t.keys.every(k => k.split(',')[1] === '0'));
    // a block: every tile has its neighbours across and deep, the gate's row towards the road
    for (const [k, { i, j }] of t.tiles) {
      assert.equal(t.at(i, j), k);
      if (i + 1 < TOWN_ACROSS && j + 1 < TOWN_DEEP) {
        const across = t.at(i + 1, j), deep = t.at(i, j + 1);
        assert.ok(DIRS.some((_, d) => step(k, d) === across) && DIRS.some((_, d) => step(k, d) === deep));
      }
    }
    assert.ok(!isTown(step(t.gate, t.exit), seed), 'the road leaves through the gate');
    assert.ok(isTown(step(t.gate, t.exit ^ 1), seed), 'the town lies behind it');
    assert.equal(new World(seed).start, t.start);
    assert.deepEqual(t.tiles.get(t.start), { i: 1, j: 2 });
  }
  assert.deepEqual([...exits].sort(), [0, 1, 2, 3]);
});

test('every tile is safe and authored, the town level where it stands; the buildings, the tents and the lake each in their own tile', () => {
  let allHomes = 0;
  const groveKinds = new Set();
  for (let seed = 0; seed < 40; seed++) {
    const w = new World(seed, { arche: 'chasm' }), t = townOf(seed);   // debug archetypes cannot destroy town
    const placed = new Map();
    for (const { k, i, j, m } of tilesOf(w)) {
      state.map = m;
      assert.equal(m.town.tile.name, TILE_NAMES[j][i]);
      assert.equal(m.K, 1); assert.equal(m.attempts, 1); assert.equal(m.enemyFree, true);
      assert.equal(m.floors.length, N * N); assert.ok(m.cols.every(c => c.length === 1));
      // the stream's falls: from one level of it down to the next, into water
      for (const fl of m.falls) {
        const below = m.cols[fl.c][0], [dx, dz] = DIRS[fl.d], above = m.cols[fl.c - dz * N - dx][0];
        assert.ok(fl.top > fl.bot && below.fluid && below.surf === fl.bot && above.fluid && above.surf === fl.top, `${k}: a fall`);
      }
      // portals: the gate only in the gate's tile, the spawn only in the start's
      assert.deepEqual(m.portals.filter(p => p.kind === 'side').map(p => p.dir), k === t.gate ? [t.exit] : []);
      assert.equal(m.portals.filter(p => p.kind === 'spawn').length, k === t.start ? 1 : 0);
      assert.equal(m.portals.length, (k === t.gate) + (k === t.start));
      for (const f of m.floors) if (f.fluid) assert.ok(f.top < f.surf && f.surf - f.top <= 2 && f.top >= 0);
      // the ground: two dry floors joined where they meet (a slope), never over a wall
      for (const f of m.floors) for (const d of [0, 2]) {
        const g = m.floors.find(g => g.x === f.x + DIRS[d][0] && g.z === f.z + DIRS[d][1]);
        if (!g || f.fluid || g.fluid) continue;
        const step = Math.max(...EDGE_CORNERS[d].map((c, i) => Math.abs(f.cs[c] - g.cs[EDGE_CORNERS[d ^ 1][i]])));
        if (f.link[d] === g) assert.ok(step < .01, `${k} ${f.x},${f.z} side ${d}`);
        if (step > .29) assert.notEqual(f.link[d], g);
      }
      if (m.town.tile.name === 'garden') assert.ok(m.floors.filter(f => f.fluid && f.surf - f.top === 2).length >= 4, 'the lake, deep in its middle');
      for (const p of m.authoredProps) if ([...BUILDINGS, ...MERCHANTS].some(b => b.name === p.name) || isHome(p.name)) {
        if (!isHome(p.name)) { assert.ok(!placed.has(p.name), p.name + ' twice'); placed.set(p.name, k); }
        assert.ok(quarterTurn(p.yaw), 'buildings stand on the grid');
        if (!isHome(p.name)) assert.equal(p.y, m.town.level * LH);
      }
      // the town stands level: its buildings at the row's level, each home at its own, its people, the
      // crash, the portal; its ways without a step (level, or a ramp)
      for (const b of m.occluders.filter(b => b.shape === 'box' && ([...BUILDINGS, ...MERCHANTS].some(q => q.name === b.name) || isHome(b.name)))) {
        // (a home's door is where a ramp meets it: its middle level)
        const y = isHome(b.name) ? b.bottom : m.town.level * LH, e = isHome(b.name) ? .6 : .1;
        for (let x = b.x0 + e; x < b.x1 - e + .01; x += .4) for (let z = b.z0 + e; z < b.z1 - e + .01; z += .4)
          assert.ok(Math.abs(groundOf(m, x, z) - y) < (isHome(b.name) ? .02 : 1e-9), `${k}: ${b.name} at ${x}, ${z}`);
      }
      for (const path of m.town.paths) for (const [i, b] of path.points.slice(1).entries()) for (let t = 0; t < 1; t += .05) {
        const a = path.points[i], at = t => [Math.min(N - .01, Math.max(0, a[0] + (b[0] - a[0]) * t)), Math.min(N - .01, Math.max(0, a[1] + (b[1] - a[1]) * t))];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const wet = [at(t), at(t + .05)].some(([x, z]) => m.cols[Math.floor(z) * N + Math.floor(x)][0].fluid);
        assert.ok(wet || Math.abs(groundOf(m, ...at(t)) - groundOf(m, ...at(t + .05))) <= 1.2 * len * .05 + .02, `${k}: a step on a path at ${at(t)}`);
      }
      for (const q of [...m.villagers, ...Object.values(m.relics), ...m.town.portal ? [m.town.portal] : []]) assert.ok(level(m, q.x, q.z));
      const boxes = m.occluders.filter(b => b.shape === 'box');
      for (const box of boxes) {
        assert.ok(box.x0 > 0 && box.z0 > 0 && box.x1 < N && box.z1 < N);
        for (const other of boxes) if (box.name !== other.name) assert.equal(overlaps(box, other), false, `${box.name}/${other.name}`);
        for (const c of m.town.water) assert.equal(containsXZ(box, c % N + .5, Math.floor(c / N) + .5), false);
      }
      for (const p of m.town.frontages) assert.equal(m.safe[Math.floor(p.z) * N + Math.floor(p.x)], 1, p.name);
      for (const p of ENEMY_PROFILES) assert.deepEqual(enemySpots(m, p), []);
      checkWalkingRoutes(m); checkStraightPaths(m);
      assert.ok(m.occluders.filter(b => b.shape === 'ellipsoid').every(b => b.top > b.bottom && b.bottom > groundOf(m, b.x, b.z) + 1.5));
      assert.deepEqual(signature(m), signature(new World(seed).cube(k).map));
    }
    assert.deepEqual([...placed.keys()].sort(), [...BUILDINGS, ...MERCHANTS].map(b => b.name).sort());
    for (const b of [...BUILDINGS, ...MERCHANTS]) assert.equal(placed.get(b.name), t.at(...b.tile), b.name);
    const trees = tilesOf(w).flatMap(({ m }) => m.town.placements.filter(p => /tree/.test(p.name)));
    assert.ok(trees.length >= 100, `${trees.length} trees`);
    // (the grove's big trees: in every town some of them, their kinds as its wood has them)
    const grove = new Set(trees.filter(p => p.name.startsWith('town_tree_')).map(p => p.name));
    assert.ok(grove.size >= 1);
    for (const name of grove) groveKinds.add(name);
    // (as many as there is room for: fewer where the land's set pieces take it, the gorge, a mill)
    const homes = tilesOf(w).flatMap(({ m }) => m.town.placements.filter(p => isHome(p.name)));
    assert.ok(homes.length >= 2, `${homes.length} homes`);
    allHomes += homes.length;
  }
  assert.ok(allHomes >= 40 * 5, `${allHomes / 40} homes a town`);
  assert.equal(groveKinds.size, 3);
});

test('the seams: flat faces, no glass or portal, nothing standing near, walkable all along, and walked across', () => {
  for (let seed = 0; seed < 24; seed++) {
    const w = new World(seed);
    for (const { k, m } of tilesOf(w)) {
      assert.deepEqual(m.seams, DIRS.map((_, d) => isTown(step(k, d), seed)));
      for (let d = 0; d < 4; d++) {
        if (!m.seams[d]) continue;
        const f = w.faces.get(faceKey(k, d));
        assert.ok([...f.profile].every(h => h === TOWN_LEVEL));
        assert.equal(f.portal, null); assert.equal(f.river, null); assert.equal(f.spout, null);
        // the cells along it: reached, and nothing stands within reach of a body crossing (the
        // physics knows only one tile at a time, docs/town.md); but on the wall and outside it, where
        // the wall runs on across the seam and nobody walks (world/townland.js)
        for (let t = 0; t < N; t++) {
          const along = [d < 2 ? 0 : t + .5, d < 2 ? t + .5 : 0];
          const at = s => [d === 0 ? N - s : d === 1 ? s : along[0], d === 2 ? N - s : d === 3 ? s : along[1]];
          const [ex, ez] = at(.5), c = Math.floor(ez) * N + Math.floor(ex);
          if (m.town.wallSide[c]) continue;
          assert.equal(m.safe[c], 1, `${seed} ${k} side ${d}: ${ex}, ${ez} reached`);
          for (const s of [0, .25, .5]) {
            const [x, z] = at(s);
            assert.ok(!m.staticBlockers.flat().some(b => containsXZ(b, x, z, CHAR_R + .2)), `${seed} ${k} side ${d}: something stands at ${x}, ${z}`);
          }
        }
      }
    }
  }
  // past a seam the ground goes on as the tile beyond has it (physics/collide.js: the sides walked
  // across, game/handover.js), as the edge's on this side; past an outer side it is solid as
  // anywhere outside
  const w = new World(3), t = townOf(3), k11 = t.at(1, 1), m = state.map = w.cube(k11).map;
  assert.deepEqual(m.seams, [true, true, true, true]);
  setAcross(m, DIRS.map((_, d) => w.cube(step(k11, d)).map));
  for (const [x, z] of [[N + .4, 8.2], [-.4, 8.2], [8.2, N + .4], [8.2, -.4]]) {
    assert.equal(cellAt(x, z), -1, 'a cell of this tile only');
    // (as the cell on this side, which is as the one beyond)
    const ex = Math.min(N - .01, Math.max(.01, x)), ez = Math.min(N - .01, Math.max(.01, z)), y = groundOf(m, ex, ez);
    assert.ok(Math.abs(groundAt(x, z, y + .1, .3).h - y) < 1e-9);
  }
  // across every seam the ground goes on as it is: the two tiles' edge cells alike
  for (const { k, m: a } of tilesOf(w)) for (let d = 0; d < 4; d++) {
    if (!a.seams[d]) continue;
    const b = w.cube(step(k, d)).map;
    for (let i = 0; i < N; i++) {
      const [ax, az] = [[N - 1, i], [0, i], [i, N - 1], [i, 0]][d], [bx, bz] = [[0, i], [N - 1, i], [i, 0], [i, N - 1]][d];
      const fa = a.cols[az * N + ax][0], fb = b.cols[bz * N + bx][0];
      assert.equal(!!fa.fluid, !!fb.fluid, `${k} side ${d} at ${i}`);
      if (!fa.fluid) assert.deepEqual([...fa.cs].sort(), [...fb.cs].sort(), `${k} side ${d} at ${i}`);
    }
  }
  assert.equal(groundAt(N + 1.5, 8.2, 99, 0).h, -Infinity, 'not further than a cell');
  assert.equal(groundAt(N + .4, N + .4, 99, 0).h, -Infinity, 'not past a corner');
  const k00 = t.at(0, 0), corner = state.map = w.cube(k00).map;
  setAcross(corner, DIRS.map((_, d) => corner.seams[d] ? w.cube(step(k00, d)).map : null));
  const out = [0, 1, 2, 3].find(d => !corner.seams[d]), [ox, oz] = [[N + .4, 8], [-.4, 8], [8, N + .4], [8, -.4]][out];
  assert.ok(insideSolid(ox, oz, 1) && groundAt(ox, oz, 99, 0).h === -Infinity, 'past the hull: solid');
  // a body at the middle of a seam steps across it
  state.map = m;
  setAcross(m, DIRS.map((_, d) => w.cube(step(k11, d)).map));
  player.x = N - .5; player.z = STREET; player.support = m.cols[Math.floor(STREET) * N + N - 1][0];
  player.y = player.visY = groundOf(m, player.x, player.z);
  assert.equal(canMove(N + .3, STREET, 'x', 1), true);
  setAcross(null);
  assert.equal(canMove(N + .3, STREET, 'x', 1), false, 'not while the side is not walked across');
});

test('only the gate joins the town to what lies round it; inside, every seam opens once known', () => {
  for (let seed = 0; seed < 16; seed++) {
    const w = new World(seed), t = townOf(seed), run = createRun(), cubes = new Map();
    const add = k => cubes.set(k, { key: k, visits: 1, map: w.cube(k).map });
    for (const k of t.keys) { add(k); for (let d = 0; d < 4; d++) if (w.layout(0).exists.has(step(k, d))) add(step(k, d)); }
    run.unlockedGates.add('intro:sword');
    for (const k of t.keys) {
      const open = discoveredFaces(cubes, cubes.get(k), run);
      for (let d = 0; d < 4; d++) {
        const n = step(k, d);
        if (!cubes.has(n)) continue;
        assert.equal(open.includes(faceKey(k, d)), isTown(n, seed) || (k === t.gate && d === t.exit), `${seed} ${k} side ${d}`);
      }
    }
  }
});

test('the gate\'s face and the road\'s edges are flat, even when the road is made first', () => {
  for (let seed = 0; seed < 24; seed++) for (const first of [true, false]) {
    const w = new World(seed), t = townOf(seed), roadKey = step(t.gate, t.exit);
    const road = first ? w.cube(roadKey).map : null;
    const gate = w.cube(t.gate).map, neighbour = road || w.cube(roadKey).map;
    assert.deepEqual(signature(gate), signature(new World(seed).cube(t.gate).map));
    const face = w.faces.get(faceKey(t.gate, t.exit));
    assert.ok([...face.profile].every(h => h === TOWN_LEVEL));
    assert.equal(face.river, null); assert.equal(face.spout, null);
    const nd = t.exit ^ 1;
    for (const f of neighbour.floors) if (f.layer === 0 && [f.x === N - 1, f.x === 0, f.z === N - 1, f.z === 0][nd])
      for (const c of EDGE_CORNERS[nd]) assert.equal(f.cs[c], TOWN_LEVEL * LH);
    const portal = neighbour.portals.find(p => p.dir === nd);
    assert.equal(portal.layer, 0); assert.equal(portal.y, gate.portals[0].y);
    assert.equal(neighbour.town, undefined); assert.equal(neighbour.enemyFree, false);
  }
});

test('the town portal\'s spot: dry, reachable and uncluttered, in the plaza\'s tile', () => {
  const ends = new Set();
  for (let seed = 0; seed < 80; seed++) {
    const w = new World(seed), t = townOf(seed), m = state.map = w.cube(t.portal).map, at = m.town.portal;
    for (const k of t.keys) if (k !== t.portal) assert.equal(w.cube(k).map.town.portal, undefined, 'only the plaza has one');
    const cell = Math.floor(at.z) * N + Math.floor(at.x);
    ends.add(t.exit);
    assert.equal(at.y, m.town.level * LH);
    assert.deepEqual([at.x, at.z].map(v => +v.toFixed(6)), rotateTownPoint(...TOWN_PORTAL_SPOT, m.town.yaw).map(v => +v.toFixed(6)));
    assert.equal(m.safe[cell], 1, 'reachable');
    assert.ok(!m.occluders.filter(b => b.shape !== 'ellipsoid').some(b => containsXZ(b, at.x, at.z, 1.1)));
    assert.ok(!new Set(m.staticBlockers.flat()).values().some(b => containsXZ(b, at.x, at.z, 1)));
    assert.ok(!m.town.placements.some(p => !p.name.startsWith('town_') && Math.hypot(p.x - at.x, p.z - at.z) < 1.1), 'nothing stands on it');
  }
  assert.deepEqual([...ends].sort(), [0, 1, 2, 3]);
});

// Where a body of CHAR_R can walk to from the first route's start, on a grid of steps of .1
// across the cube; near(x, z, r): somewhere within r of (x, z) is reached.
function walkable(m) {
  const S = 10, W = N * S, clear = new Uint8Array(W * W), seen = new Uint8Array(W * W);
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
    const x = (i + .5) / S, z = (j + .5) / S, cx = Math.floor(x), cz = Math.floor(z);
    if (m.cols[cz * N + cx][0].fluid) continue;
    let ok = true;
    for (let dz = -1; ok && dz <= 1; dz++) for (let dx = -1; ok && dx <= 1; dx++) {
      const c = (cz + dz) * N + cx + dx;
      if (cx + dx >= 0 && cz + dz >= 0 && cx + dx < N && cz + dz < N && m.staticBlockers[c].some(b => containsXZ(b, x, z, CHAR_R))) ok = false;
    }
    clear[j * W + i] = ok;
  }
  // (from where every route starts: the tile's seams, its spawn)
  const queue = [...new Set(m.routes.map(r => Math.floor(r[0].z * S) * W + Math.floor(r[0].x * S)))].filter(k => clear[k]);
  for (const k of queue) seen[k] = 1;
  while (queue.length) {
    const k = queue.pop(), i = k % W, j = (k - i) / W;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj, n = nj * W + ni;
      if (ni >= 0 && nj >= 0 && ni < W && nj < W && clear[n] && !seen[n]) { seen[n] = 1; queue.push(n); }
    }
  }
  return (x, z, r) => {
    for (let j = Math.max(0, Math.floor((z - r) * S)); j < Math.min(W, Math.ceil((z + r) * S)); j++)
      for (let i = Math.max(0, Math.floor((x - r) * S)); i < Math.min(W, Math.ceil((x + r) * S)); i++)
        if (seen[j * W + i] && Math.hypot((i + .5) / S - x, (j + .5) / S - z) <= r) return true;
    return false;
  };
}

test('villagers stand at their trades, as colliders, dressed and within reach', () => {
  for (let seed = 0; seed < 40; seed++) {
    const w = new World(seed), all = [];
    for (const { m } of tilesOf(w)) {
      state.map = m;
      const placed = m.town.placements;
      const want = VILLAGERS.filter(v => placed.some(p => p.name === v.at));
      assert.deepEqual(m.villagers.map(v => v.name).sort(), want.map(v => v.name).sort(), m.key);
      assert.deepEqual(structuredClone(m.villagers), m.villagers, 'the worker hands them over whole');
      for (const v of m.villagers) {
        all.push(v.name);
        const spec = VILLAGERS.find(s => s.name === v.name), home = placed.find(p => p.name === spec.at);
        assert.equal(v.y, m.town.level * LH);
        assert.ok(v.x > .5 && v.z > .5 && v.x < N - .5 && v.z < N - .5, v.name);
        assert.ok(Math.abs(Math.hypot(v.x - home.x, v.z - home.z) - Math.hypot(spec.x, spec.z)) < 1e-9, 'beside their building');
        assert.ok(Math.abs(Math.sin(v.yaw - home.yaw - spec.facing)) < 1e-9 && Math.cos(v.yaw - home.yaw - spec.facing) > 0);
        assert.equal(m.cols[Math.floor(v.z) * N + Math.floor(v.x)][0].fluid, 0, 'on dry ground');
        assert.deepEqual(outfitOf(v.outfit), outfitOf(spec.outfit));
        assert.equal(v.tint, spec.tint);
        const own = 'villager_' + v.name;
        assert.ok(m.staticBlockers[Math.floor(v.z) * N + Math.floor(v.x)].some(b => b.name === own && b.r === VILLAGER_R));
        assert.equal(blockedAt(v.x, v.z, v.y, .1), true);
        assert.ok(!new Set(m.staticBlockers.flat()).values().some(b => b.name !== own && containsXZ(b, v.x, v.z, VILLAGER_R - .05)), v.name);
        for (const other of m.villagers) if (other !== v) assert.ok(Math.hypot(other.x - v.x, other.z - v.z) > 2 * VILLAGER_R + .1);
        assert.ok(walkable(m)(v.x, v.z, VILLAGER_R + CHAR_R + .2), `${v.name} can be walked up to`);
      }
    }
    assert.deepEqual(all.sort(), VILLAGERS.map(v => v.name).sort());
  }
  for (const v of VILLAGERS) for (const id of v.outfit) assert.ok(ITEMS[id]?.slot, id);
  assert.deepEqual(VILLAGERS.map(v => v.outfit.length), [1, 1, 3, 1, 1, 2]);
});

function checkClutter(m, min) {
  const plan = m.town, water = new Set(plan.water);
  // (the wall and the garlands: checked on their own, below)
  const clutter = plan.placements.filter(p => !p.name.startsWith('town_tree_') && ![...BUILDINGS, ...MERCHANTS].some(b => b.name === p.name) && !isHome(p.name)
    && !isWall(p.name) && !isMill(p.name) && propMetadata.get(p.name)?.attach !== 'line');
  assert.ok(clutter.length >= min, `only ${clutter.length} clutter props`);
  // Oriented footprints: the axis-aligned collider envelopes have empty corners.
  const footprints = [...[...BUILDINGS, ...MERCHANTS].flatMap(b => plan.placements.filter(p => p.name === b.name)
    .map(p => ({ p, bounds: b.bounds }))), ...plan.placements.filter(p => isHome(p.name)).map(p => ({ p, bounds: propMetadata.get(p.name).bounds }))];
  const inside = (x, z) => footprints.some(({ p, bounds: [x0, z0, x1, z1] }) => {
    const dx = x - p.x, dz = z - p.z, c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return lx > x0 && lx < x1 && lz > z0 && lz < z1;
  });
  for (const p of clutter) {
    const meta = propMetadata.get(p.name), c = Math.floor(p.z) * N + Math.floor(p.x);
    assert.ok(meta, p.name); if (meta.attach !== 'lip') assert.equal(meta.attach === 'water', water.has(c), p.name);
    assert.ok(p.x > 0 && p.z > 0 && p.x < N && p.z < N);
    // on the ground: on the water, lying on it, or standing sunk to its lowest under it
    const g = groundOf(m, p.x, p.z);
    if (meta.attach === 'water') assert.equal(p.y, m.cols[c][0].surf * LH);
    else if (meta.attach === 'lip') {
      const round = [-1, 0, 1].flatMap(dz => [-1, 0, 1].map(dx => m.cols[Math.min(N - 1, Math.max(0, Math.floor(p.z) + dz)) * N + Math.min(N - 1, Math.max(0, Math.floor(p.x) + dx))][0]));
      assert.ok(round.some(f => f.cs.some(h => Math.abs(h - p.y) < 1e-6)) && p.y < 15, p.name);
      continue;
    }
    else if (p.normal || meta.cover || meta.height < .2) assert.ok(Math.abs(p.y - g - .008) < .01, p.name);
    else assert.ok(p.y <= g - .015 && p.y > g - 1, `${p.name} at ${p.y} over ${g}`);
    assert.ok(!inside(p.x, p.z), p.name + ' inside a building');
    if (meta.light) assert.equal(p.night, true, 'the lamps are lit at night only');
    if (meta.blocking) {
      const bodies = m.staticBlockers[c].filter(b => b.name === p.name && (b.shape === 'box' ? containsXZ(b, p.x, p.z) : b.x === p.x && b.z === p.z));
      assert.ok(bodies.length, p.name + ' needs a collider');
      // and off the seams by SEAM_CLEAR (but outside the wall, where nobody walks)
      if (m.town.wallSide[c] === 2) continue;
      for (const b of bodies) {
        const [x0, z0, x1, z1] = b.shape === 'box' ? [b.x0, b.z0, b.x1, b.z1] : [b.x - b.r, b.z - b.r, b.x + b.r, b.z + b.r];
        const gap = Math.min(...[0, 1, 2, 3].filter(d => m.seams[d]).map(d => [N - x1, x0, N - z1, z0][d]));
        assert.ok(gap >= SEAM_CLEAR - 1e-6, `${p.name} ${gap} from a seam`);
      }
    }
  }
}

test('the tiles are dressed with varied clutter that stays off paths, water, buildings and seams', () => {
  const seen = new Set();
  for (let seed = 0; seed < 16; seed++) {
    const w = new World(seed), tiles = tilesOf(w);
    for (const { m } of tiles) checkClutter(m, 50);
    const names = new Set(tiles.flatMap(({ m }) => m.town.placements.map(p => p.name.replace(/_[ab]$/, ''))));
    assert.ok(names.size >= 30, 'clutter must be varied');
    const garden = tiles.find(({ m }) => m.town.tile.name === 'garden').m;
    for (const name of ['town_garden_bed_', 'town_flower_pots_', 'town_street_lamp_', 'darkforest_dark_fir_tree_', 'peaks_expedition_camp_a', 'highlands_nomad_tent_a'])
      assert.ok(tiles.some(({ m }) => m.town.placements.some(p => p.name.startsWith(name))), name);
    for (const p of tiles.flatMap(({ m }) => m.town.placements)) seen.add(p.name.replace(/_[ab]$/, ''));
    assert.ok(garden.town.placements.some(p => p.name.startsWith('meadow_lily_pads_')));
    assert.ok(garden.town.placements.some(p => p.name.startsWith('meadow_cattails_') || p.name.startsWith('any_shore_stones_')));
    for (const [tile, prop] of [['camp', 'relics_old_campfire_'], ['windmill', 'meadow_windmill_'], ['green', 'town_well_']])
      assert.ok(tiles.find(({ m }) => m.town.tile.name === tile).m.town.placements.some(p => p.name.startsWith(prop)), `${tile}: ${prop}`);
  }
  // the homes' yards and the street's things, somewhere in all of them
  for (const name of ['town_fence', 'town_garden_bed', 'town_laundry_line', 'town_market_stall',
    'town_planter', 'town_cottage']) assert.ok([...seen].some(n => n.startsWith(name)), name);
});

test('the street runs from the gate over the water and up the cliff\'s stair to the green, and paths lead to every frontage', () => {
  for (let seed = 0; seed < 4; seed++) {
    const w = new World(seed), t = townOf(seed);
    for (const { m } of tilesOf(w)) for (const p of m.town.frontages) assert.ok(m.town.paths.some(path => {
      const end = path.points.at(-1); return Math.hypot(end[0] - p.x, end[1] - p.z) < 1e-6;
    }), p.name);
    for (let j = 0; j < TOWN_DEEP; j++) {
      const m = w.cube(t.at(1, j)).map, local = m.town.paths.map(p => p.points.map(([x, z]) => rotateTownPoint(x, z, -m.town.yaw)));
      const along = z => local.some(pts => pts.some(([x, pz]) => Math.abs(x - STREET) < 1e-6 && Math.abs(pz - z) < 1e-6));
      assert.ok(along(0), `the street in ${j}`);
      // (in the inn's tile onto the quay, and on from the top of the stair up the cliff)
      assert.ok(along(j < TOWN_DEEP - 1 ? N : 8), 'on through the tile, to the green');
      if (j === START_TILE[1]) {
        const stair = m.runs.find(r => r.kind === 'stair' && r.k === INN_STAIR.top - INN_STAIR.foot - 1);
        const land = townLand(seed);
        assert.ok(stair && stair.to.top - stair.from.top === land.upper - land.rows[0], 'the stair up the cliff');
      }
      // (over the water: on its bridges, either side of the pier on the seam)
      if (j === START_TILE[1] - 1 || j === START_TILE[1]) assert.ok(m.runs.some(r => r.kind === 'bridge' && !r.span), 'the street\'s bridge');
    }
  }
});

test('the town\'s stairs, bridges and span hold a walking hero on them: their sides are railed', () => {
  for (let seed = 0; seed < 4; seed++) {
    const w = new World(seed);
    let runs = 0;
    for (const { m } of tilesOf(w)) {
      state.map = m;
      for (const r of m.runs) for (const p of r.pieces) for (const d of r.dx !== 0 ? [2, 3] : [0, 1]) {
        const x = p.c % N, z = Math.floor(p.c / N), [dx, dz] = DIRS[d];
        if (x + dx < 0 || z + dz < 0 || x + dx >= N || z + dz >= N) continue;   // (the cube's bound holds it there)
        const y = runY(p, .5, .5);
        Object.assign(player, { x: x + .5, z: z + .5, y, visY: y, h: .85, r: CHAR_R, grounded: true, swimming: false, support: p });
        for (let k = 1; k <= 20; k++) {
          const nx = x + .5 + dx * k * .05, nz = z + .5 + dz * k * .05;
          if (!canMove(nx, nz, dx ? 'x' : 'z', dx || dz)) break;
          player.x = nx; player.z = nz;
        }
        assert.ok(Math.floor(player.x) === x && Math.floor(player.z) === z, `${m.key}: off the side ${d} of a ${r.kind} at ${x}, ${z}`);
      }
      runs += m.runs.length;
    }
    assert.ok(runs > 0);
  }
});

test('a wall rings the town a few cells in from its sides, the forest outside it; its gate lets the street in', () => {
  for (let seed = 0; seed < 8; seed++) {
    const w = new World(seed), t = townOf(seed), land = townLand(seed), { W, D } = land;
    let gatehouses = 0, towers = 0;
    for (const { k, i, j, m } of tilesOf(w)) {
      const toCube = (gx, gz) => rotateTownPoint(gx - i * N + .5, gz - j * N + .5, m.town.yaw).map(Math.floor);
      const walls = m.town.placements.filter(p => isWall(p.name) && p.name !== 'town_gatehouse_a');
      for (let lz = 0; lz < N; lz++) for (let lx = 0; lx < N; lx++) {
        const gx = i * N + lx, gz = j * N + lz, [cx, cz] = toCube(gx, gz), c = cz * N + cx, side = land.wall.side(gx, gz);
        assert.equal(m.town.wallSide[c], side);
        assert.equal(side, gx < WALL || gz < WALL || gx >= W - WALL || gz >= D - WALL ? 2 : gx === WALL || gz === WALL || gx === W - 1 - WALL || gz === D - 1 - WALL ? 1 : 0);
        const here = walls.filter(p => Math.floor(p.x) === cx && Math.floor(p.z) === cz);
        if (side !== 1 || land.wall.gateAt(gx, gz)) { assert.equal(here.length, 0); continue; }
        // a piece of it on each of its cells: an arch over the water, a tower where the land has one
        assert.equal(here.length, 1, `${seed} ${k}: the wall at ${gx}, ${gz}`);
        const [p] = here, f = m.cols[c][0], meta = propMetadata.get(p.name);
        if (land.wall.towers.has(gz * W + gx)) { assert.ok(p.name.startsWith('town_wall_tower_')); towers++; }
        else if (f.fluid) { assert.ok(p.name.startsWith('town_wall_arch_')); assert.ok(Math.abs(p.y - (f.surf * LH - meta.foot)) < 1e-9); }
        else { assert.ok(/^town_wall_(a|b|lantern_a)$/.test(p.name), p.name); assert.ok(Math.abs(p.y - (Math.min(...f.cs) - meta.foot + .02)) < 1e-9); }
        // (it stands in the way, its footing in the ground, lit at night where it has a lantern)
        const g = f.fluid ? f.surf * LH : groundOf(m, p.x, p.z);
        assert.ok(p.y < g - .5 && p.y + meta.height > g + 1.8, `${p.name} at ${p.y} over ${g}`);
        assert.ok(m.staticBlockers[c].some(b => b.name === p.name && containsXZ(b, p.x, p.z)), `${p.name} stands in the way`);
        assert.equal(!!p.night, !!meta.light);
        assert.ok(quarterTurn(p.yaw));
      }
      // nobody walks outside it but on the road to the gate
      for (let c = 0; c < N * N; c++) if (m.town.wallSide[c] === 2 && m.safe[c]) {
        assert.equal(k, t.gate, `${seed} ${k}: outside the wall at ${c % N}, ${Math.floor(c / N)} reached`);
        const [lx] = rotateTownPoint(c % N + .5, Math.floor(c / N) + .5, -m.town.yaw);
        assert.ok(Math.abs(lx - STREET) < 2.6, `${seed} ${k}: off the road outside the gate`);
      }
      // the forest outside it: close
      const out = [...m.town.wallSide].filter((s, c) => s === 2 && !m.cols[c][0].fluid).length, trees = m.town.placements.filter(p => /tree/.test(p.name) && m.town.wallSide[Math.floor(p.z) * N + Math.floor(p.x)] === 2).length;
      if (out > 30) assert.ok(trees >= out / 4, `${seed} ${k}: ${trees} trees on ${out} cells outside the wall`);
      gatehouses += m.town.placements.filter(p => p.name === 'town_gatehouse_a').length;
      if (k === t.gate) {
        const g = m.town.placements.find(p => p.name === 'town_gatehouse_a'), [gx, gz] = rotateTownPoint(STREET, WALL + .5, m.town.yaw);
        assert.ok(Math.hypot(g.x - gx, g.z - gz) < 1e-6, 'the gatehouse over the street');
      }
    }
    assert.equal(gatehouses, 1);
    assert.ok(towers >= 8, `${towers} towers`);
    for (const [x, z] of [[WALL, WALL], [W - 1 - WALL, WALL], [WALL, D - 1 - WALL], [W - 1 - WALL, D - 1 - WALL]]) assert.ok(land.wall.towers.has(z * W + x), 'a tower at each corner');
  }
});

test('garlands hang from pole to pole over the streets, a head\'s room over the ground, lit at night', () => {
  let strings = 0;
  for (let seed = 0; seed < 4; seed++) {
    const w = new World(seed);
    for (const { m } of tilesOf(w)) {
      const segments = m.town.placements.filter(p => propMetadata.get(p.name)?.attach === 'line');
      for (const p of segments) {
        assert.ok(p.name.startsWith('town_garland_') && p.matrix?.length === 16 && p.night);
        // (its cord from its start along the matrix's X: over the ground all along)
        const [dx, dy, dz] = p.matrix, [ax, ay, az] = p.matrix.slice(12, 15);
        for (const t of [0, .5, 1]) {
          const x = ax + dx * t, z = az + dz * t;
          assert.ok(x > 0 && z > 0 && x < N && z < N);
          assert.ok(ay + dy * t - .2 - groundOf(m, x, z) >= CHAR_H + .65, 'a head\'s room under it');
        }
      }
      strings += new Set(segments.map(p => `${p.x},${p.z}`)).size;
      // (half of their bulbs give light)
      if (segments.length) assert.ok(segments.some(p => p.unlit) && segments.some(p => !p.unlit));
      assert.ok(!segments.length || m.town.placements.some(p => p.name.startsWith('town_garland_pole_')));
    }
  }
  assert.ok(strings >= 20, `${strings} garlands`);
});

test('path ribbons are grid-aligned rectangles, stay inside the cube, and never pave over the water', () => {
  for (let seed = 0; seed < 4; seed++) {
    const w = new World(seed);
    for (const { m } of tilesOf(w)) {
      const { pos, nor } = buildCubeGeometry(m)[0].terrain;
      let pathVertices = 0;
      for (let i = 0; i < pos.length; i += 9) {
        // (on the ground, a hair over it)
        // (the ribbon's own: lying on the ground, a hair over it, facing up; a stair's steps aside)
        if (nor[i + 1] <= .5 || [0, 3, 6].some(k => Math.abs(pos[i + k + 1] - groundOf(m, Math.min(N - .001, pos[i + k]), Math.min(N - .001, pos[i + k + 2])) - .012) > 1e-4)) continue;
        pathVertices += 3;
        for (let j = i; j < i + 9; j += 3) assert.ok(pos[j] >= 0 && pos[j] <= N && pos[j + 2] >= 0 && pos[j + 2] <= N);
        const xs = new Set([pos[i], pos[i + 3], pos[i + 6]].map(v => v.toFixed(4)));
        const zs = new Set([pos[i + 2], pos[i + 5], pos[i + 8]].map(v => v.toFixed(4)));
        assert.ok(xs.size <= 2 && zs.size <= 2, 'path quads are axis-aligned');
        const x = (pos[i] + pos[i + 3] + pos[i + 6]) / 3, z = (pos[i + 2] + pos[i + 5] + pos[i + 8]) / 3;
        assert.equal(m.cols[Math.min(N - 1, Math.floor(z)) * N + Math.min(N - 1, Math.floor(x))][0].fluid, 0);
      }
      if (m.town.paths.length) assert.ok(pathVertices >= 6);
    }
  }
});

test('the town alone has no enemies: the road has them from the room past its gate', () => {
  let hostilePopulation = 0;
  for (let seed = 0; seed < 16; seed++) {
    const w = new World(seed), t = townOf(seed);
    for (const k of t.keys) assert.equal(enemyFreeAt(k, seed), true);
    const rock = step(t.gate, t.exit), outside = state.map = w.cube(w.layout(0).route[2]).map;
    assert.equal(enemyFreeAt(rock, seed), false);
    assert.equal(w.cube(rock).map.enemyFree, false);
    assert.equal(outside.enemyFree, false);
    for (const p of ENEMY_PROFILES) hostilePopulation += enemySpots(outside, p).length;
    assert.equal(w.cube(t.start).map.enemyFree, true);
  }
  for (const k of ['0,-1,0', '1,-1,1']) assert.equal(enemyFreeAt(k, 0), false);
  assert.ok(hostilePopulation > 0);
});

test('building boxes collide in every covered cell; canopy occlusion is separate from trunk collision', () => {
  const w = new World(3), t = townOf(3), m = state.map = w.cube(t.houses.town_inn_a).map, y = m.town.level * LH;
  Object.assign(player, { y, visY: y, h: .85, r: CHAR_R, grounded: true, swimming: false });
  const box = m.occluders.find(b => b.name === 'town_inn_a');
  for (let x = box.x0 + .1; x < box.x1; x += .7) for (let z = box.z0 + .1; z < box.z1; z += .7) {
    assert.equal(blockedAt(x, z, y, .3), true);
    assert.equal(insideSolid(x, z, y + .5), true);
    assert.equal(ceilingAt(x, z, y - .1), y);
  }
  checkWalkingRoutes(m);
  // (a crown with nothing else standing under it where it is probed, a side of its trunk inside the
  // cube: woods grow close; in the first of the town's tiles that has one)
  const probes = b => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => [b.x + dx * b.rx * .8, b.z + dz * b.rx * .8]).filter(([x, z]) => x > 0 && z > 0 && x < N && z < N);
  let edge, crown, cx, cz;
  for (const k of t.keys) {
    const tile = w.cube(k).map, clear = ([x, z]) => !tile.staticBlockers.flat().some(c => containsXZ(c, x, z, .05));
    for (const b of tile.occluders) if (!crown && b.shape === 'ellipsoid') { const p = probes(b).find(clear); if (p) { edge = tile; crown = b; [cx, cz] = p; } }
    if (crown) break;
  }
  state.map = edge;
  assert.equal(viewBlockedAt(edge, crown.x, crown.y, crown.z), true);
  assert.ok(mapInfo(edge).top > Math.max(...edge.occluders.map(b => b.top)));
  assert.equal(insideSolid(cx, cz, groundOf(edge, cx, cz) + .5), false, 'only the trunk stands in the way');
});

const glb = file => readGlb(resolve(assets, file)).json;

test('authored building footprint boxes contain the actual exported assets', () => {
  for (const b of [...BUILDINGS, ...MERCHANTS]) {
    const j = glb(`town/${b.name}.glb`), i = roots(j)[0], { min, max } = rootBounds(j, i);
    assert.equal(j.nodes[i].name, b.name);
    assert.ok(min[0] >= b.bounds[0] && min[2] >= b.bounds[1] && max[0] <= b.bounds[2] && max[2] <= b.bounds[3]);
    assert.ok(max[1] <= b.height);
  }
});
test('grove assets have flat coloured geometry, ground pivots and explicit trunk metadata', () => {
  const j = glb('town_trees.glb');
  assert.equal(j.scenes[j.scene || 0].nodes.length, 3);
  assert.equal(j.images?.length || 0, 0); assert.equal(j.animations?.length || 0, 0);
  for (const i of j.scenes[j.scene || 0].nodes) {
    const n = j.nodes[i], e = n.extras;
    assert.ok(n.name.startsWith('town_tree_')); assert.equal(e.attach, 'ground');
    assert.ok(e.trunk_radius > .1 && e.trunk_radius < .4 && e.radius > e.trunk_radius);
    const primitives = j.meshes[n.mesh].primitives, { min, max } = rootBounds(j, i);
    assert.ok(Math.abs(min[1]) < 1e-6); assert.ok(max[1] > 6 && max[1] < 7.3);
    for (const p of primitives) {
      assert.ok(p.attributes.COLOR_0 !== undefined && p.attributes.NORMAL !== undefined);
      assert.ok(j.accessors[p.indices].count / 3 < 900);
    }
  }
});

test('every world\'s town lies in a land of its own: the lower town, the water and the upper town half a cube over it, the spans over the lake (and a gorge), the river with its fall, the hill and the hollow with their tents', () => {
  const kinds = new Set(), features = new Map(), rises = new Set();
  let falls = 0, bridges = 0, gorges = 0, lakeSpans = 0, gorgeSpans = 0;
  for (let seed = 0; seed < 12; seed++) {
    const w = new World(seed), land = townLand(seed), tiles = tilesOf(w), { W } = land;
    kinds.add(JSON.stringify([land.hill.tile, land.hollow.tile, land.lake.cells.length, land.spans.map(s => s.top), land.river.length, land.streams.length]));
    for (const f of land.features) features.set(f.kind, (features.get(f.kind) ?? 0) + 1);
    // three bands: the gate's rows, the water across the whole town on the seam between the plaza's
    // row and the inn's (but its pier and the spans' rocks), the upper town half a cube over them
    assert.equal(land.rows[0], TOWN_LEVEL);
    // (half a cube over it, or a little less: the landscape's rise)
    assert.ok(land.upper - TOWN_LEVEL <= UPPER && land.upper - TOWN_LEVEL >= 12);
    rises.add(land.upper - TOWN_LEVEL);
    assert.equal(land.rows.at(-1), land.upper);
    for (const { j, m } of tiles) assert.equal(m.town.level, land.rows[j]);
    const seam = START_TILE[1] * N;
    for (let x = 0; x < W; x++) for (const z of [seam - 1, seam]) assert.ok(land.water(x, z) || land.platforms.has(z * W + x), `the water at ${x}, ${z}`);
    for (let x = 0; x < W; x++) assert.ok((land.water(x, land.edge[x]) || land.gorge.has(land.edge[x] * W + x) || land.level(x, land.edge[x]) >= land.rows.at(-1) - 1) && land.edge[x] > seam, 'the cliff out of the water (but where the river falls, or the gorge goes on)');
    // the cliff: a cliff, not a slope (the generator's own walls)
    const inn = tiles.find(({ i, j }) => i === START_TILE[0] && j === START_TILE[1]).m;
    assert.ok(inn.floors.some(f => !f.fluid && f.link.some((g, d) => !g && inn.floors.some(h => h.x === f.x + DIRS[d][0] && h.z === f.z + DIRS[d][1] && h.top - f.top >= land.upper - TOWN_LEVEL - 2))));
    // the lake's spans: from the upper town's edge over the lake to a rock on the seam, on down to
    // the lower town's shore or past it, a run in each tile; one or two of them
    const lake = land.spans.filter(s => s.kind === 'lake');
    assert.ok(lake.length === 2 || lake.length === 4, `${lake.length / 2} spans over the lake`);
    lakeSpans += lake.length / 2;
    for (let k = 0; k < lake.length; k += 2) {
      const [top, down] = [lake[k], lake[k + 1]];
      assert.ok(top.cells.length >= 5, `${top.cells.length} cells over the lake`);
      assert.equal(Math.floor(top.land / W), seam); assert.equal(Math.floor(down.top / W), seam - 1);
      assert.equal(land.platforms.get(top.land), land.platforms.get(down.top));
      // (over the lake, or a strand at the cliff's foot)
      for (const c of top.cells) assert.ok(land.water(c % W, Math.floor(c / W))?.lake || land.level(c % W, Math.floor(c / W)) === TOWN_LEVEL, 'over the lake');
      assert.ok(Math.floor(down.land / W) <= seam - N + WATER_FROM - 1, 'down on the shore or past it');
    }
    // the gorge: lake water down in the upper town, from the bay on; spans across it, rim to rim
    if (land.gorge.size) {
      gorges++;
      // (its water the lake's; a ledge a level over it in each tile it reaches into, the way out)
      for (const c of land.gorge) assert.ok(land.water(c % W, Math.floor(c / W))?.surf === TOWN_LEVEL - 1 || land.level(c % W, Math.floor(c / W)) === TOWN_LEVEL);
    }
    for (const s of land.spans.filter(s => s.kind === 'gorge')) {
      gorgeSpans++;
      for (const c of s.cells) assert.ok(land.gorge.has(c), 'over the gorge');
      for (const c of [s.top, s.land]) assert.equal(land.level(c % W, Math.floor(c / W)) >= land.upper, true, 'from rim to rim');
    }
    for (const { m } of tiles) for (const r of m.runs) {
      assert.ok(r.pieces.length === r.k && r.pieces.every(p => Number.isFinite(p.y0) && Number.isFinite(p.y1)));
      if (r.kind === 'bridge' && r.span) assert.ok(Math.abs(r.y0 - r.y1) / (r.k + 1) <= 1.5 * LH, 'a span comes down gently');
      if (r.kind === 'bridge' && !r.span) { bridges++; assert.ok(r.pieces.every(p => m.cols[p.c][0].fluid), 'a bridge over the water'); }
    }
    // the hill high over the upper town, a tent on its top; the hollow under the lower, a tent in it
    const at = ([i, j]) => tiles.find(t => t.i === i && t.j === j).m;
    const hill = at(land.hill.tile), hollow = at(land.hollow.tile);
    assert.ok(Math.max(...hill.floors.map(f => Math.max(...f.cs))) >= (land.rows.at(-1) + 3) * LH, 'the hill');
    assert.ok(Math.min(...hollow.floors.map(f => Math.min(...f.cs))) <= (TOWN_LEVEL - 2) * LH, 'the hollow');
    assert.ok(hill.town.placements.some(p => p.name === 'peaks_expedition_camp_a'), 'a tent on the hill');
    assert.ok(hollow.town.placements.some(p => p.name === 'highlands_nomad_tent_a'), 'a tent in the hollow');
    // the river: across the upper town, falling down its cliff into the water (and a stream now
    // and then, into the gorge's head or over the cliff)
    assert.ok(land.lake.cells.length >= 100 && land.river.length >= 8);
    falls += land.falls.length;
    for (const { m } of tiles) for (const f of m.falls) assert.equal(f.top - f.bot, land.upper - TOWN_LEVEL);
  }
  assert.ok(gorges >= 3 && gorges <= 10, `${gorges} gorges in 12 worlds`);
  assert.ok(gorgeSpans >= 3, `${gorgeSpans} spans over a gorge`);
  assert.ok(lakeSpans >= 13, `${lakeSpans} spans over a lake`);
  assert.ok((features.get('stream') ?? 0) >= 4, `${features.get('stream') ?? 0} streams`);
  assert.ok(kinds.size >= 10, `${kinds.size} kinds of land in 12 worlds`);
  assert.ok(falls >= 12, `${falls} falls`);
  assert.ok(rises.size >= 2, `cliffs of ${[...rises]} levels`);
  assert.ok(bridges >= 24, `${bridges} bridges`);
});

test('a mill stands by the river in most worlds, on level ground, its wheel turning in the water beside it', () => {
  let mills = 0;
  const where = new Set();
  for (let seed = 0; seed < 12; seed++) {
    const land = townLand(seed);
    if (!land.mill) continue;
    mills++;
    where.add(`${Math.floor(land.mill.x)},${Math.floor(land.mill.z)}`);
    const w = new World(seed), tiles = tilesOf(w);
    const here = tiles.filter(({ m }) => m.town.placements.some(p => p.name === 'town_watermill_a'));
    assert.equal(here.length, 1, 'one mill, in its tile');
    const m = here[0].m, p = m.town.placements.find(p => p.name === 'town_watermill_a'), q = m.town.placements.find(p => p.name === 'town_waterwheel_a');
    assert.ok(quarterTurn(p.yaw) && q.yaw === p.yaw && p.night);
    // (on its own level ground)
    const meta = propMetadata.get(p.name), body = m.occluders.find(b => b.name === p.name);
    for (let x = body.x0 + .3; x < body.x1 - .3; x += .3) for (let z = body.z0 + .3; z < body.z1 - .3; z += .3)
      if (!m.cols[Math.floor(z) * N + Math.floor(x)][0].fluid) assert.ok(Math.abs(groundOf(m, x, z) - p.y) < .02, `the mill's ground at ${x}, ${z}`);
    assert.ok(meta.height > 3);
    // (its wheel in the river, its foot under the water's surface, its hub on the mill's axle)
    const f = m.cols[Math.floor(q.z) * N + Math.floor(q.x)][0], wheel = propMetadata.get(q.name);
    assert.ok(f.fluid && q.y < f.surf * LH && q.y > f.surf * LH - .5, `the wheel at ${q.y} in water at ${f.surf * LH}`);
    assert.ok(wheel.spin > 0 && Math.abs(q.y + wheel.spin - p.y - .45) < 1e-9);
  }
  assert.ok(mills >= 3, `${mills} mills in 12 worlds`);
  assert.ok(where.size >= 2, 'mills in places of their own');
});

test('old ruins lie in most worlds\' towns, of every kind, on wild ground of their own', () => {
  const kinds = new Set(), tiles = new Set();
  let ruins = 0;
  for (let seed = 0; seed < 12; seed++) {
    const land = townLand(seed), r = land.ruins;
    if (!r) continue;
    ruins++; kinds.add(r.kind); tiles.add(`${Math.floor(r.x / N)},${Math.floor(r.z / N)}`);
    const w = new World(seed), m = tilesOf(w).find(({ i, j }) => i === Math.floor(r.x / N) && j === Math.floor(r.z / N)).m;
    const stones = m.town.placements.filter(p => p.name.startsWith('ruins_'));
    assert.ok(stones.length >= 6, `${seed}: ${stones.length} stones of the ruins`);
    assert.ok(stones.some(p => /temple_gate|colossus_head|collapsed_arch|obelisk/.test(p.name)), `${seed}: what stood there`);
    // (off the homes)
    for (const p of m.town.placements.filter(p => isHome(p.name))) assert.ok(stones.every(s => Math.hypot(s.x - p.x, s.z - p.z) > 1.2));
  }
  assert.ok(ruins >= 6, `${ruins} ruins in 12 worlds`);
  assert.equal(kinds.size, 3);
  assert.ok(tiles.size >= 3, 'in tiles of their own');
});

test('each world\'s town has a style of its own: homes, lanes, trees in the open, hedges, garlands, avenue trees', () => {
  const styles = Array.from({ length: 12 }, (_, s) => townLand(s).style);
  for (const k of ['homes', 'lanes', 'park', 'firs', 'hedges', 'garlands', 'terraces', 'cover']) assert.ok(new Set(styles.map(s => s[k])).size >= 4, k);
  assert.ok(new Set(styles.map(s => [...new Set(s.avenue)].sort().join())).size >= 6, 'avenue trees');
  // (from a dice of its own: the land drawn before it stays as it is)
  assert.deepEqual(townLand(3).style, townLand(3).style);
});

test('each world\'s town has a landscape of its own: its wood, how its woods lie, the forms of its upper and lower town, its cliff, hill and hollow', () => {
  const lands = Array.from({ length: 40 }, (_, s) => townLand(s));
  for (const k of ['wood', 'woodShape', 'upper', 'lower', 'cliff', 'rise', 'hill', 'hollow']) {
    const seen = new Set(lands.map(l => l.landscape[k]));
    assert.ok(seen.size >= ({ wood: 6, woodShape: 4, upper: 5, lower: 6, cliff: 2, rise: 3, hill: 3, hollow: 3 })[k], `${k}: ${[...seen]}`);
  }
  // (the cliff straight or winding; the hollow with a pool at its bottom, a quarry deeper)
  for (const l of lands) {
    const right = l.edge.slice(2 * N + 4, 3 * N - 2);
    if (l.landscape.cliff === 'straight') assert.ok(right.every(z => z === right[0]), `${l.seed}: a straight cliff`);
    const pool = [];
    for (let z = 0; z < l.D; z++) for (let x = 0; x < l.W; x++) if (l.water(x, z)?.pool) pool.push([x, z]);
    assert.equal(pool.length > 0, l.landscape.hollow === 'pond');
    for (const [x, z] of pool) assert.ok(Math.hypot(x + .5 - l.hollow.x, z + .5 - l.hollow.z) < l.hollow.r0);
    if (l.landscape.hollow === 'quarry') assert.ok(l.hollow.bottom <= TOWN_LEVEL - 4);
  }
  // (the forms shape the wild ground: the rugged ones stand higher than the flat ones somewhere; the
  // marsh has ponds, shallow, in the lower town)
  const highest = l => { let h = 0; for (let z = 0; z < l.D; z++) for (let x = 0; x < l.W; x++) if (l.wall.side(x, z) === 0 && !l.water(x, z) && l.formAt(x, z) === l.landscape.upper
    && Math.hypot(x + .5 - l.hill.x, z + .5 - l.hill.z) > l.hill.r1 + 1 && l.pieces.every(p => Math.hypot(x + .5 - p.x, z + .5 - p.z) > p.r1 + 1)) h = Math.max(h, l.level(x, z) - l.upper); return h; };
  let rugged = 0, tall = 0;
  for (const l of lands) {
    // (where its wild ground leaves room for it)
    if (['highland', 'ridge', 'terraces'].includes(l.landscape.upper)) { rugged++; if (highest(l) >= 3) tall++; }
    if (l.landscape.upper === 'plateau') assert.ok(highest(l) <= 1, `${l.seed} plateau: ${highest(l)}`);
    const ponds = [];
    for (let z = 0; z < l.D; z++) for (let x = 0; x < l.W; x++) if (l.water(x, z)?.pond) ponds.push([x, z, l.water(x, z)]);
    assert.equal(ponds.length > 0, l.landscape.lower === 'marsh' && ponds.length > 0);
    for (const [x, z, w] of ponds) { assert.equal(w.surf, TOWN_LEVEL - 1); assert.equal(w.surf - w.bed, 1); assert.ok(z < START_TILE[1] * N); }
  }
  assert.ok(tall >= rugged * .8, `${tall} of ${rugged} rugged towns stand three levels high somewhere`);
  assert.ok(lands.some(l => l.landscape.lower === 'marsh' && l.features.some(f => f.kind === 'marsh')), 'ponds in a marsh');
  // (from a dice of its own)
  assert.deepEqual(townLand(3).landscape, townLand(3).landscape);
});
