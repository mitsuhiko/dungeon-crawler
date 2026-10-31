import { test } from 'node:test';
import assert from 'node:assert/strict';
import { N, LH, CHAR_R } from '../src/core/constants.js';
import { state } from './fixtures.js';
import { World } from '../src/world/world.js';
import { worldOf } from './worlds.js';
import { step } from '../src/world/coords.js';
import { BUILDINGS, MERCHANTS, interiorKey, isInterior, townOf } from '../src/world/town.js';

// the town's doors, each with the map of its tile (world/town.js: the houses stand in different tiles)
const townDoors = w => townOf(w.seed).keys.flatMap(k => { const m = w.cube(k).map; return m.doors.map(d => ({ d, m, k })); });
import { HOUSES, INTERIOR_LEVEL, INTERIOR_SCALE, WALL } from '../src/cubegen/interior.js';
import { atDoor, doorArrival, doorBack } from '../src/core/doors.js';
import { player } from '../src/game/state.js';
import { movePlayer } from '../src/physics/move.js';
import { supportedPoint } from '../src/physics/respawn.js';
import { surfaceAt } from '../src/core/footing.js';
import { buildCubeGeometry } from '../src/render/cubegeo.js';
import { depthOf } from '../src/themes/depth.js';

const DT = 1 / 60;

function place(m, x, y, z) {
  state.map = m;
  Object.assign(player, { x, y, z, vx: 0, vy: 0, vz: 0, visY: y, grounded: true, swimming: false, fluid: 0,
    stun: 0, coyote: 0, jumpBuf: 0, r: CHAR_R, h: .85, support: null });
  movePlayer(DT, 0, 0, false, false);
}
// walk towards (x, z) until there (true) or `limit` steps pass
function walkTo(x, z, limit = 600) {
  for (let i = 0; i < limit; i++) {
    const dx = x - player.x, dz = z - player.z, d = Math.hypot(dx, dz);
    if (d < .12) return true;
    movePlayer(DT, dx / d, dz / d, false, false);
  }
  return false;
}
// push into door d until it takes you (the number of steps it took), or null
function pushInto(d, limit = 120) {
  for (let i = 0; i < limit; i++) {
    movePlayer(DT, -d.nx, -d.nz, false, false);
    const face = (player.x - d.x) * d.nx + (player.z - d.z) * d.nz;
    assert.ok(face > CHAR_R - .02, 'the body stops at the door');
    if (atDoor(player, d, -d.nx, -d.nz)) return i;
  }
  return null;
}

test('only the houses with a door get an inside: the inn, the blacksmith and the pet shop', () => {
  assert.deepEqual(HOUSES.map(b => b.name).sort(), ['town_blacksmith_a', 'town_inn_a', 'town_pet_shop_a']);
  for (const b of [...MERCHANTS, BUILDINGS.find(b => b.name === 'town_stable_a')]) assert.equal(b.door, undefined, b.name);
  const w = new World(1), doors = townDoors(w);
  assert.deepEqual(doors.map(({ d }) => d.building).sort(), HOUSES.map(b => b.name).sort());
  for (const { d, k } of doors) { assert.equal(d.to, interiorKey(d.building)); assert.equal(k, townOf(1).houses[d.building]); }
  assert.deepEqual(w.cube(townOf(1).houses.town_merchant_a).map.doors, [], 'the tents have none');
});

test('every house door in town can be walked up to and takes you in, for every exit', () => {
  const exits = new Set();
  for (let seed = 0; seed < 12; seed++) {
    const w = worldOf(seed);
    exits.add(townOf(seed).exit);
    for (const { d, m } of townDoors(w)) {
      assert.ok(Math.abs(d.nx) + Math.abs(d.nz) === 1, 'doors face along the grid');
      const a = doorArrival(d);
      place(m, a.x, a.y, a.z);
      assert.ok(supportedPoint(a.x, a.y, a.z), d.building + ': the doorstep is dry, supported, unblocked ground');
      assert.equal(atDoor(player, d), false, 'arriving on the doorstep does not take you back');
      assert.notEqual(pushInto(d), null, d.building + ': walking into the door takes you through');
      assert.equal(player.y, m.town.level * LH);
    }
  }
  assert.deepEqual([...exits].sort(), [0, 1, 2, 3]);
});

