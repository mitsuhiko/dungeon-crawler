// Town policy and authored plans. Pure data; also runs in the worker.
//
// The town (docs/town.md) is a place of TOWN_ACROSS × TOWN_DEEP tiles: ordinary cubes of the depth-0
// grid, laid out together as one place, known from the start and crossed without seams (no glass,
// no portal, no step in the ground between two tiles: game/handover.js). Its one gate leads out
// onto the road (depth 0's route starts there, world/layout.js). Every tile has a plan of its own
// (TILES: what stands where, in the tile's own frame), turned with the gate: a tile's local z = 0
// side faces the gate's side of the town, local +x the next tile across.
import { N, LH, CHAR_R, DIRS } from '../core/constants.js';
import { mulberry32, hash32 } from '../core/util.js';
import { propMetadata, CLUTTER } from '../core/propcatalog.js';
import { key, step } from './coords.js';

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
  { name: 'town_merchant_c', tile: [1, 0], x: 4.35, z: 3.8, yaw: Math.PI / 2, bounds: [-1.671, -1.276, 1.801, 1.637], height: 2.757 },
];
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
const segmentDistance = (x, z, [ax, az], [bx, bz]) => {
  const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
};
// How far from a seam (a side with another tile beyond) anything that stands in the way keeps: the
// physics only knows the tile it is in, and a body crossing stands half in the next (docs/town.md)
export const SEAM_CLEAR = 0.9;

