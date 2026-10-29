// The dev test rooms (world/testrooms.js, /testroom): small hand-made maps for trying one thing
// out, built straight from their plans instead of through the generator's stages. Ground is
// either flat terraces (`put` a floor of a level) or shaped by a height function over the cell
// corners (`shaped`): a cell with a corner under the water line is under water, its bed the
// shape's, so a shore runs down into the water as one slope. Floors next to each other link
// where their edges meet. No portals, no props, no enemies of the cube's own (/spawn brings
// some; the `enemies` and `guardians` rooms line every kind up, game/devspawn.js): nothing leads
// in or out but /testroom. The `boss` room is the exception: the generator's own descent arena of
// its depth (bossRoom), its boss in the lineup.
import { N, LH, DIRS, OPP, EDGE_CORNERS, WATER, LAVA, ACID, FLUID_NAME } from '../core/constants.js';
import { idx } from '../core/util.js';
import { floorY } from '../core/surfaces.js';
import { indexBlockers } from '../core/blockers.js';
import { createContext } from './context.js';
import { ladderInfo } from './climbs.js';
import { shapeStructures } from './shape.js';
import { testRoomOf, WATERFALL_HINT } from '../world/testrooms.js';
import { waterfallRoomKey } from '../world/waterfalls.js';
import { ENEMY_KINDS } from '../core/enemies.js';
import { generateGuardian } from './guardian.js';

const flat = top => Array(4).fill(top * LH);
const corners = (H, x, z) => [H(x, z), H(x + 1, z), H(x, z + 1), H(x + 1, z + 1)];
const border = (x, z) => !x || !z || x === N - 1 || z === N - 1;

function start(spec) {
  const ctx = createContext(spec.seed);
  ctx.falls = []; ctx.ladders = [];
  // a floor in cell (x, z): flat at `top`, or with its corners at cs (units)
  ctx.put = (x, z, { top, bottom = 0, layer = 0, fluid = 0, surf = 0, cs = null }) => {
    const f = ctx.mk(idx(x, z), top, bottom, layer);
    Object.assign(f, { fluid, surf, cs: cs ?? flat(top) });
    ctx.cols[f.c].push(f);
    return f;
  };
  // a cell of ground with its corners at the levels lv: under `fluid` standing at level S if a
  // corner dips under it, its top the lowest corner rounded. Walking goes by the bed's height
  // where the foot goes (physics/fluid.js wadeable), so a shore is waded down as far as the water
  // stays under the head, whatever the cell's corners.
  ctx.shaped = (x, z, lv, S = -Infinity, fluid = WATER) => {
    const lo = Math.min(...lv), cs = lv.map(v => v * LH);
    if (lo < S - 0.05) return ctx.put(x, z, { top: Math.round(lo), fluid, surf: S, cs });
    return ctx.put(x, z, { top: Math.round(lv.reduce((a, b) => a + b) / 4), cs });
  };
  // a pool of `fluid` (surface S, bed two levels under it) in the cells whose centres lie within
  // r of (cx, cz), with flat banks a level over its surface
  ctx.pool = (cx, cz, r, fluid, S) => {
    for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) if (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) < r) {
      ctx.cols[idx(x, z)] = [];
      ctx.put(x, z, { top: S - 2, fluid, surf: S });
    }
    ctx.stats.fluids.push(FLUID_NAME[fluid] + ' pool');
  };
  ctx.ladder = (lo, hi, style) => {
    const d = DIRS.findIndex(([dx, dz]) => lo.x + dx === hi.x && lo.z + dz === hi.z);
    ctx.ladders.push({ lo, hi, d, hang: hi.bottom > lo.top + 1, style });
  };
  return ctx;
}

