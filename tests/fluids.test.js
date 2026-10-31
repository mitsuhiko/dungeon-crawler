import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { shoreIssues } from '../src/render/shore.js';
import { TEST_ROOM_NAMES, testRoomKey } from '../src/world/testrooms.js';

test('the test rooms keep to the rules their fluids are drawn by', () => {
  const w = new World(2);
  // (the boss room at Squarlo's depth: his tidal hills)
  for (const name of TEST_ROOM_NAMES) assert.deepEqual(shoreIssues(w.cube(testRoomKey(name, name === 'boss' ? 2 : 3)).map), [], name);
});
