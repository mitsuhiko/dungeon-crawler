// Woppylava's arena, the cinder pit (cubegen/arenashapes.js `cinder`, cubegen/guardian.js), and the
// volcano that rises out of it in his fight (core/mountains.js `volcano`, docs/bosses.md
// "Woppylava"): it fits in the middle of the pit, nothing built where it rises; it is high, its road
// climbs from the basin round it to the crater's rim a level at a time; his lava floods the basin
// under the road's foot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './fixtures.js';
import { worldOf } from './worlds.js';
import { N, LH, DIRS, LAVA } from '../src/core/constants.js';
import { idx, inb } from '../src/core/util.js';
import { BOSSES, BOSS_ARENAS } from '../src/core/bosses.js';
import { CINDER } from '../src/cubegen/arenashapes.js';
import { VOLCANO, VOLCANO_TIMES, MOUNTAIN, ALL_SHAPES, SHAPES, freeCells, planMountain, sunk, stepMountain, bringDown, mountainTimes } from '../src/core/mountains.js';
import { mountainGeometry, volcanoLook, volcanoGlow } from '../src/render/mountaingeo.js';
import { Color } from '../vendor/three/three.core.js';
import { themesAt } from '../src/themes/depth.js';
import { generate } from '../src/cubegen/index.js';

const DEPTH = 18, SEEDS = process.env.CINDER_SEEDS ? process.env.CINDER_SEEDS.split(",").map(Number) : [1, 3, 4];
const pit = seed => { const w = worldOf(seed); return w.cube(w.descentSpec(DEPTH).key).map; };
const specOf = (m, seed = 5) => ({ n: 1, seed, shape: 'volcano', a: m.volcano.a, x: m.volcano.x, z: m.volcano.z, phase: 'crack', t: 0, life: 1e6 });
const dist = (m, x, z) => Math.hypot(x + 0.5 - m.volcano.x, z + 0.5 - m.volcano.z);
// floors reached from `from` over links (`links(f)`: its neighbours)
function reach(from, links) {
  const seen = new Set([from]), queue = [from];
  for (let i = 0; i < queue.length; i++) for (const g of links(queue[i])) if (g && !seen.has(g)) { seen.add(g); queue.push(g); }
  return seen;
}
// the links with the volcano up (as game/mountains.js sets them): its cells' own, the ground's to it
// where it joins the ground
function upLinks(m, plan) {
  const cells = plan.cells, ground = new Map();
  for (const v of cells.values()) v.link.forEach((l, d) => { if (l && !l.up) ground.set(`${l.f.c} ${d ^ 1}`, v.f); });
  return f => cells.has(f.c) ? cells.get(f.c).link.map(l => l?.f ?? null)
    : f.link.map((g, d) => g && cells.has(g.c) ? ground.get(`${f.c} ${d}`) ?? null : g);
}

test('Woppylava has his cinder pit at depth 18', () => {
  assert.equal(BOSSES[DEPTH], 'woppylava');
  assert.equal(BOSS_ARENAS.woppylava.type, 'cinder');
  assert.deepEqual(ALL_SHAPES, [...SHAPES, 'volcano']);
  assert.ok(!SHAPES.includes('volcano'), 'Monteur never pulls it up');
  for (const seed of SEEDS) {
    const m = pit(seed);
    assert.equal(m.arena.type, 'cinder');
    const v = m.volcano, level = m.portals[0].y / LH;
    assert.deepEqual([v.x, v.z, v.basin], [N / 2, N / 2, level + CINDER.low]);
    // its road starts on the side you come in from
    const door = m.portals.find(p => p.kind === 'side');
    assert.ok(Math.abs(Math.atan2(door.x + 0.5 - v.x, door.z + 0.5 - v.z) - v.a) < 1e-3);
    // the basin: flat, a level or two under the doorways; the mound in its middle a level or two
    const zone = m.floors.filter(f => f.encounter);
    const basin = zone.filter(f => f.top === v.basin && dist(m, f.x, f.z) > CINDER.mound + 1.5 && dist(m, f.x, f.z) < 8);
    assert.ok(basin.length > 100, 'a wide flat basin');
    const mound = zone.filter(f => dist(m, f.x, f.z) <= CINDER.mound);
    assert.ok(mound.every(f => f.top > v.basin && f.top <= v.basin + 2 && f.surface === 'crust'), 'a low scorched mound');
  }
});