// the floors indexed and linked (where the edges meet), the map
// (shape: its runs, if any, shaped as the generator does: heights, bases, supports, cubegen/shape.js)
function finish(ctx, spec, { K = 1, B = [0], arrival, note, lineup = [], shape = false }) {
  const floors = ctx.floors = [];
  for (const col of ctx.cols) {
    col.sort((a, b) => a.top - b.top);
    for (const f of col) { f.id = floors.length; floors.push(f); }
  }
  for (const f of floors) {
    f.split = Math.abs(f.cs[0] - f.cs[3]) <= Math.abs(f.cs[1] - f.cs[2]) ? 0 : 1;
    f.link = DIRS.map(([dx, dz], d) => {
      const x = f.x + dx, z = f.z + dz;
      if (x < 0 || z < 0 || x >= N || z >= N) return null;
      const [a, b] = EDGE_CORNERS[d], [na, nb] = EDGE_CORNERS[OPP[d]];
      return ctx.cols[idx(x, z)].find(g => g.layer === f.layer
        && Math.abs(g.cs[na] - f.cs[a]) < 0.01 && Math.abs(g.cs[nb] - f.cs[b]) < 0.01) ?? null;
    });
  }
  if (shape) shapeStructures(ctx);
  const name = testRoomOf(spec.key), blockers = indexBlockers([]);
  // where /testroom puts you: on the top floor there
  const top = ctx.cols[idx(Math.floor(arrival.x), Math.floor(arrival.z))].at(-1);
  arrival = { ...arrival, y: floorY(top, arrival.x % 1, arrival.z % 1) };
  Object.assign(ctx.stats, { layers: K, mode: `test room (${name})` });
  return {
    seed: spec.seed, attempts: 1, K, B, cols: ctx.cols, floors, pieces: ctx.pieces ?? Array.from({ length: N * N }, () => []),
    runs: ctx.runs ?? [], falls: ctx.falls, fences: new Map(), fenceList: [], stats: ctx.stats, moves: [], portals: [], exit: null,
    ladders: ctx.ladders.map(l => ladderInfo(l, l.style)),
    gateKeys: [null, null, null, null], trialFaces: [null, null, null, null], trial: null, clues: [],
    safe: new Uint8Array(floors.length).fill(1),
    kind: 'meadow', archetype: 'test', key: spec.key, depth: spec.depth, biome: spec.biome,
    cave: false, walled: false, enemyFree: false, populationScale: 0, horde: null,
    rewardSites: [], siteFailures: [], sitePlacements: [], siteReservations: [], spots: [],
    staticBlockers: blockers, blockers, occluders: [], authoredProps: [], routes: [],
    testRoom: { name, arrival, note, lineup },
  };
}

// A hill standing in a lake to halfway up (its top 15 levels up, the water at 8, the bed at 1),
// steep all round but to the east: there a shelf runs out under the water, so gently that
// walking down it the water rises to just under the head (physics/fluid.js HEAD_Y) by its far
// edge (x = 14), lifting the body to swim on the way (physics/move.js SWIM_DEPTH); past that it
// drops off into deep water. A dry rim runs round the cube, a level over the water: a swimmer
// climbs out onto it anywhere.
const HILL = { S: 8, bed: 1, top: 15, x: 6, z: 8 };
export function hillHeight(X, Z) {
  const { S, bed, top } = HILL, r = Math.hypot(X - HILL.x, Z - HILL.z);
  const hill = top - 2.6 * Math.max(0, r - 1);
  const across = Math.max(0, Math.abs(Z - HILL.z) - 2.5);
  // (out of the hill's east side: falling away west of x = 9.5, under the hill)
  const shelf = Math.min(S + 0.5 - 0.42 * (X - 9.5), S - 1.4 - 3 * (X - 14), S + 0.5 + 3 * (X - 9.5)) - 2.5 * across;
  return Math.max(bed, hill, Math.min(shelf, top));
}
function waterHill(spec) {
  const ctx = start(spec), { S } = HILL;
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    if (border(x, z)) ctx.put(x, z, { top: S + 1 });
    else ctx.shaped(x, z, corners(hillHeight, x, z), S);
  }
  ctx.stats.fluids.push('water lake with a wading shelf');
  return finish(ctx, spec, { arrival: { x: 8.5, z: 8.5, yaw: Math.PI / 2 },
    note: 'wade east down the shelf until you swim; climb out onto the rim or the shelf' });
}

// Flat ground (level 4) before a cliff along the north (level 14, up a ladder in its west end):
// a channel on top pours over its edge as a waterfall into a lake below, deep under the fall
// and shelving up to its shores; a lava pool and an acid pool in the south corners.
const FLUIDS_ROOM = { G: 4, cliff: 14, lake: 3, chan: 8 };
const lakeHeight = (X, Z) => Math.min(FLUIDS_ROOM.G, Math.max(1, 1 + 1.1 * (Math.hypot((X - 8) / 1.5, Z - 4.2) - 1)));
function fluids(spec) {
  const ctx = start(spec), { G, cliff, lake, chan } = FLUIDS_ROOM;
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    if (z <= 2) {
      if (x === chan && z) ctx.put(x, z, { top: cliff - 3, fluid: WATER, surf: cliff - 1 });   // the channel
      else ctx.put(x, z, { top: cliff });
    } else if (border(x, z)) ctx.put(x, z, { top: G });
    else ctx.shaped(x, z, corners(lakeHeight, x, z), lake);
  }
  ctx.pool(3.5, 12, 1.7, LAVA, G - 1);
  ctx.pool(12.5, 12, 1.7, ACID, G - 1);
  ctx.falls.push({ c: idx(chan, 3), d: 2, top: cliff - 1, bot: lake, type: WATER, layer: 0 });
  ctx.stats.fluids.push('water channel', 'waterfall', 'water lake');
  ctx.ladder(ctx.cols[idx(1, 3)][0], ctx.cols[idx(1, 2)][0], 'wood');
  return finish(ctx, spec, { arrival: { x: 8.5, z: 10.5, yaw: Math.PI }, note: 'the cliff\'s ladder is in its west end' });
}

