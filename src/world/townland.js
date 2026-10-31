// The town's land (docs/town.md, "The land"): the ground under all of the town's tiles at once, made
// from the world's seed, so that what runs across its seams (the escarpment, the river, the hill)
// runs on as one, and every world's town lies in a land of its own. Pure data; also runs in the
// worker. It is the generator's own ground: a whole level per cell (cubegen/smooth.js makes slopes
// of small steps and leaves the big ones as cliffs), the stairs and bridges its runs (cubegen/place.js,
// shape.js), the river's water its fluid floors and where it comes down its falls (core/falls.js).
// world/town.js builds each tile from it (tileGround).
//
// In the town's own frame, in cells: X across (tile i covers i*N to (i+1)*N), Z deep from the gate's
// side (tile j from j*N).
//
// - Three bands across the town: the lower town round the gate (the first rows), the water across
//   the back of the plaza's row and the front of the inn's, and the upper town half a cube over it
//   (UPPER levels), its cliff rising out of the water, a strand at its foot here and there. The
//   street crosses the water by two bridges and a pier on the seam to a quay under the cliff and
//   climbs it by a deep stair along the cliff's foot (INN_STAIR). The water broadens to a lake in
//   the garden; a long span comes down over it from the upper town's edge to a rock standing in it
//   on the seam, and on down to the lower town's shore.
// - What has to stand on level ground (`keep`: the houses, the streets, lanes and paths, the people,
//   the crash, the spawn, the gate, world/town.js) is level, on the ground it stands on; the wild
//   ground round about rolls a level or two up and down.
// - A high hill in one of the back corners, a camp's tent on its top and a shoulder on its side for
//   the corner's own set piece (the windmill, the wishing well); a hollow in one of the front corners
//   with another tent at its bottom.
// - The river: in from the back of the town across the upper town, over the cliff's edge in a fall
//   half a cube high into the water; two cells wide, waded, bridged where a way crosses it.
// - Trails up the hill and down into the hollow.
// - The wall (WALL): round the town a cell's width in from its outer sides, the forest outside it
//   (deep and wild, the ground rolling under it), a gate in it where the street comes in, an arch
//   where the river does; inside, woods here and there. Outside it nothing is walked to: the
//   generator's checks leave it out (cubegen/town.js).
// - The wild ground rolls (more where nothing stands near: knolls in the lower town, a level or
//   three over it), flattening towards the seams.
//
// Seams: the cells either side of one (s - 1 and s) stand alike and level (the physics reads a cell
// past a seam as the edge's, physics/collide.js cellAt): nothing steps, flows down or is built there.
import { N } from '../core/constants.js';
import { mulberry32, hash32, makeNoise, clamp } from '../core/util.js';

const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const pick3 = (R, list) => list[Math.floor(R() * list.length)];
// how far round what is kept the ground stays as it is kept (cells)
export const FLAT = 0.9;
// The water's surface: a level under the ground it runs through
export const WATER_DROP = 1;
// how high the upper town stands over the lower (levels: half a cube)
export const UPPER = 16;
// The water: from this far into the plaza's row (local z) to this far into the inn's, further in
// the garden (its lake); in the inn's tile a quay of QUAY rows between it and the cliff
export const WATER_FROM = 12, WATER_TO = 3, QUAY = 2;
// The street's stair up the cliff (in the inn's tile, its own frame): along the cliff's foot on the
// quay's back row z, from the foot (lower town) to the top (upper town), its flight the cells between
export const INN_STAIR = { z: WATER_TO + QUAY - 1, foot: 4, top: 13 };
// (where the street runs in the middle tiles: world/town.js STREET)
const STREET_X = 8.5;
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// the kinds of old ruins a town may have (world/town.js dresses them)
export const RUINS = ['temple', 'colossus', 'colonnade'];
// The kinds of wood a town's woods are (world/town.js WOODS: their trees and their floor), and how
// they lie inside the wall: a belt along it with woods here and there, many small groves, one big
// wood filling a corner or two, or open parkland with hardly a wood
export const WOODS = ['mixed', 'firs', 'birch', 'oak', 'old', 'heath'];
export const WOOD_SHAPES = ['belt', 'groves', 'corner', 'open'];
// The forms of the wild ground in the upper town (flat, broad swells, terraced fields a step over
// the next, rocky knolls, a ridge along its back) and in the lower town (rolling knolls, a marsh
// with ponds, an orchard's level ground, a flat green, dells sunk into it, rough ground with
// stones): `relief` below, world/town.js dresses them
export const UPPER_FORMS = ['plateau', 'downs', 'terraces', 'highland', 'ridge'];
export const LOWER_FORMS = ['meadow', 'marsh', 'orchard', 'green', 'dell', 'rocky'];
// The cliff under the upper town (winding a cell or two in and out as it always did, or straight),
// how high it rises (RISES:
// levels), the hill (a hill, a broad low mound, a steep peak) and the hollow (a dell, a pool at its
// bottom, a deep quarry)
export const CLIFFS = ['winding', 'straight'], RISES = [12, 14, 16, 16];
export const HILLS = ['hill', 'mound', 'peak'], HOLLOWS = ['dell', 'pond', 'quarry'];
// The wall: the cells of the forest outside it on each outer side (the wall stands in the next row
// in), how wide its gate is where the street comes in (cells, round the street)
export const WALL = 3, WALL_GATE = 5;
// where cell (x, z) of a town W x D cells lies: 0 inside the wall, 1 on it, 2 outside it
export function wallSide(W, D, x, z) {
  const a = WALL, bx = W - 1 - WALL, bz = D - 1 - WALL;
  if (x < a || z < a || x > bx || z > bz) return 2;
  return x === a || z === a || x === bx || z === bz ? 1 : 0;
}

// A kept shape: { box: [x0, z0, x1, z1], r }, { seg: [a, b], r }, or a disc { x, z, r }: how far
// (x, z) lies outside it (negative: inside)
export function keepDistance(k, x, z) {
  if (k.box) {
    const [x0, z0, x1, z1] = k.box;
    return Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1)) - (k.r ?? 0);
  }
  if (k.seg) {
    const [[ax, az], [bx, bz]] = k.seg, dx = bx - ax, dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    return Math.hypot(x - ax - t * dx, z - az - t * dz) - k.r;
  }
  return Math.hypot(x - k.x, z - k.z) - k.r;
}

// A small binary heap of [priority, value]
function heap() {
  const a = [];
  return {
    get size() { return a.length; },
    push(p, v) {
      a.push([p, v]);
      for (let i = a.length - 1; i > 0;) {
        const j = (i - 1) >> 1;
        if (a[j][0] <= a[i][0]) break;
        [a[i], a[j]] = [a[j], a[i]]; i = j;
      }
    },
    pop() {
      const top = a[0], last = a.pop();
      if (a.length) {
        a[0] = last;
        for (let i = 0; ;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < a.length && a[l][0] < a[m][0]) m = l;
          if (r < a.length && a[r][0] < a[m][0]) m = r;
          if (m === i) break;
          [a[i], a[m]] = [a[m], a[i]]; i = m;
        }
      }
      return top;
    },
  };
}

// The cheapest way over the cells (W x D) from `starts` to a cell where goal(c) holds: enter(n, c)
// what stepping onto n from c costs (Infinity: never). The cells of the way, its start first.
function cheapest(W, D, starts, goal, enter, guess = () => 0) {
  const cost = new Float64Array(W * D).fill(Infinity), prev = new Int32Array(W * D).fill(-1), open = heap();
  for (const s of starts) { cost[s] = 0; open.push(guess(s), s); }
  while (open.size) {
    const [, c] = open.pop();
    if (goal(c)) {
      const way = [];
      for (let k = c; k >= 0; k = prev[k]) way.unshift(k);
      return way;
    }
    const x = c % W, z = (c - x) / W;
    for (const [dx, dz] of DIRS4) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
      const n = nz * W + nx, step = enter(n, c, prev[c]);
      if (!Number.isFinite(step)) continue;
      if (cost[c] + step < cost[n]) { cost[n] = cost[c] + step; prev[n] = c; open.push(cost[n] + guess(n), n); }
    }
  }
  return null;
}