test('interiors are off the grid, safe, and keep their house proportions; the inn is the biggest', () => {
  const w = new World(4), areas = {};
  for (const b of HOUSES) {
    const k = interiorKey(b.name), m = w.cube(k).map, { x0, z0, x1, z1 } = m.interior.room, { W, D, front } = m.interior;
    assert.ok(isInterior(k)); assert.equal(depthOf(k), 0);
    assert.equal(w.wfc.tiles.has(k), false, 'no WFC tile, no faces');
    assert.equal(m.depth, 0); assert.equal(m.enemyFree, true); assert.deepEqual(m.portals, []);
    assert.equal(m.K, 2); assert.equal(m.interior.building, b.name); assert.equal(m.interior.outside, townOf(4).houses[b.name]);
    assert.ok(Math.abs(W - b.body.w * INTERIOR_SCALE) <= .5 && Math.abs(D - b.body.d * INTERIOR_SCALE) <= .5);
    assert.ok(Math.abs(W / D - b.body.w / b.body.d) < .12, b.name + ' proportions');
    assert.deepEqual([x1 - x0, z1 - z0], front[0] ? [D, W] : [W, D], 'width along the front, depth front to back');
    assert.ok(x0 - WALL > 0 && z0 - WALL > 0 && x1 + WALL < N && z1 + WALL < N, 'walls inside the map');
    // floors only inside the walls
    for (let c = 0; c < N * N; c++) {
      const x = c % N, z = Math.floor(c / N), inRoom = x >= x0 && x < x1 && z >= z0 && z < z1;
      assert.equal(m.cols[c].length > 0, inRoom);
    }
    areas[b.name] = (x1 - x0) * (z1 - z0);
    assert.deepEqual(w.cube(k).map, m, 'cached');
  }
  assert.ok(areas.town_inn_a > areas.town_pet_shop_a && areas.town_inn_a > areas.town_blacksmith_a);
  assert.ok(w.cube(interiorKey('town_inn_a')).map.interior.wallTop > w.cube(interiorKey('town_pet_shop_a')).map.interior.wallTop);
});

test('walls all round: running in any direction never leaves the room or drops you', () => {
  const w = new World(2);
  for (const b of HOUSES) {
    const m = w.cube(interiorKey(b.name)).map, { x0, z0, x1, z1 } = m.interior.room, ground = INTERIOR_LEVEL * LH;
    const upper = m.interior.upper.level * LH;
    // from the door, and from the upper floor's far corner
    const a = doorArrival(m.doors[0]), [ux, uz] = [m.routes[0].at(-1).x, m.routes[0].at(-1).z];
    for (const [sx, sy, sz] of [[a.x, ground, a.z], [ux, upper, uz]]) {
      for (let a = 0; a < 16; a++) {
        place(m, sx, sy, sz);
        const dx = Math.sin(a / 16 * Math.PI * 2), dz = Math.cos(a / 16 * Math.PI * 2);
        for (let i = 0; i < 240; i++) {
          movePlayer(DT, dx, dz, true, false);
          assert.ok(player.x > x0 + CHAR_R - .02 && player.x < x1 - CHAR_R + .02 && player.z > z0 + CHAR_R - .02 && player.z < z1 - CHAR_R + .02,
            `${b.name}: out of the room at ${player.x.toFixed(2)}, ${player.z.toFixed(2)}`);
          assert.ok(player.y >= ground - 1e-6, 'never below the floor');
          // the railing keeps you upstairs, unless you take the stair
          if (sy === upper && player.y < upper - 1e-6) assert.ok(m.interior.stair.cells.some(c =>
            Math.abs(c % N + .5 - player.x) < 1.5 && Math.abs(Math.floor(c / N) + .5 - player.z) < 1.5), 'only the stair leads down');
        }
      }
    }
  }
});

