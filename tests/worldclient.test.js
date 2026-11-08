import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClient } from '../src/world/client.js';
import { key } from '../src/world/coords.js';

// the client without its worker: cubes with geometry of `mb` MB each, used in the order given
function client(budget, cubes) {
  const c = Object.create(WorldClient.prototype);
  c.cubes = new Map(); c.geoBudget = budget * 2 ** 20; c.used = 0;
  for (const [k, mb] of cubes) c.cubes.set(k, { key: k, geo: {}, geoBytes: mb * 2 ** 20, used: ++c.used, ready: true });
  return c;
}

test('the cubes round the one played in keep their geometry, the others the most recent up to the budget', () => {
  const here = key(0, -1, 0);
  const c = client(2, [[key(9, -1, 0), 1], [key(0, -2, 0), 1], [key(0, -3, 0), 1], [key(4, -1, 4), 1], [key(1, -1, 0), 1], [here, 1]]);
  assert.equal(c.trimGeometry(here), 5 * 2 ** 20);
  const kept = [...c.cubes.values()].filter(x => x.geo).map(x => x.key);
  // its layer within four cubes, itself, and the two used last of the others (the oldest went)
  assert.deepEqual(kept.sort(), [key(0, -2, 0), key(0, -3, 0), key(4, -1, 4), key(1, -1, 0), here].sort());
  const gone = c.cubes.get(key(9, -1, 0));
  assert.equal(gone.geo, undefined);   // (undefined: the cube is built from its map if it must)
  assert.equal(gone.ready, false);
  assert.deepEqual(c.geometryHeld(), { bytes: 5 * 2 ** 20, cubes: 5, of: 6 });
});