// The land of a world's town: seed the world's, across x deep its tiles, level the lower town's,
// gate where the road leaves (x, z), fixed the boxes of the town's buildings (the town's frame);
// layout(features) lays the town out round the big things (world/town.js: its lanes and homes):
// { keep: what stands level, ways: its streets, lanes and paths ([{ a, b, w }]), bodies }
export function makeLand(seed, opts, { stages = true } = {}) {
  const { across, deep, level, layout: plan, gate, fixed = [], fixedWays = [], fixedKeep = [] } = opts;
  const W = across * N, D = deep * N, R = mulberry32(hash32(seed ^ 0x1a4d5));
  const roll = makeNoise(R), wander = makeNoise(R), belt = makeNoise(R), woods = makeNoise(R), kind = makeNoise(R),
    shore = makeNoise(R), cliffy = makeNoise(R);
  // ---- the landscape, from a dice of its own (what the dice above make stays as it is): what kind
  // of wood the town's woods are and how they lie
  const K = mulberry32(hash32(seed ^ 0x1a5c4));
  const landscape = { wood: pick3(K, WOODS), woodShape: pick3(K, WOOD_SHAPES) };
  // (the big woods of the `corner` shape: one or two of the inside's corners, or a side's middle)
  const bigWoods = [];
  {
    const spots = [[0, 1], [1, 1], [0, .55], [1, .55], [0, .2], [1, .2]].sort(() => K() - .5);
    for (const [u, v] of spots.slice(0, 1 + (K() < .5 ? 1 : 0)))
      bigWoods.push({ x: u ? W - WALL - 2 : WALL + 1, z: WALL + 1 + v * (D - 2 * WALL - 3), r: 6 + K() * 4 });
  }
  const woodsNoise = makeNoise(K);
  // (the forms of the upper and the lower town's wild ground: what shapes them, from the same dice)
  landscape.upper = pick3(K, UPPER_FORMS); landscape.lower = pick3(K, LOWER_FORMS);
  // (how settled each band is: built up, homes in a few groups, or hardly: world/town.js plotTown)
  landscape.settled = { upper: pick3(K, [1, .75, .55]), lower: pick3(K, [1, .75, .55]) };
  const broad = makeNoise(K), wob = makeNoise(K), boggy = makeNoise(K);
  const terraceStep = 4 + Math.floor(K() * 3), terraceFrom = 6 + Math.floor(K() * 3), ridgeTop = 4 + Math.floor(K() * 2);
  landscape.cliff = pick3(K, CLIFFS); landscape.rise = pick3(K, RISES); landscape.hill = pick3(K, HILLS); landscape.hollow = pick3(K, HOLLOWS);
  const knobCount = 6 + Math.floor(K() * 4), knobTries = Array.from({ length: 80 }, () => [K(), K(), 3 + Math.floor(K() * 3), 1 + K() * 1.5]);
  const xz = c => [c % W, Math.floor(c / W)], cell = (x, z) => z * W + x;
  const jit = s => (R() - .5) * 2 * s;
  const seamX = Array.from({ length: across - 1 }, (_, i) => (i + 1) * N), seamZ = Array.from({ length: deep - 1 }, (_, j) => (j + 1) * N);
  // how far cell column (or row) v lies from the nearest seam (0: next to it); is it next to one
  const offSeam = (v, seams) => Math.min(Infinity, ...seams.map(s => v < s ? s - v - 1 : v - s));
  const strip = (x, z) => offSeam(x, seamX) === 0 || offSeam(z, seamZ) === 0;
  // where a cell lies by the wall (wallSide: 0 inside, 1 on it, 2 outside); is continuous (x, z)
  // inside it by at least m (from its inner face)
  const side = (x, z) => wallSide(W, D, x, z);
  const inWall = (x, z, m = 0) => x > WALL + 1 + m && z > WALL + 1 + m && x < W - WALL - 1 - m && z < D - WALL - 1 - m;
  const insideBox = (x, z, m) => fixed.some(b => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m);

  // ---- the three bands: the lower town round the gate (its first rows), the water, the upper town
  // half a cube over it, its cliff rising out of the water (edge[x]: its first upper cell in each
  // column). The water from the back of the plaza's row (WATER_FROM) into the upper town's first
  // row: in the middle tile under the quay at the cliff's foot (QUAY rows, the street's stair along
  // it), on the right as far as WATER_TO (a cell further now and then), in the garden a bay (the
  // lake). By a seam as on its other side.
  const UP = Math.min(2, deep - 1), lower = level, upper = level + landscape.rise, rows = Array.from({ length: deep }, (_, j) => j < UP ? lower : upper);
  const mid = Math.floor(across / 2), upZ = UP * N, from = (UP - 1) * N + WATER_FROM, px = mid * N;
  // (how deep the lake's bay reaches into the upper town, how far the cliff winds elsewhere)
  const lakeDeep = 8 + Math.floor(R() * 6), wind = 1 + Math.floor(R() * 2);
  const edge = Array.from({ length: W }, (_, x) => {
    const i = Math.floor(x / N), lx = x - i * N;
    if (i === mid) return upZ + WATER_TO + QUAY;
    // (the lake: a bay deepest in the garden's middle, by the seam into the middle's tile as the middle's)
    if (i === 0 && across > 1) {
      const bay = Math.min(1, 1.4 * Math.sin(Math.PI * (lx + 1.5) / (N + 1))), wob = lx < N - 2 ? Math.floor(cliffy(Math.floor((x + 1) / 3), 3.3) * 1.99) : 0;
      return upZ + WATER_TO + QUAY + (lx < N - 2 ? Math.round((lakeDeep - WATER_TO - QUAY) * bay) + wob : 0);
    }
    if (lx < 2 && i === mid + 1) return upZ + WATER_TO + QUAY;
    // (straight, or winding a cell or two)
    if (lx < 4 || lx >= N - 2 || landscape.cliff === 'straight') return upZ + WATER_TO;
    return upZ + WATER_TO + Math.floor(cliffy(Math.floor((x + 2) / 4) * 1.7, 9.1) * (wind + .99));
  });
  const quay = (x, z) => Math.floor(x / N) === mid && z >= upZ + WATER_TO && z < upZ + WATER_TO + QUAY && x - px >= 2 && x - px < N - 2;
  const tongue = new Set();
  // what of the land's set pieces (`features`: the gorge, the spans, the streams, where they are)
  const features = [];
  const stairs = [], spans = [], used = new Set(), platforms = new Map();   // (cells taken; a platform's cells -> its level)
  // the street's stair: on the quay's back row, from its foot up to its top on a tongue of the
  // upper town
  {
    const z = upZ + INN_STAIR.z, line = Array.from({ length: INN_STAIR.top - INN_STAIR.foot - 1 }, (_, k) => cell(px + INN_STAIR.foot + 1 + k, z));
    tongue.add(cell(px + INN_STAIR.top, z)); tongue.add(cell(px + INN_STAIR.top + 1, z));
    stairs.push({ foot: cell(px + INN_STAIR.foot, z), top: cell(px + INN_STAIR.top, z), d: 0, cells: line });
    for (const c of [...line, cell(px + INN_STAIR.foot, z)]) used.add(c);
  }
  // In some worlds a landing stage under the cliff in the pet shop's tile: from the lower town's
  // shore a bridge out over the water to a pier on the seam, a bridge on to the cliff's foot, and a
  // stair up along its foot to a tongue of the upper town, beside the seam (the cliff straight
  // there). Its cells dry at the lower town's level (`stage`), its bridges and stair runs.
  const stage = new Set(), crossings = [];
  if (across > 2 && R() < .5 && stages) {
    const i = mid + 1, fx = i * N + 10, tx = fx - 9, z = upZ + WATER_TO - 1;
    for (let x = tx; x <= fx + 1; x++) edge[x] = upZ + WATER_TO;
    tongue.add(cell(tx, z));
    const line = Array.from({ length: fx - tx - 1 }, (_, k) => cell(fx - 1 - k, z));
    stairs.push({ foot: cell(fx, z), top: cell(tx, z), d: 1, cells: line });
    for (const c of [...line, cell(fx, z)]) stage.add(c);
    for (const c of [cell(fx, upZ - 1), cell(fx + 1, upZ - 1), cell(fx, upZ), cell(fx + 1, upZ)]) platforms.set(c, lower);
    crossings.push({ from: cell(fx, from - 1), to: cell(fx, upZ - 1), cells: Array.from({ length: upZ - from - 1 }, (_, k) => cell(fx, from + k)), d: 2 });
    crossings.push({ from: cell(fx, upZ), to: cell(fx, z), cells: Array.from({ length: z - upZ - 1 }, (_, k) => cell(fx, upZ + 1 + k)), d: 2 });
    features.push({ kind: 'stage', x: fx + .5, z: z + .5 });
    for (const c of [...stage, cell(tx, z), cell(tx, z + 1), cell(tx, z + 2), cell(tx + 1, z + 1), ...crossings.flatMap(r => [r.from, r.to, ...r.cells])]) used.add(c);
  }
  // (the gorge's cells, below: lake water down in the upper town)
  const gorge = new Set();
  const inWater = (x, z) => z >= from && z < edge[x] && !quay(x, z) && !stage.has(cell(x, z)) && !tongue.has(cell(x, z));
  const base = (x, z) => tongue.has(cell(x, z)) || (z >= edge[x] && !gorge.has(cell(x, z))) ? upper : lower;
  // A pier where the street crosses the seam in the water (dry, at the lower town's level: a bridge
  // either side of it, world/town.js lays the street over them)
  const piers = [cell(px + Math.floor(STREET_X), upZ - 1), cell(px + Math.floor(STREET_X) + 1, upZ - 1), cell(px + Math.floor(STREET_X), upZ), cell(px + Math.floor(STREET_X) + 1, upZ)];
  for (const c of piers) platforms.set(c, lower);

  // ---- where the big things lie (the tiles' corners)
  const back = deep - 1, right = across - 1;
  // (in a world with a gorge, below, the hill stands in the other back corner: the gorge runs on
  // into the grove)
  const gorgy = across > 1 && deep > UP + 1 && R() < .55;
  const hillI = gorgy || R() < .5 ? right : 0, hollowI = R() < .5 ? 0 : right;
  const inTile = (i, j, x, z) => [i * N + (i === right && i !== 0 ? N - x : x), j * N + z];
  const hill = (() => {
    const [x, z] = inTile(hillI, back, 7.6 + jit(.8), 7.4 + jit(.8)), r0 = 2.6 + R() * .5, top = upper + 4 + Math.floor(R() * 2);
    // (a broad low mound rising gently, a peak steeper: a level a cell from its foot to its flat top,
    // as the hill, but higher, cut off where its foot would reach further)
    if (landscape.hill === 'mound') return { tile: [hillI, back], x, z, top: upper + 3, r0, r1: r0 + 5, slope: .6, kind: 'mound' };
    if (landscape.hill === 'peak') return { tile: [hillI, back], x, z, top: upper + 6 + Math.floor(R() * 2), r0: 2.6, r1: 2.6 + 5.5, kind: 'peak' };
    return { tile: [hillI, back], x, z, top, r0, r1: r0 + 5, kind: 'hill' };
  })();
  const hollow = (() => {
    const [x, z] = inTile(hollowI, 0, 8.4 + jit(.7), 8.4 + jit(.7)), r0 = 2.8 + R() * .5;
    // (a quarry deeper, its bottom wider; a dell with a pool at its bottom, on the far side from the
    // town's middle)
    if (landscape.hollow === 'quarry') return { tile: [hollowI, 0], x, z, bottom: lower - 4, r0: r0 + .4, r1: r0 + 4.2, kind: 'quarry', ramp: Math.atan2(D * .6 - z, W / 2 - x) };
    if (landscape.hollow === 'pond') return { tile: [hollowI, 0], x, z, bottom: lower - 2, r0: r0 + .6, r1: r0 + 2.6, kind: 'pond' };
    return { tile: [hollowI, 0], x, z, bottom: lower - 3, r0, r1: r0 + 3, kind: 'dell' };
  })();
  const middle = [W / 2, D * .6];
  const pieces = [0, right].map(i => {
    if (i === hillI) {
      const a = Math.atan2(middle[1] - hill.z, middle[0] - hill.x) + jit(.5), d = hill.r0 + 3;
      return { tile: [i, back], x: hill.x + Math.cos(a) * d, z: hill.z + Math.sin(a) * d, level: upper + 2, r0: 2.6, r1: 4.6 };
    }
    // (by the gorge: off it, on its far side from the wall)
    if (gorgy && i === 0) { const [x, z] = inTile(i, back, 12.6 + jit(.3), 10 + jit(.5)); return { tile: [i, back], x, z, level: upper + 1, r0: 2, r1: 3.4 }; }
    const [x, z] = inTile(i, back, 8 + jit(1), 8.5 + jit(1));
    return { tile: [i, back], x, z, level: upper + 1, r0: 2.2, r1: 4 };
  });
  // ---- what stands for good (the buildings, their streets, lanes and paths, the people, the
  // crash...: world/town.js), before the town is laid out round the big things: the river keeps off it
  const fixedDist = new Float64Array(W * D);
  for (let c = 0; c < W * D; c++) { const [x, z] = xz(c); let d = Infinity; for (const k of fixedKeep) d = Math.min(d, keepDistance(k, x + .5, z + .5)); fixedDist[c] = d; }
  // (what the river keeps off: a cell what stands for good is in, or right beside)
  const fixedKept = c => fixedDist[c] < .5;

  // ---- the gorge, in some worlds: from the back of the lake's bay on into the upper town, GORGE
  // cells wide, winding a cell now and then (but straight across a seam), as deep as the lake: the
  // cliff on both sides; a stream falls into its head (below) and spans cross it
  const GORGE = 3;
  let gorgeHead = null;
  if (gorgy) {
    // (from where the bay is deepest, on the wall's side of the garden)
    const lo = WALL + 3, hi = WALL + 5;
    const xs = Array.from({ length: hi - lo + 1 }, (_, k) => lo + k), deepest = x => Math.min(edge[x], edge[x + 1], edge[x + 2]);
    let x0 = xs.sort((a, b) => deepest(b) - deepest(a) + (R() - .5) * 1.5)[0];
    const z0 = Math.min(edge[x0], edge[x0 + 1], edge[x0 + 2]), rows = [];
    let far = z0 + 8 + Math.floor(R() * 14);
    for (const s of seamZ) if (far >= s - 3 && far <= s + 2) far = s + 3;
    // (a row it may take: off the hill, the set pieces, what stands for good, inside the wall)
    const fits = (x0, z) => z < D - 1 - WALL - 3 && [0, 1, 2, -1, 3].every(o => {
      const x = x0 + o, c = cell(x, z);
      return Math.hypot(x + .5 - hill.x, z + .5 - hill.z) > hill.r1 + 1.5 && pieces.every(p => Math.hypot(x + .5 - p.x, z + .5 - p.z) > p.r1 + 1)
        && fixedDist[c] > 1.5 && !insideBox(x + .5, z + .5, 1.2);
    });
    const nearSeam = z => seamZ.some(s => z >= s - 3 && z <= s + 2);
    for (let z = z0; z <= far && fits(x0, z); z++) {
      rows.push({ z, x0 });
      if (!nearSeam(z) && !nearSeam(z + 1) && R() < .3) {
        const nx = x0 + (R() < .5 ? -1 : 1);
        if (nx >= lo && nx <= hi && fits(nx, z + 1)) x0 = nx;
      }
    }
    // (never ending by a seam: before it or well past it; and with room behind its head for the
    // stream to come to it straight, three cells)
    const behind = ({ z, x0 }) => [1, 2, 3].every(k => { const x = x0 + 1.5, zz = z + k + .5;
      return zz < D - 1 - WALL && Math.hypot(x - hill.x, zz - hill.z) > hill.r1 + 1 && pieces.every(p => Math.hypot(x - p.x, zz - p.z) > p.r1 + .5) && !insideBox(x, zz, 1.3); });
    while (rows.length && (nearSeam(rows.at(-1).z) || !behind(rows.at(-1)))) rows.pop();
    if (rows.length && rows.at(-1).z - z0 >= 5) {
      for (const { z, x0 } of rows) for (let x = x0; x < x0 + GORGE; x++) if (z >= edge[x]) gorge.add(cell(x, z));
      const end = rows.at(-1);
      gorgeHead = { x: end.x0 + 1, z: end.z, rows };
      features.push({ kind: 'gorge', x: end.x0 + 1.5, z: (z0 + end.z) / 2 + .5, rows: rows.length });
    }
  }
  const gorgeAt = (x, z) => gorge.has(cell(x, z));
  // (in each tile it reaches into, a ledge along one of its sides a level over its water, two cells
  // long: a way out of the water in that tile, physics/swimout.js)
  const ledge = new Set();
  if (gorgeHead) for (let j = UP; j < deep; j++) {
    const rows = gorgeHead.rows.filter(r => Math.floor(r.z / N) === j && r.z < gorgeHead.z && seamZ.every(s => r.z < s - 1 || r.z > s));
    const pairs = rows.filter((r, k) => rows[k + 1]?.z === r.z + 1 && rows[k + 1].x0 === r.x0);
    if (!pairs.length) continue;
    const r = pairs[Math.floor(R() * pairs.length)], x = R() < .5 ? r.x0 : r.x0 + GORGE - 1;
    for (const z of [r.z, r.z + 1]) ledge.add(cell(x, z));
  }

  // ---- the spans. Over the lake: from the upper town's edge on the lake's far side down over the
  // water to a rock standing in it on the seam, and on down to the lower town's shore (or a cell or
  // two on into it); now and then two of them. Over the gorge: from rim to rim, level, high over
  // its water. Each a run in a tile (a run never crosses a seam).
  // (how a span is built: a style of the town's, BRIDGE_STYLES, themes/builds.js; now and then the
  // same as the last one; and whether the next one over the lake stands on a tall pillar)
  const SPAN_STYLES = ['rope', 'chain', 'plank', 'stone', 'iron', 'flags'];
  let lastStyle = null;
  const spanStyle = (level = false) => (lastStyle = lastStyle && R() < .4 ? lastStyle : pick3(R, level ? [...SPAN_STYLES, 'rockarch'] : SPAN_STYLES));
  const tallNext = () => K() < .7;
  const take = (sp, w = [-1, 0, 1]) => { spans.push(sp); for (const c of [sp.top, sp.land, ...sp.cells]) for (const o of w) used.add(c + o); };
  const lakeSpan = (avoid = [], wantTall = false) => {
    // (where the lake is deepest, by its middle; off the gorge's mouth and another span)
    // (its top on the cliff's edge, the cliff beside it no further back)
    const xs = Array.from({ length: N - 4 - WALL }, (_, k) => WALL + 2 + k).sort((a, b) => edge[b] - edge[a] + Math.abs(a - 7) * .3 - Math.abs(b - 7) * .3 + (R() - .5) * 3);
    for (const x of xs) {
      const top = edge[x], shore = from - 1;
      if (edge[x + 1] > top || edge[x - 1] > top || top - upZ < 6 || insideBox(x + .5, shore + .5, .8) || insideBox(x + .5, top + .5, .8)) continue;
      if ([-1, 0, 1].some(o => gorgeAt(x + o, top) || gorgeAt(x + o, top + 1) || used.has(cell(x + o, top))) || avoid.some(a => Math.abs(a - x) < 4)) continue;
      // (on into the lower town, where nothing stands for good)
      let land = shore;
      for (let k = Math.floor(R() * 3); k > 0; k--) {
        const z = land - 1;
        if ([-1, 0, 1].some(o => fixedDist[cell(x + o, z)] < 1) || insideBox(x + .5, z + .5, 1) || strip(x, z)) break;
        land = z;
      }
      const rock = [cell(x, upZ - 1), cell(x + 1, upZ - 1), cell(x, upZ), cell(x + 1, upZ)];
      // (a rock standing on the line from the top to the shore; or, `tall`, a pillar of rock most of
      // the way up, the span down from it long, far on into the lower town, high over a way it
      // passes: never steeper than LH * 1.45 a cell, a body's room and more over the way)
      let p = lower + Math.round((upper - lower) * (upZ - 1 - land) / (top - land)), tall = false;
      if (wantTall) for (let far = shore - 9; far < shore && !tall; far++) {
        const run = upZ - 1 - far, high = lower + Math.min(Math.round((upper - lower) * (.62 + K() * .18)), Math.floor(1.45 * run));
        const deck = z => lower + (high - lower) * (z - far) / run;
        // (landing on free ground, or on a way: a road to it)
        const onWay = fixedWays.some(w => keepDistance({ seg: [w.a, w.b], r: w.w / 2 + .1 }, x + .5, far + .5) < 0);
        const fits = (fixedDist[cell(x, far)] > 1.2 || onWay) && [-1, 0, 1].every(o => side(x + o, far) === 0) && !insideBox(x + .5, far + .5, onWay ? .4 : 1) && !strip(x, far)
          && Array.from({ length: shore - far }, (_, k) => far + 1 + k).every(z => !strip(x, z) && !insideBox(x + .5, z + .5, .3)
            && (fixedDist[cell(x, z)] > 1 || deck(z) - lower >= 5 || z <= far + 1));
        if (fits && high - lower >= (upper - lower) * .4) { land = far; p = high; tall = true; }
      }
      if (wantTall && !tall) continue;
      const style = spanStyle(), pair = { tall, style };
      // (a tall one over a deep bay: a second pillar out in the bay, higher still, a span between the
      // two; never by a seam)
      const zA = upZ + 1 + Math.floor((top - upZ - 3) / 2), pA = p + Math.round((upper - p) * (zA - upZ + .5) / (top - upZ)) + 1;
      const twice = tall && top - upZ >= 9 && [zA, zA + 1].every(z => [x, x + 1].every(v => inWater(v, z) && !gorgeAt(v, z) && !strip(v, z)))
        && upper - pA <= 1.45 * (top - zA - 1) && pA - p <= 1.45 * (zA - upZ);
      if (twice) {
        take({ kind: 'lake', top: cell(x, top), land: cell(x, zA + 1), cells: Array.from({ length: top - zA - 2 }, (_, k) => cell(x, top - 1 - k)), d: 3, ...pair });
        take({ kind: 'lake', top: cell(x, zA), land: cell(x, upZ), cells: Array.from({ length: zA - upZ - 1 }, (_, k) => cell(x, zA - 1 - k)), d: 3, ...pair });
        for (const c of [cell(x, zA), cell(x + 1, zA), cell(x, zA + 1), cell(x + 1, zA + 1)]) platforms.set(c, pA);
      } else take({ kind: 'lake', top: cell(x, top), land: cell(x, upZ), cells: Array.from({ length: top - upZ - 1 }, (_, k) => cell(x, top - 1 - k)), d: 3, ...pair });
      // (the span down from a tall pillar: what is under it on the lower town's ground stays as it is,
      // a way under it free)
      take({ kind: 'lake', top: cell(x, upZ - 1), land: cell(x, land), cells: Array.from({ length: upZ - 2 - land }, (_, k) => cell(x, upZ - 2 - k)), d: 3, ...pair },
        tall ? [0] : undefined);
      for (const c of rock) platforms.set(c, p);
      features.push({ kind: 'span', x: x + .5, z: (top + land) / 2 + .5, tall });
      return x;
    }
    return null;
  };
  {
    // (a tall one where one fits, if it is to be, else as they always were)
    const span = avoid => (tallNext() ? lakeSpan(avoid, true) : null) ?? lakeSpan(avoid);
    const first = span([]);
    if (first !== null && R() < (gorgeHead ? .3 : stage.size ? .2 : .55)) span([first]);
  }
  if (gorgeHead) {
    // (across rows of it three cells wide, off its mouth and its head and the seams; a rim each side)
    const ok = ({ z, x0 }) => {
      const a = cell(x0 - 1, z), b = cell(x0 + GORGE, z);
      if (!seamZ.every(s => Math.abs(z + .5 - s) > 2.5) || z < gorgeHead.rows[0].z + 2 || z > gorgeHead.z - 1) return false;
      if (![0, 1, 2].every(o => gorgeAt(x0 + o, z)) || gorgeAt(x0 - 1, z) || gorgeAt(x0 + GORGE, z) || z < edge[x0 - 1] || z < edge[x0 + GORGE]) return false;
      return ![a, b].some(c => used.has(c) || side(...xz(c)) > 0 || insideBox(c % W + .5, Math.floor(c / W) + .5, .8));
    };
    const rows = gorgeHead.rows.filter(ok).sort(() => R() - .5), taken = [];
    for (const r of rows) {
      if (taken.length >= 1 + (R() < .5 ? 1 : 0) || taken.some(t => Math.abs(t - r.z) < 4)) continue;
      take({ kind: 'gorge', top: cell(r.x0 - 1, r.z), land: cell(r.x0 + GORGE, r.z), cells: Array.from({ length: GORGE }, (_, k) => cell(r.x0 + k, r.z)), d: 0, style: spanStyle(true) }, [-W, 0, W]);
      features.push({ kind: 'span', x: r.x0 + 1.5, z: r.z + .5 });
      taken.push(r.z);
    }
  }
  // a strand under the cliff here and there (in threes, one at least in each tile with no quay): a
  // way out of the water, not under the span nor by a seam
  const strand = new Set();
  for (let i = 0; i < across; i++) {
    if (i === mid) continue;
    // (three cells wide, anywhere along the cliff, none overlapping another, off the spans; two
    // where there is no room for three, under a span if it must: high over it there)
    const foot = (xs, off) => xs.every(x => edge[x] - 1 >= upZ + 1 && !strip(x, edge[x] - 1) && side(x, edge[x] - 1) === 0 && x > WALL + 1 && x < W - 2 - WALL
      && !off.some(o => used.has(cell(x + o, edge[x] - 1))) && ![-1, 0, 1].some(o => gorgeAt(x + o, edge[x])));
    let blocks = [];
    for (const [wide, off] of [[3, [-1, 0, 1]], [2, [0]], [2, []]]) {
      for (let x0 = i * N + 1; x0 + wide < (i + 1) * N - 1; x0++) {
        const xs = Array.from({ length: wide }, (_, k) => x0 + k);
        if (!(blocks.length && blocks.at(-1).at(-1) >= x0) && foot(xs, off)) blocks.push(xs);
      }
      if (blocks.length) break;
    }
    const take = blocks.filter(() => R() < .45);
    if (!take.length && blocks.length) take.push(blocks[Math.floor(R() * blocks.length)]);
    for (const xs of take) for (const x of xs) strand.add(cell(x, edge[x] - 1));
  }
  const structureCells = [...used];

  // the lake: the water's broad part, in the garden (and the gorge on from it)
  const lakeTile = [0, Math.min(UP, deep - 1)];
  const lake = { tile: lakeTile, x: N * .45, z: upZ + lakeDeep / 2 - 1, rx: 3, rz: 2.5, islet: [] };
  // ---- the water
  const water = new Map();   // cell -> { surf, bed, lake }
  const falls = [];          // { c (the cell it falls into), d (DIRS4: the way it flows), top, bot }
  const lakeSet = new Set();
  for (let z = from; z < D; z++) for (let x = 0; x < W; x++) if (inWater(x, z) && !platforms.has(cell(x, z)) && !strand.has(cell(x, z))) lakeSet.add(cell(x, z));
  for (const c of gorge) if (!ledge.has(c)) lakeSet.add(c);
  lake.cells = [...lakeSet];
  const surfOf = c => base(...xz(c)) - WATER_DROP;
  // (shallow along its shores, deep from two cells out)
  for (const c of lakeSet) {
    const near = r => { const [x, z] = xz(c); for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const n = cell(x + dx, z + dz); if (x + dx >= 0 && x + dx < W && z + dz >= 0 && z + dz < D && !lakeSet.has(n)) return true; } return false; };
    water.set(c, { surf: lower - WATER_DROP, bed: lower - WATER_DROP - (near(1) ? 1 : 2), lake: true });
  }
  // The river: the cheapest way in from the town's back side to the water, over the cliff's edge
  // (straight down its wall, where the wall runs straight: its fall); off what is kept but where it
  // crosses a way (straight across: a bridge), off the hill, the stair and the span; across a seam
  // only straight, never along one. In some worlds a stream too: into the gorge's head, falling
  // into it, or else over the cliff elsewhere.
  const ways = fixedWays;
  const onWay = (x, z) => ways.find(w => keepDistance({ seg: [w.a, w.b], r: w.w / 2 + .6 }, x + .5, z + .5) < 0);
  const along = (a, b) => {
    const [ax, az] = xz(a), [bx, bz] = xz(b);
    if (ax !== bx) return Math.min(offSeam(az, seamZ), offSeam(bz, seamZ)) <= 1;
    return Math.min(offSeam(ax, seamX), offSeam(bx, seamX)) <= 1;
  };
  const shut = c => {
    const [x, z] = xz(c);
    if (((x < 1 || x >= W - 1) && base(x, z) === upper) || used.has(c) || tongue.has(c) || insideBox(x + .5, z + .5, 1.2)) return true;
    // (in through the wall only from the back, between its towers: under an arch, straight on)
    if (side(x, z) > 0 && !(z >= D - 1 - WALL && x >= WALL + 2 && x <= W - 3 - WALL)) return true;
    if (Math.hypot(x + .5 - hill.x, z + .5 - hill.z) < hill.r1 + .5 || Math.hypot(x + .5 - hollow.x, z + .5 - hollow.z) < hollow.r1 + 1) return true;
    if (pieces.some(p => Math.hypot(x + .5 - p.x, z + .5 - p.z) < p.r1)) return true;
    return z < 3 && Math.abs(x + .5 - gate[0]) < 5;
  };
  // (an upper cell beside the lower town: water there would stand over the wall, but at a lip: where
  // the wall runs straight for the river's two cells and one either side, the river falling over it;
  // or the gorge's head, the stream falling into its middle)
  const rim = c => { const [x, z] = xz(c); return base(x, z) === upper && DIRS4.some(([dx, dz]) => x + dx >= 0 && x + dx < W && z + dz >= 0 && z + dz < D && base(x + dx, z + dz) === lower); };
  const cliffLip = (c, roomy = true) => { const [x, z] = xz(c); return rim(c) && z === edge[x] && x > 1 && x < W - 2 && [-1, 0, 1].every(o => edge[x + o] === z && !gorgeAt(x + o, z) && lakeSet.has(cell(x + o, z - 1))) && !strip(x, z) && !strip(x, z - 1) && !tongue.has(c - 1) && !tongue.has(c + 1)
    && (!roomy || [-1, 1].some(o => !shut(c + o) && !(fixedKept(c + o) && !onWay(x + o, z)) && base(x + 2 * o, z) === upper && !lakeSet.has(c + 2 * o))); };   // (room for its second cell beside it)
  const headLip = c => !!gorgeHead && c === cell(gorgeHead.x, gorgeHead.z + 1);
  const flow = (lip, starts, into) => {
    const enter = (n, c, p) => {
      if (shut(n) || along(c, n) || (water.has(n) && !lakeSet.has(n))) return Infinity;
      const [nx, nz] = xz(n), [cx] = xz(c);
      if ((side(nx, nz) > 0 || side(...xz(c)) > 0) && n !== c - W) return Infinity;
      if (base(nx, nz) > base(...xz(c))) return Infinity;
      // (down the escarpment: from a lip straight over its edge, come to it straight)
      if (rim(n) && !(lip(n) && c === n + W && p === c + W)) return Infinity;
      if (lip(c) && n !== c - W) return Infinity;
      // (and nowhere beside another's water: they never run into each other)
      if (DIRS4.some(([dx, dz]) => { const m = cell(nx + dx, nz + dz); return water.has(m) && !lakeSet.has(m); })) return Infinity;
      const way = fixedKept(n) ? onWay(nx, nz) : null;
      if (fixedKept(n) && !way) return Infinity;
      if (way && (way.a[0] === way.b[0]) === (nx === cx)) return Infinity;   // (across a way, not along it)
      const w = wander(nx * .37 + 11, nz * .37 + 11);
      return 1 + 4 * w * w + (way ? 3 : 0);
    };
    const path = cheapest(W, D, starts, c => into(c),
      (n, c, p) => into(n) ? (lip(c) && n === c - W && p === c + W ? 1 : Infinity) : lakeSet.has(n) ? Infinity : enter(n, c, p),
      c => { const [x, z] = xz(c); return Math.max(0, z - edge[x]); });
    if (!path) return [];
    const bed = path.filter(c => !into(c));
    // two cells wide: each cell's neighbour to its right, as it flows (the way it crosses a way
    // along the way: the bridge goes over both)
    const wide = [];
    for (const [i, c] of bed.entries()) {
      const n = bed[i + 1] ?? c, p = bed[i - 1] ?? c, [x, z] = xz(c), [ax, az] = xz(n === c ? c : n), [bx, bz] = xz(p === c ? c : p);
      const fx = Math.sign((ax - bx) || 0), fz = Math.sign((az - bz) || 0);
      const fits = side => {
        const [sx, sz] = xz(side);
        return !bed.includes(side) && !wide.includes(side) && !lakeSet.has(side) && !water.has(side) && !shut(side) && base(sx, sz) === base(x, z)
          && !(fixedKept(side) && !onWay(sx, sz)) && strip(sx, sz) === strip(x, z) && (!rim(side) || lip(c))
          // (over the edge: the cliff runs straight on past it too, its foot in the water)
          && (!lip(c) || (() => { const o = side + (side - c), [ox, oz] = xz(o); return base(ox, oz) === upper && !water.has(o); })());
      };
      // (on its left where its right is taken: by the wall, say)
      const side = [cell(x - fz, z + fx), cell(x + fz, z - fx)].find(fits);
      if (side !== undefined) wide.push(side);
    }
    for (const c of [...bed, ...wide]) water.set(c, { surf: surfOf(c), bed: surfOf(c) - 1, lake: false });
    return bed;
  };
  const backRow = keep => { const out = []; for (let x = WALL + 2; x < W - 2 - WALL; x++) if (!shut(cell(x, D - 1)) && ![-1, 0, 1].some(o => water.has(cell(x + o, D - 1))) && offSeam(x, seamX) > 1 && keep(x)) out.push(cell(x, D - 1)); return out; };
  const streams = [];
  if (gorgeHead) {
    // (from the back on the gorge's side, falling into its head)
    const s = flow(headLip, backRow(x => x < W / 2), c => gorge.has(c));
    if (s.length) { streams.push(s); features.push({ kind: 'stream', x: gorgeHead.x + .5, z: gorgeHead.z + 1.5 }); }
  }
  let river = [];
  {
    // (in from the back of the town on the other side of it from the lake: down its cliff in sight)
    // (and down the cliff now by the town's wall, now nearer its middle, or wherever it comes)
    const starts = backRow(() => true), right = x => x > W / 2 + 4, at = pick3(R, ['wall', 'middle', 'any']);
    const lipAt = c => cliffLip(c) && (at === 'wall' ? c % W >= W - N + 9 : at === 'middle' ? c % W < W - N + 7 : true);
    const east = starts.some(c => right(c % W)) ? starts.filter(c => right(c % W)) : starts, into = c => lakeSet.has(c) && !gorge.has(c);
    for (const [lip, from] of [[lipAt, east], [cliffLip, east], [cliffLip, starts], [c => cliffLip(c, false), starts]]) if (!river.length) river = flow(lip, from, into);
    if (river.length) features.push({ kind: 'river', x: river.at(-1) % W + .5, z: Math.floor(river.at(-1) / W) + .5 });
  }
  // (the landing stage left the river nowhere to come down: the stream into the gorge is the
  // river, or else the land without the stage)
  if (!river.length && streams.length) river = streams.shift();
  if (!river.length && stage.size) return makeLand(seed, opts, { stages: false });
  streams.unshift(river);
  if (!gorgeHead && R() < .6) {
    const s = flow(cliffLip, backRow(x => x < W / 2 - 4), c => lakeSet.has(c));
    if (s.length) { streams.push(s); features.push({ kind: 'stream', x: s.at(-1) % W + .5, z: Math.floor(s.at(-1) / W) + .5 }); }
  }
  // where they come down the escarpment: a fall from each cell over its edge, a deep pool under it
  for (const c of water.keys()) {
    const up = c + W;
    if (water.has(up) && water.get(up).surf > water.get(c).surf) {
      falls.push({ c, d: 3, top: water.get(up).surf, bot: water.get(c).surf });
      water.get(c).bed = water.get(c).surf - 2;
    }
  }
  // ---- the mill, in most worlds: on a bank of the river (or a stream) where it runs straight on
  // for three cells, well up from its fall, on level ground of its own; its wheel in the water
  // beside it (world/town.js: MILL), turning
  let mill = null;
  if (R() < .75) {
    // (its body: the mill's bounds but its axle, blender/town_homes.py; turned by a quarter turn
    // yaw (its +X, the axle's side, to the river), as world/town.js turns a building)
    const BODY = [-1.45, -1.37, 1.4, 1.75];
    const bodyAt = (mx, mz, yaw) => {
      const c = Math.round(Math.cos(yaw)), sn = Math.round(Math.sin(yaw));
      const pts = [[BODY[0], BODY[1]], [BODY[2], BODY[1]], [BODY[0], BODY[3]], [BODY[2], BODY[3]]].map(([u, v]) => [mx + u * c + v * sn, mz - u * sn + v * c]);
      return { x0: Math.min(...pts.map(p => p[0])), z0: Math.min(...pts.map(p => p[1])), x1: Math.max(...pts.map(p => p[0])), z1: Math.max(...pts.map(p => p[1])) };
    };
    const over = (b, g, test) => { for (let z = Math.floor(b.z0 - g); z <= Math.floor(b.z1 + g); z++) for (let x = Math.floor(b.x0 - g); x <= Math.floor(b.x1 + g); x++) if (!test(x, z)) return false; return true; };
    const river = c => water.get(c)?.lake === false;
    const spots = [];
    // (where it flows along z, the mill beside it east or west; along x, north or south: [along, across])
    for (const [ax, az, bx, bz] of [[0, 1, 1, 0], [1, 0, 0, 1]]) for (const bed of streams) for (const c of bed) {
      const [x, z] = xz(c);
      // (the river's cells across it here, t along it: [first, last] of their offsets)
      const run = t => { const x0 = x + ax * t, z0 = z + az * t; if (!river(cell(x0, z0))) return null; let a = 0, b = 0;
        while (river(cell(x0 + bx * (a - 1), z0 + bz * (a - 1)))) a--; while (river(cell(x0 + bx * (b + 1), z0 + bz * (b + 1)))) b++; return [a, b]; };
      const here = run(0);
      if (!here || [-2, -1, 1, 2].some(t => String(run(t)) !== String(here)) || falls.some(f => Math.abs(f.c % W - x) < 4 && Math.abs(Math.floor(f.c / W) - z) < 4)) continue;
      for (const sd of [1, -1]) {
        // (the bank's edge across the river from c, and the mill a cell and a half off it)
        const e = sd > 0 ? here[1] + 1 : here[0], ex = x + bx * e, ez = z + bz * e;
        const mx = (bx ? ex : x + .5) + bx * sd * 1.5, mz = (bz ? ez : z + .5) + bz * sd * 1.5;
        // (its +X towards the river: -sd along the across axis)
        const yaw = bx ? (sd > 0 ? Math.PI : 0) : (sd > 0 ? Math.PI / 2 : -Math.PI / 2), body = bodyAt(mx, mz, yaw);
        const ok = over(body, .05, (nx, nz) => { const n = cell(nx, nz); return nx >= 0 && nz >= 0 && nx < W && nz < D && !water.has(n) && !used.has(n) && !tongue.has(n) && !shut(n)
            && fixedDist[n] > .8 && !gorgeAt(nx, nz) && base(nx, nz) === base(x, z); })
          && over(body, .3, (nx, nz) => side(nx, nz) === 0)
          // (SEAM_CLEAR off the seams, world/town.js, and a cell more: the ground by a seam stands as
          // on its other side)
          && seamX.every(sx => body.x0 - 1.95 > sx || body.x1 + 1.95 < sx) && seamZ.every(sz => body.z0 - 1.95 > sz || body.z1 + 1.95 < sz);
        if (ok) spots.push({ mx, mz, yaw, wx: mx - bx * sd * 1.67, wz: mz - bz * sd * 1.67, body, level: base(x, z) });
      }
    }
    if (spots.length) {
      const s = spots[Math.floor(R() * spots.length)];
      mill = { x: s.mx, z: s.mz, yaw: s.yaw, wheel: { x: s.wx, z: s.wz }, level: s.level, box: s.body };
      // (its ground and a cell round it level: pinned so, cubegen/smooth.js)
      over(s.body, 1, (x, z) => { const c = cell(x, z); if (!water.has(c) && base(x, z) === s.level && side(x, z) === 0 && !strip(x, z)) used.add(c); return true; });
      features.push({ kind: 'mill', x: s.mx, z: s.mz });
    }
  }
  // ---- old ruins, in most worlds: what stood here before the town, on wild ground off everything
  // (a temple's gate among broken columns, a colossus's head, a colonnade): RUINS kinds, dressed by
  // world/town.js; on the upper town's edge over the cliff, or out in the lower town
  let ruins = null;
  if (R() < .7) {
    const kind = pick3(R, RUINS), spots = [];
    for (let z = WALL + 4; z < D - WALL - 4; z++) for (let x = WALL + 4; x < W - WALL - 4; x++) {
      const c = cell(x, z);
      if (fixedDist[c] < 2.6 || strip(x, z) || offSeam(x, seamX) < 3 || offSeam(z, seamZ) < 3) continue;
      if (Math.hypot(x + .5 - hill.x, z + .5 - hill.z) < hill.r1 + 3 || Math.hypot(x + .5 - hollow.x, z + .5 - hollow.z) < hollow.r1 + 3) continue;
      if (pieces.some(p => Math.hypot(x + .5 - p.x, z + .5 - p.z) < p.r1 + 3) || (mill && Math.hypot(x + .5 - mill.x, z + .5 - mill.z) < 5)) continue;
      let ok = true;
      for (let dz = -2; dz <= 2 && ok; dz++) for (let dx = -2; dx <= 2 && ok; dx++) {
        const n = cell(x + dx, z + dz);
        ok = !water.has(n) && !used.has(n) && !tongue.has(n) && base(x + dx, z + dz) === base(x, z) && !gorgeAt(x + dx, z + dz) && !insideBox(x + dx + .5, z + dz + .5, 2);
      }
      // (by the cliff's edge over the water, where it may: in sight from below)
      const brink = base(x, z) === upper && [3, 4].some(k => z - k >= 0 && base(x, z - k) === lower);
      if (ok) spots.push({ x: x + .5, z: z + .5, w: brink ? 8 : base(x, z) === upper ? 4 : 1 });
    }
    if (spots.length) {
      let r = R() * spots.reduce((a, s) => a + s.w, 0), s = spots[0];
      for (const q of spots) if ((r -= q.w) < 0) { s = q; break; }
      ruins = { kind, x: s.x, z: s.z, level: base(Math.floor(s.x), Math.floor(s.z)), r: 2.6 };
      features.push({ kind: 'ruins', x: s.x, z: s.z });
    }
  }
  // ---- the town's own style, from a dice of its own (what is drawn above stays as it is): how
  // many homes a tile has at most, how many short lanes there are, how many trees stand in the
  // open, firs or broadleaves, how many hedges and walls line the ways, garlands over the lanes,
  // homes on terraces, which trees line the avenues, how thick the ground cover grows
  const S = mulberry32(hash32(seed ^ 0x57e1e)), AVENUE_TREES = ['meadow_tree_round', 'meadow_tree_tall', 'town_tree_birch', 'town_tree_elm', 'town_tree_oak'];
  const style = {
    homes: 5 + Math.floor(S() * 5), lanes: 6 + Math.floor(S() * 7), park: .5 + S() * 1.2, firs: (S() - .5) * .35,
    hedges: .3 + S() * .7, garlands: .15 + S() * .6, terraces: .3 + S() * .7, cover: .8 + S() * .5,
    avenue: AVENUE_TREES.filter(() => S() < .6).concat(AVENUE_TREES[Math.floor(S() * AVENUE_TREES.length)]),
  };
  // ---- the town round them
  const layout = plan({ style, landscape, hill, hollow, lake, pieces, W, D, level, rows, inWall, levelAt: (x, z) => base(clamp(Math.floor(x), 0, W - 1), clamp(Math.floor(z), 0, D - 1)),
    avoid: [...structureCells.map(c => { const [x, z] = xz(c); return { x0: x, z0: z, x1: x + 1, z1: z + 1 }; }), ...mill ? [mill.box] : [],
      ...ruins ? [{ x0: ruins.x - ruins.r, z0: ruins.z - ruins.r, x1: ruins.x + ruins.r, z1: ruins.z + ruins.r }] : []],
    water: c => water.has(c), wet: [...water.keys()] });
  const keep = layout.keep;
  // (the ruins' ground level, a little round them)
  if (ruins) keep.push({ x: ruins.x, z: ruins.z, r: ruins.r - .6, level: ruins.level });
  // (the spans' ends on the land, a little round them: walked onto from the town, below)
  const spanEnds = spans.flatMap(sp => [sp.top, sp.land]).filter(c => !platforms.has(c));
  for (const c of spanEnds) { const [x, z] = xz(c); keep.push({ x: x + .5, z: z + .5, r: .8, level: base(x, z), span: true }); }
  // how far each cell lies from what is kept, and how far over its ground's level it is kept: a
  // home's terrace (`lift`) where it is the nearest, its path's ramp (`ramp`: its lift at the door,
  // none at the way) where that runs (the ramp's cells not pinned flat: cubegen/smooth.js slopes them)
  // (and how far from what keeps the ground level: a home only its own footing, its yard rolls)
  const kd = new Float64Array(W * D), kg = new Float64Array(W * D), kway = new Float64Array(W * D), lift = new Int8Array(W * D), ramped = new Uint8Array(W * D);
  // (and which shapes may be the nearest anywhere in the cell: those at most a cell's diagonal,
  // and a hair, further from its middle than the nearest; keepDistance changes no faster than
  // (x, z) moves)
  const nearKept = new Array(W * D), es = new Float64Array(keep.length);
  for (let c = 0; c < W * D; c++) {
    const [x, z] = xz(c), px = x + .5, pz = z + .5;
    let d = Infinity, near = null, ramp = null, g = Infinity, gw = Infinity;
    for (let n = 0; n < keep.length; n++) {
      const k = keep[n], e = es[n] = keepDistance(k, px, pz);
      g = Math.min(g, 'lift' in k ? e + k.r - .25 : e);
      if (!k.span) gw = Math.min(gw, 'lift' in k ? e + k.r - .25 : e);
      if (e < d) { d = e; near = k; }
      if (k.ramp && e < FLAT + .5 && (!ramp || e < ramp.e)) ramp = { k, e };
    }
    kd[c] = d; kg[c] = g; kway[c] = gw;
    nearKept[c] = keep.filter((_, n) => es[n] <= d + 1.5);
    // (the ramp where it is about as near as what is nearest: not under the home it leads up to)
    if (ramp && ramp.e <= d + .3) {
      const [[ax, az], [bx, bz]] = ramp.k.seg, dx = bx - ax, dz = bz - az;
      const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      lift[c] = Math.round(ramp.k.ramp * (1 - t)); ramped[c] = 1;
    } else if (near?.lift && d < FLAT + .5) lift[c] = near.lift;
    if (strip(x, z)) lift[c] = 0;   // (the seams stay as they are on both sides)
  }
  const kept = c => kg[c] < FLAT + .5;

  // ---- the marsh's ponds (the lower town's form `marsh`): round pools of shallow water in the wild
  // ground, waded, three to six of them, apart; off what is kept, the seams, the wall, the other
  // water, the hollow, the ruins and what is built
  const ponds = [];
  if (landscape.lower === 'marsh') {
    const dry = (x, z) => {
      const c = cell(x, z);
      if (x < WALL + 3 || z < WALL + 3 || x >= W - WALL - 3 || z >= from - 2 || base(x, z) !== lower) return false;
      if (kg[c] < 2.2 || offSeam(x, seamX) < 2 || offSeam(z, seamZ) < 2 || used.has(c) || platforms.has(c)) return false;
      if (Math.hypot(x + .5 - hollow.x, z + .5 - hollow.z) < hollow.r1 + 1.5 || (ruins && Math.hypot(x + .5 - ruins.x, z + .5 - ruins.z) < ruins.r + 1.5)) return false;
      return ![-2, -1, 0, 1, 2].some(dz => [-2, -1, 0, 1, 2].some(dx => water.has(cell(x + dx, z + dz))));
    };
    const want = 3 + Math.floor(K() * 4), placed = [];
    for (let k = 0; k < 120 && placed.length < want; k++) {
      const x = WALL + 4 + K() * (W - 2 * WALL - 8), z = WALL + 4 + K() * (from - WALL - 7), r = 1.1 + K() * 1.3;
      if (placed.some(p => Math.hypot(p.x - x, p.z - z) < p.r + r + 2.5)) continue;
      const pool = [];
      let ok = true;
      for (let cz = Math.floor(z - r); cz <= Math.floor(z + r) && ok; cz++) for (let cx = Math.floor(x - r); cx <= Math.floor(x + r) && ok; cx++) {
        // (its rim a little ragged)
        if (Math.hypot(cx + .5 - x, cz + .5 - z) > r * (.85 + .3 * boggy(cx * .5, cz * .5))) continue;
        if (!dry(cx, cz)) ok = false; else pool.push(cell(cx, cz));
      }
      if (ok && pool.length >= 3) { placed.push({ x, z, r }); ponds.push(pool); }
    }
    for (const pool of ponds) for (const c of pool) water.set(c, { surf: lower - WATER_DROP, bed: lower - WATER_DROP - 1, lake: false, pond: true });
    if (ponds.length) features.push({ kind: 'marsh', ponds: ponds.length });
  }
  // (the hollow's pool: at its bottom, on its far side from the town's middle, a level under it)
  if (hollow.kind === 'pond') {
    const a = Math.atan2(hollow.z - middle[1], hollow.x - middle[0]), px = hollow.x + Math.cos(a) * 1.5, pz = hollow.z + Math.sin(a) * 1.5;
    for (let z = Math.floor(pz - 2); z <= pz + 2; z++) for (let x = Math.floor(px - 2); x <= px + 2; x++)
      if (Math.hypot(x + .5 - px, z + .5 - pz) < 1.2 && Math.hypot(x + .5 - hollow.x, z + .5 - hollow.z) < hollow.r0 - .2)
        water.set(cell(x, z), { surf: hollow.bottom - WATER_DROP, bed: hollow.bottom - WATER_DROP - 1, lake: false, pool: true });
    features.push({ kind: 'pool', x: px, z: pz });
  }

  // ---- the ground: each cell's level. The two towns; the wild ground rolling a level or two (none
  // where it is kept, coming in a level a cell); the hill, the hollow, the set pieces' knolls
  // The wild ground's relief in its band's form (levels over its band's, [height, lowest, highest]):
  // knolls; flat ground; broad swells; terraced fields, a step of two levels every few rows up
  // towards the back (their edges wandering, never by a seam); rocky knolls; a ridge along the
  // back; dells sunk into the ground
  const upper0 = upZ + WATER_TO + QUAY, steps = [];
  for (let z = upper0 + terraceFrom; z < D - WALL - 3; z += terraceStep) steps.push(seamZ.some(sz => Math.abs(z - sz) < 3) ? seamZ.find(sz => Math.abs(z - sz) < 3) + 3 : z);
  // (the rocky knolls where the ground is wildest, apart; the ridge along the longest wild line across
  // the upper town or down a side of it, off the seams)
  const wildAt = (x, z) => {
    const c = cell(clamp(Math.floor(x), 0, W - 1), clamp(Math.floor(z), 0, D - 1));
    return kg[c] > 3 && !water.has(c) && base(...xz(c)) === upper && Math.hypot(x - hill.x, z - hill.z) > hill.r1 + 1 && pieces.every(p => Math.hypot(x - p.x, z - p.z) > p.r1 + 1);
  };
  // (the longest run of wild cells along a line)
  const run = cells => { let best = 0, n = 0; for (const w of cells) { n = w ? n + 1 : 0; best = Math.max(best, n); } return best; };
  const knobAt = [], wilds = [];
  for (let z = upper0 + 3; z < D - WALL - 4; z++) for (let x = WALL + 4; x < W - WALL - 4; x++)
    if (offSeam(x, seamX) >= 3 && offSeam(z, seamZ) >= 3 && wildAt(x + .5, z + .5)) wilds.push([x + .5, z + .5, wob(x * .9 + 20, z * .9 + 20)]);
  for (const [x, z] of wilds.sort((a, b) => a[2] - b[2])) {
    const [, , top, r] = knobTries[knobAt.length];
    if (knobAt.length < knobCount && knobAt.every(k => Math.hypot(k.x - x, k.z - z) > 4.5)) knobAt.push({ x, z, top, r });
  }
  let ridge = { along: 'x', at: D - WALL - 7, score: -1 };
  for (let z = upper0 + 4; z < D - WALL - 5; z++) {
    if (offSeam(z, seamZ) < 3) continue;
    const score = run(Array.from({ length: W }, (_, x) => [z - 1, z, z + 1].every(v => wildAt(x + .5, v + .5))));
    if (score > ridge.score) ridge = { along: 'x', at: z + .5, score };
  }
  for (let x = WALL + 5; x < W - WALL - 5; x++) {
    if (offSeam(x, seamX) < 3) continue;
    const score = run(Array.from({ length: D - upper0 }, (_, k) => [x - 1, x, x + 1].every(v => wildAt(v + .5, upper0 + k + .5))));
    if (score > ridge.score) ridge = { along: 'z', at: x + .5, score };
  }
  function relief(form, x, z) {
    const r = roll(x * .09 + 5, z * .09 + 5) - .5, q = broad(x * .05 + 1, z * .05 + 1) - .5;
    switch (form) {
      case 'plateau': return [q * 6, 0, 1];
      case 'downs': return [q * 16 + r * 3, -1, 3];
      case 'terraces': {
        const at = z + Math.round((wob(x * .15, 7) - .5) * 4);
        return [2 * steps.filter(t => at >= t).length + r * 1.5, 0, 5];
      }
      case 'highland': {
        let h = r * 4;
        for (const k of knobAt) h = Math.max(h, k.top - Math.max(0, Math.hypot(x + .5 - k.x, z + .5 - k.z) - k.r) * 1.6);
        return [h, -1, 5];
      }
      case 'ridge': {
        const [u, v] = ridge.along === 'x' ? [x, z] : [z, x], at = ridge.at + (wob(u * .08, 3) - .5) * 6;
        return [Math.max(r * 3, ridgeTop * (1 - Math.abs(v + .5 - at) / 4)), -1, 5];
      }
      case 'green': return [r * 4 - .8, 0, 1];
      case 'orchard': return [q * 5, 0, 1];
      case 'marsh': return [r * 3, -1, 1];
      case 'dell': return [-(q * 10 + r * 5) - .4, -2, 1];
      case 'rocky': return [r * 13 + q * 4, -1, 3];
      default: return [r * 11, -1, 3];
    }
  }
  // (and what form a cell's ground is in: its band's)
  const formAt = (x, z) => base(clamp(Math.floor(x), 0, W - 1), clamp(Math.floor(z), 0, D - 1)) === upper ? landscape.upper : landscape.lower;

  const L = new Int16Array(W * D);
  for (let c = 0; c < W * D; c++) {
    const [x, z] = xz(c), b = base(x, z);
    // (in its form where nothing stands near, higher outside the wall; no more than a level up or
    // down towards the seams and the wall, level along the wall itself)
    const s = side(x, z), wallIn = Math.min(x - WALL, z - WALL, W - 1 - WALL - x, D - 1 - WALL - z);
    const fade = Math.min(clamp((Math.min(offSeam(x, seamX), offSeam(z, seamZ)) - 1) / 2, 0, 1), clamp((wallIn - 2) / 2, 0, 1));
    const hills = Math.round((roll(x * .09 + 5, z * .09 + 5) - .5) * 11);
    const [h, lo, hi] = relief(b === upper ? landscape.upper : landscape.lower, x, z);
    const shaped = clamp(Math.round(h), Math.max(lo, -1 + (lo + 1) * fade), Math.min(hi, 1 + (hi - 1) * fade));
    // (the rugged forms come up closer to what is kept: a terrace's wall or a knoll's foot by a way)
    const near = ['terraces', 'highland', 'ridge', 'rocky'].includes(b === upper ? landscape.upper : landscape.lower) ? [1.2, 1.2] : [1.4, 1.8];
    L[c] = b + (s === 1 ? 0 : Math.round(shaped * clamp((kg[c] - near[0]) / near[1], 0, 1)));
    // (outside the wall the forest's floor stands high, over a cliff along the road: it is not
    // walked into from the road)
    const road = z < WALL && Math.abs(x + .5 - gate[0]) < 1.6;
    if (s === 2 && !road) L[c] = b + 3 + clamp(hills + 1, 0, 3);
    const dh = Math.hypot(x + .5 - hill.x, z + .5 - hill.z), dl = Math.hypot(x + .5 - hollow.x, z + .5 - hollow.z);
    if (dh < hill.r1 && b === upper) L[c] = Math.max(L[c], hill.top - Math.max(0, Math.ceil((dh - hill.r0) * (hill.slope ?? 1))));
    // (a quarry's sides walls of stone, two levels a cell, but on its side towards the town's middle,
    // where a way comes down into it a level a cell)
    const steep = hollow.kind === 'quarry' && Math.abs(Math.atan2(Math.sin(Math.atan2(z + .5 - hollow.z, x + .5 - hollow.x) - hollow.ramp), Math.cos(Math.atan2(z + .5 - hollow.z, x + .5 - hollow.x) - hollow.ramp))) > .7;
    if (dl < hollow.r1 && b === lower && s !== 2) L[c] = Math.min(L[c], hollow.bottom + Math.max(0, Math.ceil(dl - hollow.r0)) * (steep ? 2 : 1));
    for (const p of pieces) {
      const d = Math.hypot(x + .5 - p.x, z + .5 - p.z);
      if (d < p.r1) L[c] = clamp(L[c], p.level - Math.max(0, Math.ceil(d - p.r0)), p.level + Math.max(0, Math.ceil(d - p.r0)));
    }
    if ((kept(c) && !(s === 2 && !road)) || used.has(c) || tongue.has(c)) L[c] = b + (kept(c) ? lift[c] : 0);
    if (platforms.has(c)) L[c] = platforms.get(c);
    if (ledge.has(c)) L[c] = lower;
  }

  // the banks: no lower than the water, beside it on its own ground's level
  for (const [c, w] of water) for (const n of [c + 1, c - 1, c + W, c - W]) {
    if (n < 0 || n >= W * D || water.has(n) || Math.abs((n % W) - (c % W)) > 1) continue;
    if (L[n] <= w.surf) L[n] = w.surf + WATER_DROP;
  }
  // (the cells beside a seam alike: the higher of them both)
  for (const s of seamX) for (let z = 0; z < D; z++) { const a = cell(s - 1, z), b = a + 1; if (!water.has(a) && !water.has(b)) L[a] = L[b] = Math.max(L[a], L[b]); }
  for (const s of seamZ) for (let x = 0; x < W; x++) { const a = cell(x, s - 1), b = a + W; if (!water.has(a) && !water.has(b)) L[a] = L[b] = Math.max(L[a], L[b]); }
  // (and the water beside one as deep either side)
  for (const [a, b] of [...seamX.flatMap(s => Array.from({ length: D }, (_, z) => [cell(s - 1, z), cell(s, z)])), ...seamZ.flatMap(s => Array.from({ length: W }, (_, x) => [cell(x, s - 1), cell(x, s)]))])
    if (water.has(a) && water.has(b)) water.get(a).bed = water.get(b).bed = Math.min(water.get(a).bed, water.get(b).bed);
  for (const [c, w] of water) L[c] = w.bed;

  // ---- the stairs and bridges (runs: from a floor, over cells, to a floor; d the way, DIRS4)
  const runs = [];
  for (const s of stairs) runs.push({ kind: 'stair', from: s.foot, to: s.top, cells: s.cells, d: s.d });
  for (const b of crossings) runs.push({ kind: 'bridge', from: b.from, to: b.to, cells: b.cells, d: b.d });
  // (each span in its own style, spanStyle above)
  for (const s of spans) runs.push({ kind: 'bridge', from: s.top, to: s.land, cells: s.cells, d: s.d, span: true, style: s.style });
  // a bridge where a way crosses the river: over its water along the way, bank to bank
  for (const w of layout.ways ?? []) {
    const [[ax, az], [bx, bz]] = [w.a, w.b], vertical = ax === bx, len = Math.round(Math.abs(vertical ? bz - az : bx - ax));
    if (len < 2) continue;
    const at = t => vertical ? cell(Math.floor(ax), Math.floor(Math.min(az, bz)) + t) : cell(Math.floor(Math.min(ax, bx)) + t, Math.floor(az));
    let t = 0;
    while (t < len) {
      if (!water.has(at(t))) { t++; continue; }
      let e = t;
      while (e + 1 < len && water.has(at(e + 1))) e++;
      const from = at(t - 1), to = at(e + 1);
      // (in a tile: a seam is crossed on the pier, it ends a bridge)
      const over = Array.from({ length: e - t + 1 }, (_, k) => at(t + k));
      if (t > 0 && e + 1 < len && !water.has(from) && !water.has(to) && L[from] === L[to] && !runs.some(r => r.cells.includes(at(t)))
        && !over.some(c => strip(...xz(c))) && [from, to].every(c => !strip(...xz(c)) || platforms.has(c)))
        runs.push({ kind: 'bridge', from, to, cells: Array.from({ length: e - t + 1 }, (_, k) => at(t + k)), d: vertical ? 2 : 0 });
      t = e + 1;
    }
  }
  // the floors at a run's ends and under it level with what they are kept at
  for (const r of runs) { for (const c of r.cells) if (!water.has(c)) L[c] = Math.min(L[c], L[r.from], L[r.to]); }

  // ---- the trails: up to the hill's top and down to the hollow's bottom, from the nearest level
  // ground, the gentlest way (wading through the river if it must, never into the lake)
  const trail = (f, name, goal = kept) => {
    const start = cell(Math.floor(f.x), Math.floor(f.z));
    const way = cheapest(W, D, [start], c => c !== start && goal(c), (n, c) => {
      if (lakeSet.has(n) || used.has(n) || side(n % W, Math.floor(n / W)) > 0) return Infinity;
      // (round the set pieces' knolls: what stands on them wants their top)
      if (pieces.some(p => Math.hypot(n % W + .5 - p.x, Math.floor(n / W) + .5 - p.z) < p.r0 + 1.2)) return Infinity;
      const dh = Math.abs(L[n] - L[c]);
      return dh > 1 && !water.has(n) && !water.has(c) ? Infinity : 1 + (water.has(n) ? 5 : 0) + .6 * wander(n % W * .5, Math.floor(n / W) * .5 + 40);
    });
    if (!way) return null;
    const all = way.map(c => [c % W + .5, Math.floor(c / W) + .5]);
    const rim = Math.max(0, all.findIndex(([x, z]) => Math.hypot(x - f.x, z - f.z) >= f.r0 - .3));
    const points = all.slice(Math.min(rim, all.length - 2)), out = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
      const [a, b, c] = [out.at(-1), points[i], points[i + 1]];
      if ((b[0] - a[0]) * (c[1] - b[1]) !== (b[1] - a[1]) * (c[0] - b[0])) out.push(b);
    }
    out.push(points.at(-1));
    return { to: name, points: out };
  };
  const trails = [trail(hill, 'hill'), trail(hollow, 'hollow')].filter(Boolean);
  // (and to a span's end, where no way comes near it: from the town's ground the way to it)
  for (const c of spanEnds) {
    const [x, z] = xz(c);
    if (kway[c] < 1.6) continue;
    const t = trail({ x: x + .5, z: z + .5, r0: 0 }, 'span', n => kway[n] < FLAT + .5);
    if (t) trails.push(t);
  }

  // ---- the forest: round the outer sides (but at the gate), a belt of its own depth along them,
  // and woods of their own here and there; not on what is kept, the trails, the water, the
  // structures, the hill's top or the hollow, few on the hill's side
  const trailDist = (x, z) => Math.min(Infinity, ...trails.flatMap(t => t.points.slice(1).map((b, i) => keepDistance({ seg: [t.points[i], b], r: 0 }, x, z))));
  // how far (x, z) lies from the nearest water cell (as the water is now): the same as trying every
  // one, but the cells are sorted into buckets of WB x WB, searched in rings round (x, z)'s until
  // none further out can be nearer
  const WB = 4, BW = Math.ceil(W / WB), BD = Math.ceil(D / WB), buckets = Array.from({ length: BW * BD }, () => []);
  for (const c of water.keys()) { const cx = c % W, cz = Math.floor(c / W); buckets[Math.floor(cz / WB) * BW + Math.floor(cx / WB)].push(cx, cz); }
  const wet = water.size > 0;
  const waterDist = (x, z) => {
    let d = Infinity;
    if (!wet) return d;
    const bx = Math.floor(x / WB), bz = Math.floor(z / WB);
    const far = Math.max(Math.abs(bx), Math.abs(BW - 1 - bx), Math.abs(bz), Math.abs(BD - 1 - bz));
    // (a bucket k rings out holds nothing nearer than k - 1 buckets)
    for (let k = 0; k <= far && d > (k - 1) * WB; k++) for (let j = bz - k; j <= bz + k; j++) {
      if (j < 0 || j >= BD) continue;
      const edge = j === bz - k || j === bz + k;
      for (let i = bx - k; i <= bx + k; i += edge ? 1 : 2 * k) {
        if (i < 0 || i >= BW) continue;
        const b = buckets[j * BW + i];
        for (let n = 0; n < b.length; n += 2) {
          const cx = b[n], cz = b[n + 1];
          d = Math.min(d, Math.hypot(Math.max(cx - x, 0, x - cx - 1), Math.max(cz - z, 0, z - cz - 1)));
        }
      }
    }
    return d;
  };
  // (how far from what is kept: in the town, only the shapes that may be the nearest in its cell)
  const keepDist = (x, z) => {
    let d = Infinity;
    const inside = x >= 0 && z >= 0 && x < W && z < D;
    for (const k of inside ? nearKept[Math.floor(z) * W + Math.floor(x)] : keep) d = Math.min(d, keepDistance(k, x, z));
    return d;
  };
  // (on or beside a stair, a bridge or the span: kept free of what stands in the way)
  const built = new Set([...used, ...platforms.keys(), ...ledge, ...runs.flatMap(r => [r.from, r.to, ...r.cells])]);
  const structureAt = (x, z, r = 0) => {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const cx = Math.floor(x) + dx, cz = Math.floor(z) + dz;
      if (built.has(cell(cx, cz)) && Math.hypot(Math.max(cx - x, 0, x - cx - 1), Math.max(cz - z, 0, z - cz - 1)) < r + .35) return true;
    }
    return false;
  };
  // how thick the forest is at (x, z): outside the wall all of it (but along the road and the
  // river), none on the wall, inside a fringe along it and woods here and there
  function forest(x, z) {
    const s = side(clamp(Math.floor(x), 0, W - 1), clamp(Math.floor(z), 0, D - 1));
    if (s === 1) return 0;
    if (s === 2) return smooth((keepDist(x, z) - .9) / 1.2) * smooth((waterDist(x, z) - .5) / .8);
    const front = z - WALL - 1 + Math.max(0, 7 - Math.abs(x - gate[0])) * 3, shape = landscape.woodShape;
    const e = Math.min(x - WALL - 1, W - WALL - 1 - x, front, D - WALL - 1 - z);
    // (the belt along the wall: thin but where it is the shape, and woods: here and there, many
    // small ones, or hardly any; the big woods filling their corners)
    const depth = (shape === 'belt' ? 2.2 : shape === 'open' ? .5 : 1) * belt(x * .12, z * .12) + (shape === 'belt' ? .4 : 0);
    const here = shape === 'groves' ? smooth((woodsNoise(x * .2 + 3, z * .2 + 3) - .56) / .08)
      : smooth((woods(x * .1 + 9, z * .1 + 9) - (shape === 'open' ? .72 : .6)) / .1);
    let f = Math.max(1 - smooth((e - depth) / 1.8), here);
    if (shape === 'corner') for (const b of bigWoods) {
      // (never in front of the gate, where the road comes in)
      const r = b.r * (.75 + .5 * woodsNoise(x * .25 + 11, z * .25 + 11)) - (Math.abs(x - gate[0]) < 8 && z < WALL + 9 ? 99 : 0);
      f = Math.max(f, 1 - smooth((Math.hypot(x - b.x, z - b.z) - r) / 1.5));
    }
    f *= smooth((keepDist(x, z) - 1.2) / 2) * smooth((trailDist(x, z) - 1) / 1) * smooth((waterDist(x, z) - .7) / 1);
    const dh = Math.hypot(x - hill.x, z - hill.z), dl = Math.hypot(x - hollow.x, z - hollow.z);
    if (dh < hill.r0 + .9 || dl < hollow.r1 + .3 || structureAt(x, z, .5)) return 0;
    if (dh < hill.r1 - .4) f *= .2;
    for (const p of pieces) if (Math.hypot(x - p.x, z - p.z) < p.r0 + 1) return 0;
    return f;
  }

  // ---- the wall's towers: at its corners and along it every 7 to 10 cells, off the seams (by two
  // cells), the gate, the water and the cliff (where the ground beside it along the wall steps more
  // than two levels)
  const gateAt = (x, z) => z === WALL && Math.abs(x + .5 - gate[0]) < WALL_GATE / 2;
  const towers = new Set([cell(WALL, WALL), cell(W - 1 - WALL, WALL), cell(WALL, D - 1 - WALL), cell(W - 1 - WALL, D - 1 - WALL)]);
  {
    const lines = [[W - 2 * WALL, k => [WALL + k, WALL]], [W - 2 * WALL, k => [WALL + k, D - 1 - WALL]],
      [D - 2 * WALL, k => [WALL, WALL + k]], [D - 2 * WALL, k => [W - 1 - WALL, WALL + k]]];
    for (const [n, at] of lines) {
      const alongX = at(1)[0] !== at(0)[0], next = (x, z, o) => alongX ? cell(x + o, z) : cell(x, z + o);
      const ok = (x, z) => !(z === WALL && Math.abs(x + .5 - gate[0]) < WALL_GATE / 2 + 2)
        && offSeam(alongX ? x : z, alongX ? seamX : seamZ) >= 2
        && [-2, -1, 0, 1, 2].every(o => !water.has(next(x, z, o)))
        && [-1, 1].every(o => Math.abs(L[next(x, z, o)] - L[cell(x, z)]) <= 2);
      let last = 0, gap = 7 + Math.floor(R() * 4);
      for (let k = 1; k < n - 4; k++) {
        const [x, z] = at(k);
        if (k - last >= gap && ok(x, z)) { towers.add(cell(x, z)); last = k; gap = 7 + Math.floor(R() * 4); }
      }
    }
  }

  // where the ground cover grows thick and where the grass is bare (0..1: world/town.js groundCover),
  // in patches a few cells across
  const patchy = makeNoise(mulberry32(hash32(seed ^ 0x9a7c3)));
  const patch = (x, z) => smooth((patchy(x * .16 + 2, z * .16 + 2) - .38) / .24);

  return {
    W, D, level, rows, upper, seed, patch, landscape, formAt, hill, hollow, lake, pieces, river, streams, trails, layout, falls, runs, stairs, spans, edge, platforms, piers,
    // the gorge's cells (lake water down in the upper town), what of the land's set pieces it has and where
    gorge, features, stage, mill, ruins, style,
    // the wall: where a cell lies by it (wallSide), its towers' cells, its gate's cells and the
    // gatehouse's middle (where the street comes in), whether (x, z) lies inside it by m
    wall: { side: (x, z) => side(clamp(x, 0, W - 1), clamp(z, 0, D - 1)), towers, gateAt, gate: [gate[0], WALL + .5], inWall },
    // cell (x, z)'s level, its water ({ surf, bed, lake }, or null), whether its ground stays level
    // (what is kept, the cells beside a seam: their corners pinned flat, cubegen/smooth.js)
    level: (x, z) => L[clamp(z, 0, D - 1) * W + clamp(x, 0, W - 1)],
    water: (x, z) => (x < 0 || z < 0 || x >= W || z >= D ? null : water.get(z * W + x) ?? null),
    flat: (x, z) => (kept(z * W + x) && !ramped[z * W + x] && (side(x, z) < 2 || (z < WALL && Math.abs(x + .5 - gate[0]) < 1.6))) || strip(x, z) || built.has(z * W + x) || tongue.has(z * W + x),
    seamCell: (x, z) => strip(x, z),
    keepDist, trailDist, waterDist, forest, structureAt,
    // which trees grow where (0..1: firs low, broadleaves high)
    kind: (x, z) => kind(x * .08 + 3, z * .08 + 3),
  };
}
