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
// - Trails up the hill and down into the hollow; a forest round the outer sides.
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
export function makeLand(seed, { across, deep, level, layout: plan, gate, fixed = [], fixedWays = [], fixedKeep = [] }) {
  const W = across * N, D = deep * N, R = mulberry32(hash32(seed ^ 0x1a4d5));
  const roll = makeNoise(R), wander = makeNoise(R), belt = makeNoise(R), woods = makeNoise(R), kind = makeNoise(R),
    shore = makeNoise(R), cliffy = makeNoise(R);
  const xz = c => [c % W, Math.floor(c / W)], cell = (x, z) => z * W + x;
  const jit = s => (R() - .5) * 2 * s;
  const seamX = Array.from({ length: across - 1 }, (_, i) => (i + 1) * N), seamZ = Array.from({ length: deep - 1 }, (_, j) => (j + 1) * N);
  // how far cell column (or row) v lies from the nearest seam (0: next to it); is it next to one
  const offSeam = (v, seams) => Math.min(Infinity, ...seams.map(s => v < s ? s - v - 1 : v - s));
  const strip = (x, z) => offSeam(x, seamX) === 0 || offSeam(z, seamZ) === 0;
  const insideBox = (x, z, m) => fixed.some(b => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m);

  // ---- the three bands: the lower town round the gate (its first rows), the water, the upper town
  // half a cube over it, its cliff rising out of the water (edge[x]: its first upper cell in each
  // column). The water from the back of the plaza's row (WATER_FROM) into the upper town's first
  // row: in the middle tile under the quay at the cliff's foot (QUAY rows, the street's stair along
  // it), on the right as far as WATER_TO (a cell further now and then), in the garden a bay (the
  // lake). By a seam as on its other side.
  const UP = Math.min(2, deep - 1), lower = level, upper = level + UPPER, rows = Array.from({ length: deep }, (_, j) => j < UP ? lower : upper);
  const mid = Math.floor(across / 2), upZ = UP * N, from = (UP - 1) * N + WATER_FROM, px = mid * N;
  const lakeDeep = 8 + Math.floor(R() * 4);
  const edge = Array.from({ length: W }, (_, x) => {
    const i = Math.floor(x / N), lx = x - i * N;
    if (i === mid) return upZ + WATER_TO + QUAY;
    // (the lake: a bay deepest in the garden's middle, by the seam into the middle's tile as the middle's)
    if (i === 0 && across > 1) {
      const bay = Math.min(1, 1.4 * Math.sin(Math.PI * (lx + 1.5) / (N + 1))), wob = lx < N - 2 ? Math.floor(cliffy(Math.floor((x + 1) / 3), 3.3) * 1.99) : 0;
      return upZ + WATER_TO + QUAY + (lx < N - 2 ? Math.round((lakeDeep - WATER_TO - QUAY) * bay) + wob : 0);
    }
    if (lx < 2 && i === mid + 1) return upZ + WATER_TO + QUAY;
    return upZ + WATER_TO + (lx >= 3 && lx < N - 2 ? Math.floor(cliffy(Math.floor((x + 2) / 4) * 1.7, 9.1) * 1.99) : 0);
  });
  const quay = (x, z) => Math.floor(x / N) === mid && z >= upZ + WATER_TO && z < upZ + WATER_TO + QUAY && x - px >= 2 && x - px < N - 2;
  const tongue = new Set();
  const stairs = [], spans = [], used = new Set(), platforms = new Map();   // (cells taken; a platform's cells -> its level)
  // the street's stair: on the quay's back row, from its foot up to its top on a tongue of the
  // upper town
  {
    const z = upZ + INN_STAIR.z, line = Array.from({ length: INN_STAIR.top - INN_STAIR.foot - 1 }, (_, k) => cell(px + INN_STAIR.foot + 1 + k, z));
    tongue.add(cell(px + INN_STAIR.top, z)); tongue.add(cell(px + INN_STAIR.top + 1, z));
    stairs.push({ foot: cell(px + INN_STAIR.foot, z), top: cell(px + INN_STAIR.top, z), d: 0, cells: line });
    for (const c of [...line, cell(px + INN_STAIR.foot, z)]) used.add(c);
  }
  const inWater = (x, z) => z >= from && z < edge[x] && !quay(x, z);
  const base = (x, z) => tongue.has(cell(x, z)) || z >= edge[x] ? upper : lower;
  // A pier where the street crosses the seam in the water (dry, at the lower town's level: a bridge
  // either side of it, world/town.js lays the street over them), and the span: from the upper town's
  // edge on the lake's far side down over the water to a rock standing in it on the seam, and on down
  // to the lower town's shore
  const piers = [cell(px + Math.floor(STREET_X), upZ - 1), cell(px + Math.floor(STREET_X) + 1, upZ - 1), cell(px + Math.floor(STREET_X), upZ), cell(px + Math.floor(STREET_X) + 1, upZ)];
  for (const c of piers) platforms.set(c, lower);
  {
    // (where the lake is deepest, by its middle)
    const xs = Array.from({ length: N - 6 }, (_, k) => 3 + k).sort((a, b) => edge[b] - edge[a] + Math.abs(a - 7) * .3 - Math.abs(b - 7) * .3 + (R() - .5) * 2);
    for (const lx of xs) {
      const x = lx, top = edge[x], land = from - 1;
      if (edge[x + 1] !== top || edge[x - 1] < top || top - upZ < 6 || insideBox(x + .5, land + .5, .8) || insideBox(x + .5, top + .5, .8)) continue;
      const rock = [cell(x, upZ - 1), cell(x + 1, upZ - 1), cell(x, upZ), cell(x + 1, upZ)];
      const p = lower + Math.round(UPPER * (upZ - 1 - land) / (top - land));
      spans.push({ top: cell(x, top), land: cell(x, upZ), cells: Array.from({ length: top - upZ - 1 }, (_, k) => cell(x, top - 1 - k)), d: 3 });
      spans.push({ top: cell(x, upZ - 1), land: cell(x, land), cells: Array.from({ length: upZ - 2 - land }, (_, k) => cell(x, upZ - 2 - k)), d: 3 });
      for (const c of rock) platforms.set(c, p);
      for (const sp of spans) for (const c of [sp.top, sp.land, ...sp.cells]) { used.add(c); used.add(c - 1); used.add(c + 1); }
      break;
    }
  }
  // a strand under the cliff here and there (in threes, one at least in each tile with no quay): a
  // way out of the water, not under the span nor by a seam
  const strand = new Set();
  for (let i = 0; i < across; i++) {
    if (i === mid) continue;
    const blocks = [];
    for (let b = 1; b * 3 + 3 < N - 1; b++) {
      const xs = [0, 1, 2].map(k => i * N + b * 3 + k);
      if (xs.every(x => edge[x] - 1 >= upZ + 1 && !strip(x, edge[x] - 1) && ![-1, 0, 1].some(o => used.has(cell(x + o, edge[x] - 1))))) blocks.push(xs);
    }
    const take = blocks.filter(() => R() < .45);
    if (!take.length && blocks.length) take.push(blocks[Math.floor(R() * blocks.length)]);
    for (const xs of take) for (const x of xs) strand.add(cell(x, edge[x] - 1));
  }
  const structureCells = [...used];

  // ---- where the big things lie (the tiles' corners)
  const back = deep - 1, right = across - 1;
  const hillI = R() < .5 ? 0 : right, hollowI = R() < .5 ? 0 : right;
  const inTile = (i, j, x, z) => [i * N + (i === right && i !== 0 ? N - x : x), j * N + z];
  const hill = (() => {
    const [x, z] = inTile(hillI, back, 7 + jit(.8), 9 + jit(.8)), r0 = 2.6 + R() * .5;
    return { tile: [hillI, back], x, z, top: upper + 4 + Math.floor(R() * 2), r0, r1: r0 + 5 };
  })();
  const hollow = (() => {
    const [x, z] = inTile(hollowI, 0, 7.6 + jit(.7), 7.6 + jit(.7)), r0 = 2.8 + R() * .5;
    return { tile: [hollowI, 0], x, z, bottom: lower - 3, r0, r1: r0 + 3 };
  })();
  const middle = [W / 2, D * .6];
  const pieces = [0, right].map(i => {
    if (i === hillI) {
      const a = Math.atan2(middle[1] - hill.z, middle[0] - hill.x) + jit(.5), d = hill.r0 + 3;
      return { tile: [i, back], x: hill.x + Math.cos(a) * d, z: hill.z + Math.sin(a) * d, level: upper + 2, r0: 2.6, r1: 4.6 };
    }
    const [x, z] = inTile(i, back, 8 + jit(1), 8.5 + jit(1));
    return { tile: [i, back], x, z, level: upper + 1, r0: 2.2, r1: 4 };
  });
  // the lake: the water's broad part, in the garden
  const lakeTile = [0, Math.min(UP, deep - 1)];
  const lake = { tile: lakeTile, x: N * .45, z: upZ + lakeDeep / 2 - 1, rx: 3, rz: 2.5, islet: [] };
  // ---- what stands for good (the buildings, their streets, lanes and paths, the people, the
  // crash...: world/town.js), before the town is laid out round the big things: the river keeps off it
  const fixedDist = new Float64Array(W * D);
  for (let c = 0; c < W * D; c++) { const [x, z] = xz(c); let d = Infinity; for (const k of fixedKeep) d = Math.min(d, keepDistance(k, x + .5, z + .5)); fixedDist[c] = d; }
  // (what the river keeps off: a cell what stands for good is in, or right beside)
  const fixedKept = c => fixedDist[c] < .5;
  // ---- the water
  const water = new Map();   // cell -> { surf, bed, lake }
  const falls = [];          // { c (the cell it falls into), d (DIRS4: the way it flows), top, bot }
  const lakeSet = new Set();
  for (let z = from; z < D; z++) for (let x = 0; x < W; x++) if (inWater(x, z) && !platforms.has(cell(x, z)) && !strand.has(cell(x, z))) lakeSet.add(cell(x, z));
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
  // only straight, never along one
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
    if (Math.hypot(x + .5 - hill.x, z + .5 - hill.z) < hill.r1 + .5 || Math.hypot(x + .5 - hollow.x, z + .5 - hollow.z) < hollow.r1 + 1) return true;
    if (pieces.some(p => Math.hypot(x + .5 - p.x, z + .5 - p.z) < p.r1)) return true;
    return z < 3 && Math.abs(x + .5 - gate[0]) < 5;
  };
  // (an upper cell beside the lower town: water there would stand over the wall, but at a lip: where
  // the wall runs straight for the river's two cells and one either side, the river falling over it)
  const rim = c => { const [x, z] = xz(c); return base(x, z) === upper && DIRS4.some(([dx, dz]) => x + dx >= 0 && x + dx < W && z + dz >= 0 && base(x + dx, z + dz) === lower); };
  const lip = c => { const [x, z] = xz(c); return rim(c) && z === edge[x] && x > 1 && x < W - 2 && [-1, 0, 1].every(o => edge[x + o] === z) && !strip(x, z) && !strip(x, z - 1) && !tongue.has(c - 1) && !tongue.has(c + 1); };
  const enter = (n, c, p) => {
    if (shut(n) || along(c, n)) return Infinity;
    const [nx, nz] = xz(n), [cx] = xz(c);
    if (base(nx, nz) > base(...xz(c))) return Infinity;
    // (down the escarpment: from a lip straight over its edge, come to it straight)
    if (rim(n) && !(lip(n) && c === n + W && p === c + W)) return Infinity;
    if (lip(c) && n !== c - W) return Infinity;
    const way = fixedKept(n) ? onWay(nx, nz) : null;
    if (fixedKept(n) && !way) return Infinity;
    if (way && (way.a[0] === way.b[0]) === (nx === cx)) return Infinity;   // (across a way, not along it)
    const w = wander(nx * .37 + 11, nz * .37 + 11);
    return 1 + 4 * w * w + (way ? 3 : 0);
  };
  let river = [];
  {
    // (in from the back of the town on the other side of it from the lake: down its cliff in sight)
    const starts = [], side = x => x > W / 2 + 4;
    for (let x = 2; x < W - 2; x++) if (!shut(cell(x, D - 1)) && offSeam(x, seamX) > 1) starts.push(cell(x, D - 1));
    const into = cheapest(W, D, starts.some(c => side(c % W)) ? starts.filter(c => side(c % W)) : starts, c => lakeSet.has(c),
      (n, c, p) => lakeSet.has(n) ? (lip(c) && n === c - W && p === c + W ? 1 : Infinity) : enter(n, c, p),
      c => { const [x, z] = xz(c); return Math.max(0, z - edge[x]); });
    if (into) river = into.filter(c => !lakeSet.has(c));
    // two cells wide: each cell's neighbour to its right, as it flows (the way it crosses a way
    // along the way: the bridge goes over both)
    const wide = [];
    for (const [i, c] of river.entries()) {
      const n = river[i + 1] ?? c, p = river[i - 1] ?? c, [x, z] = xz(c), [ax, az] = xz(n === c ? c : n), [bx, bz] = xz(p === c ? c : p);
      const fx = Math.sign((ax - bx) || 0), fz = Math.sign((az - bz) || 0), side = cell(x - fz, z + fx);
      const [sx, sz] = xz(side);
      if (!river.includes(side) && !lakeSet.has(side) && !shut(side) && base(sx, sz) === base(x, z) && !(fixedKept(side) && !onWay(sx, sz))
        && strip(sx, sz) === strip(x, z) && (!rim(side) || lip(c))) wide.push(side);
    }
    for (const c of [...river, ...wide]) water.set(c, { surf: surfOf(c), bed: surfOf(c) - 1, lake: false });
    // where it comes down the escarpment: a fall from each cell over its edge, a deep pool under it
    for (const c of water.keys()) {
      const up = c + W;
      if (water.has(up) && water.get(up).surf > water.get(c).surf) {
        falls.push({ c, d: 3, top: water.get(up).surf, bot: water.get(c).surf });
        water.get(c).bed = water.get(c).surf - 2;
      }
    }
  }
  // ---- the town round them
  const layout = plan({ hill, hollow, lake, pieces, W, D, level, rows, levelAt: (x, z) => base(clamp(Math.floor(x), 0, W - 1), clamp(Math.floor(z), 0, D - 1)),
    avoid: structureCells.map(c => { const [x, z] = xz(c); return { x0: x, z0: z, x1: x + 1, z1: z + 1 }; }),
    water: c => water.has(c), wet: [...water.keys()] });
  const keep = layout.keep;
  const kd = new Float64Array(W * D);
  for (let c = 0; c < W * D; c++) { const [x, z] = xz(c); let d = Infinity; for (const k of keep) d = Math.min(d, keepDistance(k, x + .5, z + .5)); kd[c] = d; }
  const kept = c => kd[c] < FLAT + .5;

  // ---- the ground: each cell's level. The two towns; the wild ground rolling a level or two (none
  // where it is kept, coming in a level a cell); the hill, the hollow, the set pieces' knolls
  const L = new Int16Array(W * D);
  for (let c = 0; c < W * D; c++) {
    const [x, z] = xz(c), b = base(x, z), w = clamp((kd[c] - 1.5) / 3, 0, 1);
    L[c] = b + Math.round(clamp(Math.round((roll(x * .11 + 5, z * .11 + 5) - .5) * 6), -1, 2) * w);
    const dh = Math.hypot(x + .5 - hill.x, z + .5 - hill.z), dl = Math.hypot(x + .5 - hollow.x, z + .5 - hollow.z);
    if (dh < hill.r1 && b === upper) L[c] = Math.max(L[c], hill.top - Math.max(0, Math.ceil(dh - hill.r0)));
    if (dl < hollow.r1 && b === lower) L[c] = Math.min(L[c], hollow.bottom + Math.max(0, Math.ceil(dl - hollow.r0)));
    for (const p of pieces) {
      const d = Math.hypot(x + .5 - p.x, z + .5 - p.z);
      if (d < p.r1) L[c] = clamp(L[c], p.level - Math.max(0, Math.ceil(d - p.r0)), p.level + Math.max(0, Math.ceil(d - p.r0)));
    }
    if (kept(c) || used.has(c) || tongue.has(c)) L[c] = b;
    if (platforms.has(c)) L[c] = platforms.get(c);
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
  const spanStyle = pick3(R, ['rope', 'chain', 'plank']);
  for (const s of spans) runs.push({ kind: 'bridge', from: s.top, to: s.land, cells: s.cells, d: s.d, span: true, style: spanStyle });
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
  const trail = (f, name) => {
    const start = cell(Math.floor(f.x), Math.floor(f.z));
    const way = cheapest(W, D, [start], c => kept(c), (n, c) => {
      if (lakeSet.has(n) || used.has(n)) return Infinity;
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

  // ---- the forest: round the outer sides (but at the gate), a belt of its own depth along them,
  // and woods of their own here and there; not on what is kept, the trails, the water, the
  // structures, the hill's top or the hollow, few on the hill's side
  const wetCells = [...water.keys()];
  const trailDist = (x, z) => Math.min(Infinity, ...trails.flatMap(t => t.points.slice(1).map((b, i) => keepDistance({ seg: [t.points[i], b], r: 0 }, x, z))));
  const waterDist = (x, z) => {
    let d = Infinity;
    for (const c of wetCells) { const [cx, cz] = xz(c); d = Math.min(d, Math.hypot(Math.max(cx - x, 0, x - cx - 1), Math.max(cz - z, 0, z - cz - 1))); }
    return d;
  };
  const keepDist = (x, z) => { let d = Infinity; for (const k of keep) d = Math.min(d, keepDistance(k, x, z)); return d; };
  // (on or beside a stair, a bridge or the span: kept free of what stands in the way)
  const built = new Set([...used, ...platforms.keys(), ...runs.flatMap(r => [r.from, r.to, ...r.cells])]);
  const structureAt = (x, z, r = 0) => {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const cx = Math.floor(x) + dx, cz = Math.floor(z) + dz;
      if (built.has(cell(cx, cz)) && Math.hypot(Math.max(cx - x, 0, x - cx - 1), Math.max(cz - z, 0, z - cz - 1)) < r + .35) return true;
    }
    return false;
  };
  function forest(x, z) {
    const front = z + Math.max(0, 7 - Math.abs(x - gate[0])) * 3;
    const e = Math.min(x, W - x, front, D - z), depth = 2.2 + 4 * belt(x * .12, z * .12);
    let f = Math.max(1 - smooth((e - depth) / 1.8), smooth((woods(x * .1 + 9, z * .1 + 9) - .6) / .1));
    f *= smooth((keepDist(x, z) - 1.2) / 2) * smooth((trailDist(x, z) - 1) / 1) * smooth((waterDist(x, z) - .7) / 1);
    const dh = Math.hypot(x - hill.x, z - hill.z), dl = Math.hypot(x - hollow.x, z - hollow.z);
    if (dh < hill.r0 + .9 || dl < hollow.r1 + .3 || structureAt(x, z, .5)) return 0;
    if (dh < hill.r1 - .4) f *= .2;
    for (const p of pieces) if (Math.hypot(x - p.x, z - p.z) < p.r0 + 1) return 0;
    return f;
  }

  return {
    W, D, level, rows, upper, seed, hill, hollow, lake, pieces, river, trails, layout, falls, runs, stairs, spans, edge, platforms, piers,
    // cell (x, z)'s level, its water ({ surf, bed, lake }, or null), whether its ground stays level
    // (what is kept, the cells beside a seam: their corners pinned flat, cubegen/smooth.js)
    level: (x, z) => L[clamp(z, 0, D - 1) * W + clamp(x, 0, W - 1)],
    water: (x, z) => (x < 0 || z < 0 || x >= W || z >= D ? null : water.get(z * W + x) ?? null),
    flat: (x, z) => kept(z * W + x) || strip(x, z) || built.has(z * W + x) || tongue.has(z * W + x),
    seamCell: (x, z) => strip(x, z),
    keepDist, trailDist, waterDist, forest, structureAt,
    // which trees grow where (0..1: firs low, broadleaves high)
    kind: (x, z) => kind(x * .08 + 3, z * .08 + 3),
  };
}
