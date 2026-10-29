import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from './fixtures.js';
import { World } from '../src/world/world.js';
import { waterfallRoomKey, waterfallOutside, waterfallDoors, addWaterfallHideout } from '../src/world/waterfalls.js';
import { isInterior, TOWN_KEY } from '../src/world/town.js';
import { doorArrival, doorBack, atDoor } from '../src/core/doors.js';
import { player } from '../src/game/state.js';
import { supportedPoint } from '../src/physics/respawn.js';
import { WATER, LAVA, ACID, CHAR_R } from '../src/core/constants.js';
import { buildCubeParts } from '../src/render/cubegeo.js';
import { generate } from '../src/cubegen/index.js';
import { chestLoot } from '../src/core/chests.js';

const world = new World(123), outside = world.cube('3,-3,3').map;
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
    assert.ok(supportedPoint(a.x, a.y, a.z), m.key);
    const p = { ...a, x: d.x + d.nx * 0.3, z: d.z + d.nz * 0.3, vx: 0, vz: 0, r: CHAR_R };
    assert.equal(atDoor(p, d, -d.nx, -d.nz), true);
    assert.equal(atDoor(p, d, d.nx, d.nz), false);
  }
});

test('hideouts reuse furnished house interiors, stay peaceful and give one persistent ordinary chest', () => {
  assert.equal(room.enemyFree, true); assert.equal(room.depth, outside.depth);
  assert.equal(room.interior.outside, outside.key); assert.equal(room.waterfallRoom, true);
  assert.equal(room.doors.length, 1); assert.equal(room.rewardSites.length, 1);
  assert.ok(room.authoredProps.length >= 5); assert.equal(room.runs[0].kind, 'stair');
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
  assert.throws(() => world.cube(waterfallRoomKey(TOWN_KEY)), /No (waterfall )?door/);
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
  assert.ok(wide.parts.stone.pos.length > narrow.parts.stone.pos.length);
  assert.ok(buildCubeParts(room).parts.stone.pos.length > 0);
});
