import { test } from 'node:test';
import assert from 'node:assert/strict';
import { N, LH, CHAR_R, HEAD_Y, WATER, LAVA, ACID, MUD, SWIM_DEPTH, SWIM_FEET } from '../src/core/constants.js';
import { MUD_ROW } from '../src/themes/fluids.js';
import { state } from './fixtures.js';
import { World } from '../src/world/world.js';
import { interiorKey } from '../src/world/town.js';
import { TEST_ROOM_NAMES, testRoomKey, testRoomOf, isTestRoom, testRoomDepth } from '../src/world/testrooms.js';
import { BOSSES, BOSS_ARENAS, bossAt } from '../src/core/bosses.js';
import { LADDER_STYLES } from '../src/themes/builds.js';
import { depthOf } from '../src/themes/depth.js';
import { player } from '../src/game/state.js';
import { movePlayer } from '../src/physics/move.js';
import { climb } from '../src/physics/climb.js';
import { groundAt } from '../src/physics/collide.js';
import { inFluid, wading, tooDeep, wadeable, peril, WADE_MARGIN } from '../src/physics/fluid.js';
import { supportedPoint } from '../src/physics/respawn.js';
import { buildCubeGeometry, buildCubeParts } from '../src/render/cubegeo.js';
import { ENEMY_KINDS } from '../src/core/enemies.js';
import { walkable } from '../src/physics/enemynav.js';

const DT = 1 / 60;
function place(m, x, z, y = null) {
  state.map = m;
  y ??= groundAt(x, z, 99, 0).h;
  Object.assign(player, { x, y, z, vx: 0, vy: 0, vz: 0, visY: y, grounded: true, swimming: false, fluid: 0, wade: 0,
    stun: 0, coyote: 0, jumpBuf: 0, r: CHAR_R, h: 0.85, support: null, climb: null, gust: null, pull: null });
  movePlayer(DT, 0, 0, false, false);
}
// how deep the water at the player's feet is, and whether something takes them
const water = () => { const gr = groundAt(player.x, player.z, player.y + 0.1, 0); return { wade: wading(gr, player.y), lost: peril(gr, player.y)?.fluid ?? 0 }; };
// walk (or run) from (x, z) along (dx, dz) until held back or swimming (swim: on until then):
// nothing takes them, never off the ground until the water lifts them
function wadeOut(m, x, z, dx, dz, run = false, frames = 900, swim = false) {
  place(m, x, z);
  let deepest = 0, last = 0, wet = 0;
  for (let i = 0; i < frames; i++) {
    movePlayer(DT, dx, dz, run, false);
    const { wade, lost } = water();
    assert.equal(lost, 0, `${x}, ${z} -> ${dx}, ${dz}: nothing takes them in water`);
    if (swim && player.swimming) return { deepest, last, wet, swam: true };
    assert.equal(player.grounded, true, `${x}, ${z} -> ${dx}, ${dz}: walks, never falls in`);
    if (wade > 0) wet++;
    deepest = Math.max(deepest, wade); last = wade;
  }
  return { deepest, last, wet, swam: false };
}

test('test room keys are off the grid, keep their depth and are told apart from every other key', () => {
  const w = new World(3);
  for (const name of TEST_ROOM_NAMES) for (const d of [1, 7, 20]) {
    const k = testRoomKey(name, d);
    assert.equal(testRoomOf(k), name); assert.equal(depthOf(k), d);
    assert.equal(w.layout(d).exists.has(k), false);
  }
  assert.equal(new Set(TEST_ROOM_NAMES.map(n => testRoomKey(n, 1))).size, TEST_ROOM_NAMES.length);
  for (const k of ['0,0,0', '10000,-1,10001', '10001,-1,10000', '-3,-2,5', interiorKey('town_inn_a'), undefined]) assert.equal(isTestRoom(k), false, k);
});

