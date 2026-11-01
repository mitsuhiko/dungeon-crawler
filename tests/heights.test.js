import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { makeLayouts } from '../src/world/layout.js';
import { step, faceKey, parse, key } from '../src/world/coords.js';
import { shaftOf, shaftHole, heightsOf } from '../src/world/heights.js';
import { fallMask } from '../src/world/voids.js';
import { N, LH, CHAR_R, RAGDOLL_IMPACT } from '../src/core/constants.js';
import { MAX_DEPTH } from '../src/themes/depth.js';
import { ROOF } from '../src/cubegen/tunnel.js';
import { PINNACLE_TOP } from '../src/cubegen/heights.js';
import { mapInfo } from '../src/game/cutinfo.js';
import { state } from './fixtures.js';
import { player } from '../src/game/state.js';
import { movePlayer, landingSpeed } from '../src/physics/move.js';

const SEEDS = Array.from({ length: 8 }, (_, i) => i);
const DEPTHS = Array.from({ length: MAX_DEPTH - 1 }, (_, i) => i + 1);
const at = (k, d) => step(k, d);
const top = (m, c) => m.cols[c].at(-1);
const cell = p => Math.floor(p.z) * N + Math.floor(p.x);
// every point a cube's routes pass (portal to exit and back)
const routePoints = m => m.routes.flat();

test('tablelands and pinnacles come from the seed alone, on the route, clear of guardians, hordes and spans', () => {
  let tablelands = 0, pinnacles = 0, kinds = new Set();
  for (let seed = 0; seed < 120; seed++) {
    const a = makeLayouts(seed), b = makeLayouts(seed);
    for (let d = 0; d <= MAX_DEPTH; d++) {
      const L = a(d);
      assert.deepEqual(L.heights.map(p => p.keys), b(d).heights.map(p => p.keys));
      assert.equal(L.pinnacle, b(d).pinnacle);
      if (d === 0 || d === MAX_DEPTH) { assert.equal(L.heights.length + !!L.pinnacle, 0); continue; }
      assert.ok(L.heights.length <= 1);
      for (const p of L.heights) {
        tablelands++; kinds.add(p.descent);
        const i = L.route.indexOf(p.keys[0]);
        // three rooms in a row on the route, never its ends
        assert.ok(i >= 1 && i + 3 < L.route.length, `${seed}/${d}`);
        p.keys.forEach((k, j) => {
          assert.equal(L.route[i + j], k);
          assert.ok(!L.guardians.has(k) && !L.hordes.has(k) && !L.spanCells.has(k), `${seed}/${d}: ${k}`);
        });
        assert.equal(at(p.keys[0], p.dirs[0]), p.keys[1]); assert.equal(at(p.keys[1], p.dirs[1]), p.keys[2]);
        assert.equal(at(p.keys[0], p.ways[0]), L.route[i - 1]); assert.equal(at(p.keys[2], p.ways[1]), L.route[i + 3]);
        const [lo, hi] = heightsOf(L.theme).shelf;
        assert.ok(p.hi >= lo && p.hi <= hi);
        // nothing branches off a tableland
        for (const k of L.exists) if (!L.route.includes(k)) assert.ok(!p.keys.some(t => [0, 1, 2, 3].some(d4 => at(t, d4) === k) && L.portals.has(faceKey(t, [0, 1, 2, 3].find(d4 => at(t, d4) === k)))), `${seed}/${d}: a branch off ${p.id}`);
      }
      if (L.pinnacle) {
        pinnacles++;
        const intents = L.sitePlans.get(L.pinnacle);
        assert.ok(intents?.length && intents.every(t => !t.landmark), `${seed}/${d}: a pinnacle without a discovery`);
        assert.ok(!L.heightCells.has(L.pinnacle) && !L.spanCells.has(L.pinnacle));
      }
    }
  }
  // (a tableland shares the depth's large-area slot with the large areas, world/areas.js; a pinnacle
  // the set-piece slot with the lone peak and the great lake)
  assert.ok(tablelands > 300 && pinnacles > 550, JSON.stringify({ tablelands, pinnacles }));
  assert.deepEqual([...kinds].sort(), ['plunge', 'shaft', 'stairs']);
});