test('the volcano rises in the middle of the pit: nothing built where it stands, the boss, the doorways and the well round it', () => {
  for (const seed of SEEDS) {
    const m = pit(seed), ok = freeCells(m), plan = planMountain(m, specOf(m), ok);
    assert.ok(plan, `it fits in ${seed}'s pit`);
    // all of its footprint is free ground of the fight, one floor a column
    for (let c = 0; c < N * N; c++) if (dist(m, c % N, (c / N) | 0) <= VOLCANO.foot) assert.ok(ok[c], `${seed}: ${c % N},${(c / N) | 0} free`);
    for (const p of m.portals) for (const c of p.cells) assert.ok(dist(m, c % N, (c / N) | 0) > VOLCANO.foot + 0.5, `${seed}: ${p.kind} clear of it`);
    assert.ok(dist(m, m.guardian.floor.x, m.guardian.floor.z) > CINDER.clear, 'his spot clear of it');
    assert.ok(!m.arenaPlacements.some(q => dist(m, Math.floor(q.x), Math.floor(q.z)) <= CINDER.clear && !/cinders|pumice_chips/.test(q.name) && q.normal === undefined),
      'nothing but cover where it rises');
    // big: the cone 8 cells and more round, 16 levels and more over the basin, its crater open
    assert.ok(plan.cells.size > 180, `${plan.cells.size} cells`);
    assert.equal(plan.ref, m.volcano.basin);
    const tops = [...plan.cells.values()].map(v => v.top - m.volcano.basin);
    assert.ok(Math.max(...tops) >= 16, `${Math.max(...tops)} levels high`);
    const crater = [...plan.cells.values()].filter(v => v.crater), rim = Math.max(...tops) + m.volcano.basin;
    assert.ok(crater.length >= 8 && crater.every(v => v.top === rim - VOLCANO.deep && dist(m, v.x, v.z) < 2), 'a crater in its top');
    assert.ok(crater.every(v => v.link.every((l, d) => !l || plan.cells.get(l.f.c)?.crater)), 'its floor walled in');
    // the same spec, the same volcano (every game raises it after his row)
    assert.deepEqual([...planMountain(m, specOf(m), ok).cells.values()].map(v => [v.c, v.top, v.road ?? false]), [...plan.cells.values()].map(v => [v.c, v.top, v.road ?? false]));
  }
});

test('its road winds up from the basin round it to the crater\'s rim, a level at a time; the rock beside it is a cliff', () => {
  for (const seed of SEEDS) {
    const m = pit(seed), plan = planMountain(m, specOf(m, seed)), basin = m.volcano.basin, rim = basin + VOLCANO.top;
    const road = [...plan.cells.values()].filter(v => v.road);
    // its foot joins the basin floor round it (or the slope up to the doorway, where it starts by it)
    const foot = road.filter(v => v.link.some(l => l && !l.up && l.f.top <= basin + 1));
    assert.ok(foot.length >= 1, `${seed}: the road's foot on the basin`);
    // up the road alone to its top at the rim
    const up = reach(foot[0].f, f => plan.cells.get(f.c).link.map(l => l?.up && plan.cells.get(l.f.c).road ? l.f : null));
    const top = [...up].map(f => plan.cells.get(f.c)).filter(v => v.top >= rim - 1 && v.link.some(l => l?.up && plan.cells.get(l.f.c).top === rim && !plan.cells.get(l.f.c).road));
    assert.ok(top.length, `${seed}: the road reaches the crater's rim`);
    assert.ok(up.size >= 60, `${seed}: a long road (${up.size} cells)`);
    // it winds round: its cells all round the volcano, and over a turn (two turns of it at the angle it starts at)
    const angle = v => Math.atan2(v.x + 0.5 - m.volcano.x, v.z + 0.5 - m.volcano.z);
    const sectors = new Set(road.map(v => Math.floor((angle(v) + Math.PI) / (Math.PI / 6))));
    assert.equal(sectors.size, 12, 'all round');
    const at = road.filter(v => Math.abs(Math.atan2(Math.sin(angle(v) - m.volcano.a), Math.cos(angle(v) - m.volcano.a))) < 0.25);
    assert.ok(Math.max(...at.map(v => v.top)) - Math.min(...at.map(v => v.top)) > 10, 'a turn above its foot');
    // the rock: not a slope onto it from the road but at its ends
    for (const v of road) v.link.forEach(l => {
      const n = l && plan.cells.get(l.f.c);
      if (n && !n.road) assert.ok(v.top >= rim - 1 || v.top <= basin + 2 || n.top >= rim - 1, `${seed}: road ${v.x},${v.z} onto the rock`);
    });
    const rock = [...plan.cells.values()].filter(v => !v.road && !v.crater && v.top < rim - 1);
    const steep = rock.filter(v => DIRS.some(([dx, dz]) => { const n = plan.cells.get(idx(v.x + dx, v.z + dz)); return n && Math.abs(n.top - v.top) >= 2; }));
    assert.ok(steep.length > rock.length * 0.7, `${seed}: steep and rough (${steep.length} of ${rock.length})`);
  }
});

test('his lava floods the basin round it, under its road; gone once he is beaten', () => {
  for (const seed of SEEDS) {
    const m = pit(seed), plan = planMountain(m, specOf(m)), t = m.tide, basin = m.volcano.basin;
    assert.equal(t.fluid, LAVA);
    assert.ok(t.rest < basin && t.gone === t.rest, 'none at rest, none once beaten');
    assert.ok(t.high > basin, 'over the basin floor');
    const road = [...plan.cells.values()].filter(v => v.road);
    assert.ok(t.high < Math.min(...road.map(v => v.top)), 'under the road\'s foot');
    assert.ok(t.high < m.portals[0].y / LH, 'under the doorway');
    assert.deepEqual(t.box, [2, 2, N - 2, N - 2]);
  }
});