// A tile's plan, in town-local coordinates (rotated into the cube by the exit's yaw):
//   seams: the local sides with another tile beyond { left (x = 0), right (x = N), front (z = 0),
//     back (z = N) }; outer sides get the grove, seams stay clear of what stands in the way
//   spawn: where a new world comes in (the start tile's), or null; gates: points solid clutter keeps
//   off (town-local); relics: the beginning's things lying here ({ name: [x, z] })
function tilePlan(exit, seed, { buildings = [], gates = [], relics = {}, spawn = null, seams }) {
  const yaw = exitYaw[exit];
  if (yaw === undefined) throw new Error('A town needs a side exit');
  const y = TOWN_LEVEL * LH, R = mulberry32(hash32(seed ^ 0x70a11));
  const placements = [], colliders = [], occluders = [], frontages = [], paths = [], doors = [];
  const footprints = [], clutter = [], villagers = [];
  const add = (name, x, z, localYaw = 0, s = 1) => {
    const [rx, rz] = rotateTownPoint(x, z, yaw);
    const p = { name, x: rx, y, z: rz, yaw: localYaw + yaw, s, tint: null };
    placements.push(p); return p;
  };
  for (const b of buildings) {
    const p = add(b.name, b.x, b.z, b.yaw);
    const c = snap(Math.cos(p.yaw)), s = snap(Math.sin(p.yaw));
    const turn = (x, z) => [p.x + x * c + z * s, p.z - x * s + z * c];
    const aabb = ([x0, z0, x1, z1]) => {
      const points = [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].map(([x, z]) => turn(x, z));
      return { x0: Math.min(...points.map(p => p[0])), x1: Math.max(...points.map(p => p[0])),
        z0: Math.min(...points.map(p => p[1])), z1: Math.max(...points.map(p => p[1])) };
    };
    footprints.push({ x: p.x, z: p.z, c, s, bounds: b.bounds });
    for (const v of VILLAGERS.filter(v => v.at === b.name)) {
      const [x, z] = turn(v.x, v.z);
      villagers.push({ name: v.name, x, y, z, yaw: p.yaw + v.facing, tint: v.tint, outfit: v.outfit });
      colliders.push({ name: 'villager_' + v.name, x, z, r: VILLAGER_R, bottom: y, top: y + 1.1 });
    }
    for (const part of b.parts || [{ box: b.bounds, top: b.height }]) {
      let body;
      if (part.box) body = { shape: 'box', name: b.name, ...aabb(part.box), bottom: y + (part.bottom ?? 0), top: y + part.top };
      else { const [x, z] = turn(part.circle[0], part.circle[1]); body = { name: b.name, x, z, r: part.circle[2], bottom: y, top: y + part.top }; }
      if (part.solid !== false) colliders.push(body);
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
    const box = aabb(b.bounds);
    const tx = Math.abs(dx) < 1e-6 ? Infinity : ((dx > 0 ? box.x1 : box.x0) - p.x) / dx;
    const tz = Math.abs(dz) < 1e-6 ? Infinity : ((dz > 0 ? box.z1 : box.z0) - p.z) / dz;
    const distance = Math.min(tx, tz) + DOORSTEP;
    frontages.push({ name: b.name, x: p.x + dx * distance, z: p.z + dz * distance });
  }
  // Straight runs between town-local corner points, so paths follow the grid like the houses.
  const path = (points, width = .75) => {
    paths.push({ points: points.map(([x, z]) => rotateTownPoint(x, z, yaw)), width });
  };
  // how far town-local (x, z) is from the nearest seam (Infinity: none)
  const seamGap = (x, z) => Math.min(seams.left ? x : Infinity, seams.right ? N - x : Infinity,
    seams.front ? z : Infinity, seams.back ? N - z : Infinity);
  const tree = (i, x, z) => {
    const t = TREES[i % TREES.length], scale = .94 + R() * .08;
    if (seamGap(x, z) < t.trunk * scale + SEAM_CLEAR) throw new Error('A tree on a seam');
    const p = add(t.name, x, z, R() * Math.PI * 2, scale);
    const trunk = { name: p.name, x: p.x, z: p.z, r: t.trunk * scale, bottom: y, top: y + t.canopy * scale };
    colliders.push(trunk); occluders.push(trunk);
    occluders.push({ shape: 'ellipsoid', x: p.x, z: p.z, y: y + t.height * .79 * scale,
      rx: t.radius * scale, rz: t.radius * scale, ry: t.height * .21 * scale,
      top: y + t.height * scale, bottom: y + t.canopy * scale });
  };
  const [sx, sz] = spawn ? rotateTownPoint(...spawn, yaw) : [null, null];
  const plan = { placements, colliders, occluders, frontages, paths, doors, villagers, pond: [], yaw, seams,
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
  const wet = (x, z, r) => plan.pond.some(c => {
    const cx = c % N, cz = Math.floor(c / N);
    return Math.hypot(x - Math.max(cx, Math.min(cx + 1, x)), z - Math.max(cz, Math.min(cz + 1, z))) < r;
  });
  // (x, z) in the cube; lx, lz the same, town-local (for the seams)
  const fits = (x, z, r, kind, { water = false, shore = false } = {}, [lx, lz] = rotateTownPoint(x, z, -yaw)) => {
    if (x - r < .05 || z - r < .05 || x + r > N - .05 || z + r > N - .05) return false;
    if (kind === 'solid' && seamGap(lx, lz) < r + SEAM_CLEAR) return false;
    if (water ? !plan.pond.includes(Math.floor(z) * N + Math.floor(x)) : wet(x, z, shore ? .05 : kind === 'cover' ? r * .5 : r)) return false;
    for (const f of footprints) {
      const dx = x - f.x, dz = z - f.z, lx = dx * f.c - dz * f.s, lz = dx * f.s + dz * f.c, m = kind === 'cover' ? r * .5 : r;
      if (lx > f.bounds[0] - m && lx < f.bounds[2] + m && lz > f.bounds[1] - m && lz < f.bounds[3] + m) return false;
    }
    for (const b of colliders) if (b.shape !== 'box' && Math.hypot(x - b.x, z - b.z) < b.r + r * (kind === 'cover' ? .4 : 1) + (kind === 'solid' ? .15 : 0)) return false;
    const clearance = { solid: r + CHAR_R + .2, prop: r * .7 + .05, cover: r * .35 }[kind];
    for (const p of paths) for (let i = 1; i < p.points.length; i++)
      if (segmentDistance(x, z, p.points[i - 1], p.points[i]) < p.width / 2 + clearance) return false;
    if (spawn && Math.hypot(x - sx, z - sz) < 1.35 + r) return false;
    if (plan.portal && Math.hypot(x - plan.portal.x, z - plan.portal.z) < 1.1 + r) return false;
    if (Object.values(plan.relics).some(q => Math.hypot(x - q.x, z - q.z) < (q.r ?? .9) + r)) return false;
    if (kind === 'solid' && keepOut().some(q => Math.hypot(x - q.x, z - q.z) < q.r + r)) return false;
    return !clutter.some(c => Math.hypot(x - c.x, z - c.z) < (r + c.r) * (kind === 'cover' && c.kind === 'cover' ? .55
      : kind === 'cover' || c.kind === 'cover' ? .7 : 1));
  };
  // Places at the first candidate (town-local coordinates) that fits, or nowhere.
  const put = (name, candidates, { yaw: localYaw, s = .9 + R() * .2, water = false, world = false, night = false } = {}) => {
    const m = propMetadata.get(name);
    if (!m) throw new Error('Unknown clutter prop ' + name);
    const kind = clutterKind(m), r = m.radius * s, py = water ? TOWN_LEVEL * LH : y + (kind === 'cover' ? .008 : -.02);
    const turn = localYaw ?? R() * Math.PI * 2;
    for (const [lx, lz] of candidates) {
      const [x, z] = world ? [lx, lz] : rotateTownPoint(lx, lz, yaw);
      if (!fits(x, z, r, kind, { water, shore: !!m.shore })) continue;
      const p = { name, x, y: py, z, yaw: turn + yaw, s, tint: null, ...(night ? { night } : {}) };
      placements.push(p); clutter.push({ x, z, r, kind });
      if (kind === 'solid') colliders.push({ name, x, z, r: m.radius * s * .8, bottom: y, top: py + m.height * s });
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
  // Random fill, thinner where people walk: towards the tile's middle (`open` makes it thicker)
  const scatter = (count, pick, open = 0, size = [.9, 1.1]) => {
    for (let placed = 0, tries = 0; placed < count && tries < count * 25; tries++) {
      const x = .2 + R() * (N - .4), z = .2 + R() * (N - .4);
      if (R() > open + Math.hypot(x - N / 2, z - N / 2) / 6) continue;
      if (put(pick(x, z), [[x, z]], { world: true, s: size[0] + R() * (size[1] - size[0]) })) placed++;
    }
  };
  const shore = () => {
    const out = [];
    for (const c of plan.pond) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = c % N + dx, z = Math.floor(c / N) + dz;
      if (!plan.pond.includes(z * N + x)) out.push([c % N + .5 + dx * .78, Math.floor(c / N) + .5 + dz * .78]);
    }
    return out.sort(() => R() - .5);
  };
  // The grove along the town's outer sides (not the seams): `skip` town-local points it keeps off
  // (the gate)
  let trees = 0;
  const grove = (skip = []) => {
    const along = [2.6, 8, 13.4], jitter = () => (R() - .5) * .8;
    const sides = [['front', t => [t, .7]], ['back', t => [t, N - .7]], ['left', t => [.7, t]], ['right', t => [N - .7, t]]];
    for (const [side, at] of sides) {
      if (seams[side]) continue;
      for (const t of along) {
        const [x, z] = at(t + jitter());
        if (skip.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < 2.6)) continue;
        if (seamGap(x, z) < 1.4) continue;
        tree(trees++, x, z);
      }
    }
  };
  return { plan, add, path, tree, put, group, scatter, shore, grove, R };
}

// a path from the corner points `via` (town-local) to frontage i
const LANE_WIDTH = .65;   // (the street's is .75; a path crossing a seam is as wide on both sides)
function leadTo(plan, path, i, via, width = LANE_WIDTH) {
  const f = plan.frontages[i];
  path([...via, rotateTownPoint(f.x, f.z, -plan.yaw)], width);
}

// Meadow ground cover, after the authored set pieces.
function groundCover(R, scatter, scale = 1) {
  const n = k => Math.round(k * scale * CLUTTER), odd = ['any_rock_a', 'any_rock_b', 'any_rock_c',
    'meadow_mushroom_small_a', 'meadow_mushroom_small_b'];
  // Leafy things first so they get the spots along walls and under the grove.
  scatter(n(9), () => variant(R, R() < .4 ? 'meadow_fern' : R() < .6 ? 'meadow_berry_bush' : 'meadow_bush'), -.4, [.8, 1.15]);
  scatter(n(6), () => odd[Math.floor(R() * odd.length)], -.2);
  scatter(n(10), () => variant(R, 'meadow_flowers'), 0, [.8, 1.1]);
  scatter(n(14), () => variant(R, R() < .5 ? 'meadow_clover_patch' : 'meadow_daisies'), .1, [.9, 1.3]);
  scatter(n(7), () => variant(R, R() < .6 ? 'any_pebbles' : 'any_stone_chips'));
  scatter(n(70), () => variant(R, 'meadow_grass_tuft'), .3, [1, 1.45]);
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
function facing(put, name, candidates, [tx, tz]) {
  for (const [x, z] of candidates) if (put(name, [[x, z]], { yaw: Math.atan2(tx - x, tz - z) })) return;
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

// What stands in each tile ([j][i]): fn(tools, seams) dresses it after the grove
const of = (i, j) => [...BUILDINGS, ...MERCHANTS].filter(b => b.tile[0] === i && b.tile[1] === j);
const TILES = [
  // the gate's row: an orchard, the market inside the gate, the traders' camp
  [
    { name: 'orchard', dress({ put, group, R }) {
      for (const [x, z] of [[5, 5], [10.5, 5.5], [5.5, 10.5], [10.5, 11]])
        put(variant(R, R() < .5 ? 'meadow_tree_round' : 'meadow_tree_tall'), near(x, z, 1.2), { s: 1.1 + R() * .3 });
      put(variant(R, 'town_hay_bales'), near(8, 8, 1.5));
      put('mines_wheelbarrow_a', near(7.5, 12.5, 1.5), { yaw: R() * Math.PI });
      group([[12.8, 8.5]], ['mines_crate_a', 'mines_sacks_a', 'mines_barrel_b'], .8);
      put('meadow_stump_a', near(3, 8, 1.5));
    } },
    { name: 'market', gates: [[STREET, .9]], dress({ path, put, group, plan, R }) {
      path([[STREET, 0], [STREET, N]]);
      leadTo(plan, path, 0, [[STREET, 11.2]]);
      leadTo(plan, path, 1, [[STREET, 8]]);
      leadTo(plan, path, 2, [[STREET, 3.8]]);
      // a waymark at the gate, lamps where the traders set up
      put('relics_signpost_b', [[7.2, 1.2], [9.8, 1.4]], { yaw: Math.PI / 2 - .2, s: 1 });
      lamps(put, [['town_street_lamp_a', [[7.0, 9.4], [6.8, 8.8]]], ['town_street_lamp_a', [[10.0, 6.0], [10.2, 5.2]]],
        ['town_street_lamp_b', [[9.9, 13.2], [7.1, 13.0]]], ['town_street_lamp_a', [[7.1, 2.6], [9.9, 2.8]]]]);
      put(variant(R, 'town_handcart'), [...near(3.4, 13.4, 1), ...near(2.4, 6.4, 1)], { yaw: R() * Math.PI * 2, s: .85 });
      for (const [x, z] of [[6.2, 10.4], [10.6, 7.3], [6.4, 4.6]]) put(variant(R, 'town_flower_pots'), [[x, z]], { s: .9 + R() * .2 });
      group([[2.6, 9.4], [2.8, 10.2]], ['mines_barrel_a', 'mines_barrel_b', 'mines_crate_a'], .7);
      group([[13.6, 6.2], [13.4, 9.6]], ['mines_crate_b', 'mines_crate_a', 'mines_barrel_a', 'mines_sacks_a'], .8);
      put('mines_wheelbarrow_b', [[10.6, 13.0], [11.6, 12.6]], { yaw: .9 });
      put('relics_abandoned_pack_a', [[11.6, 4.2], [13.0, 4.0]]);
    } },
    { name: 'camp', dress({ put, group, R }) {
      // the traders' camp: a fire ring with log seats, and their stock
      const fire = put('relics_old_campfire_b', [[8, 7], [8.5, 7.5], [7.5, 6.5]], { s: 1 });
      if (fire) {
        [[-1.0, .25], [.75, -.75], [.55, .9]].forEach(([dx, dz]) =>
          put(variant(R, 'meadow_fallen_log'), [[8 + dx, 7 + dz]], { yaw: Math.atan2(dx, dz), s: .9 }));
        put('town_woodpile_a', [[9.6, 7.4], [7.6, 8.7], [9.5, 5.8]], { yaw: R() * Math.PI });
      }
      put('relics_abandoned_pack_b', near(6, 5, 1));
      put(variant(R, 'town_hay_bales'), near(11.5, 11.5, 1.5));
      group([[5, 11]], ['mines_sacks_b', 'mines_crate_b', 'mines_barrel_b'], .7);
      put('mines_plank_stack_b', near(11.5, 4.5, 1.2), { yaw: .3 });
      lamps(put, [['town_street_lamp_a', near(4.5, 7.5, 1)]]);
    } },
  ],
  // the plaza's row: the stable, the plaza with the crash, the smithy
  [
    { name: 'stable', dress({ path, put, group, plan, R }) {
      leadTo(plan, path, 0, [[N, LANE_1], [7, LANE_1]]);
      put(variant(R, 'town_hay_bales'), near(11.2, 5.0, 1.2));
      group([[11.4, 7.0]], ['mines_sacks_a', 'mines_sacks_b', 'mines_crate_a'], .7);
      put('mines_wheelbarrow_a', near(3.5, 9.5, 1), { yaw: -.6 });
      put(variant(R, 'town_handcart'), near(10.5, 13.2, 1), { yaw: Math.PI / 2 + R() * .4 - .2, s: .85 });
      lamps(put, [['town_street_lamp_a', near(12.5, 11.6, .75)]]);
    } },
    { name: 'plaza', relics: { shards: CRASH, robot: CRASH_ROBOT, sword: CRASH_SWORD }, portal: true, dress({ path, put, R }) {
      path([[STREET, 0], [STREET, N]]);
      path([[0, LANE_1], [N, LANE_1]], LANE_WIDTH);
      // the plaza: benches and the notice board round it, lamps along the street
      facing(put, 'town_bench_a', near(5.6, 12.2, 1), [STREET, LANE_1]);
      facing(put, 'town_bench_b', near(11.6, 12.4, 1), [STREET, LANE_1]);
      facing(put, 'town_notice_board_a', near(6.4, 3.2, 1.2), [STREET, 4]);
      lamps(put, [['town_street_lamp_a', near(9.6, 2.4, .75)], ['town_street_lamp_b', near(7.3, 9.4, .75)],
        ['town_street_lamp_a', near(9.7, 13.4, .75)]]);
      for (const [x, z] of [[3, 12.2], [13.6, 12.2], [6.2, 8.4]]) put(variant(R, 'town_flower_pots'), near(x, z, .8), { s: .9 + R() * .25 });
    } },
    { name: 'smithy', dress({ path, put, group, plan, R }) {
      leadTo(plan, path, 0, [[0, LANE_1], [6.7, LANE_1]]);
      // timber and fuel for the forge, a coal spill, a finished cart wheel
      group([[12.6, 9.8], [12, 12.5]], ['mines_plank_stack_a', 'mines_barrel_a', 'mines_crate_b', 'mines_sacks_b'], .8);
      put('mines_coal_scatter_a', [[10.8, 8.6], [11.4, 9.2], [4.4, 8.2]]);
      put('badlands_broken_wagon_wheel_a', [[3.2, 12.6], [4, 13], [12.6, 3.4]]);
      lamps(put, [['town_street_lamp_a', near(3.6, 11.6, .75)]]);
    } },
  ],
  // the inn's row: the pond garden, the inn, the pet shop
  [
    { name: 'garden', pond: [[7, 6], [8, 6], [7, 7], [8, 7], [8, 8]], dress({ put, shore, plan, R }) {
      facing(put, 'town_bench_a', near(5.4, 9.4, 1), [8, 7.5]);
      facing(put, 'town_bench_b', near(11, 5, 1), [8, 7]);
      for (const [x, z] of [[4.5, 4.5], [11.5, 10.5], [4, 12.5], [12, 2.6]]) put(variant(R, 'meadow_flowers'), near(x, z, 1), { s: 1 });
      lamps(put, [['town_street_lamp_a', near(10.4, 9.6, .75)]]);
      // reeds and stones on its banks, lily pads on the water
      const banks = shore();
      for (const name of ['meadow_cattails_a', 'meadow_cattails_b', 'any_shore_stones_a', 'any_shore_stones_b', 'meadow_cattails_a'])
        put(name, banks.splice(0, 3), { world: true });
      for (const c of [...plan.pond].sort(() => R() - .5).slice(0, 2 + Math.floor(R() * 2)))
        put(variant(R, 'meadow_lily_pads'), [[c % N + .3 + R() * .4, Math.floor(c / N) + .3 + R() * .4]], { water: true, world: true });
    } },
    { name: 'inn', spawn: [STREET, STREET], dress({ path, put, group, plan, R }) {
      path([[STREET, 0], [STREET, N]]);
      path([[STREET, LANE_2], [N, LANE_2]], LANE_WIDTH);
      leadTo(plan, path, 0, [[STREET, plan.frontagesLocal[0][1]]]);
      // deliveries by the inn's side, a cask by the porch, lamps along the street
      group([[3.2, 12.4]], ['mines_barrel_a', 'mines_barrel_b', 'mines_crate_a', 'mines_sacks_a'], .7);
      lamps(put, [['town_street_lamp_a', near(9.7, 4.2, .75)], ['town_street_lamp_b', near(9.8, 11.6, .75)]]);
      for (const [x, z] of [[6.4, 10.6], [6.4, 5.8]]) put(variant(R, 'town_flower_pots'), near(x, z, .8), { s: .9 + R() * .25 });
    } },
    { name: 'petshop', dress({ path, put, group, plan, R }) {
      leadTo(plan, path, 0, [[0, LANE_2]]);
      group([[11.6, 11.6], [11.2, 4]], ['mines_sacks_a', 'mines_crate_a', 'mines_sacks_b'], .6);
      put('meadow_stump_b', near(3.6, 12, 1));
      lamps(put, [['town_street_lamp_a', near(3.2, 8.4, .75)]]);
    } },
  ],
  // the back row: a wishing well in the grove, the green with the town's well, the windmill
  [
    { name: 'grove', dress({ put, R }) {
      facing(put, 'meadow_wishing_well_a', near(8, 8, 1.5), [N, 6]);
      facing(put, 'town_bench_b', near(10.6, 8.2, 1), [8, 8]);
      for (const [x, z] of [[5, 5], [11, 11.5], [5.5, 11]]) put(variant(R, 'meadow_flowers'), near(x, z, 1), { s: 1 });
      put('meadow_stump_a', near(11, 4.5, 1));
    } },
    { name: 'green', dress({ path, put, R }) {
      path([[STREET, 0], [STREET, 8]]);
      // the town's well where the street ends, benches and the notice board round the green
      facing(put, 'town_well_a', near(STREET, 10.4, 1), [STREET, 8]);
      facing(put, 'town_bench_a', near(5.6, 9, 1), [STREET, 10.4]);
      facing(put, 'town_bench_b', near(11.4, 9, 1), [STREET, 10.4]);
      lamps(put, [['town_street_lamp_a', near(9.7, 3.4, .75)], ['town_street_lamp_a', near(7.2, 7.4, .75)]]);
      for (const [x, z] of [[5, 12], [12, 12.2]]) put(variant(R, 'town_flower_pots'), near(x, z, .8), { s: .9 + R() * .25 });
    } },
    { name: 'windmill', dress({ put, group, R }) {
      facing(put, 'meadow_windmill_a', near(8.5, 9, 1.5), [0, 6]);
      put(variant(R, 'town_hay_bales'), near(5, 5, 1.2));
      group([[11.5, 5.5]], ['mines_sacks_a', 'mines_sacks_b'], .7);
      put(variant(R, 'town_handcart'), near(4.6, 11.4, 1), { yaw: R() * Math.PI, s: .85 });
    } },
  ],
];
export const TILE_NAMES = TILES.map(row => row.map(t => t.name));

// The plan of the town's tile (i, j): exit the town's (townExit), seed the tile's own.
export function townPlan(exit, seed, i, j) {
  const spec = TILES[j]?.[i];
  if (!spec) throw new Error(`No town tile ${i},${j}`);
  const seams = { left: i > 0, right: i < TOWN_ACROSS - 1, front: j > 0, back: j < TOWN_DEEP - 1 };
  const tools = tilePlan(exit, seed, { buildings: of(i, j), gates: spec.gates ?? [], relics: spec.relics ?? {}, spawn: spec.spawn ?? null, seams });
  const { plan } = tools;
  plan.tile = { i, j, name: spec.name };
  plan.frontagesLocal = plan.frontages.map(f => rotateTownPoint(f.x, f.z, -plan.yaw));
  if (spec.portal) { const [px, pz] = rotateTownPoint(...TOWN_PORTAL_SPOT, plan.yaw); plan.portal = { x: px, z: pz }; }
  if (spec.pond) plan.pond = spec.pond.map(([x, z]) => {
    const [rx, rz] = rotateTownPoint(x + .5, z + .5, plan.yaw); return Math.floor(rz) * N + Math.floor(rx);
  });
  tools.grove(spec.gates ?? []);
  // bushes along the outer sides, between the trees
  for (const [side, at] of [['front', t => [t, .6]], ['back', t => [t, N - .6]], ['left', t => [.6, t]], ['right', t => [N - .6, t]]])
    if (!seams[side]) for (const t of [5.2, 10.8]) tools.put('meadow_bush_' + (tools.R() < .5 ? 'a' : 'b'), [at(t)], { s: 1.05 + tools.R() * .25 });
  spec.dress(tools);
  delete plan.frontagesLocal;
  groundCover(tools.R, tools.scatter);
  return plan;
}
