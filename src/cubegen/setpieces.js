// The set-piece cubes (world/heights.js planSetPiece): mostly empty rooms built round one thing
// (spec.sparse: few props, render/propplace.js).
//   peak   a flat field with a steep block of rock in the middle; a ladder goes up it to the
//          discovery on top (stairs, ramps and bridges onto it cost more: setPieceRoute)
//   lake   water from shore to shore; the route keeps to the dry shore round it (every fluid is
//          deadly), and a discovery waits on an islet, reached by a bridge
// Neither has slabs (one layer) or cave pillars.
import { N, MAX_L } from '../core/constants.js';
import { idx, clamp } from '../core/util.js';
import { floorY } from '../core/surfaces.js';
import { TOWN_LEVEL } from '../world/town.js';

const inner = fn => { for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) fn(x, z, idx(x, z)); };
const ring = (x, z) => Math.min(x, z, N - 1 - x, N - 1 - z);   // 0 on the cube's outer ring

// learn: world.html#heights (see learn/README.md)
export function shapePeak(ctx) {
  const { spec, lvl0, void0 } = ctx, p = spec.peak, top = ctx.peakTop;
  const onTop = (x, z) => x >= p.x && z >= p.z && x < p.x + p.side && z < p.z + p.side;
  const off = (x, z) => Math.max(p.x - x, x - (p.x + p.side - 1), p.z - z, z - (p.z + p.side - 1));   // cells from the block
  // (the way into the town's banks and road are its own: shapeApproach)
  const apart = i => !!(spec.approach?.bank[i] || spec.approach?.lane[i]);
  let sum = 0, n = 0;
  inner((x, z, i) => { if (!onTop(x, z) && !apart(i)) { sum += lvl0[i]; n++; } });
  const foot = clamp(Math.round(sum / n), 3, 8), level = ctx.pinnacleTop = Math.min(MAX_L - 1, foot + p.rise);
  inner((x, z, i) => {
    void0[i] = 0;
    if (onTop(x, z)) { lvl0[i] = level; top.add(i); ctx.keep.add(i); return; }
    // a flat ring round its foot (where the ladder stands), the rest of the field worn flat (not the
    // foot of a cave's walls)
    if (off(x, z) <= 1) { lvl0[i] = foot; ctx.keep.add(i); }
    else if (ring(x, z) >= 2) lvl0[i] = clamp(lvl0[i], foot - 1, foot + 1);
  });
  ctx.stats.mode = spec.kind + ' / lone peak';
  if (spec.approach) shapeApproach(ctx);
}

// The way into the town (world/town.js townApproach), in the road's first room: the forest's floor
// outside the town's wall runs on into it as banks either side of the road, the road between them
// level with the town's gate. The banks stand a cliff over all round them (BANK_OVER levels: no jump
// gets up there, a leaping potion's either), and nothing leads up onto them (setPieceRoute): no
// stair, bridge or ladder, no way the generator adds to reach them (cubegen/escape.js addAccess),
// and no railing along their edges (cubegen/fences.js: nobody stands there to fall off).
// Along the town's face they keep the face's levels, which are the town's own (world/profile.js).
export const BANK_OVER = 4;
export function shapeApproach(ctx) {
  const { spec, lvl0, void0 } = ctx, a = spec.approach, banks = ctx.banks = new Set();
  const atFace = (x, z) => [x === N - 1, x === 0, z === N - 1, z === 0][a.dir];
  for (let i = 0; i < N * N; i++) {
    const x = i % N, z = (i / N) | 0;
    if (a.bank[i]) {
      if (!atFace(x, z)) lvl0[i] = a.bank[i];
      void0[i] = 0; banks.add(i); ctx.keep.add(i); ctx.noCross.add(i); (ctx.noFence ??= new Set()).add(i);
    } else if (a.lane[i]) { lvl0[i] = TOWN_LEVEL; void0[i] = 0; ctx.keep.add(i); }
  }
  // (and the ground round them well under them: no slope up, no step to jump)
  for (let i = 0; i < N * N; i++) {
    if (banks.has(i)) continue;
    const x = i % N, z = (i / N) | 0;
    let low = Infinity;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const j = idx(x + dx, z + dz);
      if (x + dx >= 0 && z + dz >= 0 && x + dx < N && z + dz < N && banks.has(j)) low = Math.min(low, lvl0[j]);
    }
    if (low < Infinity) { lvl0[i] = clamp(Math.min(lvl0[i], low - BANK_OVER), 2, MAX_L); void0[i] = 0; }
  }
  ctx.stats.mode += ' / the way into the town';
}

