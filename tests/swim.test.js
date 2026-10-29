// The world's water (docs/world.md "Water"): most of it waded, deep only away from its banks, and
// every water the hero can get into has a way out of it (a bank a level over its surface, or a
// ladder up out of it: cubegen/escape.js), which the click to move finds too (physics/playernav.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { N, LH, WATER, CHAR_R, CHAR_H, SWIM_FEET } from '../src/core/constants.js';
import { state } from './fixtures.js';
import { World } from '../src/world/world.js';
import { reachFrom, stuckInWater, graph } from '../src/cubegen/reach.js';
import { player } from '../src/game/state.js';
import { movePlayer } from '../src/physics/move.js';
import { climb } from '../src/physics/climb.js';
import { wayOut } from '../src/physics/swimout.js';
import { planWalk, steerWalk } from '../src/physics/playernav.js';
import { topOf } from '../src/core/surfaces.js';

const DEPTHS = Array.from({ length: 19 }, (_, i) => i + 1);
const context = m => ({ ...m,
  nextAbove: f => m.cols[f.c][m.cols[f.c].indexOf(f) + 1],
  headOK: (f, h) => { const a = m.cols[f.c][m.cols[f.c].indexOf(f) + 1]; return !a || a.bottom >= Math.max(h, f.top) + 2; },
});
function* cubes(seeds) {
  for (const seed of seeds) {
    const w = new World(seed);
    for (const d of DEPTHS) for (const k of w.layout(d).exists) {
      const m = w.cube(k).map;
      if (m.floors && m.portals?.length && m.moves && !m.trialRoom) yield { seed, k, m };
    }
  }
}

// the bodies of water in map m (water floors joined at one surface), and the ground beside each
function bodies(m) {
  const seen = new Set(), out = [], D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const f of m.floors) if (f.fluid === WATER && !seen.has(f.id)) {
    const body = [f], banks = [];
    seen.add(f.id);
    for (let i = 0; i < body.length; i++) for (const [dx, dz] of D) {
      const x = body[i].x + dx, z = body[i].z + dz;
      if (x < 0 || z < 0 || x >= N || z >= N) continue;
      for (const g of m.cols[z * N + x]) {
        if (g.fluid === WATER && g.surf === f.surf) { if (!seen.has(g.id)) { seen.add(g.id); body.push(g); } }
        else if (!g.fluid && g.bottom <= f.surf && g.top >= f.surf) banks.push(g);
      }
    }
    out.push({ surf: f.surf, body, banks });
  }
  return out;
}

test('the water: level with its shore, mostly waded, deep only away from its banks; every water got into has a way out of it', () => {
  let water = 0, deep = 0, ladders = 0, stuck = [], flush = 0, all = 0;
  for (const { seed, k, m } of cubes([1, 2])) {
    if (!m.guardian) for (const b of bodies(m)) { all++; if (b.banks.some(g => g.top === b.surf)) flush++; }
    for (const f of m.floors) if (f.fluid === WATER) {
      water++;
      if (f.surf - f.top >= 2 && !m.guardian) {   // (a guardian's arena has water of its own: cubegen/guardian.js)
        deep++;
        // deep only with water all round it
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const x = f.x + dx, z = f.z + dz;
          if (x >= 0 && z >= 0 && x < N && z < N) assert.ok(m.cols[z * N + x].some(g => g.fluid === WATER && g.surf === f.surf), `${seed} ${k}: deep by a bank at ${f.x}, ${f.z}`);
        }
      }
    }
    for (const l of m.ladders) if (l.wet !== undefined) {
      ladders++;
      const lo = m.floors[l.lo];
      assert.equal(lo.fluid, WATER); assert.equal(l.wet, lo.surf * LH); assert.ok(l.y1 > l.wet);
    }
    const ctx = context(m), seen = reachFrom(ctx, m.portals.map(p => p.floor), true);
    for (const id of stuckInWater(ctx, true)) if (seen.has(id)) stuck.push(`${seed} ${k}: ${m.floors[id].x}, ${m.floors[id].z}`);
  }
  assert.deepEqual(stuck, [], 'stuck in the water');
  assert.ok(flush / all > 0.8, `${flush} of ${all} bodies of water with a shore level with them`);
  assert.ok(water > 1000 && deep / water < 0.4, `${deep} of ${water} water cells deep`);
  assert.ok(ladders > 5, `${ladders} ladders out of the water`);
});

