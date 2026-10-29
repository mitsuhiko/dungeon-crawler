// Town policy and authored clearing plans. Pure data; also runs in the worker.
import { N, LH, CHAR_R } from '../core/constants.js';
import { mulberry32, hash32 } from '../core/util.js';
import { propMetadata, CLUTTER } from '../core/propcatalog.js';
import { parse, step } from './coords.js';

export const TOWN_KEY = '0,0,0';
export const TOWN_LEVEL = 4;
export const isTown = k => k === TOWN_KEY;
// The surface road's direction is seed % 4 (see layout.js). Reserve its first cube.
export const merchantCampKey = seed => step(TOWN_KEY, seed % 4);
export const isMerchantCamp = (k, seed) => k === merchantCampKey(seed);
export const isClearing = (k, seed) => isTown(k) || isMerchantCamp(k, seed);
export const enemyFreeAt = k => { const [x, y, z] = parse(k); return y === 0 && Math.max(Math.abs(x), Math.abs(z)) <= 1; };
export const townExitPosition = d => d === 0 || d === 3 ? 8 : 7;
const exitYaw = [-Math.PI / 2, Math.PI / 2, Math.PI, 0];
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
// turns), like the rest of the world, around an asymmetric clearing.
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
  { name: 'town_inn_a', x: 3.78, z: 3.4, yaw: 0, bounds: [-2.310, -1.764, 2.074, 2.459], height: 4.790,
    door: { x: -.28, z: 1.6, w: .8 }, body: { x: 0, w: 3.55, d: 2.9 }, upper: 'gallery',
    parts: [
      { box: [-1.84, -1.52, 1.84, 1.6], top: 4.79 },
      { box: [.62, 1.7, 1.62, 2.18], top: .75 },                       // bench
      { circle: [-.93, 2.24, .09], top: 1.7 }, { circle: [.37, 2.24, .09], top: 1.7 },   // porch posts
      { circle: [-2.055, -.43, .25], top: .6 },                          // barrel
      { box: [-1.1, 1.27, .54, 2.38], bottom: 1.6, top: 2.1, solid: false },   // porch roof
    ] },
  { name: 'town_stable_a', x: 12.3, z: 3.6, yaw: 0, bounds: [-2.440, -1.564, 2.224, 2.142], height: 3.293 },
  { name: 'town_blacksmith_a', x: 3.0, z: 11.2, yaw: Math.PI / 2, bounds: [-2.446, -1.564, 2.578, 1.731], height: 3.376,
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
  { name: 'town_pet_shop_a', x: 12.6, z: 12.03, yaw: -Math.PI / 2, bounds: [-1.771, -1.489, 2.494, 2.122], height: 3.333,
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
export const MERCHANTS = [
  { name: 'town_merchant_a', x: 4.0, z: 11.2, yaw: Math.PI / 2, bounds: [-1.551, -1.276, 1.786, 1.628], height: 2.630 },
  { name: 'town_merchant_b', x: 12.0, z: 8.0, yaw: -Math.PI / 2, bounds: [-1.701, -1.276, 1.612, 1.644], height: 2.697 },
  { name: 'town_merchant_c', x: 4.6, z: 3.8, yaw: Math.PI / 2, bounds: [-1.671, -1.276, 1.801, 1.637], height: 2.757 },
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
// Deliberate gap at the north gate; the whole plan rotates with the single exit.
const GROVE = [[.65, 1.0], [.65, 5.7], [.65, 11.3], [1.0, 15.15],
  [15.25, 1.0], [15.25, 5.9], [15.25, 11.25], [15.1, 15.2],
  [3.8, .65], [6.5, .65], [10.7, .65], [13.4, .65],
  [3.8, 15.3], [6.2, 15.3], [10.25, 15.3], [13.2, 15.3]];

// Small catalog props dressing the clearings. Each has a kind deciding how it keeps
// clear of routes: `solid` ones collide, `prop` ones are knee-high or taller but
// walk-through, `cover` lies flat on the grass and may hug the path edges.
const clutterKind = m => m.blocking ? 'solid' : m.cover || m.height < .2 ? 'cover' : 'prop';
const variant = (R, base) => base + (R() < .5 ? '_a' : '_b');
const segmentDistance = (x, z, [ax, az], [bx, bz]) => {
  const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
};

function clearingPlan(exit, seed, buildings, gates, relics) {
  const yaw = exitYaw[exit];
  if (yaw === undefined) throw new Error('Clearing needs a side exit');
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
  const tree = (i, x, z) => {
    const t = TREES[i % TREES.length], scale = .94 + R() * .08;
    const p = add(t.name, x, z, R() * Math.PI * 2, scale);
    const trunk = { name: p.name, x: p.x, z: p.z, r: t.trunk * scale, bottom: y, top: y + t.canopy * scale };
    colliders.push(trunk); occluders.push(trunk);
    occluders.push({ shape: 'ellipsoid', x: p.x, z: p.z, y: y + t.height * .79 * scale,
      rx: t.radius * scale, rz: t.radius * scale, ry: t.height * .21 * scale,
      top: y + t.height * scale, bottom: y + t.canopy * scale });
  };
  const [sx, sz] = rotateTownPoint(8.5, 8.5, yaw);
  const plan = { placements, colliders, occluders, frontages, paths, doors, villagers, pond: [], yaw,
    spawn: [Math.floor(sx), Math.floor(sz)], relics: Object.fromEntries(Object.entries(relics).map(([k, at]) => {
      const [x, z] = rotateTownPoint(...at, yaw); return [k, { x, z }];
    })) };
  // Solid clutter keeps away from gates, the spawn plaza and doorsteps, so every
  // generated route, gate cell and frontage stays walkable.
  const keepOut = () => [
    ...gates.map(([x, z]) => { const [gx, gz] = rotateTownPoint(x, z, yaw); return { x: gx, z: gz, r: 2.1 }; }),
    { x: sx, z: sz, r: 2.25 }, ...frontages.map(f => ({ x: f.x, z: f.z, r: 1.25 })),
  ];
  const wet = (x, z, r) => plan.pond.some(c => {
    const cx = c % N, cz = Math.floor(c / N);
    return Math.hypot(x - Math.max(cx, Math.min(cx + 1, x)), z - Math.max(cz, Math.min(cz + 1, z))) < r;
  });
  const fits = (x, z, r, kind, { water = false, shore = false } = {}) => {
    if (x - r < .05 || z - r < .05 || x + r > N - .05 || z + r > N - .05) return false;
    if (water ? !plan.pond.includes(Math.floor(z) * N + Math.floor(x)) : wet(x, z, shore ? .05 : kind === 'cover' ? r * .5 : r)) return false;
    for (const f of footprints) {
      const dx = x - f.x, dz = z - f.z, lx = dx * f.c - dz * f.s, lz = dx * f.s + dz * f.c, m = kind === 'cover' ? r * .5 : r;
      if (lx > f.bounds[0] - m && lx < f.bounds[2] + m && lz > f.bounds[1] - m && lz < f.bounds[3] + m) return false;
    }
    for (const b of colliders) if (b.shape !== 'box' && Math.hypot(x - b.x, z - b.z) < b.r + r * (kind === 'cover' ? .4 : 1) + (kind === 'solid' ? .15 : 0)) return false;
    const clearance = { solid: r + CHAR_R + .2, prop: r * .7 + .05, cover: r * .35 }[kind];
    for (const p of paths) for (let i = 1; i < p.points.length; i++)
      if (segmentDistance(x, z, p.points[i - 1], p.points[i]) < p.width / 2 + clearance) return false;
    if (Math.hypot(x - sx, z - sz) < 1.35 + r) return false;
    if (plan.portal && Math.hypot(x - plan.portal.x, z - plan.portal.z) < 1.1 + r) return false;
    if (Object.values(plan.relics).some(q => Math.hypot(x - q.x, z - q.z) < .9 + r)) return false;
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
  // Random fill, thinned out towards the open centre of the clearing.
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
  return { plan, add, path, tree, put, group, scatter, shore, R };
}

// a path from the corner points `via` (town-local) to frontage i
function leadTo(plan, path, i, via, width = .65) {
  const f = plan.frontages[i];
  path([...via, rotateTownPoint(f.x, f.z, -plan.yaw)], width);
}

// Meadow ground cover shared by both clearings, after the authored set pieces.
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

// Where the town end of a town portal stands (town-local; the plan rotates it with the exit):
// east of the plaza, between the stable's and the pet shop's paths. Nothing is put on it.
export const TOWN_PORTAL_SPOT = [12, 8.5];
// Where the beginning's things lie (town-local, core/intro.js, docs/story.md "The beginning"): the
// shards of the big glass that burst over the town, on its plaza, round where a hero stood before
// (render/shards.js); in the merchant camp the robot asleep (core/robot.js), a few steps in from the
// town's side, and his old sword stuck in the ground beside it, both off the road (walking along it
// takes neither). Nothing is put on them (plan.relics: { shards } and { sword, robot }).
export const TOWN_SHARDS = [8.5, 8.2], CAMP_RELIC = [6.3, 11.8], CAMP_ROBOT = [7.2, 12.6];
// the house a new hero comes out of as the world comes up (game/intro.js): the inn
export const WAKE_HOUSE = 'town_inn_a';

export function townPlan(exit, seed) {
  const { plan, path, tree, put, group, scatter, shore, R } = clearingPlan(exit, seed, BUILDINGS, [[8.5, .9]], { shards: TOWN_SHARDS });
  const [px, pz] = rotateTownPoint(...TOWN_PORTAL_SPOT, plan.yaw);
  plan.portal = { x: px, z: pz };
  GROVE.forEach(([x, z], i) => tree(i, x, z));
  // Planting stays in reserved pockets, away from the walking routes.
  for (const [x, z] of [[.75, 3.3], [.8, 8.4], [.8, 13.5], [15.2, 3.5], [15.2, 8.6],
    [15.2, 13.4], [2.2, .6], [5.2, .6], [12, .6], [2.1, 15.4], [8.4, 15.4], [11.8, 15.4]]) {
    put('meadow_bush_' + (R() < .5 ? 'a' : 'b'), [[x, z]], { s: 1.05 + R() * .25 });
  }
  for (const [x, z] of [[5.9, 6.6], [7.0, 11.8], [10.5, 7.4], [5.0, 14.0]])
    put('meadow_flowers_a', [[x, z]], { s: .9 });
  plan.pond = [[6, 3], [7, 3], [6, 4], [7, 4], [7, 5]].map(([x, z]) => {
    const [rx, rz] = rotateTownPoint(x + .5, z + .5, plan.yaw); return Math.floor(rz) * N + Math.floor(rx);
  });
  // One street from the gate past the plaza; the houses branch off it at right angles.
  path([[8.5, 0], [8.5, 12.5]]);
  leadTo(plan, path, 0, [[8.5, 7], [3.5, 7]]);
  leadTo(plan, path, 1, [[8.5, 7], [12.3, 7]]);
  leadTo(plan, path, 2, [[8.5, 12.5]]);
  leadTo(plan, path, 3, [[8.5, 11.5]]);

  // Set pieces: a waymark at the gate, street lamps along the street and round the plaza (lit at
  // night), the well, benches and the notice board, and each trade's leftovers.
  put('relics_signpost_a', [[7.3, 1.3], [7.4, 2.0], [9.9, 1.4]], { yaw: Math.PI / 2 + .3, s: 1 });
  // (the well where the inn's lane ends; else east of the plaza, or south of it)
  facing(put, 'town_well_a', [...near(1.6, 7, 1), ...near(14.4, 7.2, 1), ...near(9.5, 14, 1)], [8.5, 7]);
  facing(put, 'town_bench_a', near(6, 10.3, 1), [8.5, 8.5]);
  facing(put, 'town_bench_b', [...near(14.2, 8.8, 1.2), ...near(7.2, 14.1, 1)], [12, 8.5]);
  facing(put, 'town_notice_board_a', [...near(7.3, 14.2, 1.2), ...near(1.6, 8, 1.5)], [8.5, 12]);
  lamps(put, [['town_street_lamp_a', near(9.6, 1.8, .75)], ['town_street_lamp_a', [[9.9, 4.2], ...near(9.8, 5, .75)]],
    ['town_street_lamp_b', [[10.3, 9.9], ...near(10.6, 10.3, .75)]], ['town_street_lamp_a', [[6.6, 7.9], ...near(6.2, 8, .75)]],
    ['town_street_lamp_a', near(5.2, 6.1, .75)], ['town_street_lamp_a', near(11.2, 6.1, .75)],
    ['town_street_lamp_a', [...near(7.6, 12.9, .75), ...near(9.4, 12.4, .75)]]]);
  // flower pots by the doors and round the plaza
  for (const [x, z] of [[2.6, 6.3], [4.5, 6.3], [10.4, 12.4], [10.5, 10.6], [5.2, 13.6], [6, 8.3]])
    put(variant(R, 'town_flower_pots'), near(x, z, .8), { s: .9 + R() * .25 });
  // Inn: deliveries by the side door, a cask by the porch.
  group([[6.2, 1.8]], ['mines_barrel_a', 'mines_barrel_b', 'mines_crate_a', 'mines_sacks_a'], .7);
  group([[1.2, 6.8]], ['mines_barrel_b', 'mines_crate_b'], .5);
  // Stable: hay and feed sacks along the wall, a barrow by the paddock, a hand cart to fetch more.
  put(variant(R, 'town_hay_bales'), near(14.8, 6.4, 1.2));
  group([[14.6, 6.3], [9.6, 6.0]], ['mines_sacks_a', 'mines_sacks_b', 'mines_crate_a'], .7);
  put('mines_wheelbarrow_a', [[14.6, 7.3], [14.4, 6.8], [15.0, 9.8]], { yaw: -.6 });
  put(variant(R, 'town_handcart'), [...near(14.4, 7.2, .75), ...near(9.5, 14, .75)], { yaw: Math.PI / 2 + R() * .4 - .2, s: .85 });
  // Blacksmith: timber and fuel for the forge, a coal spill, a finished cart wheel.
  group([[7.4, 14.1], [6.6, 13.4]], ['mines_plank_stack_a', 'mines_barrel_a', 'mines_crate_b', 'mines_sacks_b'], .8);
  put('mines_coal_scatter_a', [[5.4, 13.6], [5.9, 13.9], [5.5, 9.4]]);
  put('badlands_broken_wagon_wheel_a', [[1.0, 9.9], [0.7, 10.5], [7.9, 12.4]]);
  put('meadow_stump_a', [[0.6, 7.6], [1.6, 15.0], [9.2, 14.9]]);
  // Pet shop: feed sacks and a crate by the doorstep.
  group([[10.0, 13.6], [9.8, 10.2]], ['mines_sacks_a', 'mines_crate_a', 'mines_sacks_b'], .6);
  // Pond: reeds and stones on its banks, lily pads on the water.
  const banks = shore();
  for (const name of ['meadow_cattails_a', 'meadow_cattails_b', 'any_shore_stones_a', 'any_shore_stones_b', 'meadow_cattails_a'])
    put(name, banks.splice(0, 3), { world: true });
  for (const c of [...plan.pond].sort(() => R() - .5).slice(0, 2 + Math.floor(R() * 2)))
    put(variant(R, 'meadow_lily_pads'), [[c % N + .3 + R() * .4, Math.floor(c / N) + .3 + R() * .4]], { water: true, world: true });
  groundCover(R, scatter);
  return plan;
}

export function merchantCampPlan(exit, seed) {
  const { plan, path, tree, put, group, scatter, R } = clearingPlan(exit, seed, MERCHANTS, [[8.5, .9], [8.5, 15.1]], { sword: CAMP_RELIC, robot: CAMP_ROBOT });
  // Open at both ends of the road; tents flank it instead of forming another row.
  [[1.0, 1.4], [14.7, 2.2], [1.0, 7.0], [14.9, 11.6], [2.0, 14.9], [12.9, 14.9]]
    .forEach(([x, z], i) => tree(i, x, z));
  for (const [x, z] of [[2.0, 5.0], [13.9, 4.7], [1.5, 12.5], [11.4, 14.5]])
    put('meadow_bush_a', [[x, z]], { s: 1.1 });
  path([[8.5, 16], [8.5, 0]], .85);
  leadTo(plan, path, 0, [[8.5, 11.2]]);
  leadTo(plan, path, 1, [[8.5, 8]]);
  leadTo(plan, path, 2, [[8.5, 3.8]]);

  // Waymarks at both ends and lamps where the traders set up.
  put('relics_signpost_b', [[7.2, 1.2], [9.8, 1.4]], { yaw: Math.PI / 2 - .2, s: 1 });
  put('relics_signpost_a', [[9.9, 14.8], [7.1, 14.7]], { yaw: -Math.PI / 2 + .3, s: 1 });
  lamps(put, [['town_street_lamp_a', [[7.0, 9.4], [6.8, 8.8]]], ['town_street_lamp_a', [[10.0, 6.0], [10.2, 5.2]]],
    ['town_street_lamp_b', [[9.9, 13.2], [7.1, 13.0]]], ['town_street_lamp_a', [[7.1, 2.6], [9.9, 2.8]]]]);
  // Traders' camp: a fire ring with log seats, and stock stacked behind the stalls.
  const fire = put('relics_old_campfire_b', [[11.9, 3.4], [12.3, 4.0], [11.6, 2.6]], { s: 1 });
  if (fire) {
    const [fx, fz] = rotateTownPoint(fire.x, fire.z, -plan.yaw);
    // Seats lie tangentially; the log mesh is long along its X axis.
    [[-1.0, .25], [.75, -.75], [.55, .9]].forEach(([dx, dz]) =>
      put(variant(R, 'meadow_fallen_log'), [[fx + dx, fz + dz]], { yaw: Math.atan2(dx, dz), s: .9 }));
    put('town_woodpile_a', [[fx + 1.6, fz + .4], [fx - .4, fz + 1.7], [fx + 1.5, fz - 1.2]], { yaw: R() * Math.PI });
  }
  put(variant(R, 'town_handcart'), [...near(3.4, 13.4, 1), ...near(2.4, 4.4, 1), ...near(13.8, 9, 1)], { yaw: R() * Math.PI * 2, s: .85 });
  put(variant(R, 'town_hay_bales'), [[1.4, 3.4], [14.6, 13.2], [3.4, 6.6]]);
  for (const [x, z] of [[6.2, 10.4], [10.6, 7.3], [6.4, 4.6]]) put(variant(R, 'town_flower_pots'), [[x, z]], { s: .9 + R() * .2 });
  group([[1.6, 9.4], [2.0, 10.2]], ['mines_barrel_a', 'mines_barrel_b', 'mines_crate_a'], .7);
  group([[14.6, 6.2], [14.4, 9.6]], ['mines_crate_b', 'mines_crate_a', 'mines_barrel_a', 'mines_sacks_a'], .8);
  group([[2.6, 1.0], [7.0, 2.4]], ['mines_sacks_b', 'mines_crate_b', 'mines_barrel_b'], .7);
  put('mines_wheelbarrow_b', [[10.6, 13.0], [11.6, 12.6]], { yaw: .9 });
  put('mines_plank_stack_b', [[13.8, 13.0], [12.9, 12.0]], { yaw: .3 });
  put('relics_abandoned_pack_a', [[11.6, 4.2], [13.6, 4.0]]);
  put('meadow_stump_b', [[5.6, 14.6], [3.2, 7.4]]);
  for (const [x, z] of [[11.6, 7.4], [5.0, 8.4], [12.2, 10.6]]) put(variant(R, 'meadow_sapling'), [[x, z]]);
  groundCover(R, scatter, 1.15);
  return plan;
}
