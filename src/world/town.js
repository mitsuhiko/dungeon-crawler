// Town policy and authored plans. Pure data; also runs in the worker.
//
// The town (docs/town.md) is a place of TOWN_ACROSS × TOWN_DEEP tiles: ordinary cubes of the depth-0
// grid, laid out together as one place, known from the start and crossed without seams (no glass,
// no portal, no step in the ground between two tiles: game/handover.js). Its one gate leads out
// onto the road (depth 0's route starts there, world/layout.js). Every tile has a plan of its own
// (TILES: what stands where, in the tile's own frame), turned with the gate: a tile's local z = 0
// side faces the gate's side of the town, local +x the next tile across.
import { N, LH, CHAR_R, CHAR_H, DIRS, OPP, EDGE_CORNERS, WATER } from '../core/constants.js';
import { mulberry32, hash32 } from '../core/util.js';
import { propMetadata, CLUTTER } from '../core/propcatalog.js';
import { floorY } from '../core/surfaces.js';
import { containsXZ, indexBlockers } from '../core/blockers.js';
import { key, step } from './coords.js';
import { makeLand, INN_STAIR, WALL } from './townland.js';
import { createContext } from '../cubegen/context.js';
import { smooth } from '../cubegen/smooth.js';
import { shapeStructures } from '../cubegen/shape.js';

export const TOWN_LEVEL = 4;
export const TOWN_ACROSS = 3, TOWN_DEEP = 4;
// The tiles by their place (i across, j deep, from the gate's row): where the gate is, the one a new
// world starts in (the inn's), and the one the town portal comes out in (the plaza's)
export const GATE_TILE = [1, 0], START_TILE = [1, 2], PORTAL_TILE = [1, 1];
// the road leaves the town this way (DIRS index); the whole town turns with it
export const townExit = seed => (seed >>> 0) % 4;
// tile-local +x in the world for each exit (the next tile across)
const ACROSS = [[0, 1], [0, -1], [-1, 0], [1, 0]];
const exitYaw = [-Math.PI / 2, Math.PI / 2, Math.PI, 0];
export const townExitPosition = d => d === 0 || d === 3 ? 8 : 7;

// The town of a world (seed): { exit, tiles: key -> { i, j }, at(i, j) -> key, keys, gate, start,
// portal, houses: building name -> its tile's key }
const towns = new Map();
export function townOf(seed) {
  seed >>>= 0;
  let t = towns.get(seed);
  if (t) return t;
  const exit = townExit(seed), [ax, az] = ACROSS[exit], [dx, dz] = DIRS[exit];
  const at = (i, j) => key((i - 1) * ax - j * dx, 0, (i - 1) * az - j * dz);
  const tiles = new Map();
  for (let j = 0; j < TOWN_DEEP; j++) for (let i = 0; i < TOWN_ACROSS; i++) tiles.set(at(i, j), { i, j });
  const houses = {};
  for (const b of [...BUILDINGS, ...MERCHANTS]) houses[b.name] = at(...b.tile);
  t = { exit, tiles, at, keys: [...tiles.keys()], gate: at(...GATE_TILE), start: at(...START_TILE), portal: at(...PORTAL_TILE), houses };
  if (towns.size > 64) towns.clear();
  towns.set(seed, t);
  return t;
}
export const isTown = (k, seed) => townOf(seed).tiles.has(k);
export const townTile = (k, seed) => townOf(seed).tiles.get(k) ?? null;
// no enemies in town (and only there: the road outside has them from its first room)
export const enemyFreeAt = (k, seed) => isTown(k, seed);
// the sides (DIRS) of tile k that are seams: another tile of the town beyond them
export const townSeams = (k, seed) => DIRS.map((_, d) => isTown(k, seed) && isTown(step(k, d), seed));

// The inside of a house is a map of its own (cubegen/interior.js), outside the cube grid.
const INTERIOR = 'interior:';
export const interiorKey = name => INTERIOR + name;
export const isInterior = k => typeof k === 'string' && k.startsWith(INTERIOR);
// Buildings stand on quarter turns only: snap cos/sin so their boxes stay exact.
const snap = v => Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : v;

export function rotateTownPoint(x, z, yaw) {
  const dx = x - N / 2, dz = z - N / 2, c = Math.cos(yaw), s = Math.sin(yaw);
  return [N / 2 + dx * c + dz * s, N / 2 - dx * s + dz * c];
}

// Full exported footprint bounds in glTF X/Z, INCLUDING attached porches/props.
// Tests compare these to assets/town/*.glb. Buildings stand on the cube grid (quarter
// turns), like the rest of the world, each wholly in one tile (`tile`: [i, j]) at (x, z) of it,
// turned `yaw` (0: its front, +Z, towards the back of the town).
//
// Houses with a door also list:
//   parts: their colliders in the same frame (front +Z): { box: [x0, z0, x1, z1] } or
//     { circle: [x, z, r] }, up to `top`; `solid: false` only hides the player (porch roofs)
//     from `bottom` up. The walls stop at the door's face, so you can walk up to it.
//   door: the door's centre `x` on the front, the `z` of its face and its width `w`.
//   body: the walled part (centre `x`, width `w`, depth `d`); the interior has its proportions.
//   upper: the floor above inside, 'gallery' (a real storey) or 'loft' (under the gable).
// Buildings without parts collide with their whole bounds.
export const BUILDINGS = [
  // the inn, west of the street in the tile a new world starts in, its door to the street
  { name: 'town_inn_a', tile: [1, 2], x: 4.2, z: 8.22, yaw: Math.PI / 2, bounds: [-2.310, -1.764, 2.074, 2.459], height: 4.790,
    door: { x: -.28, z: 1.6, w: .8 }, body: { x: 0, w: 3.55, d: 2.9 }, upper: 'gallery',
    parts: [
      { box: [-1.84, -1.52, 1.84, 1.6], top: 4.79 },
      { box: [.62, 1.7, 1.62, 2.18], top: .75 },                       // bench
      { circle: [-.93, 2.24, .09], top: 1.7 }, { circle: [.37, 2.24, .09], top: 1.7 },   // porch posts
      { circle: [-2.055, -.43, .25], top: .6 },                          // barrel
      { box: [-1.1, 1.27, .54, 2.38], bottom: 1.6, top: 2.1, solid: false },   // porch roof
    ] },
  // the stable, west of the plaza, its horses facing the lane
  { name: 'town_stable_a', tile: [0, 1], x: 7.0, z: 6.0, yaw: 0, bounds: [-2.440, -1.564, 2.224, 2.142], height: 3.293 },
  // the smithy, east of the plaza
  { name: 'town_blacksmith_a', tile: [2, 1], x: 8.0, z: 6.0, yaw: 0, bounds: [-2.446, -1.564, 2.578, 1.731], height: 3.376,
    door: { x: -1.3, z: 1.42, w: .65 }, body: { x: -.75, w: 2.5, d: 2.5 }, upper: 'loft',
    parts: [
      { box: [-2.07, -1.32, .57, 1.42], top: 3.38 },
      { box: [.5, -1.32, 2.56, -.35], top: 3.38 },                     // forge, bellows and chimney
      { circle: [2.47, .35, .1], top: 1.75 },                            // lean-to post
      { circle: [1.25, .76, .3], top: .75 },                             // anvil
      { circle: [2.17, .45, .26], top: .55 },                            // quench tub
      { box: [-2.45, -.89, -1.99, -.43], top: .46 },                    // crate
      { box: [-2.3, -.4, -2.07, .5], top: 1.6 },                         // side window's sill and shutters
      { box: [.5, -1.32, 2.6, .4], bottom: 1.6, top: 2.05, solid: false },     // lean-to roof
    ] },
  // the pet shop, east of the inn, its door to the street
  { name: 'town_pet_shop_a', tile: [2, 2], x: 8.0, z: 7.53, yaw: -Math.PI / 2, bounds: [-1.771, -1.489, 2.494, 2.122], height: 3.333,
    door: { x: -.53, z: 1.33, w: .63 }, body: { x: 0, w: 2.6, d: 2.35 }, upper: 'loft',
    parts: [
      { box: [-1.36, -1.24, 1.36, 1.33], top: 3.33 },
      { circle: [-1.4, 2.025, .07], top: 1.71 }, { circle: [1.4, 2.025, .07], top: 1.71 },   // porch posts
      { box: [1.47, -.97, 2.21, .69], top: 1 },                         // kennels
      { circle: [1.82, .75, .16], top: .55 },                            // cat
      { box: [.14, 1.33, 1.41, 2.12], top: .6 },                        // rabbit pen
      { circle: [-1.52, -.14, .1], top: 1.6 },                           // bird perch
      { box: [-1.6, -1.1, -1.36, -.15], top: 1.6 },                      // side window's sill and shutters
      { box: [-1.47, 1.2, 1.47, 2.06], bottom: 1.6, top: 1.95, solid: false },  // canvas porch
    ] },
];
// The market: the three tents along the street inside the gate
export const MERCHANTS = [
  { name: 'town_merchant_a', tile: [1, 0], x: 4.0, z: 11.2, yaw: Math.PI / 2, bounds: [-1.551, -1.276, 1.786, 1.628], height: 2.630 },
  { name: 'town_merchant_b', tile: [1, 0], x: 12.0, z: 8.0, yaw: -Math.PI / 2, bounds: [-1.701, -1.276, 1.612, 1.644], height: 2.697 },
  { name: 'town_merchant_c', tile: [1, 0], x: 4.35, z: 6.2, yaw: Math.PI / 2, bounds: [-1.671, -1.276, 1.801, 1.637], height: 2.757 },
];
// how far a home's terrace reaches round it (world/townland.js: kept at its level)
const TERRACE = .55;
// how far in front of a door (or a frontage) its doorstep is
export const DOORSTEP = .75;
// Villagers at their trades (render/villagers.js): next to a building (`at`), standing at
// (x, z) in the building's own frame (front +Z, like `parts`), facing `facing` there (0: out of
// the front), their clay tinted, wearing and holding `outfit` (core/items.js WEARABLES). Each
// stands where it is put and is a collider (VILLAGER_R) there. The merchants stand in front of
// their stalls, beside the counter (under the canopy the roof would hide them from the camera).
export const VILLAGER_R = CHAR_R;
export const VILLAGERS = [
  // on the inn's porch, left of the door, a towel over the arm
  { name: 'innkeeper', at: 'town_inn_a', x: -1.45, z: 2.05, facing: .5, tint: '#d9b48c', outfit: ['held_towel'] },
  // in front of the horses, with a rope
  { name: 'groom', at: 'town_stable_a', x: -1.2, z: 2.6, facing: -.4, tint: '#b9c79a', outfit: ['held_rope'] },
  // at the anvil, mask down, hammer and pliers in hand
  { name: 'smith', at: 'town_blacksmith_a', x: 1.3, z: 1.36, facing: Math.PI + .3, tint: '#c99a86',
    outfit: ['wear_welding_mask', 'held_hammer', 'held_pliers'] },
  // by the rabbit pen, a bag of feed in hand
  { name: 'keeper', at: 'town_pet_shop_a', x: 1.75, z: 1.6, facing: -.5, tint: '#e0c7a0', outfit: ['held_feed_bag'] },
  // the potion seller, in a wizard's hat
  { name: 'alchemist', at: 'town_merchant_c', x: -1.05, z: 1.95, facing: .35, tint: '#b8b0d8', outfit: ['wear_wizard_hat'] },
  // the enchanter, in a headscarf, a crystal ball floating over the hand
  { name: 'enchanter', at: 'town_merchant_b', x: -1.05, z: 1.95, facing: .35, tint: '#9fc3c9',
    outfit: ['wear_headscarf', 'held_crystal_ball'] },
];
const TREES = [
  { name: 'town_tree_oak_a', height: 6.8, radius: 1.30, trunk: .334, canopy: 4.01 },
  { name: 'town_tree_elm_a', height: 7.1, radius: 1.05, trunk: .276, canopy: 4.19 },
  { name: 'town_tree_birch_a', height: 6.1, radius: .85, trunk: .218, canopy: 3.59 },
];

// Small catalog props dressing the tiles. Each has a kind deciding how it keeps
// clear of routes: `solid` ones collide, `prop` ones are knee-high or taller but
// walk-through, `cover` lies flat on the grass and may hug the path edges.
const clutterKind = m => m.blocking ? 'solid' : m.cover || m.height < .2 ? 'cover' : 'prop';
const variant = (R, base) => base + (R() < .5 ? '_a' : '_b');
const pick = (R, list) => list[Math.floor(R() * list.length)];
const segmentDistance = (x, z, [ax, az], [bx, bz]) => {
  const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
};
// boxes { x0, z0, x1, z1 }: bounds [x0, z0, x1, z1] (front +Z) turned by yaw (quarter turns: the
// same turn as a building's) and moved to (x, z); how far a point or a straight run lies from one
function turnedBox([bx0, bz0, bx1, bz1], x, z, yaw, grow = 0) {
  const c = snap(Math.cos(yaw)), s = snap(Math.sin(yaw));
  const pts = [[bx0, bz0], [bx1, bz0], [bx0, bz1], [bx1, bz1]].map(([u, v]) => [x + u * c + v * s, z - u * s + v * c]);
  return { x0: Math.min(...pts.map(p => p[0])) - grow, z0: Math.min(...pts.map(p => p[1])) - grow,
    x1: Math.max(...pts.map(p => p[0])) + grow, z1: Math.max(...pts.map(p => p[1])) + grow };
}
const boxDistance = (b, x, z) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));
const boxGap = (a, b) => Math.hypot(Math.max(a.x0 - b.x1, 0, b.x0 - a.x1), Math.max(a.z0 - b.z1, 0, b.z0 - a.z1));
// (the runs are straight and along the grid: the nearest point of one to a box)
const boxRunDistance = (b, [ax, az], [bx, bz]) => {
  const x = Math.max(Math.min(ax, bx), Math.min(Math.max(ax, bx), (b.x0 + b.x1) / 2)), z = Math.max(Math.min(az, bz), Math.min(Math.max(az, bz), (b.z0 + b.z1) / 2));
  if (Math.abs(ax - bx) < 1e-6) return Math.min(...[az, bz, Math.max(Math.min(az, bz), Math.min(Math.max(az, bz), b.z0)), Math.max(Math.min(az, bz), Math.min(Math.max(az, bz), b.z1)), z].map(v => boxDistance(b, ax, v)));
  return Math.min(...[ax, bx, Math.max(Math.min(ax, bx), Math.min(Math.max(ax, bx), b.x0)), Math.max(Math.min(ax, bx), Math.min(Math.max(ax, bx), b.x1)), x].map(v => boxDistance(b, v, az)));
};
// How far from a seam (a side with another tile beyond) anything that stands in the way keeps: the
// physics only knows the tile it is in, and a body crossing stands half in the next (docs/town.md)
export const SEAM_CLEAR = 0.9;
// How uneven the ground under a thing may be (units, highest to lowest under it): a tent or a well
// wants level ground, a bush does not care (lying flat things lie along the slope)
const UNEVEN = { big: .5, solid: .4, prop: .6, tree: .9 };

// The homes the town's people live in (blender/town_homes.py): along its streets and lanes, their
// doors to them (`door`: the door's x on the front); none of them can be entered
export const HOMES = { town_cottage_a: { door: -.45 }, town_cottage_b: { door: 0 }, town_cottage_c: { door: -.4 },
  town_cottage_d: { door: -.5 }, town_barn_a: { door: 0 } };
const isHome = name => name in HOMES;
const COTTAGES = ['town_cottage_a', 'town_cottage_b', 'town_cottage_c', 'town_cottage_d'];