test('every test room builds at every depth, dressed in its theme, with nothing in it but itself', () => {
  const w = new World(5);
  // (the boss room: at the depths with a boss)
  const depths = name => name === 'boss' ? Object.keys(BOSSES).map(Number) : Array.from({ length: 20 }, (_, i) => i + 1);
  for (const name of TEST_ROOM_NAMES) for (const d of depths(name)) {
    const k = testRoomKey(name, d), m = w.cube(k).map;
    assert.equal(m.key, k); assert.equal(m.depth || 0, d); assert.equal(m.biome, w.layout(d).theme.props);
    assert.deepEqual(m.portals, []); assert.equal(m.populationScale, 0); assert.deepEqual(m.authoredProps ?? [], []);
    assert.equal(m.testRoom.name, name);
    for (let c = 0; c < N * N; c++) assert.ok(m.cols[c].some(f => f.layer === 0 && f.bottom === 0), `${name}: ground in every cell`);
    m.floors.forEach((f, i) => assert.equal(f.id, i));
    for (const f of m.floors) if (f.fluid) assert.ok(f.pal !== undefined, 'fluid colours stamped');
    const a = m.testRoom.arrival;
    state.map = m;
    assert.ok(supportedPoint(a.x, a.y, a.z), `${name}: arrive on dry, supported ground`);
    if (d <= 1 || d === 20) buildCubeGeometry(m);
  }
});

test('water hill: walking down the shelf wades ever deeper until the water lifts the body; it swims, and wades back out', () => {
  const m = new World(1).cube(testRoomKey('water_hill', 1)).map, a = m.testRoom.arrival;
  // from dry land it is walked into as deep as the water goes up to the neck, where the foot goes:
  // the shelf a stretch of it several cells long and wide
  state.map = m;
  let shelf = 0;
  for (let z = 0.05; z < N; z += 0.1) for (let x = 0.05; x < N; x += 0.1) {
    const gr = groundAt(x, z, 99, 0);
    if (gr.s?.fluid !== WATER || !wadeable(gr)) continue;
    assert.ok(gr.s.surf * LH - gr.h <= HEAD_Y - WADE_MARGIN, `${x}, ${z}`);
    if (x >= 10 && z >= 6 && z <= 10) shelf += 0.01;
  }
  assert.ok(shelf >= 12, `${shelf} wading cells`);
  for (const lz of [6.5, 8.5]) for (const run of [false, true]) {
    const { deepest, wet, swam } = wadeOut(m, a.x, lz, 1, 0, run, 900, true);
    assert.ok(wet > 40, 'waded a while');
    assert.ok(swam && deepest > SWIM_DEPTH * 0.8, `swam once it was deep enough: ${deepest}`);
    // out over the deep water, afloat
    for (let i = 0; i < 40; i++) movePlayer(DT, 1, 0, run, false);
    for (let i = 0; i < 60; i++) movePlayer(DT, 0, 0, run, false);
    assert.ok(player.swimming && Math.abs(player.y - (m.floors.find(f => f.fluid).surf * LH - SWIM_FEET)) < 0.05, `afloat at ${player.y}`);
    // back west: up the shelf, wading again, out of the water onto the hill
    for (let i = 0; i < 900; i++) movePlayer(DT, -1, 0, run, false);
    assert.ok(!player.swimming && player.grounded, 'out of the water');
    assert.equal(water().wade, 0, `dry on the hill at ${player.x}`);
  }
  // a swimmer anywhere in the lake gets out onto the rim (a level over the water)
  place(m, 14.5, 3.5, m.floors.find(f => f.fluid).surf * LH - SWIM_FEET);
  for (let i = 0; i < 600; i++) movePlayer(DT, 0, -1, false, false);
  assert.ok(!player.swimming && player.grounded && player.z < 1, `onto the rim: ${player.x}, ${player.z}`);
});

