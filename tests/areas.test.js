import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { worldOf } from './worlds.js';
import { makeLayouts } from '../src/world/layout.js';
import { step, faceKey, parse } from '../src/world/coords.js';
import { spiralAt, innerFaces, AREA_SIZE, templateCells } from '../src/world/areas.js';
import { discoveredFaces } from '../src/core/boundaries.js';
import { portalLocked } from '../src/core/guardians.js';
import { createRun } from '../src/core/progression.js';
import { N, LH, CHAR_R } from '../src/core/constants.js';
import { MAX_DEPTH } from '../src/themes/depth.js';
import { state } from './fixtures.js';
import { player } from '../src/game/state.js';
import { movePlayer } from '../src/physics/move.js';

const SEEDS = Array.from({ length: 8 }, (_, i) => i);
const DEPTHS = Array.from({ length: MAX_DEPTH - 1 }, (_, i) => i + 1);
const cellOf = k => { const [x, , z] = parse(k); return [x, z]; };
// cell j steps in from face d at position t (portals.js edgeCell)
const edge = (d, t, j) => d === 0 ? t * N + N - 1 - j : d === 1 ? t * N + j : d === 2 ? (N - 1 - j) * N + t : j * N + t;
const ground = (m, c) => m.cols[c].find(f => f.layer === 0);
const DT = 1 / 60;

// every large area of a few worlds, with its world
function* areas(seeds = SEEDS) {
  for (const seed of seeds) {
    const w = worldOf(seed);
    for (const d of DEPTHS) for (const piece of w.layout(d).areas) yield { w, piece, seed, d };
  }
}

test('large areas come from the seed alone, built into the route in their shape, never guarded', () => {
  const count = { spiral: 0, hairpin: 0, tableland: 0 };
  for (let seed = 0; seed < 150; seed++) {
    const a = makeLayouts(seed), b = makeLayouts(seed);
    for (let d = 0; d <= MAX_DEPTH; d++) {
      const L = a(d);
      assert.deepEqual(L.areas.map(p => p.keys), b(d).areas.map(p => p.keys));
      if (d === 0 || d === MAX_DEPTH) { assert.equal(L.areas.length, 0); continue; }
      // one large area per depth at most, a tableland included
      assert.ok(L.areas.length + L.heights.length <= 1, `${seed}/${d}`);
      count.tableland += L.heights.length;
      for (const p of L.areas) {
        count[p.kind]++;
        const i = L.route.indexOf(p.keys[0]), size = AREA_SIZE[p.kind];
        assert.ok(i >= 1 && i + size <= L.route.length - 2, `${seed}/${d}: never at the ends`);
        assert.deepEqual(L.route.slice(i, i + size), p.keys, `${seed}/${d}: in order on the route`);
        // the shape: entered at a going f, turning towards l
        const cells = p.keys.map(cellOf), f = [cells[1][0] - cells[0][0], cells[1][1] - cells[0][1]];
        const l = p.kind === 'spiral' ? f : [cells[3][0] - cells[2][0], cells[3][1] - cells[2][1]];
        const want = p.kind === 'spiral' ? templateCells('spiral', cells[0], [cells[3][0] - cells[0][0], cells[3][1] - cells[0][1]], l)
          : templateCells('hairpin', cells[0], f, l);
        assert.deepEqual(cells, want, `${seed}/${d}: ${p.kind} shape`);
        // no guardian, horde or reward site in it (but where nothing else is left), and the room
        // it comes into high up is never guarded either
        for (const k of [...p.keys, L.route[i + size]]) assert.ok(!L.guardians.has(k), `${seed}/${d}: ${k} guarded`);
        for (const k of p.keys) assert.ok(!L.hordes.has(k) && L.pinnacle !== k && L.peak !== k && L.lake !== k);
        // nothing branches off it
        for (const k of L.exists) if (!L.route.includes(k)) assert.ok(p.keys.every(t => [0, 1, 2, 3].every(d4 => step(t, d4) !== k)), `${seed}/${d}: a branch beside ${p.id}`);
        if (p.kind === 'hairpin') {
          // two spans side by side, the low one going out, the high one coming back
          const [low, high] = p.spans;
          assert.ok(L.spans.includes(low) && L.spans.includes(high) && low.twin && high.twin);
          assert.deepEqual(low.keys, p.keys.slice(0, 3)); assert.deepEqual(high.keys, p.keys.slice(3));
          assert.ok(low.levels[0] < low.levels[1] && low.levels[1] < p.mid && p.mid <= high.levels[0] && high.levels[0] < high.levels[1]);
          assert.equal(high.levels[1], p.top);
          assert.equal(low.sky, high.sky);
        } else {
          assert.ok(p.lo < p.crossings[0].level || p.crossings[0].level === p.lo);
          assert.ok(p.crossings.every((c, j) => !j || c.level > p.crossings[j - 1].level), `${seed}/${d}: the ramp climbs`);
          assert.ok(p.crossings[2].level < p.hi && p.core > p.hi + 2);
          assert.ok(p.fe > 0 && p.fe < Math.PI / 2 && p.fx > Math.PI * 1.5 && p.fx < Math.PI * 2);
        }
      }
    }
  }
  // about one large area per depth, most of them of the new kinds
  const depths = 150 * (MAX_DEPTH - 1), all = count.spiral + count.hairpin + count.tableland;
  assert.ok(all > depths * 0.5 && count.spiral > depths * 0.2 && count.hairpin > depths * 0.05 && count.tableland > depths * 0.1, JSON.stringify(count));
});