// Circles (x, z, r) in buckets of a cell, for asking what is near
function circles() {
  const cells = new Map();
  let most = 0;
  return {
    add(q) { const k = Math.floor(q.z) * 64 + Math.floor(q.x); (cells.get(k) ?? cells.set(k, []).get(k)).push(q); most = Math.max(most, q.r); },
    // does test(q) hold for any within r of (x, z) (and their own radius)?
    some(x, z, r, test) {
      const reach = Math.ceil(r + most);
      for (let dz = -reach; dz <= reach; dz++) for (let dx = -reach; dx <= reach; dx++) {
        const list = cells.get((Math.floor(z) + dz) * 64 + Math.floor(x) + dx);
        if (list) for (const q of list) if (test(q)) return true;
      }
      return false;
    },
  };
}

// The ground under tile (i, j) of the land (world/townland.js), in the cube's frame (turned by
// yaw), built as the generator builds a cube's (cubegen/testrooms.js does the same): a floor of the
// land's level in each cell (its water a fluid floor), the stairs and bridges its runs, the corners
// smoothed (cubegen/smooth.js: small steps slopes, big ones cliffs; flat where the town stands and
// beside the seams), the runs shaped (cubegen/shape.js), the falls turned into the cube.
// { ctx (cols, floors, pieces, runs), cs, split, water (per cell: { surf, bed, lake } or null),
// falls, built (the cells of a run, its ends and what is under it) }
function tileGround(land, i, j, yaw, seed) {
  const ctx = createContext(seed);
  ctx.spec = { key: `town ${i},${j}`, biome: 'meadow', faces: [{}, {}, {}, {}], span: { style: 'rope' } };
  ctx.falls = []; ctx.ladders = []; ctx.pathWalks = []; ctx.pathFloors = []; ctx.runs = [];
  ctx.pieces = Array.from({ length: N * N }, () => []);
  ctx.headOK = () => true;
  ctx.slopeNoise = () => 1;   // (a step of a level is always a slope, of two mostly, of more a cliff)
  // (cube cell c <-> the land's cell)
  const toLand = c => { const [lx, lz] = rotateTownPoint(c % N + .5, Math.floor(c / N) + .5, -yaw); return [i * N + Math.floor(lx), j * N + Math.floor(lz)]; };
  const toCube = g => { const [x, z] = [g % land.W - i * N, Math.floor(g / land.W) - j * N]; if (x < 0 || z < 0 || x >= N || z >= N) return -1; const [cx, cz] = rotateTownPoint(x + .5, z + .5, yaw); return Math.floor(cz) * N + Math.floor(cx); };
  const turnDir = d => {
    const [dx, dz] = DIRS[d], [ax, az] = rotateTownPoint(8.5, 8.5, yaw), [bx, bz] = rotateTownPoint(8.5 + dx, 8.5 + dz, yaw);
    return DIRS.findIndex(([x, z]) => x === Math.round(bx - ax) && z === Math.round(bz - az));
  };
  const water = [];
  for (let c = 0; c < N * N; c++) {
    const [gx, gz] = toLand(c), w = water[c] = land.water(gx, gz), f = ctx.mk(c, land.level(gx, gz), 0, 0);
    if (w) { f.fluid = WATER; f.surf = w.surf; }
    // (pinned flat at its level: cubegen/smooth.js does so for a quest's spot)
    if (land.flat(gx, gz) && !w) f.spot = true;
    ctx.cols[c].push(f);
  }
  const floors = ctx.floors = [];
  for (const col of ctx.cols) for (const f of col) { f.id = floors.length; floors.push(f); }
  const built = new Set();
  for (const r of land.runs) {
    const from = toCube(r.from), to = toCube(r.to), cells = r.cells.map(toCube);
    if (from < 0 || to < 0 || cells.some(c => c < 0)) continue;
    const d = turnDir(r.d), [dx, dz] = DIRS[d];
    const run = { kind: r.kind, from: ctx.cols[from][0], to: ctx.cols[to][0], d, dx, dz, cells, k: cells.length, sag: 0, span: !!r.span,
      layerLo: 0, layerHi: 0, layer: 0 };
    run.pieces = cells.map((c, j) => { const p = { kind: r.kind, c, j, dx, dz, run, y0: 0, y1: 0, base: 0 }; ctx.pieces[c].push(p); return p; });
    if (r.kind === 'stair') for (const c of cells) { ctx.cols[c][0].covered = true; ctx.cols[c][0].underStair = true; }
    ctx.runs.push(run);
    ctx.stats[r.kind === 'stair' ? 'stairs' : 'bridges']++;
    if (r.span) ctx.spec.span.style = r.style;
    for (const c of [from, to, ...cells]) built.add(c);
  }
  smooth(ctx);
  // (beside a seam exactly level, and the corners round it that slope into it with it: a pinned
  // neighbour of another level shares a corner with it, cubegen/smooth.js averages the two)
  const cornerOf = (x, z, X, Z) => (X - x) + 2 * (Z - z);
  const seamy = f => land.seamCell(...toLand(f.c));
  for (const f of floors) {
    if (f.fluid || !seamy(f)) continue;
    const y = f.top * LH;
    for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const X = f.x + ox, Z = f.z + oz;
      for (const [x, z] of [[X - 1, Z - 1], [X, Z - 1], [X - 1, Z], [X, Z]]) {
        if (x < 0 || z < 0 || x >= N || z >= N) continue;
        const g = ctx.cols[z * N + x][0], k = cornerOf(x, z, X, Z);
        if (g === f || (!g.fluid && !seamy(g) && Math.abs(g.cs[k] - y) < .6)) g.cs[k] = y;
      }
    }
  }
  for (const f of floors) {
    f.split = Math.abs(f.cs[0] - f.cs[3]) <= Math.abs(f.cs[1] - f.cs[2]) ? 0 : 1;
    // (joined only where they still meet)
    f.link = f.link.map((g, d) => g && (f.fluid || g.fluid || EDGE_CORNERS[d].every((k, i) => Math.abs(f.cs[k] - g.cs[EDGE_CORNERS[OPP[d]][i]]) < .01)) ? g : null);
  }
  shapeStructures(ctx);
  for (const r of ctx.runs) delete r.street;
  for (const f of floors) delete f.spot;
  // the falls: their cell and the way they flow, turned into the cube
  const falls = [];
  for (const f of land.falls) {
    const c = toCube(f.c);
    if (c >= 0) falls.push({ c, d: turnDir(f.d), top: f.top, bot: f.bot });
  }
  return { ctx, cs: floors.map(f => f.cs), split: floors.map(f => f.split), water, falls, built, pieces: ctx.pieces };
}

// The ways over a tile's ground (tileGround, in the cube's frame), shared by the plan and the
// generator's checks (cubegen/town.js): two dry cells join where they meet without a step (not over
// a terrace's wall), water its own at its level, and a body wades out over a bank no more than a
// level over the water. A cell's level (a floor's top): what its corners come to, a bank beside water
// no more than a level over it.
const WALK_STEP = .29;   // (physics/move.js STEP)
export function groundTop(g, c) {
  const w = g.water[c], cs = g.cs[c];
  if (w) return w.bed;
  let top = Math.round((cs[0] + cs[1] + cs[2] + cs[3]) / 4 / LH);
  const bank = DIRS.map(([dx, dz]) => { const x = c % N + dx, z = Math.floor(c / N) + dz; return x >= 0 && z >= 0 && x < N && z < N && g.water[z * N + x]; }).find(Boolean);
  if (bank) top = Math.max(bank.surf, Math.min(top, bank.surf + 1));
  return top;
}
export function groundLinked(g, a, b, d) {
  const wa = g.water[a], wb = g.water[b];
  if (wa || wb) return !!(wa && wb && wa.surf === wb.surf);
  return EDGE_CORNERS[d].every((k, i) => Math.abs(g.cs[a][k] - g.cs[b][EDGE_CORNERS[OPP[d]][i]]) <= WALK_STEP);
}
// Where a body walks to from cell `start` (or any of a list) over ground g, past the bodies standing
// in the way (colliders, by cell: core/blockers.js indexBlockers), through shallow water: Map cell ->
// the cell before it (null: a start)
export function townReach(g, cells, start, { dry = false } = {}) {
  const clearAt = (x, z, m) => {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const cx = Math.floor(x) + dx, cz = Math.floor(z) + dz;
      if (cx >= 0 && cz >= 0 && cx < N && cz < N && cells[cz * N + cx].some(b => containsXZ(b, x, z, m))) return false;
    }
    return true;
  };
  // (under a stair, a bridge or a span low over the ground there is no room for a body; deep water
  // is swum, under a bridge too)
  const under = c => (g.pieces?.[c] ?? []).some(p => p.kind === 'pillar' || (!g.water[c] && Math.min(p.y0, p.y1) - .45 < Math.max(...g.cs[c]) + CHAR_H + .1));
  const clear = c => (dry ? !g.water[c] : true) && !under(c) && clearAt(c % N + .5, Math.floor(c / N) + .5, CHAR_R + .08);
  // (from one cell's middle to the next's, between the props: a body's rim's probes, physics/canmove.js)
  const between = (a, b) => {
    const ax = a % N + .5, az = Math.floor(a / N) + .5, bx = b % N + .5, bz = Math.floor(b / N) + .5;
    return [.2, .35, .5, .65, .8].every(t => clearAt(ax + (bx - ax) * t, az + (bz - az) * t, CHAR_R + .12));
  };
  const prev = new Map(), queue = [];
  for (const s of [start].flat()) if (clear(s) && !prev.has(s)) { prev.set(s, null); queue.push(s); }
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i], x = c % N, z = Math.floor(c / N);
    DIRS.forEach(([dx, dz], d) => {
      const nx = x + dx, nz = z + dz, n = nz * N + nx;
      if (nx < 0 || nz < 0 || nx >= N || nz >= N || prev.has(n)) return;
      const wet = g.water[c] ? c : g.water[n] ? n : -1, dry = wet === c ? n : c;
      const joins = groundLinked(g, c, n, d) || (wet >= 0 && !g.water[dry] && groundTop(g, dry) <= g.water[wet].surf + 1);
      if (joins && clear(n) && between(c, n)) { prev.set(n, c); queue.push(n); }
    });
  }
  return prev;
}

