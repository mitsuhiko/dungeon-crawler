import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from './fixtures.js';
import { N, DIRS, LH } from '../src/core/constants.js';
import { edgeKey } from '../src/core/util.js';
import { World } from '../src/world/world.js';
import { makeLayouts } from '../src/world/layout.js';
import { ARENA_WEIGHTS } from '../src/world/arenas.js';
import { generate } from '../src/cubegen/index.js';
import { ARENA_TYPES } from '../src/cubegen/arenashapes.js';
import { propMetadata } from '../src/core/propcatalog.js';
import { guardianSpots } from '../src/game/enemyspawn.js';
import { walkable, findPath } from '../src/physics/enemynav.js';
import { buildCubeGeometry } from '../src/render/cubegeo.js';
import { placeProps } from '../src/render/propplace.js';
import { BOSS_ARENAS } from '../src/core/bosses.js';

// every guardian cube of a few worlds, generated as each arena type in turn
function* forced(seeds, depths) {
  for (const seed of seeds) {
    const w = new World(seed);
    for (const d of depths) for (const [key] of w.layout(d).guardians) {
      w.prepare(key);
      const spec = w.spec(key);
      if (BOSS_ARENAS[spec.guardian.role === 'descent' && spec.guardian.boss]?.type) continue;   // (a boss's arena of his own)
      for (const type of ARENA_TYPES) yield { type, d, map: generate({ ...spec, guardian: { ...spec.guardian, arena: type } }) };
    }
  }
}

test('each depth plans distinct arena types, and every type turns up', () => {
  assert.deepEqual(Object.keys(ARENA_WEIGHTS.descent).sort(), [...ARENA_TYPES].sort());
  assert.deepEqual(Object.keys(ARENA_WEIGHTS.side).sort(), [...ARENA_TYPES].sort());
  const seen = new Map(ARENA_TYPES.map(t => [t, 0]));
  for (let seed = 0; seed < 30; seed++) {
    const get = makeLayouts(seed);
    for (let d = 0; d < 20; d++) {
      const types = [...get(d).guardians.values()].map(g => g.arena);
      assert.equal(new Set(types).size, types.length, `repeated arena at depth ${d}`);
      for (const t of types) { assert.ok(seen.has(t), t); seen.set(t, seen.get(t) + 1); }
      assert.deepEqual(types, [...makeLayouts(seed)(d).guardians.values()].map(g => g.arena));
    }
  }
  for (const [t, n] of seen) assert.ok(n >= 40, `${t} is too rare: ${n}`);
});

test('every arena type keeps a connected zone, flat doorways, out-of-reach scenery and room for its roster', () => {
  const kept = new Map(ARENA_TYPES.map(t => [t, 0])), total = new Map(ARENA_TYPES.map(t => [t, 0]));
  for (const { type, map: m } of forced([0, 7], [0, 4, 6, 9, 12, 16, 19])) {   // (not Squarlo's, Flip's or Foggery's: their own arenas)
    state.map = m;
    total.set(type, total.get(type) + 1);
    if (m.arena.type === type) kept.set(type, kept.get(type) + 1);
    assert.equal(m.arena.requested, type);
    const level = m.portals[0].y / LH, blocked = new Set(m.staticBlockers.flatMap((l, c) => l.length ? [c] : []));
    // doorways stay exactly flat at the entrance level, the guardian stands clear
    for (const p of m.portals) for (const c of p.cells) assert.ok(m.floors[c].cs.every(y => y === level * LH), `${type}: pad ${c}`);
    assert.ok(!blocked.has(m.guardian.floor.c));
    for (const p of m.portals) for (const c of p.cells) assert.ok(!blocked.has(c));
    // every free zone floor is reachable on foot from the entrance
    const seen = new Set([m.portals[0].floor]), queue = [m.portals[0].floor];
    for (let i = 0; i < queue.length; i++) for (const g of queue[i].link)
      if (g && !seen.has(g) && !blocked.has(g.c)) { seen.add(g); queue.push(g); }
    for (const f of m.floors) if (f.encounter && !blocked.has(f.c)) assert.ok(seen.has(f), `${type}: stranded ${f.x},${f.z}`);
    // scenery beside the zone is a wall, or lower ground behind a rail
    for (const f of m.floors) if (f.encounter) for (const [dx, dz] of DIRS) {
      const g = m.floors[(f.z + dz) * N + f.x + dx];
      if (!g.arenaCell || g.encounter) continue;
      assert.ok(g.top >= f.top + 2 || g.top < f.top && m.fences.has(edgeKey(f.x, f.z, g.x, g.z)), `${type}: ledge at ${g.x},${g.z}`);
      assert.ok(!f.link.includes(g));
    }
    // clutter: real props, blockers inside their own cell
    for (const q of m.arenaPlacements) assert.ok(propMetadata.has(q.name) && Number.isFinite(q.y), q.name);
    m.staticBlockers.forEach((list, c) => { for (const b of list) assert.equal(Math.floor(b.z) * N + Math.floor(b.x), c); });
    // the doubled roster fits and every body can reach the guardian
    const spots = guardianSpots(m), guard = spots.find(s => s.guardian);
    for (const s of spots) assert.ok(walkable(s.f, s.kind.height) && findPath(s.f, guard.f, 40, s.kind.height), `${type}: spot`);
    assert.ok(findPath(m.portals[0].floor, m.guardian.floor, 40));
    assert.equal(buildCubeGeometry(m).length, 1);
  }
  // crowded depths may fall back to a roomier arena, but rarely
  for (const t of ARENA_TYPES) assert.ok(kept.get(t) >= total.get(t) * .85, `${t} fell back ${total.get(t) - kept.get(t)} of ${total.get(t)} times`);
});

test('arena types look different: relief, walls, standing stones, trees and their own clutter', () => {
  const sample = new Map();
  for (const { type, map: m } of forced([3], [2, 5, 10])) if (m.arena.type === type) {
    const level = m.portals[0].y / LH, zone = m.floors.filter(f => f.encounter);
    const scenery = m.floors.filter(f => f.arenaCell && !f.encounter);
    const s = sample.get(type) || { relief: 0, scenery: 0, blockers: 0, props: 0, n: 0 };
    s.relief += zone.filter(f => f.top !== level).length / zone.length;
    s.scenery += scenery.length; s.blockers += zone.filter(f => m.staticBlockers[f.c].length).length;
    s.props += m.arenaPlacements.length; s.n++;
    sample.set(type, s);
  }
  const avg = (t, k) => sample.get(t)[k] / sample.get(t).n;
  for (const t of ['hills', 'crater']) assert.ok(avg(t, 'relief') > .3, `${t} relief ${avg(t, 'relief')}`);
  for (const t of ['gorge', 'colosseum', 'dais', 'courtyard']) assert.ok(avg(t, 'scenery') > 12, `${t} has walls`);
  for (const t of ['hills', 'henge', 'crater', 'grove']) assert.equal(avg(t, 'scenery'), 0, `${t} is all fighting ground`);
  for (const t of ['henge', 'grove']) assert.ok(avg(t, 'blockers') >= 4, `${t} has cover`);
  for (const t of ARENA_TYPES) assert.ok(avg(t, 'props') > 80, `${t} is dressed`);
});

test('arena floors are left to the arena dressing; the generic scatter only dresses the outer ring', () => {
  const w = new World(5), key = w.layout(5).down, m = w.cube(key).map;
  assert.ok(m.arena && m.arenaPlacements.length);
  const { out } = placeProps(m, { props: 'badlands', side: [[0, '#000'], [0, '#111']] });
  for (const q of m.arenaPlacements) assert.ok(out.includes(q));
});
