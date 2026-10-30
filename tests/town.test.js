import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { assets } from './paths.js';
import { readGlb, rootBounds, roots } from '../tools/glb.mjs';
import { N, LH, CHAR_R, EDGE_CORNERS, DIRS } from '../src/core/constants.js';
import { containsXZ, viewBlockedAt } from '../src/core/blockers.js';
import { World } from '../src/world/world.js';
import { step, faceKey } from '../src/world/coords.js';
import { BUILDINGS, MERCHANTS, TOWN_LEVEL, TOWN_PORTAL_SPOT, TOWN_ACROSS, TOWN_DEEP, VILLAGERS, VILLAGER_R, SEAM_CLEAR, STREET,
  enemyFreeAt, townOf, isTown, rotateTownPoint, TILE_NAMES } from '../src/world/town.js';
import { ITEMS, outfitOf } from '../src/core/items.js';
import { state } from './fixtures.js';
import { ENEMY_PROFILES } from '../src/core/enemies.js';
import { enemySpots } from '../src/game/enemyspawn.js';
import { blockedAt, insideSolid, ceilingAt, cellAt, groundAt } from '../src/physics/collide.js';
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
// the town's tiles of a world: [{ k, i, j, m }]
const tilesOf = w => townOf(w.seed).keys.map(k => ({ k, ...townOf(w.seed).tiles.get(k), m: w.cube(k).map }));

function checkStraightPaths(m) {
  for (const path of m.town.paths) for (const [i, b] of path.points.slice(1).entries()) {
    const a = path.points[i];
    assert.ok(Math.abs(a[0] - b[0]) < 1e-9 || Math.abs(a[1] - b[1]) < 1e-9, 'paths run along the grid');
    for (let t = 0; t <= 1; t += .1) {
      const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      assert.ok(!new Set(m.staticBlockers.flat()).values().some(b => containsXZ(b, x, z, CHAR_R + .03)), 'path must clear bodies and clutter, not just look connected');
      const c = Math.min(N - 1, Math.max(0, Math.floor(z))) * N + Math.min(N - 1, Math.max(0, Math.floor(x)));
      assert.equal(m.cols[c][0].fluid, 0);
    }
  }
}