// docs/world.md, "Only where you have been": an area is no exception
test('an area is discovered a cube at a time: a portal on every step, its faces open only once walked', () => {
  let areasSeen = 0;
  for (let seed = 0; seed < 60; seed++) {
    const get = makeLayouts(seed);
    for (const d of DEPTHS) {
      const L = get(d), run = createRun();
      for (const k of L.guardians.keys()) run.unlockedGates.add(k);
      const cubes = new Map([...L.exists].map(k => [k, { key: k, visits: 0, map: {
        key: k, exit: L.exit.get(k), routeIndex: L.routeIndex.get(k), route: L.route,
        gateKeys: [0, 1, 2, 3].map(d4 => L.gateFaces.get(faceKey(k, d4))),
        portals: [0, 1, 2, 3].filter(d4 => L.portals.has(faceKey(k, d4))).map(dir => ({ dir, kind: 'side' })) } }]));
      for (const p of L.areas) {
        areasSeen++;
        const faces = innerFaces(p);
        // exactly the faces between two of its cubes
        for (const k of p.keys) for (let d4 = 0; d4 < 4; d4++)
          assert.equal(faces.includes(faceKey(k, d4)), p.keys.includes(step(k, d4)));
        assert.equal(faces.length, p.kind === 'spiral' ? 4 : 7);
        // from one of its cubes to the next: through a portal, like anywhere else
        p.keys.slice(1).forEach((k, j) => {
          const d4 = [0, 1, 2, 3].find(x => step(p.keys[j], x) === k);
          assert.ok(L.portals.has(faceKey(p.keys[j], d4)), `${seed}/${d}: no portal from ${p.keys[j]} to ${k}`);
        });
        // walked in route order: no face of a visited cube opens towards one not yet visited,
        // and once all of it is walked, all of its inner faces are open
        for (const k of L.route.slice(0, L.route.indexOf(p.keys[0]))) cubes.get(k).visits = 1;
        for (const k of p.keys) {
          cubes.get(k).visits = 1;
          for (const c of cubes.values()) if (c.visits) for (const fk of discoveredFaces(cubes, c, run)) {
            const [a, d4] = fk.split('/');
            assert.ok(cubes.get(a).visits && cubes.get(step(a, +d4)).visits, `${seed}/${d}: ${fk} open towards an unvisited cube`);
          }
        }
        const open = new Set(p.keys.flatMap(k => discoveredFaces(cubes, cubes.get(k), run)));
        for (const fk of faces) assert.ok(open.has(fk), `${seed}/${d}: ${fk} still shut once walked`);
      }
    }
  }
  assert.ok(areasSeen > 300, `${areasSeen} areas`);
});