// A tile's plan, in town-local coordinates (rotated into the cube by the exit's yaw):
//   seams: the local sides with another tile beyond { left (x = 0), right (x = N), front (z = 0),
//     back (z = N) }; seams stay clear of what stands in the way
//   spawn: where a new world comes in (the start tile's), or null; gates: points solid clutter keeps
//   off (town-local); relics: the beginning's things lying here ({ name: [x, z] }); homes: the
//   people's houses ({ name, x, z, yaw }, town-local, HOMES)
//   land, tile: the town's land (world/townland.js) and where in it the tile lies ([i, j]); none: flat
//   (the layout, baseLayout)
function tilePlan(exit, seed, { buildings = [], homes = [], gates = [], relics = {}, spawn = null, seams, land = null, tile = [0, 0], level = TOWN_LEVEL }) {
  const yaw = exitYaw[exit];
  if (yaw === undefined) throw new Error('A town needs a side exit');
  const y = level * LH, R = mulberry32(hash32(seed ^ 0x70a11));
  const placements = [], colliders = [], occluders = [], frontages = [], paths = [], doors = [];
  const footprints = [], boxes = [], villagers = [];
  const clutter = circles(), round = circles();   // (the clutter; the round bodies that stand in the way)
  const ground = land ? tileGround(land, tile[0], tile[1], yaw, seed) : null;
  const water = ground ? ground.water.flatMap((w, c) => w ? [c] : []) : [];
  const wetSet = new Set(water);
  const collide = b => { colliders.push(b); if (b.shape !== 'box') round.add(b); };
  // the town's frame (world/townland.js) from the tile's own, and back
  const G = (lx, lz) => [tile[0] * N + lx, tile[1] * N + lz];
  const L = (gx, gz) => [gx - tile[0] * N, gz - tile[1] * N];
  // the height of the ground at (x, z) in the cube (units; in water its bed)
  const groundAt = (x, z) => {
    if (!ground) return y;
    const cx = Math.min(N - 1, Math.max(0, Math.floor(x))), cz = Math.min(N - 1, Math.max(0, Math.floor(z))), c = cz * N + cx;
    return floorY({ cs: ground.cs[c], split: ground.split[c] }, x - cx, z - cz);
  };
  // ... its lowest and highest round (x, z) as far as r, or over a box
  const under = (x, z, r) => {
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < 9; k++) {
      const a = k * Math.PI / 4, d = k === 8 ? 0 : r;
      const h = groundAt(x + Math.cos(a) * d, z + Math.sin(a) * d);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    return [lo, hi];
  };
  const underBox = b => {
    let lo = Infinity, hi = -Infinity;
    for (let u = 0; u <= 1; u += .25) for (let v = 0; v <= 1; v += .25) {
      const h = groundAt(b.x0 + (b.x1 - b.x0) * u, b.z0 + (b.z1 - b.z0) * v);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    return [lo, hi];
  };
  const add = (name, x, z, localYaw = 0, s = 1) => {
    const [rx, rz] = rotateTownPoint(x, z, yaw);
    const p = { name, x: rx, y, z: rz, yaw: localYaw + yaw, s, tint: null };
    placements.push(p); return p;
  };
  for (const b of [...buildings, ...homes.map(h => ({ ...h, home: true, bounds: propMetadata.get(h.name).bounds, height: propMetadata.get(h.name).height }))]) {
    const p = add(b.name, b.x, b.z, b.yaw);
    // (a home stands on its own terrace, its windows lit at night)
    if (b.home) { p.night = true; p.y = b.level * LH; }
    const c = snap(Math.cos(p.yaw)), s = snap(Math.sin(p.yaw));
    const turn = (x, z) => [p.x + x * c + z * s, p.z - x * s + z * c];
    const aabb = ([x0, z0, x1, z1]) => {
      const points = [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].map(([x, z]) => turn(x, z));
      return { x0: Math.min(...points.map(p => p[0])), x1: Math.max(...points.map(p => p[0])),
        z0: Math.min(...points.map(p => p[1])), z1: Math.max(...points.map(p => p[1])) };
    };
    const box = aabb(b.bounds);
    footprints.push({ x: p.x, z: p.z, c, s, bounds: b.bounds, box });
    boxes.push(box);
    if (b.home) {
      const body = { shape: 'box', name: b.name, ...aabb(b.bounds.map((v, k) => v + (k < 2 ? .06 : -.06))), bottom: p.y, top: p.y + b.height };
      collide(body); occluders.push(body);
      continue;
    }
    for (const v of VILLAGERS.filter(v => v.at === b.name)) {
      const [x, z] = turn(v.x, v.z);
      villagers.push({ name: v.name, x, y, z, yaw: p.yaw + v.facing, tint: v.tint, outfit: v.outfit });
      collide({ name: 'villager_' + v.name, x, z, r: VILLAGER_R, bottom: y, top: y + 1.1 });
    }
    for (const part of b.parts || [{ box: b.bounds, top: b.height }]) {
      let body;
      if (part.box) body = { shape: 'box', name: b.name, ...aabb(part.box), bottom: y + (part.bottom ?? 0), top: y + part.top };
      else { const [x, z] = turn(part.circle[0], part.circle[1]); body = { name: b.name, x, z, r: part.circle[2], bottom: y, top: y + part.top }; }
      if (part.solid !== false) collide(body);
      occluders.push(body);
    }
    // In front of the door; else in front of the whole footprint, on its centre line.
    const dx = s, dz = c;
    if (b.door) {
      const [x, z] = turn(b.door.x, b.door.z);
      doors.push({ id: b.name, building: b.name, to: interiorKey(b.name), x, z, nx: dx, nz: dz, w: b.door.w, y });
      frontages.push({ name: b.name, x: x + dx * DOORSTEP, z: z + dz * DOORSTEP });
      continue;
    }
    const tx = Math.abs(dx) < 1e-6 ? Infinity : ((dx > 0 ? box.x1 : box.x0) - p.x) / dx;
    const tz = Math.abs(dz) < 1e-6 ? Infinity : ((dz > 0 ? box.z1 : box.z0) - p.z) / dz;
    const distance = Math.min(tx, tz) + DOORSTEP;
    frontages.push({ name: b.name, x: p.x + dx * distance, z: p.z + dz * distance });
  }
  // Straight runs between town-local corner points, so paths follow the grid like the houses (on
  // the ground kept for them: level, or a ramp up to a home's door).
  const path = (points, width = .75) => {
    paths.push({ points: points.map(([x, z]) => rotateTownPoint(x, z, yaw)), width });
  };
  // how far town-local (x, z) is from the nearest seam (Infinity: none)
  const seamGap = (x, z) => Math.min(seams.left ? x : Infinity, seams.right ? N - x : Infinity,
    seams.front ? z : Infinity, seams.back ? N - z : Infinity);
  const [sx, sz] = spawn ? rotateTownPoint(...spawn, yaw) : [null, null];
  const plan = { placements, colliders, occluders, frontages, paths, doors, villagers, water, yaw, seams, boxes, ground, falls: ground?.falls ?? [], level,
    spawn: spawn ? [Math.floor(sx), Math.floor(sz)] : null, relics: Object.fromEntries(Object.entries(relics).map(([k, at]) => {
      // (the crater keeps the clutter further off)
      const [x, z] = rotateTownPoint(...at, yaw); return [k, { x, z, ...(k === 'shards' ? { r: 2 } : {}) }];
    })) };
  // Solid clutter keeps away from gates, the spawn plaza and doorsteps, so every
  // generated route, gate cell and frontage stays walkable.
  const keepOut = () => [
    ...gates.map(([x, z]) => { const [gx, gz] = rotateTownPoint(x, z, yaw); return { x: gx, z: gz, r: 2.1 }; }),
    ...spawn ? [{ x: sx, z: sz, r: 2.25 }] : [], ...frontages.map(f => ({ x: f.x, z: f.z, r: 1.25 })),
  ];
  const wet = (x, z, r) => water.some(c => {
    const cx = c % N, cz = Math.floor(c / N);
    return Math.hypot(x - Math.max(cx, Math.min(cx + 1, x)), z - Math.max(cz, Math.min(cz + 1, z))) < r;
  });
  // (x, z) in the cube; lx, lz the same, town-local (for the seams and the land)
  // (outside the wall nobody walks but on the road: what stands there may stand by a seam)
  const outside = (lx, lz) => !!land && land.wall.side(...G(lx, lz).map(Math.floor)) === 2;
  const fits = (x, z, r, kind, { water = false, shore = false, trail = true } = {}, [lx, lz] = rotateTownPoint(x, z, -yaw)) => {
    if (x - r < .05 || z - r < .05 || x + r > N - .05 || z + r > N - .05) return false;
    const far = outside(lx, lz);
    if (kind === 'solid' && !far && seamGap(lx, lz) < r + SEAM_CLEAR) return false;
    if (water ? !wetSet.has(Math.floor(z) * N + Math.floor(x)) : wet(x, z, shore ? .05 : kind === 'cover' ? r * .5 : r)) return false;
    for (const f of footprints) {
      if (boxDistance(f.box, x, z) > r + .01) continue;
      const dx = x - f.x, dz = z - f.z, lx = dx * f.c - dz * f.s, lz = dx * f.s + dz * f.c, m = kind === 'cover' ? r * .5 : r;
      if (lx > f.bounds[0] - m && lx < f.bounds[2] + m && lz > f.bounds[1] - m && lz < f.bounds[3] + m) return false;
    }
    if (round.some(x, z, r + .15, b => Math.hypot(x - b.x, z - b.z) < b.r + r * (kind === 'cover' ? .4 : 1) + (kind === 'solid' ? .15 : 0))) return false;
    const clearance = { solid: r + CHAR_R + .2, prop: r * .7 + .05, cover: r * .35 }[kind];
    for (const p of paths) for (let i = 1; i < p.points.length; i++)
      if (segmentDistance(x, z, p.points[i - 1], p.points[i]) < p.width / 2 + clearance) return false;
    // (the trails up the hill and down into the hollow: kept free like a path)
    if (land && trail && kind !== 'cover' && land.trailDist(...G(lx, lz)) < .45 + clearance) return false;
    // (the stairs, the bridges, the span: walked on and under, nothing on them)
    if (land && land.structureAt(...G(lx, lz), kind === 'cover' ? 0 : r)) return false;
    if (spawn && Math.hypot(x - sx, z - sz) < 1.35 + r) return false;
    if (plan.portal && Math.hypot(x - plan.portal.x, z - plan.portal.z) < 1.1 + r) return false;
    if (Object.values(plan.relics).some(q => Math.hypot(x - q.x, z - q.z) < (q.r ?? .9) + r)) return false;
    if (kind === 'solid' && keepOut().some(q => Math.hypot(x - q.x, z - q.z) < q.r + r)) return false;
    return !clutter.some(x, z, r, c => Math.hypot(x - c.x, z - c.z) < (r + c.r) * (kind === 'cover' && c.kind === 'cover' ? .55
      : kind === 'cover' || c.kind === 'cover' ? .7 : 1));
  };
  // Places at the first candidate (town-local coordinates) that fits, or nowhere. On the ground
  // there: lying things along its slope, standing ones upright, sunk to its lowest under them; on
  // uneven ground (more than `uneven`, units) not at all. Anything with a light is lit at night.
  const put = (name, candidates, { yaw: localYaw, s = .9 + R() * .2, water = false, world = false, night = false, shore = false, uneven, trail = true, radius } = {}) => {
    const m = propMetadata.get(name);
    if (!m) throw new Error('Unknown clutter prop ' + name);
    // (radius: how much room it keeps, if not its own: the deep wood's trees stand close)
    const kind = clutterKind(m), r = (radius ?? m.radius) * s;
    const most = uneven ?? (kind === 'cover' ? Infinity : kind === 'solid' ? (r > 1 ? UNEVEN.big : UNEVEN.solid) : UNEVEN.prop);
    const turn = localYaw ?? R() * Math.PI * 2;
    for (const [lx, lz] of candidates) {
      const [x, z] = world ? [lx, lz] : rotateTownPoint(lx, lz, yaw);
      if (!fits(x, z, r, kind, { water, shore: shore || !!m.shore, trail })) continue;
      let py, normal = null;
      if (water) py = ground.water[Math.floor(z) * N + Math.floor(x)].surf * LH;
      else if (kind === 'cover') {
        const e = .05, h = groundAt(x, z);
        py = h + .008;
        const gx = (groundAt(x + e, z) - groundAt(x - e, z)) / (2 * e), gz = (groundAt(x, z + e) - groundAt(x, z - e)) / (2 * e);
        if (Math.abs(gx) + Math.abs(gz) > .01) normal = [-gx, 1, -gz];
      } else {
        const [lo, hi] = under(x, z, Math.max(.1, r * .7));
        if (hi - lo > most) continue;
        py = lo - .02;
      }
      const p = { name, x, y: py, z, yaw: turn + yaw, s, tint: null, ...(normal ? { normal } : {}), ...(night || m.light ? { night: true } : {}) };
      placements.push(p); clutter.add({ x, z, r, kind });
      if (kind === 'solid') {
        const body = { name, x, z, r: m.radius * s * .8, bottom: py, top: py + m.height * s };
        collide(body);
        // (what is as tall as the hero hides them: the cutaway looks through it)
        if (m.height * s > 1.4) occluders.push(body);
      }
      return p;
    }
    return null;
  };
  // Like put, for the long and square things (fences, sheds, stalls, coops ...): on quarter turns
  // (`turn`, or each candidate's third value), standing in the way as their box.
  const piece = (name, candidates, { turn, uneven = .35 } = {}) => {
    const m = propMetadata.get(name);
    if (!m) throw new Error('Unknown piece ' + name);
    for (const [lx, lz, q = turn ?? Math.floor(R() * 4)] of candidates) {
      const [x, z] = rotateTownPoint(lx, lz, yaw), py0 = q * Math.PI / 2 + yaw, box = turnedBox(m.bounds, x, z, py0);
      if (box.x0 < .05 || box.z0 < .05 || box.x1 > N - .05 || box.z1 > N - .05) continue;
      if (m.blocking) {
        const [a0, b0] = rotateTownPoint(box.x0, box.z0, -yaw), [a1, b1] = rotateTownPoint(box.x1, box.z1, -yaw);
        if (Math.min(seamGap(a0, b0), seamGap(a1, b1), seamGap(a0, b1), seamGap(a1, b0)) < SEAM_CLEAR + .05) continue;
      }
      if (footprints.some(f => boxGap(f.box, box) < .05)) continue;
      if (round.some((box.x0 + box.x1) / 2, (box.z0 + box.z1) / 2, Math.hypot(box.x1 - box.x0, box.z1 - box.z0) / 2 + .2, b => boxDistance(box, b.x, b.z) < b.r + .1)) continue;
      if (clutter.some((box.x0 + box.x1) / 2, (box.z0 + box.z1) / 2, Math.hypot(box.x1 - box.x0, box.z1 - box.z0) / 2, c => c.kind !== 'cover' && boxDistance(box, c.x, c.z) < c.r * .8)) continue;
      const room = m.blocking ? CHAR_R + .15 : .05;
      if (paths.some(p => p.points.slice(1).some((b, i) => boxRunDistance(box, p.points[i], b) < p.width / 2 + room))) continue;
      if (land) {
        const g = [[box.x0, box.z0], [box.x1, box.z1], [(box.x0 + box.x1) / 2, (box.z0 + box.z1) / 2]].map(([a, b]) => G(...rotateTownPoint(a, b, -yaw)));
        if (g.some(([gx, gz]) => land.trailDist(gx, gz) < .6 + room || land.structureAt(gx, gz, .3))) continue;
      }
      if (water.some(c => boxDistance(box, c % N + .5, Math.floor(c / N) + .5) < .75)) continue;
      if (spawn && boxDistance(box, sx, sz) < 1.4) continue;
      if (plan.portal && boxDistance(box, plan.portal.x, plan.portal.z) < 1.2) continue;
      if (Object.values(plan.relics).some(q => boxDistance(box, q.x, q.z) < (q.r ?? .9))) continue;
      if (m.blocking && keepOut().some(q => boxDistance(box, q.x, q.z) < q.r)) continue;
      const [under, hi] = underBox(box), lo = Math.min(under, groundAt(x, z));
      if (hi - lo > uneven) continue;
      const p = { name, x, y: lo - .02, z, yaw: py0, s: 1, tint: null, ...(m.light ? { night: true } : {}) };
      placements.push(p);
      footprints.push({ x, z, c: snap(Math.cos(py0)), s: snap(Math.sin(py0)), bounds: m.bounds, box });
      if (m.blocking) {
        const body = { shape: 'box', name, ...box, bottom: p.y, top: p.y + m.height };
        collide(body);
        if (m.height > 1.4) occluders.push(body);
      }
      return p;
    }
    return null;
  };
  // A loose group: each item lands somewhere within `spread` of the anchor.
  const group = (anchors, items, spread = .9) => {
    for (const name of items) {
      const tries = anchors.flatMap(([ax, az]) => Array.from({ length: 6 }, () => {
        const a = R() * Math.PI * 2, d = Math.sqrt(R()) * spread;
        return [ax + Math.cos(a) * d, az + Math.sin(a) * d];
      }));
      put(name, tries);
    }
  };
  // The banks of the tile's water (cube coordinates), shuffled: of the lake or the stream (which),
  // or both
  const shore = which => {
    const out = [];
    for (const c of water) {
      const w = ground.water[c];
      if (which !== undefined && w.lake !== (which === 'lake')) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = c % N + dx, z = Math.floor(c / N) + dz;
        if (x >= 0 && z >= 0 && x < N && z < N && !wetSet.has(z * N + x)) out.push([c % N + .5 + dx * .78, Math.floor(c / N) + .5 + dz * .78]);
      }
    }
    return out.sort(() => R() - .5);
  };
  // A tree at town-local (lx, lz): one of the grove's big ones (TREES: a trunk that stands in the
  // way, its crown hides what is under it), or any tree of the catalog. false: it does not fit
  // (close: as close to the next as their trunks let them, the deep wood's)
  const tree = (name, lx, lz, s = .94 + R() * .08, close = false) => {
    const t = TREES.find(t => t.name === name);
    if (!t) return !!put(name, [[lx, lz]], { s, uneven: UNEVEN.tree, ...(close ? { radius: .3 } : {}) });
    const [x, z] = rotateTownPoint(lx, lz, yaw), r = t.trunk * s + (close ? .08 : .25);
    if ((seamGap(lx, lz) < t.trunk * s + SEAM_CLEAR && !outside(lx, lz)) || !fits(x, z, r, 'solid', {}, [lx, lz])) return false;
    const [lo, hi] = under(x, z, t.trunk * s);
    if (hi - lo > UNEVEN.tree) return false;
    const gy = lo - .02, p = add(t.name, lx, lz, R() * Math.PI * 2, s);
    p.y = gy;
    clutter.add({ x, z, r, kind: 'solid' });
    const trunk = { name: p.name, x: p.x, z: p.z, r: t.trunk * s, bottom: gy, top: gy + t.canopy * s };
    collide(trunk); occluders.push(trunk);
    occluders.push({ shape: 'ellipsoid', x: p.x, z: p.z, y: gy + t.height * .79 * s,
      rx: t.radius * s, rz: t.radius * s, ry: t.height * .21 * s,
      top: gy + t.height * s, bottom: gy + t.canopy * s });
    return true;
  };
  // the land's things in this tile, town-local (null: elsewhere)
  const here = f => f && f.tile?.[0] === tile[0] && f.tile?.[1] === tile[1] ? f : null;
  return { plan, add, path, tree, put, piece, group, shore, R, land, G, L, here, groundAt, under, seamGap, tile, collide, footprints, occluders, outside };
}

// a path from the corner points `via` (town-local) to frontage i
const LANE_WIDTH = .65;   // (the street's is .75; a path crossing a seam is as wide on both sides)
function leadTo(plan, path, i, via, width = LANE_WIDTH) {
  const f = plan.frontages[i];
  path([...via, rotateTownPoint(f.x, f.z, -plan.yaw)], width);
}