// every tableland of a few worlds, with its world
function* tablelands(seeds = SEEDS) {
  for (const seed of seeds) {
    const w = new World(seed);
    for (const d of DEPTHS) for (const piece of w.layout(d).heights) yield { w, piece, seed, d };
  }
}

test("a tableland's faces: high all round the plateau, the pads up there, the escarpment beside the ascent and descent", () => {
  for (const { w, piece, seed, d } of tablelands()) {
    for (const k of piece.keys) w.prepare(k);
    const [A, B, C] = piece.keys;
    for (let d4 = 0; d4 < 4; d4++) {
      const f = w.faces.get(faceKey(B, d4));
      assert.ok([...f.profile].slice(1, -1).every(v => v === piece.hi), `${seed}/${d}: plateau face ${d4}`);
    }
    // the way up and the way down cross at the shelf's level
    for (const [k, dir] of [[A, piece.dirs[0]], [B, piece.dirs[1]]]) assert.equal(w.faces.get(faceKey(k, dir)).portal.level, piece.hi);
    // and the way into the ascent and out of the descent stay down low
    assert.ok(w.faces.get(faceKey(A, piece.ways[0])).portal.level < piece.hi - 4, `${seed}/${d}: the way in`);
    assert.ok(w.faces.get(faceKey(C, piece.ways[1])).portal.level < piece.hi - 4, `${seed}/${d}: the way out`);
    // the shared faces are the same, whichever cube decided them
    const fresh = new World(seed);
    for (const k of [...piece.keys].reverse()) fresh.prepare(k);
    for (const k of piece.keys) for (let d4 = 0; d4 < 4; d4++)
      assert.deepEqual(fresh.faces.get(faceKey(k, d4)).profile, w.faces.get(faceKey(k, d4)).profile, `${seed}/${d}: ${k}/${d4}`);
  }
});

test('every tableland generates: the route climbs the escarpment, crosses the plateau and comes down', () => {
  const seen = { plunge: 0, shaft: 0, stairs: 0 };
  for (const { w, piece, seed, d } of tablelands(Array.from({ length: 20 }, (_, i) => i))) {
    const [a, b, c] = piece.keys.map(k => w.cube(k).map);
    assert.equal(a.archetype, 'ascent'); assert.equal(b.archetype, 'plateau'); assert.equal(c.archetype, 'descent');
    for (const m of [a, b, c]) for (const p of m.portals) assert.equal(m.safe[p.floor.id], 1, `${seed}/${d}: ${m.key} portal ${p.dir}`);
    // the plateau is up high, the ascent's foot and the descent's far end down low
    const inner = m => m.floors.filter(f => !f.layer && f.x > 1 && f.z > 1 && f.x < N - 2 && f.z < N - 2);
    assert.ok(inner(b).every(f => f.top >= piece.hi - 1 || f.fluid), `${seed}/${d}: the plateau`);
    assert.ok(Math.min(...inner(a).map(f => f.top)) <= piece.hi - 9, `${seed}/${d}: the escarpment`);
    const kind = c.shaft ? 'shaft' : c.stats.mode.match(/\((\w+)\)/)?.[1];
    seen[kind]++;
    if (kind === 'plunge') {
      // the way on leaps off the edge onto the soft landing, deeper than any ordinary drop
      const leaps = c.moves.filter(m => m.kind === 'drop' && m.to.soft);
      assert.ok(leaps.length, `${seed}/${d}: no plunge`);
      assert.ok(c.floors.filter(f => f.soft).every(f => !f.fluid && f.layer === 0));
    }
  }
  assert.ok(seen.plunge > 5 && seen.shaft > 2 && seen.stairs > 1, JSON.stringify(seen));
});