test('fluids: a waterfall into a lake, lava, acid and mud pools', () => {
  const m = new World(2).cube(testRoomKey('fluids', 3)).map, kinds = new Set(m.floors.map(f => f.fluid));
  assert.ok(kinds.has(WATER) && kinds.has(LAVA) && kinds.has(ACID));
  // the mud pool: water with the look of mud, in the mud's colours, with pockets of mud on the dry
  // ground round it
  const mud = m.floors.filter(f => f.look === MUD);
  assert.ok(mud.length > 4 && mud.every(f => f.fluid === WATER && f.pal === MUD_ROW && tooDeep(f)));
  assert.ok(m.mudPockets.length >= 2);
  for (const p of m.mudPockets) {
    const g = m.cols[p.c].at(-1);
    assert.ok(!g.fluid && Math.abs(g.top * LH - p.y) < 0.01 && p.c === Math.floor(p.z) * N + Math.floor(p.x), `pocket at ${p.x}, ${p.z}`);
  }
  assert.equal(m.falls.length, 1);
  const fall = m.falls[0], foot = m.cols[fall.c].at(-1);
  assert.equal(foot.fluid, WATER); assert.equal(foot.surf, fall.bot);
  const lip = m.cols[fall.c - N].at(-1);
  assert.equal(lip.fluid, WATER); assert.equal(lip.surf, fall.top);
  // the lake shelves: some of it can be waded, the middle cannot
  const lake = m.floors.filter(f => f.fluid === WATER && f.surf === fall.bot);
  assert.ok(lake.some(f => !tooDeep(f)) && lake.some(f => tooDeep(f)));
  for (const f of m.floors) if (f.fluid === LAVA || f.fluid === ACID) assert.ok(tooDeep(f));
  // the lake is waded into from every shore, deeper and deeper, until the water lifts the body: it swims
  for (const [x, z, dx, dz] of [[8.5, 10.5, 0, -1], [6.5, 9.5, 0, -1], [3.5, 4.5, 1, 0], [12.5, 4.5, -1, 0]]) {
    const { deepest, swam } = wadeOut(m, x, z, dx, dz, false, 900, true);
    assert.ok(swam && deepest > SWIM_DEPTH * 0.8 && deepest < HEAD_Y, `lake from ${x}, ${z}: ${deepest}`);
  }
  // and the pools are not stepped into at all
  for (const [x, dx] of [[5.8, -1], [10.2, 1]]) {
    const { wet } = wadeOut(m, x, 12.5, dx, 0, false, 300);
    assert.equal(wet, 0);
    assert.ok(!m.cols[groundAt(player.x, player.z, player.y + 0.1, 0).i].some(f => f.fluid), 'stopped on the bank');
  }
  // the ladder up the cliff
  assert.equal(m.ladders.length, 1); assert.equal(m.ladders[0].y1 - m.ladders[0].y0, 5);
});

test('climb: every ladder style, the hanging ones hanging too, and every ladder climbs to its top', () => {
  const m = new World(4).cube(testRoomKey('climb', 2)).map;
  assert.deepEqual([...new Set(m.ladders.filter(l => !l.hang).map(l => l.style))].sort(), Object.keys(LADDER_STYLES).sort());
  assert.deepEqual(m.ladders.filter(l => l.hang).map(l => l.style).sort(),
    Object.keys(LADDER_STYLES).filter(s => LADDER_STYLES[s].hang).sort());
  for (const l of m.ladders) {
    const [nx, nz] = [[1, 0], [-1, 0], [0, 1], [0, -1]][l.d];
    place(m, l.x + 0.5, l.z + 0.5, l.y0);
    let on = false;
    // (as the game does: on the ladder it climbs, else it walks)
    for (let i = 0; i < 1200 && !(on && !player.climb); i++) {
      if (climb(DT, nx, nz, false)) on = true; else movePlayer(DT, nx, nz, false, false);
    }
    assert.ok(on, `${l.style}: got on`);
    assert.equal(player.y, l.y1, `${l.style}${l.hang ? ' (hanging)' : ''}: up to the top`);
    assert.equal(player.climb, null);
    assert.equal(groundAt(player.x, player.z, player.y + 0.1, 0).s, m.floors[l.hi], 'stepped onto the floor at its top');
  }
});

test('enemies and guardians: every kind lined up once (the Temp Bosses not yet, the bosses in their room), on the ground, apart, the shortest in front', () => {
  const w = new World(6), rooms = ['enemies', 'guardians'].map(n => w.cube(testRoomKey(n, 5)).map);
  const bosses = Object.keys(BOSSES).map(d => w.cube(testRoomKey('boss', +d)).map.testRoom.lineup.map(l => l.type)).flat();
  const all = rooms.flatMap(m => m.testRoom.lineup.map(l => l.type));
  assert.deepEqual([...all, ...bosses].sort(), Object.keys(ENEMY_KINDS).filter(k => !ENEMY_KINDS[k].bossPlaceholder).sort(), 'every kind, once');
  assert.ok(rooms[1].testRoom.lineup.every(l => ENEMY_KINDS[l.type].guardianRole === 'side'));
  assert.ok(rooms[0].testRoom.lineup.every(l => !ENEMY_KINDS[l.type].guardian));
  for (const m of rooms) {
    const line = m.testRoom.lineup, a = m.testRoom.arrival;
    state.map = m;
    for (const l of line) {
      const k = ENEMY_KINDS[l.type], gr = groundAt(l.x, l.z, 99, 0);
      assert.ok(l.x - k.radius > 0 && l.x + k.radius < N && l.z - k.radius > a.z + CHAR_R && l.z + k.radius < N, l.type);
      assert.ok(walkable(gr.s, k.height), `${l.type} stands on walkable ground`);
      for (const o of line) if (o !== l) assert.ok(Math.hypot(o.x - l.x, o.z - l.z) > k.radius + ENEMY_KINDS[o.type].radius, `${l.type} and ${o.type} apart`);
    }
    // row by row (front to back), never shorter than the row before
    const rows = [...new Set(line.map(l => l.z))].sort((p, q) => p - q).map(z => Math.max(...line.filter(l => l.z === z).map(l => ENEMY_KINDS[l.type].height)));
    rows.forEach((h, i) => assert.ok(!i || h >= rows[i - 1]));
  }
});