// The town's wood on the banks (world/town.js townApproach: its trees), standing on them as they
// came out (smoothed, cut: cubegen/cuts.js): a tree only where the ground under it is a bank's, not
// cut, and nearly level; it hides what is behind it as the town's do (the cutaway: occluders)
export function approachWood(ctx) {
  const a = ctx.spec.approach, placements = [], occluders = [];
  if (!a) return { placements, occluders };
  const bankAt = (x, z) => {
    const cx = Math.floor(x), cz = Math.floor(z);
    if (cx < 0 || cz < 0 || cx >= N || cz >= N || !ctx.banks.has(idx(cx, cz))) return null;
    const f = ctx.cols[idx(cx, cz)].find(g => g.layer === 0 && !g.fluid);
    return f && !f.cut ? f : null;
  };
  for (const q of a.trees) {
    const r = q.trunk ? q.trunk * q.s : .25, pts = [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]];
    const ys = pts.map(([ox, oz]) => { const f = bankAt(q.x + ox, q.z + oz); return f ? floorY(f, q.x + ox - f.x, q.z + oz - f.z) : null; });
    if (ys.some(y => y === null) || Math.max(...ys) - Math.min(...ys) > .35) continue;
    const y = Math.min(...ys) - .02;
    placements.push({ name: q.name, x: q.x, y, z: q.z, yaw: q.yaw, s: q.s, tint: null });
    if (!q.trunk) continue;
    occluders.push({ name: q.name, x: q.x, z: q.z, r: q.trunk * q.s, bottom: y, top: y + q.canopy * q.s });
    occluders.push({ shape: 'ellipsoid', x: q.x, z: q.z, y: y + q.height * .79 * q.s, rx: q.radius * q.s, rz: q.radius * q.s,
      ry: q.height * .21 * q.s, top: y + q.height * q.s, bottom: y + q.canopy * q.s });
  }
  return { placements, occluders };
}

// the way up the peak is its ladder: stairs, bridges and jumps onto or off the top cost more; over
// the lake's water nothing jumps (a missed jump is a fall into it: the islet's way is a bridge,
// a stair onto or off it costs more)
export function setPieceRoute(ctx) {
  const movesFrom = ctx.movesFrom, isle = f => ctx.islet?.has(f.c);
  if (ctx.spec.lake) ctx.movesFrom = (f, ...rest) => movesFrom(f, ...rest).filter(m => m.kind !== 'jump')
    .map(m => m.kind === 'stair' && isle(m.to) !== isle(f) ? { ...m, cost: m.cost + 40 } : m);
  // (the way into the town's banks: nothing goes up there, nor comes down from there)
  if (ctx.banks?.size) {
    const bank = f => ctx.banks.has(f.c) && !f.landing, moves = ctx.movesFrom;
    ctx.movesFrom = (f, ...rest) => bank(f) ? [] : moves(f, ...rest).filter(m => !bank(m.to));
  }
  if (!ctx.peakTop?.size) return;
  const on = f => ctx.peakTop.has(f.c), onward = ctx.movesFrom;
  // (both ways: a stair down off the top would be a way up too)
  ctx.movesFrom = (f, ...rest) => onward(f, ...rest).map(m => ['ladder', 'walk', 'drop'].includes(m.kind) || on(m.to) === on(f)
    ? m : { ...m, cost: m.cost + 40 });
}

// learn: world.html#heights (see learn/README.md)
export function shapeLake(ctx) {
  const { spec, lvl0, void0, noise } = ctx, islet = spec.lake.islet, shore = [];
  inner((x, z, i) => { if (ring(x, z) === 2) shore.push(lvl0[i]); });
  // the islet stands about as high as the shore, so a bridge reaches it
  const level = clamp(Math.round(shore.reduce((a, b) => a + b, 0) / shore.length), 4, 10);
  const away = (x, z) => islet ? Math.hypot(x + 0.5 - islet.x - 0.5, z + 0.5 - islet.z - 0.5) : Infinity;
  inner((x, z, i) => {
    void0[i] = 0; ctx.keep.add(i);   // (no pools on the shore)
    const d = away(x, z);
    if (d < (islet?.r ?? 0)) { lvl0[i] = level; ctx.islet.add(i); return; }
    // water from three cells in (four in places), and all round the islet
    if (ring(x, z) >= 3 + (noise(x * 0.4 + 11, z * 0.4 + 5) > 0.62 ? 1 : 0) || d < (islet ? islet.r + 1.5 : 0)) { lvl0[i] = 0; ctx.seaCells.push(i); }
  });
  ctx.isletLevel = level;
  ctx.stats.mode = spec.kind + ' / great lake' + (islet ? ' with an islet' : '');
}