// What grows where (world/townland.js): [names, weight, [smallest, largest]] each
const MEADOW = [
  [['meadow_grass_tuft_a', 'meadow_grass_tuft_b'], 9, [1, 1.45]], [['meadow_flowers_a', 'meadow_flowers_b'], 3, [.8, 1.1]],
  [['meadow_clover_patch_a', 'meadow_clover_patch_b', 'meadow_daisies_a', 'meadow_daisies_b'], 5, [.9, 1.3]],
  [['any_pebbles_a', 'any_pebbles_b', 'any_stone_chips_a', 'any_stone_chips_b'], 1.2], [['any_rock_a', 'any_rock_b', 'any_rock_c'], .8],
  [['meadow_mushroom_small_a', 'meadow_mushroom_small_b'], .4], [['meadow_bush_a', 'meadow_bush_b', 'meadow_berry_bush_a', 'meadow_berry_bush_b'], 1.6, [.8, 1.15]],
  [['highlands_blue_poppy_a', 'highlands_blue_poppy_b'], .6], [['meadow_fern_a', 'meadow_fern_b'], .5],
];
const FOREST = [
  [['meadow_fern_a', 'meadow_fern_b', 'roots_cave_fern_a', 'roots_cave_fern_b'], 5, [.8, 1.2]],
  [['roots_leaf_litter_a', 'roots_leaf_litter_b', 'darkforest_leaf_litter_a', 'darkforest_leaf_litter_b'], 4, [.9, 1.3]],
  [['roots_moss_patch_a', 'roots_moss_patch_b', 'darkforest_moss_mound_a', 'darkforest_moss_mound_b'], 2],
  [['meadow_mushroom_small_a', 'meadow_mushroom_small_b'], 1.6], [['roots_moss_rock_a', 'roots_moss_rock_b'], .9],
  [['meadow_bush_a', 'meadow_bush_b', 'meadow_berry_bush_a', 'meadow_berry_bush_b'], 2.6, [.85, 1.25]],
  [['meadow_sapling_a', 'meadow_sapling_b'], 1.2, [.8, 1.2]], [['meadow_stump_a', 'meadow_stump_b', 'darkforest_mossy_stump_a'], .6],
  [['meadow_fallen_log_a', 'meadow_fallen_log_b'], .6], [['meadow_fairy_ring_a', 'meadow_fairy_ring_b'], .2],
  [['meadow_grass_tuft_a', 'meadow_grass_tuft_b'], 1.5, [1, 1.3]],
];
const HILL = [
  [['highlands_tussock_grass_a', 'highlands_tussock_grass_b'], 5, [.9, 1.3]], [['peaks_alpine_flowers_a', 'peaks_alpine_flowers_b'], 2.5],
  [['any_rock_a', 'any_rock_b', 'any_rock_c'], 2], [['highlands_scree_patch_a', 'highlands_scree_patch_b'], 1.2],
  [['any_boulder_a', 'any_boulder_b'], .5, [.8, 1.2]], [['highlands_juniper_shrub_a', 'highlands_juniper_shrub_b'], 1.6],
  [['any_stone_chips_a', 'any_stone_chips_b'], 1], [['meadow_grass_tuft_a', 'meadow_grass_tuft_b'], 2, [1, 1.3]],
];
const SHORE = [
  [['meadow_cattails_a', 'meadow_cattails_b'], 3, [.8, 1.1]], [['any_shore_stones_a', 'any_shore_stones_b'], 2],
  [['meadow_grass_tuft_a', 'meadow_grass_tuft_b'], 2, [1, 1.4]], [['any_pebbles_a', 'any_pebbles_b'], 1],
  [['lagoon_driftwood_a', 'lagoon_driftwood_b'], .4], [['meadow_fern_a', 'meadow_fern_b'], .6],
];
const HOLLOW = [
  [['meadow_fern_a', 'meadow_fern_b', 'roots_cave_fern_a', 'roots_cave_fern_b'], 3], [['meadow_mushroom_small_a', 'meadow_mushroom_small_b'], 2],
  [['roots_moss_patch_a', 'roots_moss_patch_b'], 1.5], [['meadow_grass_tuft_a', 'meadow_grass_tuft_b'], 3, [1, 1.4]],
  [['meadow_fairy_ring_a', 'meadow_fairy_ring_b'], .4], [['any_rock_a', 'any_rock_b', 'any_rock_c'], 1], [['roots_moss_rock_a', 'roots_moss_rock_b'], .6],
];
// (in the town itself: grass along the walls and the ways, flowers, a stone here and there)
const STREETS = [
  [['meadow_grass_tuft_a', 'meadow_grass_tuft_b'], 6, [.9, 1.3]], [['meadow_flowers_a', 'meadow_flowers_b'], 2, [.8, 1.1]],
  [['meadow_clover_patch_a', 'meadow_clover_patch_b', 'meadow_daisies_a', 'meadow_daisies_b'], 3, [.9, 1.2]],
  [['any_pebbles_a', 'any_pebbles_b', 'any_stone_chips_a', 'any_stone_chips_b'], 2], [['meadow_bush_a', 'meadow_bush_b'], .8, [.75, 1]],
];
const draw = (R, list) => {
  let r = R() * list.reduce((s, e) => s + e[1], 0);
  for (const e of list) if ((r -= e[1]) < 0) return e;
  return list[0];
};

// The ground cover, after everything else: what grows where it is (the land's: the shores, the
// forest's floor, the hill, the hollow, the meadow; the town's own along its walls and ways).
function groundCover({ put, land, G, R }, scale = 1) {
  const count = Math.round(230 * scale * CLUTTER);
  for (let placed = 0, tries = 0; placed < count && tries < count * 6; tries++) {
    const lx = .2 + R() * (N - .4), lz = .2 + R() * (N - .4), [gx, gz] = G(lx, lz);
    const kept = land.keepDist(gx, gz);
    const hill = land.hill, hollow = land.hollow;
    const list = kept < 1 ? STREETS : land.waterDist(gx, gz) < 1.2 ? SHORE
      : Math.hypot(gx - hollow.x, gz - hollow.z) < hollow.r1 - .5 ? HOLLOW
      : Math.hypot(gx - hill.x, gz - hill.z) < hill.r1 - .3 ? HILL
      : land.forest(gx, gz) > .35 ? FOREST : MEADOW;
    const [names, , [lo, hi] = [.9, 1.1]] = draw(R, list);
    if (put(pick(R, names), [[lx, lz]], { s: lo + R() * (hi - lo) })) placed++;
  }
}

// The forest (world/townland.js forest): trees on a loose grid, as thick as the land says, firs and
// broadleaves where its kinds of wood are, smaller trees and saplings along its edges; and in the
// open, away from the town's ways, a tree here and there, in twos and threes.
const FIRS = ['darkforest_dark_fir_tree_a', 'darkforest_dark_fir_tree_b'];
const BROADLEAVES = TREES.map(t => t.name), SMALL = ['meadow_tree_round_a', 'meadow_tree_round_b', 'meadow_tree_tall_a', 'meadow_tree_tall_b'];
const scaleOf = (R, name) => name.startsWith('town_tree') ? .82 + R() * .22 : name.startsWith('darkforest') ? .85 + R() * .45 : 1.05 + R() * .45;
function forest({ tree, put, land, G, R, tile }) {
  const out = (x, z) => land.wall.side(...G(x, z).map(Math.floor)) === 2;
  // outside the wall: the deep wood, close and tall, firs and broadleaves as the land's kinds of
  // wood go, saplings and bushes where a tree does not fit
  for (let lz = .5; lz < N; lz += 1.05) for (let lx = .5; lx < N; lx += 1.05) {
    if (!out(lx, lz)) continue;
    const [gx, gz] = G(lx, lz), f = land.forest(gx, gz), kind = land.kind(gx, gz) + (R() - .5) * .3;
    if (R() > f * 1.15) continue;
    const name = R() < .15 ? pick(R, SMALL) : kind < .45 ? pick(R, FIRS) : pick(R, BROADLEAVES), s = scaleOf(R, name) * (name.startsWith('darkforest') ? 1.15 : 1.05);
    let ok = false;
    for (let k = 0; k < 3 && !ok; k++) {
      const x = lx + (R() - .5) * .6, z = lz + (R() - .5) * .6;
      ok = out(x, z) && tree(name, x, z, s, true);
    }
    const x = lx, z = lz;
    if (!ok)
      put(pick(R, ['meadow_bush_a', 'meadow_bush_b', 'meadow_berry_bush_a', 'meadow_sapling_a', 'meadow_sapling_b', 'roots_moss_rock_a']), [[x, z]], { s: .9 + R() * .4 });
  }
  const step = 1.65, park = tile[1] < 2 ? .34 : .24;
  for (let lz = .9; lz < N; lz += step) for (let lx = .9; lx < N; lx += step) {
    const x = lx + (R() - .5) * 1.1, z = lz + (R() - .5) * 1.1, [gx, gz] = G(x, z);
    if (out(x, z)) continue;
    const f = land.forest(gx, gz), kind = land.kind(gx, gz) + (R() - .5) * .25;
    if (f <= 0) {
      // (the open: parkland, more of it in the lower town)
      if (land.keepDist(gx, gz) > 1.4 && R() < park) {
        const name = R() < .5 ? pick(R, SMALL) : kind < .42 ? pick(R, FIRS) : pick(R, BROADLEAVES);
        tree(name, x, z, scaleOf(R, name) * (name.startsWith('town_tree') ? .8 : 1));
      }
      continue;
    }
    if (R() > f * 1.05) continue;
    const name = f < .55 && R() < .55 ? pick(R, SMALL) : kind < .42 ? pick(R, FIRS) : pick(R, BROADLEAVES);
    if (!tree(name, x, z, scaleOf(R, name)))
      put(pick(R, ['meadow_bush_a', 'meadow_bush_b', 'meadow_berry_bush_a', 'meadow_sapling_a', 'meadow_sapling_b']), [[x, z]], { s: .9 + R() * .35 });
  }
}

// Trees along the town's ways, now on one side, now on the other; a lamp every few steps, on
// alternate sides (no nearer another lamp than LAMP_GAP); over a lane now and then a garland
const AVENUE = ['meadow_tree_round_a', 'meadow_tree_round_b', 'meadow_tree_tall_a', 'meadow_tree_tall_b', 'town_tree_birch_a', 'town_tree_elm_a'];
const LAMP_GAP = 2.6;
function avenues(t) {
  const { plan, tree, put, R } = t;
  const local = ([x, z]) => rotateTownPoint(x, z, -plan.yaw);
  const lamps = () => plan.placements.filter(q => q.name.startsWith('town_street_lamp'));
  for (const p of [...plan.paths]) {
    if (p.width < .6) continue;
    for (let i = 1; i < p.points.length; i++) {
      const [ax, az] = local(p.points[i - 1]), [bx, bz] = local(p.points[i]), len = Math.hypot(bx - ax, bz - az);
      if (len < 2) continue;
      const ux = (bx - ax) / len, uz = (bz - az) / len, kind = pick(R, AVENUE), street = p.width > .7;
      const at = (d, off, side) => [ax + ux * d - uz * off * side, az + uz * d + ux * off * side];
      let side = R() < .5 ? 1 : -1, lampSide = R() < .5 ? 1 : -1;
      // the lamps, their arms (a crook's lantern) out over the way
      for (let d = .6 + R() * 1.5; d < len - .3; d += 3.6 + R() * 1.4, lampSide = -lampSide) {
        const name = street ? (R() < .6 ? 'town_street_lamp_a' : 'town_street_lamp_b') : (R() < .6 ? 'town_street_lamp_c' : 'town_street_lamp_a');
        const spots = [.6, .85, 1.1].map(o => at(d, p.width / 2 + o, lampSide));
        const [cx, cz] = rotateTownPoint(...spots[0], plan.yaw);
        if (lamps().some(q => Math.hypot(q.x - cx, q.z - cz) < LAMP_GAP)) continue;
        put(name, spots, { s: 1, night: true, yaw: Math.atan2(lampSide * ux, lampSide * uz) });
      }
      for (let d = .8 + R() * 1.2; d < len - .5; d += 2.2 + R() * 1.4, side = R() < .7 ? -side : side) {
        const [x, z] = at(d, p.width / 2 + 1.05 + R() * .5, side);
        const name = R() < .7 ? kind : pick(R, AVENUE);
        if (R() < .82) tree(name, x, z, name.startsWith('town_tree') ? .58 + R() * .14 : 1.15 + R() * .35);
        else put(variant(R, 'meadow_bush'), [[x, z]], { s: 1 + R() * .3 });
      }
      if (!street && len >= 4 && R() < .4) {
        const d = len * (.35 + R() * .3);
        garlands(t, [at(d, p.width / 2 + .8, 1), at(d, p.width / 2 + .8, -1)]);
      }
    }
  }
}

// Garlands (blender/town_clutter.py): poles at the points (town-local) in turn, a garland strung
// from the top of each to the next (sagging, a head's room over the ground all along, or none):
// segments of the `line` props, each sheared along the curve (as render/propplace.js strings the
// dark forest's lanterns). Lit at night, every other bulb with a light of its own; they come on as
// one (their placements share where they are: render/night.js).
const POLE_TOP = 2.55, GARLANDS = ['town_garland_a', 'town_garland_b', 'town_garland_c'];
function garlands(t, points) {
  const { put, R } = t;
  const poles = points.map(([x, z]) => put(R() < .5 ? 'town_garland_pole_a' : 'town_garland_pole_b', near(x, z, .9), { s: 1 }));
  for (let k = 1; k < poles.length; k++) {
    const p = poles[k - 1], q = poles[k];
    if (p && q) garland(t, [p.x, p.y + POLE_TOP, p.z], [q.x, q.y + POLE_TOP, q.z]);
  }
}
function garland({ plan, groundAt, R }, a, b) {
  const L = Math.hypot(b[0] - a[0], b[2] - a[2]);
  if (L < 1.2 || L > 6.5) return false;
  const sag = .2 + .07 * L, at = t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
  for (let k = 0; k <= 20; k++) { const [x, y, z] = at(k / 20); if (y - .2 - groundAt(x, z) < CHAR_H + .7) return false; }
  const steps = Math.max(2, Math.round(L / .8)), first = Math.floor(R() * 3), [mx, , mz] = at(.5);
  for (let k = 0; k < steps; k++) {
    const p = at(k / steps), q = at((k + 1) / steps), d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], h = Math.hypot(d[0], d[2]) || 1;
    plan.placements.push({ name: GARLANDS[(first + k) % GARLANDS.length], x: mx, y: p[1], z: mz, yaw: 0, s: 1, tint: null, night: true,
      matrix: [d[0], d[1], d[2], 0, 0, 1, 0, 0, -d[2] / h, 0, d[0] / h, 0, p[0], p[1], p[2], 1], ...(k % 2 ? { unlit: true } : {}) });
  }
  return true;
}

// Hedges and dry stone walls along the ways, a cell back from them, with gaps (more of them in the
// lower town)
const ROWS = ['town_hedge_a', 'town_hedge_b', 'town_stone_wall_a', 'town_stone_wall_b'];
function hedgerows({ plan, piece, R, tile }) {
  const local = ([x, z]) => rotateTownPoint(x, z, -plan.yaw), lower = tile[1] < 2;
  for (const p of [...plan.paths]) {
    if (p.width < .6) continue;
    for (let i = 1; i < p.points.length; i++) {
      const [ax, az] = local(p.points[i - 1]), [bx, bz] = local(p.points[i]), len = Math.hypot(bx - ax, bz - az);
      if (len < 3) continue;
      const ux = (bx - ax) / len, uz = (bz - az) / len, q = Math.abs(ux) > Math.abs(uz) ? 0 : 1, off = p.width / 2 + 1.25;
      for (const side of [-1, 1]) {
        if (R() > (lower ? .9 : .4)) continue;
        const name = pick(R, ROWS);
        for (let d = 1.2; d < len - 1; d += 2.05) {
          if (R() < .2) continue;
          piece(R() < .85 ? name : pick(R, ROWS), [0, .35, .7].map(o => [ax + ux * d - uz * (off + o) * side, az + uz * d + ux * (off + o) * side, q]), { turn: q, uneven: .6 });
        }
      }
    }
  }
}

