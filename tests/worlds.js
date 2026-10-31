// One World per seed (and options) for the tests of a file that only look at what it generates:
// made once, its cubes kept for the next test of the file (generating them is most of what the
// tests take). A test that changes a world, or makes its cubes in an order of its own (the same
// whichever way it is explored), makes its own: new World(seed).
import { World } from '../src/world/world.js';

const worlds = new Map();
export function worldOf(seed, opts = {}) {
  const k = `${seed} ${JSON.stringify(opts)}`;
  if (!worlds.has(k)) worlds.set(k, new World(seed, opts));
  return worlds.get(k);
}
