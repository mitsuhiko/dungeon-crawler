// The checks that look at every cube of whole worlds (tests/sweeps/), each world made once: in a
// process of its own (tests/sweep-<seed>.test.js), whose tests are those checks over that world.
// Making the cubes is most of what such a check takes, and checks in files of their own made the
// same worlds again and again. A check's counts are of its world (the thresholds are per world).
import './fixtures.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { World } from '../src/world/world.js';
import fluids from './sweeps/fluids.js';
import water from './sweeps/water.js';
import sites from './sweeps/sites.js';
import guardians from './sweeps/guardians.js';

// the worlds looked at, each in its file
export const SWEEP_SEEDS = [0, 1, 2];
export const CHECKS = [...fluids, ...water, ...sites, ...guardians];

export function sweep(seed) {
  if (seed === SWEEP_SEEDS[0]) test('every world of the sweep has its file, and only those', () => {
    const files = readdirSync(import.meta.dirname).filter(f => /^sweep-\d+\.test\.js$/.test(f)).sort();
    assert.deepEqual(files, SWEEP_SEEDS.map(s => `sweep-${s}.test.js`).sort());
  });
  const w = new World(seed);
  for (const { name, run } of CHECKS) test(`${name} (world ${seed})`, () => run(w, seed));
}