test('a great shaft opens into the room below: a hole nothing crosses, a ramp round it, a dry basin under it', () => {
  let shafts = 0;
  for (const { w, piece, seed, d } of tablelands(Array.from({ length: 24 }, (_, i) => i))) {
    const below = shaftOf(w, piece);
    if (!below) continue;
    shafts++;
    const m = w.cube(piece.keys[2]).map, hole = shaftHole(piece);
    assert.deepEqual({ cx: m.shaft.cx, cz: m.shaft.cz, r: m.shaft.r }, hole);
    assert.equal(below, key(...[parse(piece.keys[2])].map(([x, y, z]) => [x, y - 1, z])[0]));
    for (let c = 0; c < N * N; c++) {
      const x = c % N + 0.5, z = (c / N | 0) + 0.5, r = Math.hypot(x - hole.cx, z - hole.cz);
      if (r >= hole.r - 0.01) continue;
      assert.equal(m.cols[c].length, 0, `${seed}/${d}: the hole is open at ${c}`);
      assert.ok(m.pieces[c].every(p => p.kind === 'pillar') && !m.pieces[c].length, `${seed}/${d}: something crosses the hole`);
    }
    // down the ramp: the route passes round the hole between the rim and the bottom
    assert.ok(routePoints(m).some(p => { const r = Math.hypot(p.x - hole.cx, p.z - hole.cz); return r > hole.r && r < hole.r + 1.8 && p.y < piece.hi * LH - 1; }),
      `${seed}/${d}: the route does not take the ramp`);
    // the room below: dry ground under the hole, and it knows you may fall in there
    const u = w.cube(below).map, mask = fallMask(w, below);
    for (let c = 0; c < N * N; c++) {
      const x = c % N + 0.5, z = (c / N | 0) + 0.5;
      if (Math.hypot(x - hole.cx, z - hole.cz) >= hole.r) continue;
      assert.ok(m.cols[c].length === 0 && mask[c], `${seed}/${d}: the fall mask`);
      const f = top(u, c);
      assert.ok(f && !f.fluid, `${seed}/${d}: no floor under the shaft at ${c}`);
    }
  }
  assert.ok(shafts >= 2, `only ${shafts} shafts`);
});

test('a pinnacle carries its reward site on top, and the way up winds round it', () => {
  let pinnacles = 0, sites = 0;
  for (const seed of SEEDS) {
    const w = new World(seed);
    for (const d of DEPTHS) {
      const k = w.layout(d).pinnacle;
      if (!k) continue;
      const m = w.cube(k).map;
      if (m.archetype !== 'pinnacle') { w.prepare(k); assert.ok(w.spec(k).kind === 'river' || w.spec(k).kind === 'lake' || w.spec(k).kind === 'gorge'); continue; }
      pinnacles++;
      const site = m.rewardSites[0];
      if (!site) continue;
      sites++;
      const f = m.floors[site.floor];
      // up on the needle, well over everything at its foot
      const around = m.floors.filter(g => !g.layer && Math.hypot(g.x - f.x, g.z - f.z) > PINNACLE_TOP + 2.8 && Math.hypot(g.x - f.x, g.z - f.z) < PINNACLE_TOP + 4);
      assert.ok(f.top >= Math.min(...around.map(g => g.top)) + 9, `${seed}/${d}: the needle is too low`);
      // the approach walks the ramp: no ladder, stair or bridge climbs onto the needle
      w.prepare(k);
      const p = w.spec(k).pinnacle, needle = g => Math.hypot(g.x - p.x, g.z - p.z) < PINNACLE_TOP + 1.7;
      const approach = m.moves.filter(mv => needle(mv.to) && !needle(mv.from) && mv.to.top > mv.from.top + 2 && mv.kind !== 'walk');
      assert.ok(!approach.length, `${seed}/${d}: ${approach.map(mv => mv.kind)}`);
    }
  }
  assert.ok(pinnacles > 20 && sites / pinnacles > 0.9, JSON.stringify({ pinnacles, sites }));
});