// The town's wall (world/townland.js WALL), its own share of it in each tile: a stretch on each of
// its cells (an arch over the water, a lantern on every fourth, ivy on some), a tower where the land
// has one, the gatehouse over the street in the gate's tile. Each stands on a footing sunk WALL_FOOT
// into the ground under it (an arch ARCH_FOOT into the water: blender/town_walls.py), its outer face
// to the forest; it stands in the way as its box (a tower as its circle) and hides the hero behind
// it (the cutaway), an arch but under the water. Never moved for a way (clearWays) nor kept off a
// seam: it runs on across the seams into the next tile, and nobody walks outside it.
const WALL_FOOT = .9, ARCH_FOOT = 1.1;
const isWall = name => name.startsWith('town_wall') || name === 'town_gatehouse_a';
function walls(t) {
  const { plan, land, tile: [ti, tj], add, collide, footprints, occluders, under } = t;
  const { W, wall } = land, g = plan.ground;
  const place = (name, lx, lz, localYaw, y) => {
    const p = add(name, lx, lz, localYaw);
    p.y = y;
    if (propMetadata.get(name).light) p.night = true;
    return p;
  };
  const block = (p, b, grow = 0) => footprints.push({ x: p.x, z: p.z, c: snap(Math.cos(p.yaw)), s: snap(Math.sin(p.yaw)), bounds: b.map((v, k) => v + (k < 2 ? -grow : grow)),
    box: turnedBox(b, p.x, p.z, p.yaw, grow) });
  const body = (p, b, bottom, top) => ({ shape: 'box', name: p.name, ...turnedBox(b, p.x, p.z, p.yaw), bottom, top });
  for (let lz = 0; lz < N; lz++) for (let lx = 0; lx < N; lx++) {
    const gx = ti * N + lx, gz = tj * N + lz;
    if (wall.side(gx, gz) !== 1 || wall.gateAt(gx, gz)) continue;
    const [cx, cz] = rotateTownPoint(lx + .5, lz + .5, plan.yaw), c = Math.floor(cz) * N + Math.floor(cx);
    const water = g.water[c], h = hash32(gx * 7919 + gz * 104729 + land.seed);
    // (its outer face away from the town; a corner's towards its nearer side)
    const [ox, oz] = gx === WALL ? [-1, 0] : gx === W - 1 - WALL ? [1, 0] : gz === WALL ? [0, -1] : [0, 1], yaw = Math.atan2(ox, oz);
    if (wall.towers.has(gz * W + gx)) {
      const name = h % 3 ? 'town_wall_tower_b' : 'town_wall_tower_a', [lo] = under(cx, cz, .85);
      const p = place(name, lx + .5, lz + .5, yaw, lo - WALL_FOOT + .02), round = { name, x: p.x, z: p.z, r: .86, bottom: p.y, top: p.y + propMetadata.get(name).height };
      collide(round); occluders.push(round); block(p, [-.95, -.95, .95, .95]);
      continue;
    }
    const lantern = (gx + gz) % 4 === 0;
    const name = water ? (lantern ? 'town_wall_arch_b' : 'town_wall_arch_a') : lantern ? 'town_wall_lantern_a' : h % 10 < 3 ? 'town_wall_b' : 'town_wall_a';
    const p = place(name, lx + .5, lz + .5, yaw, water ? water.surf * LH - ARCH_FOOT : Math.min(...g.cs[c]) - WALL_FOOT + .02);
    const b = body(p, [-.497, -.36, .497, .36], p.y, p.y + propMetadata.get(name).height);
    collide(b);
    if (!water) occluders.push(b);
    block(p, [-.5, -.36, .5, .36], .1);
  }
  // the gatehouse, over the street where it comes in (its towers stand in the way, its arch hides)
  const [gx, gz] = wall.gate;
  if (Math.floor(gx / N) !== ti || Math.floor(gz / N) !== tj) return;
  const lx = gx - ti * N, lz = gz - tj * N, [cx, cz] = rotateTownPoint(lx, lz, plan.yaw), [lo] = under(cx, cz, 2.4);
  const p = place('town_gatehouse_a', lx, lz, Math.PI, lo - WALL_FOOT + .02), top = p.y + propMetadata.get(p.name).height;
  for (const b of [[-2.5, -.75, -1, .75], [1, -.75, 2.5, .75]]) { const q = body(p, b, p.y, top); collide(q); occluders.push(q); }
  occluders.push(body(p, [-1, -.45, 1, .45], p.y + WALL_FOOT + 1.75, top));
  block(p, [-2.5, -.75, 2.5, .75], .1);
}

// What stands round a home (HOMES): flowers by its door, trees in its yard, behind it a garden
// fenced in, the wash hanging out, wood stacked, or the animals (`rural`: on the town's edge)
function yard(t, h) {
  const { put, piece, tree, R } = t;
  const [x0, z0, x1] = propMetadata.get(h.name).bounds, z1 = propMetadata.get(h.name).bounds[3];
  const c = snap(Math.cos(h.yaw)), s = snap(Math.sin(h.yaw)), q = Math.round(h.yaw / (Math.PI / 2)) & 3;
  const at = (u, v) => [h.x + u * c + v * s, h.z - u * s + v * c], door = HOMES[h.name].door;
  if (R() < .8) put(variant(R, 'town_flower_pots'), [at(door + .7, z1 + .05), at(door - .7, z1 + .05)], { s: .85 });
  if (R() < .4) put(variant(R, 'town_planter'), [at(x1 - .7, z1 + .1), at(x0 + .7, z1 + .1)], { yaw: h.yaw });
  if (R() < .3) put(variant(R, 'town_bench'), [at(x1 - .5, z1 + .55), at(x0 + .5, z1 + .55)], { yaw: h.yaw });
  if (R() < .35) put(R() < .5 ? 'mines_barrel_a' : 'mines_crate_a', [at(x0 - .45, z1 - .6), at(x1 + .45, z1 - .6)]);
  const sideTree = R() < .5 ? [x1 + 1.2, z0 + .4] : [x0 - 1.2, z0 + .4];
  for (const [u, v] of [sideTree, [(x0 + x1) / 2 + (R() - .5) * 2, z0 - 2.6]]) if (R() < .7) {
    const name = pick(R, AVENUE);
    tree(name, ...at(u, v), name.startsWith('town_tree') ? .6 + R() * .15 : 1.2 + R() * .3);
  }
  const style = pick(R, h.rural ? ['garden', 'farm', 'wood', 'farm', 'wash'] : ['garden', 'wash', 'wood', 'garden', 'wash']);
  if (style === 'garden') {
    piece(variant(R, 'town_garden_bed'), [[...at(0, z0 - 1.05), q], [...at(0, z0 - 1.05), q + 2], [...at(x1 + 1.1, 0), q + 1]]);
    if (R() < .5) piece(variant(R, 'town_garden_bed'), [[...at(R() < .5 ? x0 - 1.1 : x1 + 1.1, 0), q + 1]]);
    for (const u of [-1.05, 1.05]) piece(R() < .25 ? 'town_fence_b' : 'town_fence_a', [[...at(u, z0 - 2.05), q]]);
    for (const u of [x0 - .25, x1 + .25]) piece('town_fence_a', [[...at(u, z0 - 1.05), q + 1]]);
  } else if (style === 'wash') {
    put(variant(R, 'town_laundry_line'), [at(0, z0 - 1.2), at(x1 + 1.3, (z0 + z1) / 2), at(x0 - 1.3, (z0 + z1) / 2)], { yaw: h.yaw + (R() < .5 ? 0 : Math.PI) });
  } else if (style === 'wood') {
    if (!piece('town_shed_a', [[...at(x1 + 1.5, z0 + .7), q + (R() < .5 ? 1 : 3)], [...at(0, z0 - 1.4), q + 2]]))
      put('town_woodpile_a', [at(x1 + .9, 0), at(x0 - .9, 0)], { yaw: h.yaw + Math.PI / 2 });
  } else {
    piece(pick(R, ['town_chicken_coop_a', 'town_beehives_a', 'town_trough_a']), [[...at(x1 + 1.3, z0 + .5), q], [...at(x0 - 1.3, z0 + .5), q], [...at(0, z0 - 1.4), q]]);
    if (R() < .5) put(variant(R, 'town_hay_bales'), [at(x0 - 1.1, z0 - .9), at(x1 + 1.1, z0 - .9)]);
  }
}

// Grass, roots and moss hanging over the terraces' walls (props hung on a lip: render/propplace.js)
const DRAPES = ['meadow_grass_drape_a', 'meadow_grass_drape_b', 'roots_root_drape_a', 'roots_root_drape_b', 'darkforest_root_drape_a'];
function drapes({ plan, R }) {
  const g = plan.ground, own = new Set(plan.paths.flatMap(p => p.points.map(([x, z]) => Math.floor(z) * N + Math.floor(x))));
  for (let c = 0; c < N * N; c++) {
    if (g.water[c] || own.has(c)) continue;
    const x = c % N, z = (c - x) / N;
    for (let d = 0; d < 4; d++) {
      const nx = x + DIRS[d][0], nz = z + DIRS[d][1];
      if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
      const [a, b] = EDGE_CORNERS[d], [na, nb] = EDGE_CORNERS[OPP[d]], n = nz * N + nx;
      const edgeTop = Math.min(g.cs[c][a], g.cs[c][b]), below = g.water[n] ? g.water[n].surf * LH : Math.max(g.cs[n][na], g.cs[n][nb]);
      if (edgeTop - below < .55 || R() > .45) continue;
      const t = .25 + R() * .5, [ex, ez] = [[1, t], [0, t], [t, 1], [t, 0]][d];
      plan.placements.push({ name: pick(R, DRAPES), x: x + ex, y: edgeTop, z: z + ez, yaw: Math.atan2(-DIRS[d][0], -DIRS[d][1]), s: .85 + R() * .3, tint: null });
    }
  }
}

// What must be walked to in a tile (cube cells) from where the town goes on (its seams' cells,
// world/townland.js sees to it all of the town's ground is walked to from the gate): its frontages,
// its gate, its spawn, the portal's spot, the beginning's things. Where what stands about leaves one
// of them cut off, what stands on the shortest way to it goes (not a building, a home or a
// villager): the generator checks it all is reached (cubegen/town.js).
const KEEPS = new Set([...BUILDINGS, ...MERCHANTS].map(b => b.name));
function clearWays({ plan, seamGap }, spec) {
  const g = plan.ground, cellOf = (x, z) => Math.floor(z) * N + Math.floor(x);
  const needed = new Set(plan.frontages.map(f => cellOf(f.x, f.z))), start = [];
  for (let c = 0; c < N * N; c++) if (seamGap(...rotateTownPoint(c % N + .5, Math.floor(c / N) + .5, -plan.yaw)) < 1 && !plan.wallSide?.[c]) start.push(c);
  for (const [x, z] of spec.gates ?? []) needed.add(cellOf(...rotateTownPoint(x, z, plan.yaw)));
  for (const q of [...Object.values(plan.relics), ...plan.portal ? [plan.portal] : []]) needed.add(cellOf(q.x, q.z));
  if (plan.spawn) { needed.add(plan.spawn[1] * N + plan.spawn[0]); start.push(plan.spawn[1] * N + plan.spawn[0]); }
  if (!start.length) start.push(...needed);
  const fixed = b => KEEPS.has(b.name) || isHome(b.name) || isWall(b.name) || b.name.startsWith('villager_');
  const gone = new Set();
  for (let round = 0; round < 40; round++) {
    const cells = indexBlockers(plan.colliders), reach = townReach(g, cells, start);
    const missing = [...needed].filter(c => !reach.has(c));
    if (!missing.length) break;
    // the way to the nearest missing cell, past what may go: what of it stands on that way goes
    const free = indexBlockers(plan.colliders.filter(fixed)), around = townReach(g, free, start);
    const target = missing.find(c => around.has(c));
    if (target === undefined) break;
    const way = [];
    for (let c = target; c !== null; c = around.get(c)) way.push(c);
    const hit = plan.colliders.filter(b => !fixed(b) && way.some((c, i) => {
      const x = c % N + .5, z = Math.floor(c / N) + .5, n = way[i + 1];
      if (containsXZ(b, x, z, CHAR_R + .2)) return true;
      if (n === undefined) return false;
      const nx = n % N + .5, nz = Math.floor(n / N) + .5;
      return [.2, .35, .5, .65, .8].some(t => containsXZ(b, x + (nx - x) * t, z + (nz - z) * t, CHAR_R + .2));
    }));
    if (!hit.length) break;
    for (const b of hit) gone.add(b);
    plan.colliders = plan.colliders.filter(b => !gone.has(b));
  }
  if (!gone.size) return;
  // (and what they were: their placements, what hid behind them)
  const at = new Set([...gone].map(b => b.name + ':' + (b.x ?? (b.x0 + b.x1) / 2).toFixed(3) + ':' + (b.z ?? (b.z0 + b.z1) / 2).toFixed(3)));
  const key = p => p.name + ':' + p.x.toFixed(3) + ':' + p.z.toFixed(3);
  const boxKey = p => { const b = [...gone].find(b => b.shape === 'box' && b.name === p.name && containsXZ(b, p.x, p.z)); return b ? b : null; };
  plan.placements = plan.placements.filter(p => !at.has(key(p)) && !boxKey(p));
  plan.occluders = plan.occluders.filter(b => !gone.has(b) && !(b.shape === 'ellipsoid' && [...gone].some(t => t.x === b.x && t.z === b.z)));
}

// The street lamps, lit at night (render/night.js): [name, candidates] each.
function lamps(put, list) {
  for (const [name, candidates] of list) put(name, candidates, { s: 1, night: true });
}
// candidates round (x, z) (town-local), nearest first, as far as r
function near(x, z, r) {
  const out = [];
  for (let dz = -r; dz <= r + 1e-9; dz += .25) for (let dx = -r; dx <= r + 1e-9; dx += .25)
    if (Math.hypot(dx, dz) <= r + 1e-9) out.push([x + dx, z + dz, Math.hypot(dx, dz)]);
  return out.sort((a, b) => a[2] - b[2]).map(([x, z]) => [x, z]);
}
// at the first of the candidates (town-local) that fits, its front turned towards `to`
function facing(put, name, candidates, [tx, tz], opts = {}) {
  for (const [x, z] of candidates) {
    const p = put(name, [[x, z]], { ...opts, yaw: Math.atan2(tx - x, tz - z) });
    if (p) return p;
  }
  return null;
}
// the quarter turn (0..3) whose front looks most towards (tx, tz) from (x, z)
const quarterTo = (x, z, tx, tz) => Math.round(Math.atan2(tx - x, tz - z) / (Math.PI / 2)) & 3;

// A camp on the land's flat top or bottom f (the hill's, the hollow's: world/townland.js): a tent at
// the back with its door to where the trail comes up (or towards the town), a fire in front of it
// with logs round it to sit on, a lantern by the door, the campers' things beside the tent.
function camp(t, f, { tent, fire = 'relics_old_campfire_a', stock = [], extra = () => {} }) {
  const { put, group, land, L, R } = t;
  const [cx, cz] = L(f.x, f.z), trail = land.trails.find(r => r.to === (f === land.hill ? 'hill' : 'hollow'));
  const [hx, hz] = trail ? L(...trail.points[0]) : L(land.W / 2, land.D / 2);
  const a = Math.atan2(hz - cz, hx - cx), ux = Math.cos(a), uz = Math.sin(a), side = R() < .5 ? 1 : -1;
  const tx = cx - ux * 1.1, tz = cz - uz * 1.1;
  const at = (along, across) => [cx + ux * along - uz * across * side, cz + uz * along + ux * across * side];
  // (where the trail ends: at its door)
  const home = facing(put, tent, near(tx, tz, 2.6), [hx, hz], { s: 1, uneven: .8, trail: false });
  const [fx, fz] = at(1.5, .7), lit = put(fire, near(fx, fz, .6), { s: 1 });
  if (lit) {
    const [px, pz] = rotateTownPoint(lit.x, lit.z, -t.plan.yaw);
    for (const k of [0, 1, 2]) {
      const b = a + side * (1.2 + k * 1.9), lx = px + Math.cos(b) * .95, lz = pz + Math.sin(b) * .95;
      put(variant(R, 'meadow_fallen_log'), [[lx, lz]], { yaw: Math.atan2(px - lx, pz - lz) + Math.PI / 2, s: .85 });
    }
  }
  put(variant(R, 'mines_lantern'), [at(.2, -1.6), at(-.5, -1.8), at(.6, 1.8)], { s: .9 });
  group([at(-1.2, 1.9), at(-1.6, -1.9)], stock, .7);
  extra(at, home);
}