test('the stair leads up to the upper floor, and the door inside leads back out', () => {
  const w = new World(3);
  for (const b of HOUSES) {
    const k = interiorKey(b.name), m = w.cube(k).map, inside = m.doors[0], tile = townOf(3).houses[b.name];
    assert.equal(inside.to, tile); assert.equal(inside.building, b.name);
    const outside = doorBack(w.cube(tile).map, inside, k);
    assert.equal(outside.to, k, 'the door inside leads to this house\'s door');
    assert.equal(doorBack(m, outside, tile), inside, 'and that one back in');
    // come in and walk the route: to the stair, up it, along the upper floor
    const a = doorArrival(inside);
    place(m, a.x, a.y, a.z);
    assert.ok(supportedPoint(a.x, a.y, a.z));
    for (const p of m.routes[0].slice(1)) assert.ok(walkTo(p.x, p.z), `${b.name}: reach ${p.x}, ${p.z}`);
    assert.ok(Math.abs(player.y - m.interior.upper.level * LH) < 1e-6, b.name + ' upstairs');
    assert.ok(m.interior.upper.level * LH - INTERIOR_LEVEL * LH >= 2.5, 'room for the character under the upper floor');
    // and back out through the door
    place(m, a.x, a.y, a.z);
    assert.notEqual(pushInto(inside), null, b.name + ': the door inside takes you out');
  }
});

test('interiors sound and look like wood and plaster', () => {
  const w = new World(5);
  for (const b of HOUSES) {
    const m = w.cube(interiorKey(b.name)).map;
    for (const f of m.floors) assert.equal(surfaceAt(f, m, 'meadow', f.x + .5, f.z + .5), 'wood');
    for (const p of m.runs[0].pieces) assert.equal(surfaceAt(p, m, 'meadow', 0, 0), 'wood');
    const geo = buildCubeGeometry(m);
    assert.equal(geo.length, 2);
    assert.ok(geo[0].wood && geo[0].stone && geo[1].wood, 'floors, stair and frame in wood, walls in plaster');
    for (const L of geo) for (const a of [L.terrain, L.stone, L.wood]) if (a) assert.ok(a.pos.every(Number.isFinite));
    assert.deepEqual(structuredClone(m).interior, m.interior, 'survives the worker');
  }
});

test('inside, the house stands as it does outside: the door on the same side, the way in kept', () => {
  for (let seed = 0; seed < 8; seed++) {
    const w = worldOf(seed);
    for (const { d } of townDoors(w)) {
      const m = w.cube(d.to).map, inside = m.doors[0], { room, front } = m.interior;
      assert.deepEqual(front.map(Math.round), [d.nx, d.nz].map(Math.round), 'the front faces where the house does');
      // you walk in along -n outside, and arrive walking the same way inside
      assert.deepEqual([inside.nx, inside.nz].map(v => Math.round(v) || 0), [-d.nx, -d.nz].map(v => Math.round(v) || 0));
      assert.ok(Math.cos(doorArrival(inside).yaw - doorArrival(d).yaw) < -1 + 1e-9, 'in and out face opposite ways');
      // the door is in the front wall
      const onFront = [inside.x === room.x1, inside.x === room.x0, inside.z === room.z1, inside.z === room.z0];
      assert.equal(onFront.indexOf(true), [[1, 0], [-1, 0], [0, 1], [0, -1]].findIndex(([x, z]) => x === Math.round(d.nx) && z === Math.round(d.nz)));
      // and where the model has it along that wall: the inn's left of centre, the others further left
      const b = HOUSES.find(h => h.name === d.building), along = (b.door.x - b.body.x + b.body.w / 2) / b.body.w;
      const R = [front[1], -front[0]], left = [room.x0 + room.x1, room.z0 + room.z1].map(v => v / 2);
      const u = (inside.x - left[0]) * R[0] + (inside.z - left[1]) * R[1] + m.interior.W / 2;
      assert.ok(Math.abs(u / m.interior.W - along) < .12, `${b.name} door at ${u.toFixed(2)} of ${m.interior.W}`);
    }
  }
});