test('the doorway, his spot and the well are reached, with the volcano down and up', () => {
  for (const seed of SEEDS) {
    const m = pit(seed), plan = planMountain(m, specOf(m)), door = m.portals[0].floor, well = m.portals[1].floor, guard = m.guardian.floor;
    const down = reach(door, f => f.link);
    assert.ok(down.has(well) && down.has(guard), `${seed}: down`);
    const up = reach(door, upLinks(m, plan));
    assert.ok(up.has(well) && up.has(guard), `${seed}: up, round it`);
    const road = [...plan.cells.values()].filter(v => v.road).map(v => v.f);
    assert.ok(road.some(f => up.has(f)) && plan.cells.get([...up].find(f => plan.cells.get(f.c)?.top === basin(m) + VOLCANO.top)?.c), `${seed}: up it to the rim`);
  }
});
const basin = m => m.volcano.basin;

test('it cracks, rises in jolts, stands till his death and comes down', () => {
  const m = pit(SEEDS[0]), plan = planMountain(m, specOf(m)), s = specOf(m), T = VOLCANO_TIMES;
  assert.equal(mountainTimes('volcano'), T);
  assert.equal(mountainTimes('mesa'), MOUNTAIN);
  assert.ok(T.crack > 2 && T.rise > 6 && T.fall > 3, 'slower than Monteur\'s');
  assert.equal(sunk(plan, 'crack', 1), plan.drop);
  // rising: a heave and a hold, each jolt
  const q = T.rise / T.riseJolts;
  for (let i = 0; i < T.riseJolts; i++) {
    const a = sunk(plan, 'rise', i * q + q * 0.5), b = sunk(plan, 'rise', i * q + q * 0.95);
    assert.ok(Math.abs(a - b) < 1e-9 && a < plan.drop, `held after jolt ${i}`);
  }
  assert.equal(sunk(plan, 'rise', T.rise), 0);
  // its clock: up for its life (his death brings it down)
  assert.equal(stepMountain(s, T.crack + 0.01), 'rise');
  assert.equal(stepMountain(s, T.rise), 'up');
  for (let i = 0; i < 100; i++) assert.equal(stepMountain(s, 1), null);
  bringDown(s);
  assert.equal(s.phase, 'fall');
  assert.equal(stepMountain(s, T.fall + 0.01), 'gone');
  // brought down while it rises: from as high as it got
  const r = { ...specOf(m), phase: 'rise', t: T.rise / 2 }, high = sunk(plan, 'rise', r.t);
  bringDown(r);
  assert.ok(Math.abs(sunk(plan, 'fall', r.t) - high) < plan.drop / T.jolts + 1e-9);
});

test('it is drawn in the colours of each theme of its depth, lighter than the floor, its road paler, glowing; quickly', () => {
  const spec = worldOf(SEEDS[0]).descentSpec(DEPTH), looks = new Set();
  const lum = c => { const k = new Color(c); return 0.3 * k.r + 0.59 * k.g + 0.11 * k.b; };
  for (const theme of themesAt(DEPTH)) {
    const m = generate({ ...spec, biome: theme.props }), plan = planMountain(m, specOf(m));
    const t0 = performance.now(), geo = mountainGeometry(plan, m), glow = volcanoGlow(plan, m), ms = performance.now() - t0;
    assert.ok(ms < 300, `${theme.props}: built in ${ms.toFixed(0)} ms`);
    assert.ok(Math.abs(geo.bounds[4] - (m.volcano.basin + VOLCANO.top) * LH) < 0.3, `${theme.props}: as high as its rim`);
    const look = volcanoLook(theme, plan.ref), cliffs = look.theme.side.slice(0, 3).map(([, c]) => lum(c)), tops = look.theme.top.map(([, c]) => lum(c));
    assert.ok(Math.min(...cliffs) > lum(look.floor) * 1.3, `${theme.props}: its cliffs clearly lighter than the floor round it`);
    assert.ok(lum(look.road) > Math.max(...tops) * 2, `${theme.props}: its road far paler than its rock`);
    looks.add(look.theme.top.map(([, c]) => c).join());
    // its glow: lava down its cliffs and in its crater's walls, hot (over the lit colours' range)
    const tris = glow.pos.length / 9;
    assert.ok(tris > 300 && glow.col.length === glow.pos.length, `${theme.props}: ${tris} glowing triangles`);
    let hot = 0;
    for (let i = 0; i < glow.col.length; i += 3) if (glow.col[i] > 1.2) hot++;
    assert.ok(hot > 50, 'white-hot where the lava comes out');
    const ys = []; for (let i = 1; i < glow.pos.length; i += 3) ys.push(glow.pos[i]);
    assert.ok(Math.max(...ys) > (m.volcano.basin + VOLCANO.top - 1) * LH, 'up to its rim');
    // (the floors in the cube's map are never tinted: only the view's copies)
    assert.ok(m.floors.every(f => f.tint === undefined));
  }
  assert.equal(looks.size, themesAt(DEPTH).length, 'each theme its own');
});