// The things at the hill's top (a lookout: a bench facing the town, cairns)
function lookout(t) {
  const { put, land, L, R } = t;
  camp(t, land.hill, { tent: 'peaks_expedition_camp_a', stock: ['mines_crate_b', 'relics_abandoned_pack_b', 'mines_sacks_a'],
    extra: at => {
      const [mx, mz] = L(land.W / 2, land.D / 2);
      facing(put, variant(R, 'town_bench'), [at(.6, -1.9), at(1.2, -1.6), at(-.2, -2.2)], [mx, mz], { s: 1 });
      put(variant(R, 'any_cairn'), [at(2.3, -1), at(2.4, 1.4), at(-2, .3)]);
    } });
  // boulders on its sides
  const [hx, hz] = L(land.hill.x, land.hill.z);
  for (let k = 0; k < 6; k++) {
    const a = R() * Math.PI * 2, d = land.hill.r0 + .8 + R() * (land.hill.r1 - land.hill.r0 - 1.5);
    put(variant(R, 'any_boulder'), [[hx + Math.cos(a) * d, hz + Math.sin(a) * d]], { s: .8 + R() * .5, uneven: .8 });
  }
}

// The hollow: someone camps down there (in the traders' camp's tile, the traders themselves)
function dell(t, traders) {
  const { put, R } = t;
  camp(t, t.land.hollow, { tent: 'highlands_nomad_tent_a', fire: traders ? 'relics_old_campfire_b' : 'relics_old_campfire_a',
    stock: traders ? ['mines_sacks_b', 'mines_crate_b', 'mines_barrel_b', 'mines_crate_a'] : ['mines_sacks_a', 'relics_abandoned_pack_a'],
    extra: at => {
      put('town_woodpile_a', [at(-.4, 2.4), at(.4, -2.4), at(-1.8, 1.6)], { yaw: R() * Math.PI });
      if (!traders) put(variant(R, 'town_hay_bales'), [at(-2, -1.4), at(1.8, 2.2)]);
    } });
}

// Where the stream rises: stones round its spring, reeds
function spring(t) {
  const { group, land, L } = t;
  if (!land.spring || !t.inTile(land.spring)) return;
  const [x, z] = L(land.spring.x, land.spring.z);
  group([[x, z]], ['any_boulder_a', 'any_boulder_b', 'any_shore_stones_a', 'meadow_cattails_a', 'any_rock_b', 'meadow_fern_a'], 1.6);
}

// The trails' marks: a signpost where one leaves the town's level ground, and stones along it
function trailMarks(t) {
  const { put, land, L, R } = t;
  for (const tr of land.trails) {
    const foot = tr.points.at(-1), [fx, fz] = L(...foot);
    if (t.inTile({ x: foot[0], z: foot[1] })) {
      const prev = L(...tr.points.at(-2) ?? foot), a = Math.atan2(prev[0] - fx, prev[1] - fz);
      put(variant(R, 'relics_signpost'), [[fx + Math.cos(a) * .9, fz - Math.sin(a) * .9], [fx - Math.cos(a) * .9, fz + Math.sin(a) * .9]], { yaw: a, s: 1 });
    }
    // stepping stones every so often along it
    for (let i = 1; i < tr.points.length; i++) {
      const [ax, az] = tr.points[i - 1], [bx, bz] = tr.points[i], len = Math.hypot(bx - ax, bz - az);
      for (let d = .6; d < len; d += 1.3) {
        const gx = ax + (bx - ax) * d / len, gz = az + (bz - az) * d / len;
        if (!t.inTile({ x: gx, z: gz }) || R() < .35) continue;
        put(pick(R, ['any_rock_slab_a', 'any_rock_slab_b', 'any_gravel_patch_a', 'any_gravel_patch_b']), [L(gx + (R() - .5) * .3, gz + (R() - .5) * .3)], { s: .7 + R() * .3 });
      }
    }
  }
}

// Now and then a little scene in the woods of an outer tile: where someone cut wood, old stones, a
// shrine, a wagon left to the moss, a shed
const SCENES = ['darkforest_woodcutter_camp_a', 'darkforest_stone_circle_a', 'darkforest_wayside_shrine_a', 'darkforest_overgrown_wagon_a',
  'darkforest_abandoned_shed_a'];
function woodsScene(t) {
  const { put, land, G, R } = t;
  if (R() > .45) return;
  const name = pick(R, SCENES), spots = [];
  for (let k = 0; k < 60; k++) {
    const x = 2 + R() * (N - 4), z = 2 + R() * (N - 4), f = land.forest(...G(x, z));
    if (f > .2 && f < .8) spots.push([x, z]);
  }
  const [mx, mz] = t.L(land.W / 2, land.D / 2);
  facing(put, name, spots, [mx, mz], { s: 1 });
}

// The streets (town-local, in every tile alike, so they meet at the seams): the main street runs
// from the gate straight back along the middle column (x = STREET) to the green; the lanes cross
// the plaza's row (z = LANE_1) and the inn's (z = LANE_2) to the houses either side.
export const STREET = 8.5, LANE_1 = 10.5, LANE_2 = 7;
// Where the town end of a town portal stands (town-local, in the plaza's tile: PORTAL_TILE): west
// of the street, across from the crash. Nothing is put on it.
export const TOWN_PORTAL_SPOT = [4.5, 6.0];
// Where the beginning's things lie (town-local, in the plaza's tile; core/intro.js, docs/story.md
// "The beginning"): the glassmaker's big glass came down here and burst (render/shards.js: the
// shards round a scorched patch, the crater); thrown out at its rim, the robot asleep in the grass
// (core/robot.js) and his old sword stuck in the ground beside it, both off the street (walking
// along it takes neither). Nothing is put on them.
export const CRASH = [12.2, 5.6], CRASH_ROBOT = [11.0, 7.6], CRASH_SWORD = [12.5, 8.0];
// the house a new hero comes out of as the world comes up (game/intro.js): the inn
export const WAKE_HOUSE = 'town_inn_a';