test("an area's cubes meet at every face, whichever cube decided it", () => {
  for (const { w, piece, seed, d } of areas()) {
    const L = w.layout(d);
    const maps = piece.keys.map(k => w.cube(k).map);
    for (const m of maps) {
      assert.deepEqual(m.area.keys, piece.keys);
      assert.equal(m.K, 1, `${seed}/${d}: ${m.key} one layer`);
      for (const p of m.portals) assert.equal(m.safe[p.floor.id], 1, `${seed}/${d}: ${m.key} portal ${p.dir}`);
    }
    // ground matches on both sides of every face of every area cube, corners included
    for (const k of piece.keys) for (let d4 = 0; d4 < 4; d4++) {
      const n = step(k, d4);
      if (!L.exists.has(n)) continue;
      const m = w.cube(k).map, o = w.cube(n).map;
      for (let t = 0; t < N; t++) {
        const f = ground(m, edge(d4, t, 0)), g = ground(o, edge(d4 ^ 1, t, 0));
        assert.equal(!!f, !!g, `${seed}/${d}: ${k} face ${d4} at ${t}`);
        if (f && !f.fluid && !g.fluid) assert.equal(f.top, g.top, `${seed}/${d}: ${k} face ${d4} at ${t}`);
      }
    }
    // the same faces when the area is made the other way round
    const fresh = new World(seed);
    for (const k of [...piece.keys].reverse()) fresh.prepare(k);
    for (const k of piece.keys) for (let d4 = 0; d4 < 4; d4++)
      assert.deepEqual(fresh.faces.get(faceKey(k, d4)).profile, w.faces.get(faceKey(k, d4)).profile, `${seed}/${d}: ${k}/${d4}`);
  }
});

function place(m, x, y, z) {
  state.map = m;
  Object.assign(player, { x, y, z, vx: 0, vy: 0, vz: 0, visY: y, grounded: true, swimming: false, fluid: 0,
    stun: 0, coyote: 0, jumpBuf: 0, r: CHAR_R, h: 0.85, support: null, climb: null });
  movePlayer(DT, 0, 0, false, false);
}

test('a spiral: one ramp round the mountain, walked from the foot to the top, railed all along', () => {
  let walked = 0, pushed = 0;
  for (const { w, piece, seed, d } of areas()) {
    if (piece.kind !== 'spiral') continue;
    piece.keys.forEach((k, i) => {
      const m = w.cube(k).map, at = f => spiralAt(piece, parse(k)[0] * N + f.x + 0.5, parse(k)[2] * N + f.z + 0.5).part;
      // nothing leads from the low ground beside the mountain onto the ramp (the faces are open:
      // that would be a way past the climb); the way up is the ramp
      const foot = f => !f.landing && at(f) === 'foot' && !f.prot;
      const high = f => !f.landing && (at(f) === 'ramp' || at(f) === 'ridge');
      for (const r of [...m.runs.filter(q => q.kind !== 'landing'), ...m.ladders.map(l => ({ from: m.floors[l.lo], to: m.floors[l.hi] }))])
        assert.ok(!(foot(r.from) && high(r.to)) && !(high(r.from) && foot(r.to)), `${seed}/${d}: ${k} a structure from the foot onto the ramp`);
      for (const mv of m.moves) if (mv.kind !== 'walk' && mv.kind !== 'drop')
        assert.ok(!(foot(mv.from) && high(mv.to)) && !(high(mv.from) && foot(mv.to)), `${seed}/${d}: ${k} ${mv.kind} from the foot onto the ramp`);
      // the route climbs: in low (the foot) and out high (the top of the ramp, the ridge)
      const levels = m.portals.map(p => p.y / LH);
      if (i === 0) assert.ok(Math.min(...levels) <= piece.lo + 1);
      if (i === 3) assert.equal(m.portals.find(p => p.dir === piece.exit.dir).y / LH, piece.hi);
      // walk the way from the portal it is entered by to the exit
      const route = m.routes[0], [X, , Z] = parse(k);
      const onFoot = q => spiralAt(piece, X * N + q.x, Z * N + q.z).part === 'foot';
      place(m, route[0].x, route[0].y, route[0].z);
      route.slice(1).forEach((q, j) => {
        // over a gap (a jump on the low ground, not this test's business): onto the landing
        if (route[j].takeoff) { place(m, q.x, q.y - 0.12, q.z); return; }
        for (let n = 0; n < 240 && Math.hypot(q.x - player.x, q.z - player.z) > 0.2; n++) {
          const dx = q.x - player.x, dz = q.z - player.z, dist = Math.hypot(dx, dz);
          movePlayer(DT, dx / dist, dz / dist, false, false);
        }
        // up a ladder or a steep step from the low ground (this walker neither climbs nor jumps;
        // the foot's ways are not this test's business either): on from there
        if (Math.hypot(q.x - player.x, q.z - player.z) > 0.2 && onFoot(route[j])) { place(m, q.x, q.y - 0.12, q.z); return; }
        assert.ok(Math.hypot(q.x - player.x, q.z - player.z) <= 0.2 && Math.abs(player.y - q.y + 0.12) < 0.6,
          `${seed}/${d}: ${k} stuck at ${player.x.toFixed(2)}, ${player.y.toFixed(2)}, ${player.z.toFixed(2)} on the way to ${q.x}, ${q.z}`);
      });
      walked++;
      // the rails: pushing outwards, away from the mountain, where the ramp stands high over the
      // foot, keeps you on it
      const ox = piece.O[0] * N - X * N, oz = piece.O[1] * N - Z * N;
      const on = route.filter(q => { const s = spiralAt(piece, X * N + q.x, Z * N + q.z); return s.part === 'ramp' && s.level >= piece.lo + 6; });
      for (const q of on.filter((_, j) => j % 4 === 2)) {
        place(m, q.x, q.y - 0.12, q.z);
        const y0 = player.y, dx = q.x - ox, dz = q.z - oz, dist = Math.hypot(dx, dz);
        for (let n = 0; n < 90; n++) movePlayer(DT, dx / dist, dz / dist, true, false);
        assert.ok(player.y > y0 - 0.6, `${seed}/${d}: ${k} fell off the ramp at ${q.x}, ${q.z}`);
        pushed++;
      }
    });
  }
  assert.ok(walked > 40 && pushed > 40, `${walked} walks, ${pushed} pushes`);
});