// Flat ground (level 2): a tower for every ladder style along the north, each taller than the
// one before (one ladder longer than any normal one), and a platform floating in the south
// (levels 10 to 12) with the styles that hang free hanging from its north edge.
const STYLES = ['wood', 'rope', 'vine', 'iron', 'footholds'], HANGING = ['wood', 'rope', 'vine'];
const TOWERS = [8, 10, 13, 16, 22];
function climb(spec) {
  const ctx = start(spec), G = 2, P = { top: 12, bottom: 10, x0: 3, x1: 12, z0: 10, z1: 12 };
  const tower = (x, z) => x >= 1 && z >= 1 && z <= 3 && (x - 1) % 3 < 2 ? TOWERS[(x - 1) / 3 | 0] ?? null : null;
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    ctx.put(x, z, { top: tower(x, z) ?? G });
    if (x >= P.x0 && x <= P.x1 && z >= P.z0 && z <= P.z1) ctx.put(x, z, { top: P.top, bottom: P.bottom, layer: 1 });
  }
  const at = (x, z, layer = 0) => ctx.cols[idx(x, z)].find(f => f.layer === layer);
  STYLES.forEach((s, i) => ctx.ladder(at(1 + 3 * i, 4), at(1 + 3 * i, 3), s));
  HANGING.forEach((s, i) => ctx.ladder(at(4 + 3 * i, P.z0 - 1), at(4 + 3 * i, P.z0, 1), s));
  return finish(ctx, spec, { K: 2, B: [0, P.bottom], arrival: { x: 8, z: 6.5, yaw: Math.PI },
    note: `towers: ${STYLES.join(', ')}; hanging from the platform: ${HANGING.join(', ')}` });
}

// Flat ground (level 2) with every enemy kind standing in it, idle (game/devspawn.js
// spawnLineup): `enemies` has the species with their kinds and their bosses' minions, a row per
// species (shareRows); `guardians` the side guardians, the shorter half in front (the descent guardians,
// the Temp Bosses, wait for bosses of their own; the bosses have the `boss` room). The shortest
// stand in front, all face the arrival. lineup: [{ type, x, z, yaw }]
const KINDS = Object.values(ENEMY_KINDS);
const tallest = row => Math.max(...row.map(k => k.height));
const bySpecies = list => [...new Set(list.map(k => k.species))].map(s => list.filter(k => k.species === s));
const byHeight = list => [...list].sort((a, b) => a.height - b.height);
// (a species shares its row with the next while the row holds seven at most: the room is only so
// deep)
const shareRows = rows => rows.reduce((out, row) => {
  const last = out.at(-1);
  if (last && last.length + row.length <= 7) out[out.length - 1] = [...last, ...row]; else out.push(row);
  return out;
}, []);
const LINEUPS = {
  enemies: () => shareRows(bySpecies(KINDS.filter(k => !k.guardian)).sort((a, b) => tallest(a) - tallest(b))),
  guardians: () => {
    const side = byHeight(KINDS.filter(k => k.guardianRole === 'side')), half = Math.ceil(side.length / 2);
    return [side.slice(0, half), side.slice(half)];
  },
};
const LINE = { front: 2, back: N - 0.6, width: N - 2, room: 1.2, gap: 2 };
// rows of kinds (the front one first) between LINE.front and LINE.back (in the middle if they
// leave room), centred across the cube
export function lineUp(rows) {
  const r = rows.map(row => Math.max(...row.map(k => k.radius)));
  const depth = r.reduce((s, x) => s + 2 * x, 0), room = LINE.back - LINE.front - depth;
  const gap = Math.min(LINE.gap, room / Math.max(1, rows.length - 1));
  const out = [];
  let z = LINE.front + (room - gap * (rows.length - 1)) / 2;
  rows.forEach((row, j) => {
    z += r[j];
    const step = Math.min(2 * r[j] + LINE.room, LINE.width / row.length);
    row.forEach((k, i) => out.push({ type: k.type, x: N / 2 + (i - (row.length - 1) / 2) * step, z, yaw: Math.PI }));
    z += r[j] + gap;
  });
  return out;
}
function lineupRoom(spec, name) {
  const ctx = start(spec), G = 2;
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) ctx.put(x, z, { top: G });
  const lineup = lineUp(LINEUPS[name]());
  return finish(ctx, spec, { arrival: { x: 8, z: 1.2, yaw: 0 }, lineup,
    note: `${lineup.length} kinds standing idle until hit (/passive keeps them so)` });
}

