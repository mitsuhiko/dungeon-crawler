import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { worldOf } from './worlds.js';
import { makeLayouts } from '../src/world/layout.js';
import { step, faceKey, parse } from '../src/world/coords.js';
import { N, LH, CHAR_R } from '../src/core/constants.js';
import { MAX_DEPTH } from '../src/themes/depth.js';
import { runY, floorY } from '../src/core/surfaces.js';
import { state } from './fixtures.js';
import { player } from '../src/game/state.js';
import { movePlayer } from '../src/physics/move.js';

const SEEDS = Array.from({ length: 8 }, (_, i) => i);
// cell j steps in from face d at position t (portals.js edgeCell)
const edge = (d, t, j) => d === 0 ? t * N + N - 1 - j : d === 1 ? t * N + j : d === 2 ? (N - 1 - j) * N + t : j * N + t;
const ground = (m, c) => m.cols[c].find(f => f.layer === 0);
const DT = 1 / 60;
// every depth with spans: all but the town and the core
const DEPTHS = Array.from({ length: MAX_DEPTH - 1 }, (_, i) => i + 1);

function place(m, x, y, z) {
  state.map = m;
  Object.assign(player, { x, y, z, vx: 0, vy: 0, vz: 0, visY: y, grounded: true, swimming: false, fluid: 0,
    stun: 0, coyote: 0, jumpBuf: 0, r: CHAR_R, h: .85, support: null });
  movePlayer(DT, 0, 0, false, false);
}

test('spans are planned from the seed and the theme on every depth, straight and in budget', () => {
  let route = 0, island = 0, long = 0, cave = 0, sky = 0;
  const at = new Set();
  for (let seed = 0; seed < 200; seed++) {
    const a = makeLayouts(seed), b = makeLayouts(seed);
    for (let d = 0; d <= 20; d++) {
      const L = a(d);
      assert.deepEqual(L.spans.map(s => s.keys), b(d).spans.map(s => s.keys));
      if (d === 0 || d === MAX_DEPTH) { assert.equal(L.spans.length, 0); continue; }
      const cfg = L.theme.spans;
      // (a hairpin's twin spans, world/areas.js, count as one)
      assert.ok(L.spans.filter(s => !s.twin).length + (L.spans.some(s => s.twin) ? 1 : 0) <= cfg.max);
      for (const s of L.spans) {
        s.island ? island++ : route++;
        at.add(d); if (L.theme.cave) cave++;
        if (s.sky) { sky++; assert.ok(cfg.sky > 0, `${seed}/${d}: no sky spans in ${L.theme.props}`); }
        assert.ok(Math.max(...s.levels) <= (cfg.deck ?? 22), `${seed}/${d}: deck too high`);
        if (s.n === 2) long++;
        // a straight line, every face of it a portal, nothing guarded or crowded on it
        s.keys.forEach((k, j) => {
          assert.ok(L.exists.has(k));
          if (j) assert.equal(step(s.keys[j - 1], s.dir), k);
          if (j < s.keys.length - 1) assert.ok(L.portals.has(faceKey(k, s.dir)));
          assert.ok(!L.guardians.has(k) && !L.hordes.has(k), `${seed}/${d}: ${k} on a span`);
        });
        for (const k of s.keys.slice(1, -1)) assert.ok(!L.sitePlans.has(k));
        assert.equal(s.levels.length, s.n + 1);
        if (s.island) {
          // nothing but the bridge leads to the island or its gorge
          for (const k of s.keys.slice(1)) for (let d4 = 0; d4 < 4; d4++) {
            const n = step(k, d4);
            if (L.exists.has(n)) assert.ok(s.keys.includes(n), `${seed}/${d}: ${n} next to the island of ${s.id}`);
          }
        } else s.keys.forEach((k, j) => assert.equal(L.route.indexOf(k) - L.route.indexOf(s.keys[0]), j));
      }
    }
  }
  assert.ok(route > 500 && island > 150 && long > 300 && cave > 300 && sky > 100, JSON.stringify({ route, island, long, cave, sky }));
  assert.deepEqual([...at].sort((a, b) => a - b), DEPTHS);
});