test("a hairpin: two bridges over one canyon, the summit high all round, the foot under its cliff", () => {
  let n = 0;
  for (const { w, piece, seed, d } of areas()) {
    if (piece.kind !== 'hairpin') continue;
    n++;
    const [a, b, , , e, f] = piece.keys.map(k => w.cube(k).map);
    assert.equal(a.archetype, 'foot'); assert.equal(b.archetype, 'gorge'); assert.equal(e.archetype, 'gorge'); assert.equal(f.archetype, 'summit');
    // one bridge in each gorge, the high one up at the summit
    for (const [m, span] of [[b, piece.spans[0]], [e, piece.spans[1]]]) {
      const r = m.runs.filter(q => q.span);
      assert.equal(r.length, 1, `${seed}/${d}: ${m.key}`);
      assert.deepEqual([r[0].from.top, r[0].to.top].sort((x, y) => x - y), [...span.levels].sort((x, y) => x - y));
    }
    // the canyon runs on through both gorges: no wall on the face between them
    const fk = faceKey(piece.keys[1], [0, 1, 2, 3].find(d4 => step(piece.keys[1], d4) === piece.keys[4]));
    assert.equal(w.faces.get(fk).wall, null);
    // the summit: high ground all over; the foot: low, its face towards the summit a cliff
    const inner = m => m.floors.filter(g => !g.layer && !g.fluid && g.x > 0 && g.z > 0 && g.x < N - 1 && g.z < N - 1);
    assert.ok(inner(f).every(g => g.top === piece.top), `${seed}/${d}: the summit`);
    assert.ok(inner(a).every(g => g.top <= Math.max(piece.spans[0].levels[0] + 1, 6)), `${seed}/${d}: the foot`);
    // in at the foot down low, out of the summit up high
    const route = w.layout(d).route, i = route.indexOf(a.key), toward = (m, k) => m.portals.find(p => p.dir < 4 && step(m.key, p.dir) === k);
    assert.ok(toward(a, route[i - 1]).y / LH <= 6, `${seed}/${d}: in low`);
    assert.equal(toward(f, route[i + 6]).y / LH, piece.top, `${seed}/${d}: out high`);
  }
  assert.ok(n > 3, `${n} hairpins`);
});