// Ground (level 4) round a lake (its bed at 1, its surface at 3), and what stands in it: a stair
// from the west bank down into it to its bed, a plank bridge on legs across it from north to
// south, and a wooden ladder from its bed up a tower in its east (render/shore.js: the foam
// goes round them all, render/wet.js: they stay wet where the water has just been).
const SHORES = { G: 4, S: 3, bed: 1, x0: 4, x1: 10, z0: 5, z1: 11 };
function shores(spec) {
  const ctx = start(spec), { G, S, bed, x0, x1, z0, z1 } = SHORES;
  ctx.spec = { ...spec, forceBridge: 'plank' };
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    if (x === x1 + 1 && z === 9) ctx.put(x, z, { top: 12 });   // the ladder's tower
    else if (x >= x0 && x <= x1 && z >= z0 && z <= z1) ctx.put(x, z, { top: bed, fluid: WATER, surf: S });
    else ctx.put(x, z, { top: G });
  }
  ctx.stats.fluids.push('water lake');
  // runs as the generator places them (cubegen/place.js), shaped by it (cubegen/shape.js)
  ctx.pieces = Array.from({ length: N * N }, () => []); ctx.runs = []; ctx.pathFloors = [];
  const run = (kind, from, to, cells, dx, dz) => {
    const r = { kind, from, to, d: DIRS.findIndex(([a, b]) => a === dx && b === dz), dx, dz, cells, k: cells.length, sag: 0, span: false, layerLo: 0, layerHi: 0, layer: 0 };
    r.pieces = cells.map((c, j) => { const p = { kind, c, j, dx, dz, run: r, y0: 0, y1: 0, base: 0 }; ctx.pieces[c].push(p); return p; });
    ctx.runs.push(r);
    ctx.stats[kind === 'stair' ? 'stairs' : 'bridges']++;
  };
  const at = (x, z) => ctx.cols[idx(x, z)][0];
  run('stair', at(x0 - 1, 6), at(x0 + 3, 6), [0, 1, 2].map(i => idx(x0 + i, 6)), 1, 0);
  run('bridge', at(8, z0 - 1), at(8, z1 + 1), Array.from({ length: z1 - z0 + 1 }, (_, i) => idx(8, z0 + i)), 0, 1);
  ctx.ladder(at(x1, 9), at(x1 + 1, 9), 'wood');
  return finish(ctx, spec, { arrival: { x: 2.5, z: 13.5, yaw: Math.PI * 0.75 }, shape: true,
    note: 'a stair into a lake, a bridge on legs over it, a ladder up out of it' });
}

// What click to move (physics/playernav.js, physics/leaps.js) jumps and climbs, from west to
// east: the arrival's ground (level 4) to a trench a cell wide (x = 5, level 0: jumped over), a
// plateau with a ledge a level up (jumped onto) and a tower (level 10, up a ladder in its south),
// a gap two cells wide (level 0) down to low ground two levels lower (jumped down over), and in
// it a pit (level 0, out up a ladder in its west). Along the north edge the gap has steps (level
// 3): the way back up is jumped, a level at a time.
export const LEAPS = { G: 4, trench: 5, ledge: { x: 7, z0: 2, z1: 4 }, tower: { x: 7, z0: 11, z1: 12, top: 10 },
  gap: [9, 10], low: 2, pit: { x0: 13, x1: 14, z0: 7, z1: 9 }, steps: 15 };
function leaps(spec) {
  const ctx = start(spec), { G, trench, ledge, tower, gap, low, pit, steps } = LEAPS;
  const level = (x, z) => {
    if (x === trench) return 0;
    if (gap.includes(x)) return z === steps ? G - 1 : 0;
    if (x > gap[1]) return x >= pit.x0 && x <= pit.x1 && z >= pit.z0 && z <= pit.z1 ? 0 : low;
    if (x === ledge.x && z >= ledge.z0 && z <= ledge.z1) return G + 1;
    if (x === tower.x && z >= tower.z0 && z <= tower.z1) return tower.top;
    return G;
  };
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) ctx.put(x, z, { top: level(x, z) });
  const at = (x, z) => ctx.cols[idx(x, z)][0];
  ctx.ladder(at(tower.x, tower.z0 - 1), at(tower.x, tower.z0), 'wood');
  ctx.ladder(at(pit.x0, 8), at(pit.x0 - 1, 8), 'rope');
  return finish(ctx, spec, { arrival: { x: 2.5, z: 8.5, yaw: Math.PI / 2 },
    note: 'click across: over the trench, onto the ledge, up the tower, down over the wide gap, into the pit' });
}