function checkWalkingRoutes(m) {
  state.map = m;
  Object.assign(player, { y: TOWN_LEVEL * LH, visY: TOWN_LEVEL * LH, h: .85, r: CHAR_R, grounded: true, swimming: false });
  for (const route of m.routes) for (const [i, b] of route.slice(1).entries()) {
    const a = route[i];
    player.x = a.x; player.z = a.z; player.support = m.cols[Math.floor(a.z) * N + Math.floor(a.x)][0];
    for (let t = .1; t <= 1.001; t += .1) {
      const nx = a.x + (b.x - a.x) * t, nz = a.z + (b.z - a.z) * t;
      assert.equal(canMove(nx, nz, a.x === b.x ? 'z' : 'x', Math.sign(b.x - a.x || b.z - a.z)), true);
      player.x = nx; player.z = nz;
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

test('every tile is flat, safe and authored; the buildings, the tents and the pond each in their own tile', () => {
  for (let seed = 0; seed < 40; seed++) {
    const w = new World(seed, { arche: 'chasm' }), t = townOf(seed);   // debug archetypes cannot destroy town
    const placed = new Map();
    for (const { k, i, j, m } of tilesOf(w)) {
      state.map = m;
      assert.equal(m.town.tile.name, TILE_NAMES[j][i]);
      assert.equal(m.K, 1); assert.equal(m.attempts, 1); assert.equal(m.enemyFree, true);
      assert.equal(m.floors.length, N * N); assert.ok(m.cols.every(c => c.length === 1));
      assert.equal(m.falls.length, 0); assert.equal(m.runs.length, 0);
      // portals: the gate only in the gate's tile, the spawn only in the start's
      assert.deepEqual(m.portals.filter(p => p.kind === 'side').map(p => p.dir), k === t.gate ? [t.exit] : []);
      assert.equal(m.portals.filter(p => p.kind === 'spawn').length, k === t.start ? 1 : 0);
      assert.equal(m.portals.length, (k === t.gate) + (k === t.start));
      for (const f of m.floors) {
        if (!f.fluid) assert.deepEqual(f.cs, Array(4).fill(TOWN_LEVEL * LH));
        else { assert.ok(f.top < f.surf && f.surf === TOWN_LEVEL); assert.ok(f.x > 1 && f.x < N - 2 && f.z > 1 && f.z < N - 2); }
      }
      assert.equal(m.floors.filter(f => f.fluid).length, m.town.tile.name === 'garden' ? 5 : 0);
      for (const p of m.authoredProps) if ([...BUILDINGS, ...MERCHANTS].some(b => b.name === p.name)) {
        assert.ok(!placed.has(p.name), p.name + ' twice'); placed.set(p.name, k);
        assert.ok(quarterTurn(p.yaw), 'buildings stand on the grid');
      }
      const boxes = m.occluders.filter(b => b.shape === 'box');
      for (const box of boxes) {
        assert.ok(box.x0 > 0 && box.z0 > 0 && box.x1 < N && box.z1 < N);
        for (const other of boxes) if (box.name !== other.name) assert.equal(overlaps(box, other), false, `${box.name}/${other.name}`);
        for (const c of m.town.pond) assert.equal(containsXZ(box, c % N + .5, Math.floor(c / N) + .5), false);
      }
      for (const p of m.town.frontages) assert.equal(m.safe[Math.floor(p.z) * N + Math.floor(p.x)], 1, p.name);
      for (const p of ENEMY_PROFILES) assert.deepEqual(enemySpots(m, p), []);
      checkWalkingRoutes(m); checkStraightPaths(m);
      assert.ok(m.occluders.filter(b => b.shape === 'ellipsoid').every(b => b.top > TOWN_LEVEL * LH + 4.8));
      assert.deepEqual(signature(m), signature(new World(seed).cube(k).map));
    }
    assert.deepEqual([...placed.keys()].sort(), [...BUILDINGS, ...MERCHANTS].map(b => b.name).sort());
    for (const b of [...BUILDINGS, ...MERCHANTS]) assert.equal(placed.get(b.name), t.at(...b.tile), b.name);
    const trees = tilesOf(w).flatMap(({ m }) => m.town.placements.filter(p => p.name.startsWith('town_tree_')));
    assert.ok(trees.length >= 24, `${trees.length} trees`);
    assert.equal(new Set(trees.map(p => p.name)).size, 3);
  }
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
        // physics knows only one tile at a time, docs/town.md)
        for (let t = 0; t < N; t++) {
          const along = [d < 2 ? 0 : t + .5, d < 2 ? t + .5 : 0];
          const at = s => [d === 0 ? N - s : d === 1 ? s : along[0], d === 2 ? N - s : d === 3 ? s : along[1]];
          const [ex, ez] = at(.5), c = Math.floor(ez) * N + Math.floor(ex);
          assert.equal(m.safe[c], 1, `${seed} ${k} side ${d}: ${ex}, ${ez} reached`);
          for (const s of [0, .25, .5]) {
            const [x, z] = at(s);
            assert.ok(!m.staticBlockers.flat().some(b => containsXZ(b, x, z, CHAR_R + .2)), `${seed} ${k} side ${d}: something stands at ${x}, ${z}`);
          }
        }
      }
    }
  }
  // the ground goes on past a seam as the edge's (physics/collide.js cellAt); past an outer side it
  // is solid as anywhere outside
  const w = new World(3), t = townOf(3), m = state.map = w.cube(t.at(1, 1)).map;
  assert.deepEqual(m.seams, [true, true, true, true]);
  Object.assign(player, { y: TOWN_LEVEL * LH, visY: TOWN_LEVEL * LH, h: .85, r: CHAR_R, grounded: true, swimming: false });
  for (const [x, z] of [[N + .4, 8.2], [-.4, 8.2], [8.2, N + .4], [8.2, -.4]]) {
    assert.ok(cellAt(x, z) >= 0);
    assert.equal(groundAt(x, z, TOWN_LEVEL * LH + .1, .3).h, TOWN_LEVEL * LH);
  }
  assert.equal(cellAt(N + 1.5, 8.2), -1, 'not further than a cell');
  const corner = state.map = w.cube(t.at(0, 0)).map;
  const out = [0, 1, 2, 3].find(d => !corner.seams[d]), [ox, oz] = [[N + .4, 8], [-.4, 8], [8, N + .4], [8, -.4]][out];
  assert.equal(cellAt(ox, oz), -1, 'past the hull: solid');
  // a body at the middle of a seam steps across it
  state.map = m;
  player.x = N - .5; player.z = STREET; player.support = m.cols[Math.floor(STREET) * N + N - 1][0];
  assert.equal(canMove(N + .3, STREET, 'x', 1), true);
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
    assert.equal(at.y, TOWN_LEVEL * LH);
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
  const start = m.routes[0][0], queue = [Math.floor(start.z * S) * W + Math.floor(start.x * S)];
  seen[queue[0]] = 1;
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
        assert.equal(v.y, TOWN_LEVEL * LH);
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
  const plan = m.town, y = TOWN_LEVEL * LH, pond = new Set(plan.pond);
  const clutter = plan.placements.filter(p => !p.name.startsWith('town_'));
  assert.ok(clutter.length >= min, `only ${clutter.length} clutter props`);
  // Oriented footprints: the axis-aligned collider envelopes have empty corners.
  const footprints = [...BUILDINGS, ...MERCHANTS].flatMap(b => plan.placements.filter(p => p.name === b.name)
    .map(p => ({ p, bounds: b.bounds })));
  const inside = (x, z) => footprints.some(({ p, bounds: [x0, z0, x1, z1] }) => {
    const dx = x - p.x, dz = z - p.z, c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return lx > x0 && lx < x1 && lz > z0 && lz < z1;
  });
  for (const p of clutter) {
    const meta = propMetadata.get(p.name), c = Math.floor(p.z) * N + Math.floor(p.x);
    assert.ok(meta, p.name); assert.equal(meta.attach === 'water', pond.has(c), p.name);
    assert.ok(p.x > 0 && p.z > 0 && p.x < N && p.z < N);
    if (meta.attach === 'water') assert.equal(p.y, TOWN_LEVEL * LH);
    else assert.ok(Math.abs(p.y - y) < .03, p.name);
    assert.ok(!inside(p.x, p.z), p.name + ' inside a building');
    if (meta.light) assert.equal(p.night, true, 'the lamps are lit at night only');
    if (meta.blocking) {
      assert.ok(m.staticBlockers[c].some(b => b.name === p.name && b.x === p.x && b.z === p.z), p.name + ' needs a collider');
      // and off the seams by SEAM_CLEAR
      const gap = Math.min(...[0, 1, 2, 3].filter(d => m.seams[d]).map(d => [N - p.x, p.x, N - p.z, p.z][d]));
      assert.ok(gap >= meta.radius * p.s + SEAM_CLEAR - 1e-6, `${p.name} ${gap} from a seam`);
    }
  }
}

test('the tiles are dressed with varied clutter that stays off paths, water, buildings and seams', () => {
  for (let seed = 0; seed < 16; seed++) {
    const w = new World(seed), tiles = tilesOf(w);
    for (const { m } of tiles) checkClutter(m, 50);
    const names = new Set(tiles.flatMap(({ m }) => m.town.placements.map(p => p.name.replace(/_[ab]$/, ''))));
    assert.ok(names.size >= 30, 'clutter must be varied');
    const garden = tiles.find(({ m }) => m.town.tile.name === 'garden').m;
    assert.ok(garden.town.placements.some(p => p.name.startsWith('meadow_lily_pads_')));
    assert.ok(garden.town.placements.some(p => p.name.startsWith('meadow_cattails_') || p.name.startsWith('any_shore_stones_')));
    for (const [tile, prop] of [['camp', 'relics_old_campfire_'], ['windmill', 'meadow_windmill_'], ['green', 'town_well_']])
      assert.ok(tiles.find(({ m }) => m.town.tile.name === tile).m.town.placements.some(p => p.name.startsWith(prop)), `${tile}: ${prop}`);
  }
});

test('the street runs straight from the gate to the green, and paths lead to every frontage', () => {
  for (let seed = 0; seed < 4; seed++) {
    const w = new World(seed), t = townOf(seed);
    for (const { m } of tilesOf(w)) for (const p of m.town.frontages) assert.ok(m.town.paths.some(path => {
      const end = path.points.at(-1); return Math.hypot(end[0] - p.x, end[1] - p.z) < 1e-6;
    }), p.name);
    for (let j = 0; j < TOWN_DEEP; j++) {
      const m = w.cube(t.at(1, j)).map, local = m.town.paths.map(p => p.points.map(([x, z]) => rotateTownPoint(x, z, -m.town.yaw)));
      const street = local.find(pts => pts.every(([x]) => Math.abs(x - STREET) < 1e-6) && pts.some(([, z]) => Math.abs(z) < 1e-6));
      assert.ok(street, `the street in ${j}`);
      assert.ok(street.some(([, z]) => Math.abs(z - (j < TOWN_DEEP - 1 ? N : 8)) < 1e-6), 'on through the tile, to the green');
    }
  }
});

test('path ribbons are grid-aligned rectangles, stay inside the cube, and never pave over the pond', () => {
  for (let seed = 0; seed < 4; seed++) {
    const w = new World(seed);
    for (const { m } of tilesOf(w)) {
      const { pos, nor } = buildCubeGeometry(m)[0].terrain;
      let pathVertices = 0;
      for (let i = 0; i < pos.length; i += 9) {
        if (Math.abs(pos[i + 1] - (TOWN_LEVEL * LH + .012)) > 1e-5) continue;
        pathVertices += 3;
        for (let j = i; j < i + 9; j += 3) {
          assert.ok(pos[j] >= 0 && pos[j] <= N && pos[j + 2] >= 0 && pos[j + 2] <= N);
          assert.equal(nor[j + 1], 1);
        }
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
  const w = new World(3), t = townOf(3), m = state.map = w.cube(t.houses.town_inn_a).map;
  Object.assign(player, { y: 2, visY: 2, h: .85, r: CHAR_R, grounded: true, swimming: false });
  const box = m.occluders.find(b => b.name === 'town_inn_a');
  for (let x = box.x0 + .1; x < box.x1; x += .7) for (let z = box.z0 + .1; z < box.z1; z += .7) {
    assert.equal(blockedAt(x, z, 2, .3), true);
    assert.equal(insideSolid(x, z, 2.5), true);
    assert.equal(ceilingAt(x, z, 1.9), 2);
  }
  checkWalkingRoutes(m);
  const edge = state.map = w.cube(t.at(0, 0)).map;
  const crown = edge.occluders.find(b => b.shape === 'ellipsoid');
  assert.equal(viewBlockedAt(edge, crown.x, crown.y, crown.z), true);
  assert.ok(mapInfo(edge).top > Math.max(...edge.occluders.map(b => b.top)));
  const inward = Math.sign(N / 2 - crown.x) || 1;
  assert.equal(insideSolid(crown.x + inward * crown.rx * .8, crown.z, 2.5), false, 'only the trunk stands in the way');
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