// What stands in each tile ([j][i]): `ways(tools)` lays its paths (the town's level ground,
// baseLayout), `dress(tools)` puts what stands there; `keep`: more of it on level ground ([x, z, r]
// town-local, round its set pieces); `rural`: on the town's edge (its homes keep animals)
const of = (i, j) => [...BUILDINGS, ...MERCHANTS].filter(b => b.tile[0] === i && b.tile[1] === j);
const TILES = [
  // the gate's row: an orchard, the market inside the gate, the traders' camp (in some worlds the
  // hollow with its camp lies in one of the corners)
  [
    { name: 'orchard', rural: true, dress(t) {
      const { put, piece, group, here, L, R } = t;
      const dell_ = here(t.land.hollow);
      if (dell_) dell(t, false);
      // fruit trees: in rows, or about the hollow's rim and the meadow
      const rows = !dell_ && R() < .6, trees = [];
      if (rows) for (let z = 3.5; z < 14; z += 3.2) for (let x = 3 + (R() < .5 ? 0 : 1.2); x < 14; x += 3.2) trees.push([x + (R() - .5) * .4, z + (R() - .5) * .4]);
      else for (let k = 0; k < 18; k++) trees.push([2 + R() * 12, 2 + R() * 12]);
      for (const [x, z] of trees) put(variant(R, R() < .7 ? 'meadow_tree_round' : 'meadow_tree_tall'), near(x, z, .5), { s: 1.1 + R() * .3 });
      const [cx, cz] = dell_ ? L(dell_.x + (dell_.x < 8 ? 6 : -6), dell_.z) : [8, 8];
      put(variant(R, 'town_hay_bales'), near(cx, cz, 2));
      put('town_scarecrow_a', [...near(cx + 2, cz + 1, 2), ...near(5, 6, 3)], { yaw: R() * Math.PI * 2 });
      piece('town_beehives_a', [...near(3, 3, 2), ...near(13, 13, 2)]);
      put(variant(R, 'mines_wheelbarrow'), [...near(7.5, 12.5, 2), ...near(12, 4, 2)], { yaw: R() * Math.PI });
      group([[12.8, 8.5], [3, 12]], ['mines_crate_a', 'mines_sacks_a', 'mines_barrel_b', 'mines_sacks_b'], .8);
      put(variant(R, 'meadow_stump'), near(3, 8, 2));
      put(variant(R, 'town_handcart'), near(10, 13, 2), { yaw: R() * Math.PI * 2, s: .85 });
    } },
    { name: 'market', gates: [[STREET, .9]], keep: [[STREET, 1.5, 2.5], [STREET, 3.5, 3.2]], ways({ path, plan }) {
      path([[STREET, 0], [STREET, N]]);
      leadTo(plan, path, 0, [[STREET, 11.2]]);
      leadTo(plan, path, 1, [[STREET, 8]]);
      leadTo(plan, path, 2, [[STREET, 6.2]]);
    }, dress(t) {
      const { put, piece, group, R } = t;
      // a waymark outside the gate, lamps where the traders set up, stalls along the street
      put('relics_signpost_b', [[7.0, 1.2], [10.0, 1.4]], { yaw: Math.PI / 2 - .2, s: 1 });
      lamps(put, [['town_street_lamp_a', [[7.0, 9.4], [6.8, 8.8]]], ['town_street_lamp_a', [[10.0, 6.0], [10.2, 5.2]]],
        ['town_street_lamp_b', [[9.9, 13.2], [7.1, 13.0]]], ['town_street_lamp_b', [[7.0, 5.0], [10.0, 5.2]]],
        ['town_street_lamp_a', [[7.2, 1.6], [9.8, 1.8]]]]);
      for (const [x, z, q] of [[10.6, 4.6, 3], [10.8, 12.6, 3], [6.3, 8.4, 1], [6.2, 14.4, 1]].sort(() => R() - .5).slice(0, 3))
        piece(variant(R, 'town_market_stall'), [[x, z, q], ...near(x, z, .75).map(([a, b]) => [a, b, q])]);
      // garlands across the street, from pole to pole, zigzag up it
      garlands(t, [[9.9, 5.6], [7.1, 7.9], [9.9, 10.3], [7.1, 12.6], [9.9, 14.8]]);
      put(variant(R, 'town_handcart'), [...near(3.4, 13.4, 1), ...near(2.4, 6.4, 1)], { yaw: R() * Math.PI * 2, s: .85 });
      for (const [x, z] of [[6.2, 10.4], [10.6, 7.3], [6.4, 4.6], [10.4, 11.8]]) put(variant(R, 'town_flower_pots'), near(x, z, .5), { s: .9 + R() * .2 });
      group([[2.6, 9.4], [2.8, 10.2]], ['mines_barrel_a', 'mines_barrel_b', 'mines_crate_a'], .7);
      group([[13.6, 6.2], [13.4, 9.6]], ['mines_crate_b', 'mines_crate_a', 'mines_barrel_a', 'mines_sacks_a'], .8);
      group([[13.2, 12.2], [2.4, 5.4]], ['mines_sacks_b', 'mines_crate_a', 'mines_barrel_b'], .8);
      put('mines_wheelbarrow_b', [[10.6, 13.0], [11.6, 12.6]], { yaw: .9 });
      put('relics_abandoned_pack_a', [[11.6, 4.2], [13.0, 4.0]]);
      put(variant(R, 'town_hay_bales'), [...near(12.6, 5.2, 1.5), ...near(2.6, 5.2, 1.5)]);
    } },
    { name: 'camp', rural: true, dress(t) {
      const { put, group, here, R } = t;
      // the traders' camp: a fire ring with log seats, and their stock (down in the hollow, if it
      // lies here, with their tent)
      if (here(t.land.hollow)) dell(t, true);
      else {
        const fire = put('relics_old_campfire_b', [...near(8, 7, 1.5), ...near(8, 7, 5)], { s: 1 });
        if (fire) {
          const [fx, fz] = rotateTownPoint(fire.x, fire.z, -t.plan.yaw);
          [[-1.0, .25], [.75, -.75], [.55, .9]].forEach(([dx, dz]) =>
            put(variant(R, 'meadow_fallen_log'), [[fx + dx, fz + dz]], { yaw: Math.atan2(dx, dz), s: .9 }));
          put('town_woodpile_a', [[fx + 1.6, fz + .4], [fx - .4, fz + 1.7], [fx + 1.5, fz - 1.2]], { yaw: R() * Math.PI });
          put(variant(R, 'mines_lantern'), [[fx - 1.4, fz - 1.2], [fx + 1.2, fz + 1.6]], { s: .9 });
        }
        put(variant(R, 'town_hay_bales'), near(11.5, 11.5, 2));
      }
      put('relics_abandoned_pack_b', near(6, 5, 2));
      group([[5, 11], [11, 4.5]], ['mines_sacks_b', 'mines_crate_b', 'mines_barrel_b', 'mines_sacks_a'], .7);
      put('mines_plank_stack_b', [...near(11.5, 4.5, 1.5), ...near(4, 12, 2)], { yaw: .3 });
      lamps(put, [['town_street_lamp_a', near(4.5, 7.5, 1.5)]]);
    } },
  ],
  // the plaza's row: the stable, the plaza with the crash, the smithy
  [
    { name: 'stable', ways({ path, plan }) {
      leadTo(plan, path, 0, [[N, LANE_1], [7, LANE_1]]);
    }, dress({ put, piece, group, R }) {
      put(variant(R, 'town_hay_bales'), near(11.2, 5.0, 1.2));
      put(variant(R, 'town_hay_bales'), [...near(3, 12.6, 1.5), ...near(12.6, 13.4, 1.5)]);
      piece('town_trough_a', [...near(10.6, 8.2, 1), ...near(3.2, 8.6, 1)], { turn: 0 });
      group([[11.4, 7.0]], ['mines_sacks_a', 'mines_sacks_b', 'mines_crate_a'], .7);
      group([[2.6, 4]], ['mines_barrel_a', 'mines_sacks_b', 'mines_crate_b'], .8);
      put('mines_wheelbarrow_a', near(3.5, 9.5, 1), { yaw: -.6 });
      put(variant(R, 'town_handcart'), near(10.5, 13.2, 1), { yaw: Math.PI / 2 + R() * .4 - .2, s: .85 });
      put('town_woodpile_a', [...near(12.4, 2.4, 1.2), ...near(2.4, 1.8, 1.2)], { yaw: R() * Math.PI });
      for (const u of [3.2, 5.3]) piece('town_fence_a', [[u, 9.2, 0], [u, 9.4, 0]]);
      lamps(put, [['town_street_lamp_a', near(12.5, 11.6, .75)]]);
    } },
    { name: 'plaza', relics: { shards: CRASH, robot: CRASH_ROBOT, sword: CRASH_SWORD }, portal: true,
      keep: [[5.2, 8.6, 1.2], [14.4, 9.6, 1.1], [6.4, 3.2, 1.6]], ways({ path }) {
        // the street up to the lane and on over the water (its bridge, world/townland.js)
        path([[STREET, 0], [STREET, N]]);
        path([[0, LANE_1], [N, LANE_1]], LANE_WIDTH);
      }, dress(t) {
        const { put, piece, R } = t;
        // the plaza: benches and the notice board round it, lamps along the street, flower beds,
        // garlands over the street
        facing(put, 'town_bench_a', near(5.2, 8.6, 1), [STREET, LANE_1]);
        facing(put, 'town_bench_b', near(14.4, 9.6, 1), [STREET, LANE_1]);
        facing(put, 'town_notice_board_a', near(6.4, 3.2, 1.2), [STREET, 4]);
        lamps(put, [['town_street_lamp_a', near(9.6, 2.4, .75)], ['town_street_lamp_b', near(7.3, 9.4, .75)],
          ['town_street_lamp_a', near(9.7, 11.2, .75)], ['town_street_lamp_b', near(9.8, 6.4, .75)], ['town_street_lamp_a', near(7.2, 13.4, .75)]]);
        for (const [x, z] of [[2.6, 9.2], [13.6, 11.4], [6.2, 8.4], [2.4, 7.4]]) put(variant(R, 'town_flower_pots'), near(x, z, .8), { s: .9 + R() * .25 });
        for (const [x, z] of [[2.4, 3], [13.8, 2.6]]) piece('town_garden_bed_b', [[x, z, 0], ...near(x, z, .6).map(([a, b]) => [a, b, 0])]);
        piece('town_planter_b', [...near(9.9, 8.6, .6).map(([a, b]) => [a, b, 1])]);
        garlands(t, [[9.9, 1.4], [7.1, 4.2], [9.9, 6.9], [7.1, 11.6], [9.9, 13.6]]);
      } },
    { name: 'smithy', ways({ path, plan }) {
      leadTo(plan, path, 0, [[0, LANE_1], [6.7, LANE_1]]);
    }, dress({ put, piece, group, R }) {
      // timber and fuel for the forge, a coal spill, a finished cart wheel
      group([[12.6, 9.8], [12, 12.5]], ['mines_plank_stack_a', 'mines_barrel_a', 'mines_crate_b', 'mines_sacks_b'], .8);
      put('mines_coal_scatter_a', [[10.8, 8.6], [11.4, 9.2], [4.4, 8.2]]);
      put('mines_coal_scatter_b', [[11.6, 2.6], [4.6, 2.4]]);
      put('badlands_broken_wagon_wheel_a', [[3.2, 12.6], [4, 13], [12.6, 3.4]]);
      put('town_woodpile_a', [...near(13.2, 5.4, 1.2), ...near(3, 3, 1.2)], { yaw: R() * Math.PI });
      put('mines_ore_cart_a', [...near(3.4, 6, 1), ...near(13, 13, 1.5)], { yaw: R() * Math.PI });
      piece('town_trough_a', [...near(11.2, 8.4, 1)], { turn: 0 });
      lamps(put, [['town_street_lamp_a', near(3.6, 11.6, .75)]]);
    } },
  ],
  // the inn's row: the lake (the garden), the inn, the pet shop
  [
    { name: 'garden', rural: true, dress(t) {
      const { put, shore, plan, land, L, R } = t;
      const [lx, lz] = L(land.lake.x, land.lake.z);
      // benches looking out over it, flowers, a lamp
      for (const [x, z] of [[lx + 5.5, lz + 1], [lx + 1, lz + 5.5], [lx + 5, lz - 4], [lx - .5, lz - 5.5]])
        if (facing(put, variant(R, 'town_bench'), near(x, z, 1.5), [lx, lz])) if (R() < .5) break;
      for (const [x, z] of [[13, 13], [13.5, 3], [3, 14], [2.6, 2.2]]) put(variant(R, 'meadow_flowers'), near(x, z, 1.5), { s: 1 });
      lamps(put, [['town_street_lamp_a', near(lx + 5.6, lz + 2.4, 1.5)]]);
      // reeds and stones on its banks, a boat pulled up on one, lily pads on the water
      const banks = shore('lake');
      for (let k = 0; k < 10; k++) put(pick(R, ['meadow_cattails_a', 'meadow_cattails_b', 'any_shore_stones_a', 'any_shore_stones_b']), banks.splice(0, 3), { world: true });
      put(variant(R, 'lagoon_rowboat'), shore('lake'), { world: true, shore: true, s: 1.3 });
      put(variant(R, 'lagoon_driftwood'), shore('lake'), { world: true });
      const lake = plan.water.filter(c => plan.ground.water[c].lake);
      for (const c of [...lake].sort(() => R() - .5).slice(0, 4 + Math.floor(R() * 5)))
        put(variant(R, 'meadow_lily_pads'), [[c % N + .3 + R() * .4, Math.floor(c / N) + .3 + R() * .4]], { water: true, world: true });
      // the islet: a tree on it, or a bush and a stone
      for (const c of land.lake.islet) {
        const [x, z] = L(c % land.W + .5, Math.floor(c / land.W) + .5);
        if (R() < .6) t.tree('town_tree_birch_a', x, z, .7 + R() * .15) || put(variant(R, 'meadow_bush'), [[x, z]], { shore: true });
        else put(variant(R, 'meadow_berry_bush'), [[x, z]], { shore: true });
      }
    } },
    { name: 'inn', spawn: [STREET, STREET], ways({ path, plan }) {
      // off the bridge onto the quay, along it to the foot of the stair up the cliff
      // (world/townland.js INN_STAIR), from its top on to the street in the upper town
      const { z, foot, top } = INN_STAIR;
      path([[STREET, 0], [STREET, z - .5], [foot + .5, z - .5], [foot + .5, z + .5]]);
      path([[top + .5, z + .5], [top + .5, z + 1.5], [STREET, z + 1.5]], LANE_WIDTH);
      path([[STREET, z + 1.5], [STREET, N]]);
      path([[STREET, LANE_2], [N, LANE_2]], LANE_WIDTH);
      leadTo(plan, path, 0, [[STREET, plan.frontagesLocal[0][1]]]);
    }, dress(t) {
      const { put, group, R } = t;
      // deliveries by the inn's side, a cask by the porch, lamps along the street, garlands over it
      group([[3.2, 12.4]], ['mines_barrel_a', 'mines_barrel_b', 'mines_crate_a', 'mines_sacks_a'], .7);
      group([[3, 3.4]], ['mines_barrel_b', 'mines_crate_b'], .6);
      lamps(put, [['town_street_lamp_a', near(9.7, 4.2, .75)], ['town_street_lamp_b', near(9.8, 11.6, .75)],
        ['town_street_lamp_c', near(7.2, 14.4, .75)], ['town_street_lamp_a', near(10.4, 2.0, .75)], ['town_street_lamp_c', near(4.2, 2.4, .75)]]);
      garlands(t, [[9.9, 10.4], [7.1, 12.6], [9.9, 15.0]]);
      for (const [x, z] of [[6.4, 10.6], [6.4, 5.8], [12.6, 5.4], [13, 9]]) put(variant(R, 'town_flower_pots'), near(x, z, .8), { s: .9 + R() * .25 });
      facing(put, variant(R, 'town_bench'), near(12.4, 11.6, 1.2), [STREET, 11.6]);
    } },
    { name: 'petshop', ways({ path, plan }) {
      leadTo(plan, path, 0, [[0, LANE_2]]);
    }, dress({ put, group, R }) {
      group([[11.6, 11.6], [11.2, 4]], ['mines_sacks_a', 'mines_crate_a', 'mines_sacks_b'], .6);
      put(variant(R, 'meadow_stump'), near(3.6, 12, 1.5));
      put(variant(R, 'town_hay_bales'), [...near(4, 3, 1.5), ...near(12.5, 13.5, 1.5)]);
      for (const [x, z] of [[4.4, 9.6], [4.2, 4.6]]) put(variant(R, 'town_flower_pots'), near(x, z, .8), { s: .9 + R() * .2 });
      lamps(put, [['town_street_lamp_a', near(3.2, 8.4, .75)]]);
    } },
  ],
  // the back row: a wishing well in the grove, the green with the town's well, the windmill (and
  // the hill in one of the corners, the corner's own set piece on its shoulder)
  [
    { name: 'grove', rural: true, dress(t) {
      const { put, land, L, here, R } = t;
      if (here(land.hill)) lookout(t);
      const piece = land.pieces.find(p => here(p)), [px, pz] = L(piece.x, piece.z), [mx, mz] = L(land.W / 2, land.D / 2);
      facing(put, 'meadow_wishing_well_a', [...near(px, pz, 1.2), ...near(px, pz, 3)], [mx, mz], { s: 1 });
      facing(put, variant(R, 'town_bench'), near(px + (mx > px ? 1.8 : -1.8), pz + 1.4, 1.2), [px, pz]);
      for (let k = 0; k < 3; k++) put(variant(R, 'meadow_flowers'), near(px + (R() - .5) * 6, pz + (R() - .5) * 6, 1), { s: 1 });
      put(variant(R, 'meadow_stump'), near(11, 4.5, 2));
    } },
    { name: 'green', keep: [[STREET, 10.4, 1.6], [5.6, 9, 1.1], [11.4, 9, 1.1]], ways({ path }) {
      path([[STREET, 0], [STREET, 8]]);
    }, dress(t) {
      const { put, piece, R } = t;
      // the town's well where the street ends, benches round the green, garlands over the street
      facing(put, 'town_well_a', near(STREET, 10.4, 1), [STREET, 8]);
      facing(put, 'town_bench_a', near(5.6, 9, 1), [STREET, 10.4]);
      facing(put, 'town_bench_b', near(11.4, 9, 1), [STREET, 10.4]);
      lamps(put, [['town_street_lamp_a', near(9.7, 3.4, .75)], ['town_street_lamp_a', near(7.2, 7.4, .75)],
        ['town_street_lamp_b', near(5.0, 10.6, .9)], ['town_street_lamp_b', near(12.0, 10.6, .9)]]);
      garlands(t, [[7.1, 1.2], [9.9, 3.8], [7.1, 6.4]]);
      garlands(t, [[5.4, 12.4], [STREET, 13.4], [11.6, 12.4]]);
      for (const [x, z] of [[5, 12], [12, 12.2], [6, 4], [11.2, 5]]) put(variant(R, 'town_flower_pots'), near(x, z, .8), { s: .9 + R() * .25 });
      for (const [x, z] of [[STREET - 2.6, 12.6], [STREET + 2.6, 12.6]]) piece('town_garden_bed_b', [[x, z, 0], ...near(x, z, .6).map(([a, b]) => [a, b, 0])]);
      put(variant(R, 'meadow_flowers'), [...near(3.4, 6, 1.5), ...near(13.4, 6.4, 1.5)], { s: 1 });
    } },
    { name: 'windmill', rural: true, dress(t) {
      const { put, piece: box, group, land, L, here, R } = t;
      if (here(land.hill)) lookout(t);
      const piece = land.pieces.find(p => here(p)), [px, pz] = L(piece.x, piece.z), [mx, mz] = L(land.W / 2, land.D / 2);
      facing(put, 'meadow_windmill_a', [...near(px, pz, 1.2), ...near(px, pz, 3)], [mx, mz], { s: 1 });
      put(variant(R, 'town_hay_bales'), [...near(px + 2.6, pz - 1.4, 1.2), ...near(px - 2.6, pz - 1.4, 1.2)]);
      group([[px - 2.2, pz + 1.6], [px + 2.2, pz + 1.6]], ['mines_sacks_a', 'mines_sacks_b', 'mines_sacks_a'], .7);
      box('town_shed_a', [...near(px + 3, pz + 2, 2)]);
      put(variant(R, 'town_handcart'), [...near(4.6, 11.4, 2), ...near(4, 4, 2)], { yaw: R() * Math.PI, s: .85 });
    } },
  ],
];
export const TILE_NAMES = TILES.map(row => row.map(t => t.name));
const seamsOf = (i, j) => ({ left: i > 0, right: i < TOWN_ACROSS - 1, front: j > 0, back: j < TOWN_DEEP - 1 });

// What of the town is the same in every world, in each tile's own frame: its buildings' boxes, its
// streets, lanes and paths, the people, the crash, the spawn, the portal's spot, the gate, the set
// pieces round the street (the tiles' `keep`): [{ i, j, boxes, paths, discs }]
let base = null;
function baseLayout() {
  if (base) return base;
  base = [];
  for (let j = 0; j < TOWN_DEEP; j++) for (let i = 0; i < TOWN_ACROSS; i++) {
    const spec = TILES[j][i];
    // (exit 3 turns by nothing: the cube's frame is the tile's own)
    const tools = tilePlan(3, 0, { buildings: of(i, j), gates: spec.gates ?? [], relics: spec.relics ?? {}, spawn: spec.spawn ?? null, seams: seamsOf(i, j) });
    const { plan } = tools;
    plan.frontagesLocal = plan.frontages.map(f => [f.x, f.z]);
    spec.ways?.(tools);
    const discs = [...plan.villagers.map(v => ({ x: v.x, z: v.z, r: .9 })),
      ...Object.entries(plan.relics).map(([k, q]) => ({ x: q.x, z: q.z, r: k === 'shards' ? 3.2 : 1.2 })),
      ...spec.spawn ? [{ x: spec.spawn[0], z: spec.spawn[1], r: 2.6 }] : [],
      ...spec.portal ? [{ x: TOWN_PORTAL_SPOT[0], z: TOWN_PORTAL_SPOT[1], r: 1.8 }] : [],
      ...(spec.gates ?? []).map(([x, z]) => ({ x, z, r: 2.6 })), ...(spec.keep ?? []).map(([x, z, r]) => ({ x, z, r }))];
    base.push({ i, j, boxes: plan.boxes, paths: plan.paths.map(p => ({ points: p.points, width: p.width })), discs });
  }
  return base;
}