// The boss of the depth (core/bosses.js) in his own arena: the depth's descent arena as the
// generator builds it (cubegen/guardian.js: the arena type a boss brings, Squarlo's tidal hills
// and their water, Totnar's braziers, the fight zone), the very one of this world, made a test
// room: no portals (the entrance and the well are plain ground), no gate, no guardian of the
// map's own. The boss stands in the lineup on the guardian's spot, facing the entrance, where
// you arrive: idle until hit, back after a death, never remembered (game/devspawn.js).
// spec.arena: the world's spec of that arena (world/world.js descentSpec).
// learn: enemies.html#boss-fight (see learn/README.md)
function bossRoom(spec) {
  const boss = spec.arena?.guardian?.boss;
  if (!boss) throw new Error(`No boss at depth ${spec.depth}`);
  const m = generateGuardian(spec.arena), g = m.guardian, door = m.portals.find(p => p.dir < 4);
  const [dx, dz] = DIRS[door.dir], x = door.x + 0.5 - dx * 1.5, z = door.z + 0.5 - dz * 1.5;
  const top = m.cols[idx(Math.floor(x), Math.floor(z))].at(-1);
  const arrival = { x, z, y: floorY(top, x % 1, z % 1), yaw: Math.atan2(g.x - x, g.z - z) };
  const name = testRoomOf(spec.key);
  Object.assign(m.stats, { mode: `test room (${name}, ${m.arena.type} arena)` });
  return { ...m, key: spec.key, portals: [], exit: null, guardian: null, moves: [], routes: [],
    gateKeys: [null, null, null, null], trialFaces: [null, null, null, null], archetype: 'test', roomRole: null,
    populationScale: 0, horde: null,
    testRoom: { name, arrival, note: `${ENEMY_KINDS[boss].label} in his ${m.arena.type} arena, idle until hit`,
      lineup: [{ type: boss, x: g.x, z: g.z, yaw: g.yaw }] } };
}

function waterfallRoom(spec) {
  const ctx = start(spec);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const pool = x >= 6 && x <= 10 && z >= 6 && z <= 9;
    ctx.put(x, z, { top: pool ? 0 : 4, ...(pool ? { fluid: WATER, surf: 3 } : {}) });
    if (x >= 4 && x <= 12 && z >= 1 && z <= 5) {
      const channel = x >= 7 && x <= 9;
      ctx.put(x, z, { top: channel ? 10 : 13, bottom: 8, layer: 1,
        ...(channel ? { fluid: WATER, surf: 12 } : {}) });
    }
  }
  ctx.falls.push({ c: idx(8, 6), d: 2, top: 12, bot: 3, type: WATER, layer: 0, width: 3.2 });
  ctx.stats.fluids.push('broad waterfall with a hidden door');
  const m = finish(ctx, spec, { K: 2, B: [0, 8], arrival: { x: 5.5, z: 10.5, yaw: Math.PI }, note: WATERFALL_HINT });
  m.doors = [{ id: 'waterfall', building: 'waterfall:' + spec.key, to: waterfallRoomKey(spec.key),
    x: 8.5, y: 1, z: 6.1, nx: 0, nz: 1, w: 2.2, layer: 0, waterfall: true, swim: true }];
  // Arrive on the dry ledge under the overhang, not on the channel over it.
  m.testRoom.arrival = { x: 8.5, y: 2, z: 5.7, yaw: Math.PI };
  m.swimArrival = { x: 8.5, y: 1, z: 8.5, yaw: Math.PI };
  return m;
}

const BUILD = { waterfall: waterfallRoom, water_hill: waterHill, fluids, climb, shores, enemies: s => lineupRoom(s, 'enemies'), guardians: s => lineupRoom(s, 'guardians'), boss: bossRoom, leaps };
// spec: { key, depth, seed, biome (the depth's theme); arena: the boss room's (bossRoom) }
export function generateTestRoom(spec) {
  const name = testRoomOf(spec.key);
  if (!BUILD[name]) throw new Error('No test room ' + spec.key);
  return BUILD[name](spec);
}