test('tunnels: a roof over a passage two cells wide, and the way leads through most of them', () => {
  let tunnels = 0, used = 0;
  for (const seed of SEEDS.slice(0, 3)) {
    const w = new World(seed);
    for (const d of DEPTHS) for (const k of w.layout(d).exists) {
      w.prepare(k);
      if (!w.spec(k).tunnel) continue;
      const m = w.cube(k).map;
      if (!m.tunnel) continue;
      tunnels++;
      // (a waterfall's hidden cave, cubegen/grotto.js, has a roof of its own)
      const roofs = m.floors.filter(f => f.roof && !m.grotto?.cells.includes(f.c));
      assert.equal(roofs.length, 2 * m.tunnel.len, `${seed}/${d}: ${k}`);
      for (const r of roofs) {
        const below = m.cols[r.c][m.cols[r.c].indexOf(r) - 1];
        assert.ok(below && !below.fluid && r.bottom - below.top >= ROOF && r.top - r.bottom >= 3, `${seed}/${d}: ${k} roof at ${r.c}`);
        assert.ok(Math.max(...below.cs) + 0.85 < r.bottom * LH, `${seed}/${d}: no head room`);
        assert.ok(m.pieces[r.c].length === 0, `${seed}/${d}: a structure in the tunnel`);
      }
      // the cutaway takes a roof for a slab (game/cutinfo.js)
      m.cutInfo = null;
      assert.equal(mapInfo(m).slabs.length, m.floors.filter(f => (f.layer > 0 || f.roof) && !f.merged && !f.ramp).length);
      if (routePoints(m).some(p => m.cols[cell(p)]?.some(f => f.roof && p.y < f.bottom * LH))) used++;
    }
  }
  assert.ok(tunnels > 10 && used / tunnels > 0.5, JSON.stringify({ tunnels, used }));
});

test('walking through a tunnel and plunging onto something soft', () => {
  const worlds = [];
  let tunnel = null, plunge = null;
  for (const seed of [3, 4, 5, 6, 7, 8]) for (const d of [5, 6, ...DEPTHS]) {
    if (tunnel && plunge) break;
    const w = worlds[seed] ||= new World(seed, { themes: ['canyon'] });
    for (const k of w.layout(d).exists) {
      w.prepare(k);
      const spec = w.spec(k);
      if (!spec.tunnel && spec.height?.role !== 'descent') continue;
      const m = w.cube(k).map;
      if (!tunnel && m.tunnel) tunnel = m;
      if (!plunge && m.moves.some(mv => mv.to.soft && mv.from.top - mv.to.top > 10)) plunge = m;
    }
    if (tunnel && plunge) break;
  }
  assert.ok(tunnel && plunge);
  const DT = 1 / 60, place = (m, x, y, z) => {
    state.map = m;
    Object.assign(player, { x, y, z, vx: 0, vy: 0, vz: 0, visY: y, grounded: true, swimming: false, fluid: 0,
      stun: 0, coyote: 0, jumpBuf: 0, r: CHAR_R, h: 0.85, support: null });
  };
  // along the passage, under the roof, from one mouth to the other
  const t = tunnel.tunnel, along = (u, v) => t.axis ? [v + 1, u + 0.5] : [u + 0.5, v + 1];
  const [x0, z0] = along(t.from - 1, t.at), [x1, z1] = along(t.from + t.len, t.at);
  place(tunnel, x0, t.level * LH, z0);
  const dx = Math.sign(x1 - x0), dz = Math.sign(z1 - z0);
  for (let i = 0; i < 600 && Math.hypot(player.x - x1, player.z - z1) > 0.3; i++) movePlayer(DT, dx, dz, false, false);
  assert.ok(Math.hypot(player.x - x1, player.z - z1) <= 0.3, `stuck in the tunnel at ${player.x}, ${player.z}`);
  // off the edge: a long way down, but it lands softly
  const leap = plunge.moves.find(mv => mv.to.soft && mv.from.top - mv.to.top > 10), [lx, lz] = [[1, 0], [-1, 0], [0, 1], [0, -1]][leap.d];
  place(plunge, leap.from.x + 0.5, leap.from.top * LH, leap.from.z + 0.5);
  let landed = null;
  for (let i = 0; i < 400 && !landed; i++) {
    const gr = movePlayer(DT, i < 40 ? lx : 0, i < 40 ? lz : 0, false, false);
    if (gr.landed > 0) landed = gr;
  }
  assert.ok(landed && landed.s.soft, 'lands on the soft patch');
  assert.ok(landed.landed > RAGDOLL_IMPACT, `a fall that would knock you over (${landed.landed})`);
  assert.equal(landingSpeed(landed), 0);
  assert.ok(landingSpeed({ ...landed, s: { soft: false } }) > RAGDOLL_IMPACT);
});