test('boss: each boss alone in the very arena of his depth, made a test room; no boss, no room', () => {
  const w = new World(8);
  for (const [d, boss] of Object.entries(BOSSES)) {
    const k = testRoomKey('boss', +d), m = w.cube(k).map, real = w.cube(w.descentSpec(+d).key).map;
    assert.equal(testRoomOf(k), 'boss'); assert.equal(m.depth || 0, +d); assert.equal(m.key, k);
    // the generator's arena (cubegen/guardian.js), as in the world: its type, its water, its props
    assert.deepEqual(m.arena, real.arena);
    if (BOSS_ARENAS[boss]?.type) assert.equal(m.arena.type, BOSS_ARENAS[boss].type);
    assert.deepEqual(m.tide, real.tide);
    assert.equal(!!m.tide, ['tidal', 'tower', 'bowl', 'mire'].includes(BOSS_ARENAS[boss]?.type));
    assert.deepEqual(m.floors.map(f => [f.top, f.encounter]), real.floors.map(f => [f.top, f.encounter]));
    assert.equal(m.arenaPlacements.length, real.arenaPlacements.length);
    // nothing leads out, no gate, no guardian of its own, nobody else
    assert.deepEqual(m.portals, []); assert.equal(m.exit, null); assert.equal(m.guardian, null); assert.equal(m.populationScale, 0);
    // the boss alone, on the guardian's spot, facing the entrance, where you arrive on the fight's ground
    assert.deepEqual(m.testRoom.lineup, [{ type: boss, x: real.guardian.x, z: real.guardian.z, yaw: real.guardian.yaw }]);
    const a = m.testRoom.arrival, door = real.portals.find(p => p.dir < 4);
    assert.ok(Math.hypot(a.x - door.x - 0.5, a.z - door.z - 0.5) < 2, 'beside the entrance');
    state.map = m;
    assert.ok(walkable(groundAt(a.x, a.z, 99, 0).s, 0.85), 'arrives on walkable ground');
    assert.ok(Math.abs(Math.atan2(real.guardian.x - a.x, real.guardian.z - a.z) - a.yaw) < 1e-9, 'facing him');
  }
  for (let d = 0; d < 20; d++) if (!bossAt(d)) assert.throws(() => w.cube(testRoomKey('boss', d)), /No boss at depth/);
});

test('/testroom: a depth, or a boss for his depth', () => {
  for (const [d, boss] of Object.entries(BOSSES)) { assert.equal(testRoomDepth(boss), +d); assert.equal(testRoomDepth(boss.toUpperCase()), +d); }
  assert.equal(testRoomDepth('0'), 0); assert.equal(testRoomDepth('7'), 7); assert.equal(testRoomDepth(3), 3);
  assert.equal(testRoomDepth('nobody'), null);
});

test('fluids: the lake\'s shore slopes up out of the water inside its cells, and its tops know it', () => {
  const m = new World(2).cube(testRoomKey('fluids', 3)).map, geo = buildCubeParts(m), p = geo.parts.water;
  const at = new Map();
  let out = 0;
  for (let v = 0; v < p.uv.length / 2; v++) {
    if (p.uv[v * 2] < 0) continue;
    const x = p.pos[v * 4] * geo.scale, z = p.pos[v * 4 + 2] * geo.scale, [ground, slope] = p.shore.slice(v * 4, v * 4 + 2);
    if (ground > p.uv[v * 2 + 1]) { out++; assert.ok(slope > 0.05, `the ground out of the water slopes (${x}, ${z})`); }
    // the same ground and slope on a cell's edge from either side
    const k = `${x.toFixed(3)},${z.toFixed(3)},${p.uv[v * 2 + 1]}`, seen = at.get(k);
    if (seen) { assert.ok(Math.abs(seen[0] - ground) < 1e-3 && Math.abs(seen[1] - slope) < 1e-3, `(${x}, ${z}): ${seen} / ${ground}, ${slope}`); }
    else at.set(k, [ground, slope]);
  }
  assert.ok(out > 20, `${out} tops over ground out of the water`);
});
