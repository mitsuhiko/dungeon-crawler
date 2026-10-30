import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from './fixtures.js';
import { World } from '../src/world/world.js';
import { waterfallRoomKey, waterfallOutside, waterfallDoors, addWaterfallHideout } from '../src/world/waterfalls.js';
import { isInterior, townOf } from '../src/world/town.js';
import { testRoomKey, TEST_ROOM_NAMES } from '../src/world/testrooms.js';
import { doorArrival, doorBack, atDoor } from '../src/core/doors.js';
import { player } from '../src/game/state.js';
import { supportedPoint, respawnPoint } from '../src/physics/respawn.js';
import { WATER, LAVA, ACID, CHAR_R } from '../src/core/constants.js';
import { buildCubeParts } from '../src/render/cubegeo.js';
import { generate } from '../src/cubegen/index.js';
import { chestLoot } from '../src/core/chests.js';

const world = new World(123), outside = world.cube('-1,-1,-4').map;
const door = outside.doors.find(d => d.waterfall), room = world.cube(door.to).map;

test('rare broad waterfalls get deterministic doors without changing existing terrain or routes', () => {
  const again = new World(123).cube(outside.key).map;
  assert.deepEqual(again.doors, outside.doors);
  assert.ok(outside.falls.some(f => f.width >= 2.2));
  const plain = generate(world.spec(outside.key));
  const terrain = m => m.floors.map(f => ({ top: f.top, bottom: f.bottom, cs: f.cs, fluid: f.fluid, surf: f.surf }));
  assert.deepEqual(terrain(outside), terrain(plain));
  const moves = m => m.moves.map(v => ({ kind: v.kind, from: v.from.id, to: v.to.id, cells: v.cells }));
  assert.deepEqual(moves(outside), moves(plain));
  assert.equal(waterfallOutside(door.to), outside.key);
  assert.equal(door.to, waterfallRoomKey(outside.key));
  assert.equal(isInterior(door.to), true);
});

test('both doors use the existing arrival, walk-in and return rules with dry supported feet', () => {
  const back = doorBack(room, door, outside.key);
  assert.ok(back); assert.equal(doorBack(outside, back, room.key), door);
  for (const [m, d] of [[outside, door], [room, back]]) {
    state.map = m;
    const a = doorArrival(d);
    if (d.swim) {
      const safe = respawnPoint(a);
      assert.ok(supportedPoint(safe.x, safe.y, safe.z), 'a dry fallback remains available near the water entrance');
    } else assert.ok(supportedPoint(a.x, a.y, a.z), m.key);
    const p = { ...a, x: d.x + d.nx * 0.3, z: d.z + d.nz * 0.3, vx: 0, vz: 0, r: CHAR_R };
    assert.equal(atDoor(p, d, -d.nx, -d.nz), true);
    assert.equal(atDoor(p, d, d.nx, d.nz), false);
  }
});

test('hideouts are ordinary peaceful forests with a small waterfall and one persistent ordinary chest', () => {
  assert.equal(room.enemyFree, true); assert.equal(room.depth, outside.depth);
  assert.equal(room.roomOutside.outside, outside.key); assert.equal(room.waterfallRoom, true);
  assert.equal(room.interior, undefined); assert.equal(room.biome, 'darkforest');
  assert.equal(room.doors.length, 1); assert.equal(room.rewardSites.length, 1);
  assert.equal(room.authoredProps, undefined, 'use ordinary forest dressing');
  assert.equal(room.runs.length, 0); assert.equal(room.falls.length, 1);
  assert.ok(room.falls[0].width < outside.falls.find(f => f.width).width);
  assert.ok(!buildCubeParts(room).parts.wood?.pos.length, 'no wooden house floor or stairs');
  const site = room.rewardSites[0];
  assert.equal(site.prestige, 'uncommon'); assert.equal(site.encounter, null);
  assert.deepEqual(chestLoot(site, room.depth, room.seed), chestLoot(site, room.depth, room.seed));
  assert.equal(new World(123).cube(door.to).map.rewardSites[0].id, site.id);
  assert.notEqual(site.id, new World(123).cube(waterfallRoomKey('0,-4,-3')).map.rewardSites[0].id);
});

test('bosses, trials, test rooms, lethal falls and inaccessible land never receive hideout doors', () => {
  const bare = () => ({ ...outside, doors: [], falls: outside.falls.map(f => ({ ...f, width: undefined })) });
  for (const special of [{ guardian: {} }, { trial: {} }, { testRoom: {} }, { depth: 0 }, { interior: {} }]) {
    const m = Object.assign(bare(), special); addWaterfallHideout(m); assert.deepEqual(m.doors, []);
  }
  for (const type of [LAVA, ACID]) {
    const m = bare(); m.falls.forEach(f => f.type = type); addWaterfallHideout(m); assert.deepEqual(m.doors, []);
  }
  const unsafe = bare(); unsafe.safe = new Uint8Array(outside.safe.length);
  assert.deepEqual(waterfallDoors(unsafe), []);
  assert.throws(() => world.cube(waterfallRoomKey(townOf(world.seed).start)), /No (waterfall )?door/);
});

test('the waterfall command preview has a supported entrance and a real two-way room for any seed', () => {
  assert.equal(TEST_ROOM_NAMES.at(-1), 'waterfall');
  assert.equal(testRoomKey('leaps', 1), '10028,-1,10000');
  for (const seed of [1, 123, 987654]) for (const depth of [1, 20]) {
    const w = new World(seed), m = w.cube(testRoomKey('waterfall', depth)).map;
    state.map = m;
    const a = m.testRoom.arrival;
    assert.ok(supportedPoint(a.x, a.y, a.z));
    assert.equal(m.falls[0].width, 3.2);
    const d = m.doors[0], r = w.cube(d.to).map;
    assert.ok(doorBack(r, d, m.key));
    assert.equal(r.rewardSites.length, 1); assert.equal(r.enemyFree, true);
    buildCubeParts(m); buildCubeParts(r);
  }
});

test('the curtain actually renders wider and its door and room compile through native cube geometry', () => {
  const fall = outside.falls.find(f => f.width);
  const wide = buildCubeParts({ ...outside, falls: [fall] });
  const narrow = buildCubeParts({ ...outside, doors: [], falls: [{ ...fall, width: undefined }] });
  const axis = fall.d < 2 ? 2 : 0;
  const span = part => {
    const a = []; for (let i = axis; i < part.pos.length; i += 4) a.push(part.pos[i]);
    return Math.max(...a) - Math.min(...a);
  };
  assert.ok(span(wide.parts['water-fall']) > span(narrow.parts['water-fall']) * 2);
  assert.equal(wide.parts.stone.pos.length, narrow.parts.stone.pos.length, 'no wooden door or frame at a swim-through entrance');
  assert.ok(buildCubeParts(room).parts.terrain.pos.length > 0);
});