test('a span\'s cubes meet at every face and carry one long bridge from pad to pad', () => {
  let bridges = 0;
  for (const seed of SEEDS) {
    const w = worldOf(seed);
    for (const d of DEPTHS) for (const s of w.layout(d).spans) {
      const maps = s.keys.map(k => w.cube(k).map);
      // the crossings: pads at the deck's level on both sides, at the same place
      for (let j = 0; j <= s.n; j++) {
        const a = maps[j], b = maps[j + 1];
        const pa = a.portals.find(p => p.dir === s.dir), pb = b.portals.find(p => p.dir === (s.dir ^ 1));
        assert.equal(pa.y, s.levels[j] * LH, `${seed}: ${s.keys[j]} pad`);
        assert.equal(pb.y, s.levels[j] * LH);
        assert.equal(s.dir < 2 ? pa.z : pa.x, s.pos);
        assert.equal(s.dir < 2 ? pb.z : pb.x, s.pos);
      }
      // ground matches on both sides of every face of every span cube
      for (const k of s.keys.slice(1)) for (let d4 = 0; d4 < 4; d4++) {
        const n = step(k, d4);
        if (!w.layout(d).exists.has(n)) continue;
        const m = w.cube(k).map, o = w.cube(n).map;
        if (o.flip) continue;   // (Flip's box: its walls are the cube's sides, cubegen/fliparena.js)
        for (let t = 0; t < N; t++) {
          const f = ground(m, edge(d4, t, 0)), g = ground(o, edge(d4 ^ 1, t, 0));
          assert.equal(!!f, !!g);
          if (f && !f.fluid && !g.fluid) assert.equal(f.top, g.top, `${seed}: ${k} face ${d4} at ${t}`);
        }
      }
      // each gorge cube: one bridge over the whole valley, its deck over the ground
      s.keys.slice(1, s.n + 1).forEach((k, i) => {
        const m = w.cube(k).map, runs = m.runs.filter(r => r.span);
        assert.equal(runs.length, 1, `${seed}: ${k} has ${runs.length} span bridges`);
        const r = runs[0];
        assert.equal(r.k, N - 4);
        assert.deepEqual([r.from.top, r.to.top].sort((x, y) => x - y), [s.levels[i], s.levels[i + 1]].sort((x, y) => x - y));
        for (const p of r.pieces) {
          const deck = Math.min(runY(p, 0, 0), runY(p, 1, 1), runY(p, 0.5, 0.5));
          for (const f of m.cols[p.c]) if (f.top * LH < deck) assert.ok(Math.max(...f.cs) < deck - 0.4, `${seed}: ${k} ground under the deck`);
        }
        assert.equal(m.archetype, 'gorge');
        // over the sky nothing stands on the void under the bridge
        if (s.sky) { assert.notEqual(r.style, 'stone'); assert.ok(!r.pillars?.length, `${seed}: ${k} legs into the void`); }
        bridges++;
      });
      // every portal of every span cube leads on (the bridge works both ways)
      for (const m of maps) for (const p of m.portals) assert.equal(m.safe[p.floor.id], 1);
      if (s.island) assert.ok(maps.at(-1).rewardSites.length + maps.at(-1).siteFailures.length > 0, 'the island has a destination');
    }
  }
  assert.ok(bridges > 15);
});

test('span cubes are the same whichever way the depth is explored', () => {
  const sig = m => JSON.stringify({ floors: m.floors.map(f => [f.c, f.bottom, f.top]), runs: m.runs.map(r => [r.kind, r.style, r.cells]) });
  for (const seed of [2, 7]) {
    const keys = DEPTHS.flatMap(d => new World(seed).layout(d).spans.flatMap(s => s.keys));
    const a = new World(seed), b = new World(seed);
    const fwd = keys.map(k => sig(a.cube(k).map)), back = [...keys].reverse().map(k => sig(b.cube(k).map)).reverse();
    assert.deepEqual(back, fwd);
    for (const k of keys) assert.ok(parse(k)[1] < 0);
  }
});

test('the character walks every span bridge both ways without falling off', () => {
  let walks = 0;
  for (const seed of SEEDS.slice(0, 8)) {
    const w = worldOf(seed);
    for (const d of DEPTHS) for (const s of w.layout(d).spans) s.keys.slice(1, s.n + 1).forEach(k => {
      const m = w.cube(k).map, r = m.runs.find(q => q.span);
      const ends = [r.from, r.to].map(f => ({ x: f.x + 0.5, z: f.z + 0.5, y: floorY(f, 0.5, 0.5) }));
      for (const [a, b] of [ends, [...ends].reverse()]) {
        place(m, a.x, a.y, a.z);
        const lowest = Math.min(a.y, b.y) - 1;
        let i = 0;
        for (; i < 1200; i++) {
          const dx = b.x - player.x, dz = b.z - player.z, dist = Math.hypot(dx, dz);
          if (dist < 0.15) break;
          movePlayer(DT, dx / dist, dz / dist, true, false);
          assert.ok(player.y > lowest, `${seed}: ${k} fell off the bridge at ${player.x.toFixed(2)}, ${player.z.toFixed(2)}`);
        }
        assert.ok(i < 1200, `${seed}: ${k} never got across (${player.x.toFixed(2)}, ${player.y.toFixed(2)}, ${player.z.toFixed(2)})`);
        assert.ok(Math.abs(player.y - b.y) < 0.3, `${seed}: ${k} arrived at the wrong height`);
        walks++;
      }
      // the side rails: pushing sideways in the middle keeps you on the deck
      const p = r.pieces[r.k >> 1], cx = p.c % N + 0.5, cz = Math.floor(p.c / N) + 0.5, y = runY(p, 0.5, 0.5);
      for (const side of [-1, 1]) {
        place(m, cx, y, cz);
        for (let i = 0; i < 120; i++) movePlayer(DT, r.dz * side, r.dx * side, true, false);
        assert.ok(Math.abs(player.y - y) < 0.5, `${seed}: ${k} pushed off the bridge`);
      }
    });
  }
  assert.ok(walks > 20);
});