// the nearest ground out of the water from water floor f (the reach graph's, cubegen/reach.js)
function ashore(adj, f) {
  const seen = new Set([f.id]), queue = [f];
  while (queue.length) for (const g of adj.get(queue.shift().id) || []) {
    if (!g.fluid && !g.landing) return g;
    if (!seen.has(g.id)) { seen.add(g.id); queue.push(g); }
  }
  return null;
}

test('a swimmer anywhere in a cube\'s water finds a way out, and a click takes them out of it', () => {
  let tried = 0, out = 0;
  const failed = [];
  for (const { seed, k, m } of cubes([3])) {
    state.map = m;
    const ctx = context(m), seen = reachFrom(ctx, m.portals.map(p => p.floor), true), adj = graph(ctx, true);
    const pools = m.floors.filter(f => f.fluid === WATER && seen.has(f.id) && f.surf - f.top >= 2);
    for (const f of pools.slice(0, 2)) {
      tried++;
      const surface = f.surf * LH;
      if (!wayOut(f.x + 0.5, f.z + 0.5, surface)) { failed.push(`${seed} ${k}: no way out at ${f.x}, ${f.z}`); continue; }
      // swim there, and click the nearest ground out of it
      Object.assign(player, { x: f.x + 0.5, y: surface - SWIM_FEET, z: f.z + 0.5, vx: 0, vy: 0, vz: 0, grounded: false, swimming: true,
        wade: 0, stun: 0, coyote: 0, jumpBuf: 0, r: CHAR_R, h: CHAR_H, support: f, climb: null, gust: null, pull: null, effects: {} });
      const to = ashore(adj, f), w = planWalk(to, to.x + 0.5, to.z + 0.5, topOf(to, 0.5, 0.5), true);
      let left = false;
      for (let i = 0; i < 60 * 60 && !left; i++) {
        const s = steerWalk(w, 1 / 60);
        if (!s) break;
        if (!climb(1 / 60, s.dx, s.dz, s.jump, s.ladder)) movePlayer(1 / 60, s.dx, s.dz, true, s.jump);
        left = !player.swimming && !player.climb && player.grounded && !player.support?.fluid;
      }
      if (left) out++; else failed.push(`${seed} ${k}: still in at ${player.x.toFixed(2)}, ${player.z.toFixed(2)}`);
    }
  }
  assert.ok(tried > 10, `${tried}`);
  assert.ok(failed.length <= Math.ceil(tried / 20), `${out} of ${tried} out: ${failed.join('; ')}`);
});

test('the water of the guardians\' arenas (their dwellers\' ponds, a boss\'s lagoon), the town and the camp has a way out too', () => {
  let deep = 0;
  const bad = [];
  for (const seed of [1, 2]) {
    const w = new World(seed);
    for (let d = 0; d <= 20; d++) for (const k of w.layout(d).exists) {
      w.prepare(k);
      const spec = w.spec(k);
      if (!spec.guardian && !spec.town && !spec.merchantCamp) continue;
      const m = w.cube(k).map;
      state.map = m;
      for (const f of m.floors) if (f.fluid === WATER && f.surf * LH - Math.min(...f.cs) > 0.6) {
        deep++;
        if (!wayOut(f.x + 0.5, f.z + 0.5, f.surf * LH)) bad.push(`${seed} ${k}: ${f.x}, ${f.z}`);
      }
    }
  }
  assert.ok(deep > 20, `${deep}`);
  assert.deepEqual(bad, []);
});