test('set pieces: a lone peak climbed by its ladder, a great lake walked round by its shore', () => {
  let peaks = 0, lakes = 0, islets = 0;
  for (const seed of Array.from({ length: 16 }, (_, i) => i)) {
    const w = worldOf(seed);
    for (const d of DEPTHS) {
      const L = w.layout(d);
      assert.ok([L.pinnacle, L.peak, L.lake].filter(Boolean).length <= 1);
      if (L.peak) {
        const m = w.cube(L.peak).map, spec = (w.prepare(L.peak), w.spec(L.peak)).peak;
        assert.ok(m.sparse && m.K === 1 && m.archetype === 'peak');
        const on = g => !g.landing && g.x >= spec.x && g.z >= spec.z && g.x < spec.x + spec.side && g.z < spec.z + spec.side;
        const site = m.rewardSites[0];
        assert.ok(site, `${seed}/${d}: ${JSON.stringify(m.siteFailures)}`);
        assert.ok(on(m.floors[site.floor]), `${seed}/${d}: the discovery is on top`);
        // nothing but a ladder leads up onto the top
        const up = m.moves.filter(mv => on(mv.to) && !on(mv.from));
        assert.ok(up.length && up.every(mv => mv.kind === 'ladder' || mv.kind === 'drop'), `${seed}/${d}: ${up.map(mv => mv.kind)}`);
        assert.ok(m.runs.every(r => r.kind === 'landing' || r.span || !(on(r.from) !== on(r.to))), `${seed}/${d}: a structure onto the peak`);
        peaks++;
      }
      if (L.lake) {
        const m = w.cube(L.lake).map, spec = (w.prepare(L.lake), w.spec(L.lake)).lake;
        assert.ok(m.sparse && m.K === 1 && m.archetype === 'lake');
        // water from shore to shore, never on the cube's outer ring (but where a river comes in)
        const wet = m.floors.filter(g => g.fluid);
        assert.ok(wet.length > 50, `${seed}/${d}: ${wet.length} cells of water`);
        for (const g of wet) if (!g.x || !g.z || g.x === N - 1 || g.z === N - 1) assert.ok(w.faces.get(faceKey(L.lake, [g.x === N - 1 ? 0 : g.x === 0 ? 1 : g.z === N - 1 ? 2 : 3][0])).river, `${seed}/${d}: water at the rim`);
        // the route keeps to dry ground (bridges included)
        for (const route of m.routes) for (const q of route) {
          const c = Math.floor(q.z) * N + Math.floor(q.x);
          assert.ok(m.cols[c].some(g => !g.fluid && Math.abs(g.top * LH - q.y + 0.12) < 1.5) || m.pieces[c].length, `${seed}/${d}: the route in the water at ${q.x}, ${q.z}`);
        }
        lakes++;
        if (spec.islet && m.rewardSites.length) {
          islets++;
          const isle = new Set(m.floors.filter(g => Math.hypot(g.x + 0.5 - spec.islet.x - 0.5, g.z + 0.5 - spec.islet.z - 0.5) < spec.islet.r).map(g => g.c));
          assert.ok(isle.has(m.floors[m.rewardSites[0].floor].c), `${seed}/${d}: the discovery on the islet`);
          // a bridge out to it
          assert.ok(m.runs.some(r => r.kind === 'bridge' && (isle.has(r.from.c) || isle.has(r.to.c))), `${seed}/${d}: no bridge to the islet`);
        }
      }
    }
  }
  assert.ok(peaks > 8 && lakes > 8 && islets > 3, JSON.stringify({ peaks, lakes, islets }));
});

test('large areas and set pieces are the same whichever way the depth is explored', () => {
  const sig = m => JSON.stringify({ floors: m.floors.map(f => [f.c, f.bottom, f.top, f.fluid]), runs: m.runs.map(r => [r.kind, r.cells]) });
  for (const seed of [1, 5]) {
    const keys = DEPTHS.flatMap(d => { const L = new World(seed).layout(d); return [...L.areas.flatMap(p => p.keys), L.peak, L.lake].filter(Boolean); });
    const a = new World(seed), b = new World(seed);
    const fwd = keys.map(k => sig(a.cube(k).map)), back = [...keys].reverse().map(k => sig(b.cube(k).map)).reverse();
    assert.deepEqual(back, fwd);
  }
});