// The town of a world laid out round the land's big things (world/townland.js `layout`): lanes of
// its own off the streets (to the lake, along the front and the back of the town, short ones off
// any way), the people's homes along every way, their doors to it, a path to each door. What of it
// stays level (`keep`, in the town's frame) and per tile its lanes and homes ({ lanes: [{ points,
// width }], homes: [{ name, x, z, yaw }] }, tile-local).
function plotTown(seed, { hill, hollow, lake, pieces, W, D, rows, levelAt, inWall = () => true, avoid = [], water = () => false }) {
  const wetAt = (x, z) => water(Math.floor(z) * W + Math.floor(x));
  const R = mulberry32(hash32(seed ^ 0x40e5)), layout = baseLayout();
  const tiles = TILES.map((row, j) => row.map(() => ({ lanes: [], homes: [], level: rows[j] })));
  const keep = [], boxes = [], discs = [], ways = [];
  for (const t of layout) {
    const ox = t.i * N, oz = t.j * N, level = rows[t.j];
    for (const b of t.boxes) boxes.push({ x0: b.x0 + ox, z0: b.z0 + oz, x1: b.x1 + ox, z1: b.z1 + oz, level });
    for (const d of t.discs) discs.push({ x: d.x + ox, z: d.z + oz, r: d.r, level });
    for (const p of t.paths) for (let k = 1; k < p.points.length; k++) {
      const [ax, az] = [p.points[k - 1][0] + ox, p.points[k - 1][1] + oz], [bx, bz] = [p.points[k][0] + ox, p.points[k][1] + oz];
      ways.push({ a: [ax, az], b: [bx, bz], w: p.width, base: true, level: levelAt((ax + bx) / 2, (az + bz) / 2) });
    }
  }
  const S = GATE_TILE[0] * N + STREET;
  // (what is built on the escarpment, the stairs and the span: kept off)
  const clear = (x, z, m) => avoid.every(b => boxDistance(b, x, z) > m);
  const wayLevel = w => w.level;
  const lakeR = Math.max(lake.rx, lake.rz);
  const wild = (x, z, m) => Math.hypot(x - hill.x, z - hill.z) > hill.r1 + m && Math.hypot(x - hollow.x, z - hollow.z) > hollow.r1 + 1.6 + m
    && Math.hypot(x - lake.x, z - lake.z) > lakeR + 1.8 + m && pieces.every(p => Math.hypot(x - p.x, z - p.z) > p.r1 * .8 + m);
  // A lane from (ax, az) along (dx, dz), as far as it goes (at most `most`) without coming near a
  // building, the big things, the town's sides or another way: kept if at least `least` long
  const lane = (ax, az, dx, dz, least, most, level = levelAt(ax, az)) => {
    let len = 0;
    // (on its ground: not up or down the escarpment, nor by what is built on it)
    // (not along a seam, too near it for a home between: the homes keep off the seams)
    const along = v => { const m = ((v % N) + N) % N; return Math.min(m, N - m) > 3.6; };
    const ok = (x, z) => inWall(x, z, .6) && (dx ? along(z) : along(x)) && [-1.2, 0, 1.2].every(o => levelAt(x + dz * o, z + dx * o) === level)
      && clear(x, z, 1.6) && wild(x, z, 1) && boxes.every(b => boxDistance(b, x, z) > 1.1)
      && discs.every(d => Math.hypot(x - d.x, z - d.z) > d.r + .4) && ways.every(w => segmentDistance(x, z, w.a, w.b) > 2.4);
    // (from where it leaves its way: what is that near, it may be)
    const from = 2.6;
    // (over the river, if it crosses it straight, a few cells: a bridge, world/townland.js; never
    // ending in it)
    let wet = 0;
    for (; len + .5 <= most; len += .5) {
      const x = ax + dx * (len + .5 + from), z = az + dz * (len + .5 + from);
      if (wetAt(x, z) || wetAt(x + dz * .8, z + dx * .8) || wetAt(x - dz * .8, z - dx * .8)) { if (++wet > 7) break; continue; }
      wet = 0;
      if (!ok(x, z)) break;
    }
    while (len > 0 && [0, 1, 2, 3].some(k => wetAt(ax + dx * (len + from + k * .5), az + dz * (len + from + k * .5)))) len -= .5;
    if (len + from < least) return null;
    len += from;
    // (off its way on dry ground, and ending on it, where it may)
    const ex = ax + dx * len, ez = az + dz * len;
    if ([...Array(Math.ceil(from / .5) + 1)].some((_, k) => wetAt(ax + dx * k * .5, az + dz * k * .5)) || wetAt(ex, ez) || !ok(ex, ez)) return null;
    const w = { a: [ax, az], b: [ax + dx * len, az + dz * len], w: LANE_WIDTH, level };
    ways.push(w);
    return w;
  };
  // along the front of the town, inside the market; to the lake; along the back, by the green
  for (const s of [-1, 1]) if (R() < .85) lane(S, 14 + R() * .6, s, 0, 4, 22);
  if (R() < .9) lane(S, 2 * N + 12.8 + R() * .6, -1, 0, 4, 16);
  for (const s of [-1, 1]) if (R() < .85) lane(S, 3 * N + 5.8 + R() * .6, s, 0, 4, 20);
  // and short ones off any way
  for (let k = 0, made = 0; k < 60 && made < 6 + Math.floor(R() * 4); k++) {
    const w = pick(R, ways), len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    if (len < 5 || w.w < .6) continue;
    const t = 2 + R() * (len - 4), ux = (w.b[0] - w.a[0]) / len, uz = (w.b[1] - w.a[1]) / len, s = R() < .5 ? 1 : -1;
    const x = Math.round((w.a[0] + ux * t) * 2) / 2, z = Math.round((w.a[1] + uz * t) * 2) / 2;
    if (lane(x, z, -uz * s, ux * s, 4, 9, w.level)) made++;
  }
  // and on along the wall, inside it, from where a way comes up to it (world/townland.js WALL)
  const inner = WALL + 1 + 2.4;
  for (const w of [...ways]) for (const [x, z] of w.w < .6 ? [] : [w.a, w.b])
    for (const [dx, dz, off] of [[0, 1, x - inner], [0, -1, x - inner], [0, 1, W - inner - x], [0, -1, W - inner - x],
      [1, 0, z - inner], [-1, 0, z - inner], [1, 0, D - inner - z], [-1, 0, D - inner - z]])
      if (Math.abs(off) < 2.2 && R() < .85) lane(x, z, dx, dz, 4, 18, w.level);
  // The homes: on either side of every way, facing it, as many as there is room for
  const homes = [], tileOf = (x, z) => [Math.floor(x / N), Math.floor(z / N)];
  const slots = [];
  for (const w of ways) {
    if (w.w < .6) continue;
    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), ux = (w.b[0] - w.a[0]) / len, uz = (w.b[1] - w.a[1]) / len;
    for (let t = .8; t < len; t += .6) for (const s of [-1, 1]) slots.push({ w, x: w.a[0] + ux * t, z: w.a[1] + uz * t, nx: -uz * s, nz: ux * s });
  }
  slots.sort(() => R() - .5);
  const count = new Map();
  // (the first of the kinds of home that fits there, in a random order: a barn on the town's edge now
  // and then)
  const fit = (slot, name, ti, tj, lift = 0) => {
    const { w, nx, nz } = slot, bounds = propMetadata.get(name).bounds;
    // (its front, +Z, to the way: the way lies along -n from it; on the way's own ground)
    const yaw = snap(Math.atan2(-nx, -nz)), level = wayLevel(w), lv = level + lift;
    const set = w.w / 2 + .55 + R() * .45 + (lift ? TERRACE + .2 + lift * .5 : 0);
    const x = slot.x + nx * (set + bounds[3]), z = slot.z + nz * (set + bounds[3]);
    const box = turnedBox(bounds, x, z, yaw), [i, j] = tileOf(x, z);
    if (i !== ti || j !== tj) return null;
    const seams = seamsOf(i, j), lx0 = box.x0 - i * N, lz0 = box.z0 - j * N, lx1 = box.x1 - i * N, lz1 = box.z1 - j * N;
    const edge = (seam, d) => d >= (seam ? SEAM_CLEAR + .15 + (lift ? TERRACE + .4 : 0) : .6);
    if (!edge(seams.left, lx0) || !edge(seams.right, N - lx1) || !edge(seams.front, lz0) || !edge(seams.back, N - lz1)) return null;
    // (a terrace keeps further off the buildings and the people: its edge would tilt their ground)
    if (boxes.some(b => boxGap(b, box) < (lift ? TERRACE + 1.6 : 1.1)) || homes.some(h => boxGap(h.box, box) < (lift || h.level !== h.path.level ? TERRACE + 1.4 : .9))) return null;
    if (discs.some(d => boxDistance(box, d.x, d.z) < d.r + (lift ? TERRACE + 1.4 : .3))) return null;
    // (a terrace's ground, as far as it is kept round it, off every way's: its edge beside a way would
    // step under it)
    if (ways.some(v => boxRunDistance(box, v.a, v.b) < v.w / 2 + .5 + (lift ? TERRACE + .1 : 0))) return null;
    if (![[box.x0, box.z0], [box.x1, box.z0], [box.x0, box.z1], [box.x1, box.z1], [x, z]].every(([a, b]) => wild(a, b, .6) && inWall(a, b, .5))) return null;
    // (all of it, and round it, on the way's ground: not over the escarpment's edge)
    for (let u = box.x0 - .6; u <= box.x1 + .6; u += .4) for (let v = box.z0 - .6; v <= box.z1 + .6; v += .4) if (levelAt(u, v) !== level) return null;
    if (avoid.some(b => boxGap(b, box) < 1.2)) return null;
    for (let u = box.x0 - .9; u <= box.x1 + .9; u += .4) for (let v = box.z0 - .9; v <= box.z1 + .9; v += .4) if (wetAt(u, v)) return null;
    // its door's path, to the way
    const door = HOMES[name].door, c = snap(Math.cos(yaw)), s = snap(Math.sin(yaw));
    // (from its doorstep, a body's width out from the wall)
    const out = bounds[3] + CHAR_R + .1, [dx, dz] = [x + door * c + out * s, z - door * s + out * c];
    return { name, x, z, yaw, box, i, j, level: lv, path: { a: [dx, dz], b: [dx - nx * (set + .02 - CHAR_R - .1), dz - nz * (set + .02 - CHAR_R - .1)], w: .45, level, lift } };
  };
  for (const slot of slots) {
    const [ti, tj] = tileOf(slot.x + slot.nx * 3, slot.z + slot.nz * 3), spec = TILES[tj]?.[ti];
    if (!spec || (count.get(spec) ?? 0) >= 6 || R() > .9) continue;
    const kinds = [...COTTAGES].sort(() => R() - .5);
    if (spec.rural && R() < .35) kinds.unshift('town_barn_a');
    let h = null;
    // (on a terrace a level or two over its way, now and then, more often in the lower town: its
    // path a ramp up to its door, set back for it; where there is no room for that, on the way's level)
    const lift = R() < (wayLevel(slot.w) === rows[0] ? .75 : .3) ? 1 + Math.floor(R() * 3) : 0;
    for (const up of lift ? [lift, 0] : [0]) {
      for (const name of kinds) if ((h = fit(slot, name, ti, tj, up))) break;
      if (h) break;
    }
    if (!h) continue;
    homes.push({ ...h, rural: !!spec.rural });
    ways.push(h.path);
    count.set(spec, (count.get(spec) ?? 0) + 1);
  }
  // into the tiles: the new ways cut at the seams, the homes in their own tile's frame
  for (const w of ways) {
    if (w.base) continue;
    const [ax, az] = w.a, [bx, bz] = w.b;
    for (let j = 0; j < TOWN_DEEP; j++) for (let i = 0; i < TOWN_ACROSS; i++) {
      const x0 = Math.max(Math.min(ax, bx), i * N), x1 = Math.min(Math.max(ax, bx), (i + 1) * N);
      const z0 = Math.max(Math.min(az, bz), j * N), z1 = Math.min(Math.max(az, bz), (j + 1) * N);
      if (x0 > x1 || z0 > z1 || (x0 === x1 && z0 === z1)) continue;
      tiles[j][i].lanes.push({ points: [[x0 - i * N, z0 - j * N], [x1 - i * N, z1 - j * N]], width: w.w });
    }
  }
  for (const h of homes) tiles[h.j][h.i].homes.push({ name: h.name, x: h.x - h.i * N, z: h.z - h.j * N, yaw: h.yaw, rural: h.rural, level: h.level });
  for (const b of boxes) keep.push({ box: [b.x0, b.z0, b.x1, b.z1], r: 1.3, level: b.level });
  // (a home's ground at its terrace's level, `lift` over its way's; its path a ramp from its door
  // down to the way: world/townland.js)
  for (const h of homes) keep.push({ box: [h.box.x0, h.box.z0, h.box.x1, h.box.z1], r: h.level !== h.path.level ? TERRACE : 1.1, level: h.level, lift: h.level - h.path.level });
  for (const w of ways) keep.push({ seg: [w.a, w.b], r: w.w / 2 + .5, level: w.level, ...(w.lift ? { ramp: w.lift } : {}) });
  for (const d of discs) keep.push(d);
  // (what stands in the way for good: the houses and the homes, the people)
  const bodies = [...boxes, ...homes.map(h => h.box), ...discs.filter(d => d.r < 1).map(d => ({ x0: d.x - .3, z0: d.z - .3, x1: d.x + .3, z1: d.z + .3 }))];
  return { keep, tiles, bodies, ways };
}

// The land of a world's town (world/townland.js), made once a world
const lands = new Map();
export function townLand(world) {
  world >>>= 0;
  let land = lands.get(world);
  if (land) return land;
  // (what stands for good, in the town's frame: the land builds nothing on it, the river keeps off it
  // but where it crosses a way)
  const fixed = [], fixedWays = [], fixedKeep = [];
  for (const t of baseLayout()) {
    const ox = t.i * N, oz = t.j * N;
    for (const b of t.boxes) { fixed.push({ x0: b.x0 + ox, z0: b.z0 + oz, x1: b.x1 + ox, z1: b.z1 + oz }); fixedKeep.push({ box: [b.x0 + ox, b.z0 + oz, b.x1 + ox, b.z1 + oz], r: 1.3 }); }
    for (const d of t.discs) fixedKeep.push({ x: d.x + ox, z: d.z + oz, r: d.r });
    for (const p of t.paths) for (let k = 1; k < p.points.length; k++) {
      const w = { a: [p.points[k - 1][0] + ox, p.points[k - 1][1] + oz], b: [p.points[k][0] + ox, p.points[k][1] + oz], w: p.width };
      fixedWays.push(w); fixedKeep.push({ seg: [w.a, w.b], r: w.w / 2 + .5 });
    }
  }
  land = makeLand(world, { across: TOWN_ACROSS, deep: TOWN_DEEP, level: TOWN_LEVEL, layout: f => plotTown(world, f),
    gate: [GATE_TILE[0] * N + STREET, GATE_TILE[1] * N], fixed, fixedWays, fixedKeep });
  if (lands.size > 16) lands.clear();
  lands.set(world, land);
  return land;
}

// The plan of the town's tile (i, j): exit the town's (townExit), seed the tile's own, world the
// world's seed (the town's land is the world's: townLand).
export function townPlan(exit, seed, i, j, world = 0) {
  const spec = TILES[j]?.[i];
  if (!spec) throw new Error(`No town tile ${i},${j}`);
  const seams = seamsOf(i, j), land = townLand(world), laid = land.layout.tiles[j][i];
  const tools = tilePlan(exit, seed, { buildings: of(i, j), homes: laid.homes, gates: spec.gates ?? [], relics: spec.relics ?? {},
    spawn: spec.spawn ?? null, seams, land, tile: [i, j], level: laid.level });
  const { plan } = tools;
  plan.tile = { i, j, name: spec.name };
  plan.frontagesLocal = plan.frontages.map(f => rotateTownPoint(f.x, f.z, -plan.yaw));
  if (spec.portal) { const [px, pz] = rotateTownPoint(...TOWN_PORTAL_SPOT, plan.yaw); plan.portal = { x: px, z: pz }; }
  // (a point of the town's frame in this tile?)
  tools.inTile = ({ x, z }) => x >= i * N && x < (i + 1) * N && z >= j * N && z < (j + 1) * N;
  spec.ways?.(tools);
  for (const l of laid.lanes) tools.path(l.points, l.width);
  // (each cube cell by the wall: 0 inside, 1 on it, 2 outside it, world/townland.js wallSide)
  plan.wallSide = Array.from({ length: N * N }, (_, c) => land.wall.side(...tools.G(...rotateTownPoint(c % N + .5, Math.floor(c / N) + .5, -plan.yaw)).map(Math.floor)));
  walls(tools);
  spec.dress(tools);
  hedgerows(tools);
  for (const h of laid.homes) yard(tools, h);
  spring(tools);
  trailMarks(tools);
  woodsScene(tools);
  avenues(tools);
  forest(tools);
  delete plan.frontagesLocal;
  drapes(tools);
  groundCover(tools, j < 2 ? 1.3 : 1.1);
  clearWays(tools, spec);
  delete plan.boxes;
  return plan;
}
