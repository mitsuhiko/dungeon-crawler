// A hidden cave behind a waterfall (docs/world.md "Waterfall grottos"): where a tall clear-water
// fall pours off a slab, a small cave opens right behind the curtain, level with the pool, and an
// uncommon chest waits at its back. Nothing marks it but the curtain, which comes down broader than
// a fall's usually does: its stream is made two cells across (a wide fall, core/falls.js), the only
// streams that are; the hero wades or swims through the falling water (it does not push them
// back out: physics/hazards.js) into the cave. It is closed all round: carved into the rock, or,
// under an overhang, walled in by bringing the slab down to the ground round it (the way a hill
// merges into a slab over it, cubegen/slabs.js), so it is seen from nowhere else.
//
// carveGrotto runs in the generator once the fluids are settled (before their shores), so the
// moves, routes and checks that follow know the cave; it draws nothing from the generator's
// random stream, so a cube without a grotto comes out exactly as it would without this stage.
// finishGrotto puts the chest in once the cube is checked, if the cave can be got to and back.
import { N, LH, HEAD, DIRS, WATER, CHAR_R, SWIM_DEPTH, SWIM_FEET } from '../core/constants.js';
import { idx, hash32 } from '../core/util.js';
import { floorY } from '../core/surfaces.js';
import { acrossOf, fallCells, fallShift } from '../core/falls.js';
import { propMetadata } from '../core/propcatalog.js';
import { reachFrom } from './reach.js';
import { banks } from './pools.js';
import { ROOF } from './tunnel.js';

export const GROTTO_DROP = 7;      // levels the fall drops at least: room for the cave under its lip
export const GROTTO_WIDTH = 1.9;   // world units across the curtain of its two cells (a fall's usual: render/parts.js FALL_WIDTH)
const CHEST_SCALE = 0.8;

// the cells of the cave, the mouth first and the chest's cell second. m: the mouth behind the
// fall's cell, s: the side its stream is widened to. Best a mouth across both cells of the curtain:
// a room of two by two, else one cell behind it; else a mouth behind one of them, with a room of
// three across behind it or a short passage of two.
function shapes(x, z, d, s) {
  const [dx, dz] = DIRS[d], lx = dz, lz = dx, at = (k, b) => [x + lx * s * k - dx * b, z + lz * s * k - dz * b];
  const m0 = at(0, 0), m1 = at(1, 0), b0 = at(0, 1), b1 = at(1, 1);
  return [
    [m0, b0, m1, b1], [m0, b0, m1], [m1, b1, m0],
    [m0, b0, at(1, 1), at(-1, 1)], [m1, b1, at(2, 1), at(0, 1)],
    [m0, b0], [m1, b1],
  ];
}

export function carveGrotto(ctx) {
  ctx.grotto = null;
  const { spec, cols } = ctx;
  if (spec.trial || spec.firstGlass || !(spec.depth > 0)) return;
  // what must stay as it is: portal pads, sites, a horde's camp, ramps, the big pieces' cells
  const keptCell = c => ctx.keep?.has(c) || ctx.noCross?.has(c) || ctx.siteSpace?.has(c) || ctx.roofs?.has(c) || ctx.sky?.has(c);
  const keptFloor = f => f.prot || f.site || f.siteBlocked || f.hordeReserved || f.ramp || f.landing || f.roof || f.soft;
  for (const fall of ctx.falls ?? []) {
    if (fall.type !== WATER || fall.in || fall.out || fall.spout || fall.top - fall.bot < GROTTO_DROP) continue;
    const F = fall.bot, [dx, dz] = DIRS[fall.d];
    if (!cols[fall.c].some(f => f.fluid === WATER && f.surf === F)) continue;   // (it pours into its own pool)
    if (!shored(ctx, fall.c, F)) continue;   // (not a pool down a pit, which nobody gets into)
    const chan = stream(ctx, fall);
    if (!chan) continue;
    // floors that may go (dry ground, or the pool's water reaching in under the overhang)
    const loose = f => !keptFloor(f) && (!f.fluid || f.fluid === WATER && f.surf === F);
    // column c's floors bottom up, the first reaching `top` (what stays over the cave or makes its
    // wall) and the ones under it; null if one of those may not go or nothing stands under it
    const split = (c, top) => {
      const col = [...cols[c]].sort((a, b) => a.top - b.top), up = col.find(f => f.top >= top);
      if (!up || keptFloor(up)) return null;
      const under = col.filter(f => f !== up && f.top < up.top);
      if (!under.every(loose)) return null;
      const base = Math.min(up.bottom, ...under.map(f => f.bottom));
      return base <= F - 1 ? { up, under, base, merged: base === up.bottom ? up.merged : under.find(f => f.bottom === base).merged } : null;
    };
    const x0 = fall.c % N - dx, z0 = ((fall.c / N) | 0) - dz;
    for (const s of [1, -1]) {
      const wide = widen(ctx, fall, chan, s, keptCell, keptFloor);
      if (!wide) continue;
      const curtain = new Set(fallCells({ ...fall, side: s }));
      for (const shape of shapes(x0, z0, fall.d, s)) {
        if (shape.some(([x, z]) => x < 1 || z < 1 || x > N - 2 || z > N - 2)) continue;
        const cells = shape.map(([x, z]) => idx(x, z)), set = new Set(cells);
        // over the cave a level of rock at least (or the slab), under it something to stand on
        const hollows = cells.map(c => keptCell(c) ? null : split(c, F + ROOF + 1));
        if (hollows.some(h => !h)) continue;
        // and rock all round it but where it opens behind the curtain: there already, or the slab
        // over it brought down to the ground (not on the cube's outer ring, shared with the neighbours)
        const walls = new Map();
        let closed = true;
        for (const c of cells) for (const [ex, ez] of DIRS) {
          const x = c % N + ex, z = ((c / N) | 0) + ez, n = idx(x, z);
          if (set.has(n) || curtain.has(n) || walls.has(n)) continue;
          if (cols[n].some(f => f.bottom <= F && f.top >= F + ROOF)) { walls.set(n, null); continue; }
          const fill = !ctx.border({ x, z }) && !keptCell(n) && split(n, F + ROOF);
          if (!fill) { closed = false; break; }
          walls.set(n, fill);
        }
        if (!closed) continue;
        carve(ctx, fall, s, wide, cells, hollows, walls, F);
        return;
      }
    }
  }
}

// the stream the fall pours from (cubegen/streams.js): its water floors, the one at the lip first;
// null if there is none (a fall from a pool)
function stream(ctx, fall) {
  const [dx, dz] = DIRS[fall.d], S = fall.top, chan = [];
  for (let x = fall.c % N - dx, z = ((fall.c / N) | 0) - dz; x >= 0 && z >= 0 && x < N && z < N; x -= dx, z -= dz) {
    const f = ctx.cols[idx(x, z)].find(g => g.fluid === WATER && g.surf === S);
    if (!f) break;
    chan.push(f);
  }
  return chan.length ? chan : null;
}

// the stream two cells across: the floors beside it on side s to flood to its surface (as a pool
// is, cubegen/pools.js), walled in all round but where the new lip pours over, which has to drop
// clear into the pool beside the fall's (nothing in the way of the curtain); null if it cannot be
function widen(ctx, fall, chan, s, keptCell, keptFloor) {
  const { cols } = ctx, S = fall.top, F = fall.bot, bed = S - 2, [dx, dz] = DIRS[fall.d], lx = dz, lz = dx;
  const drop = fallCells({ ...fall, side: s })[1];
  if (!cols[drop].some(f => f.fluid === WATER && f.surf === F) || cols[drop].some(f => f.top > F && f.bottom < S + 1)) return null;
  const floors = [], cells = new Set(), wet = new Set(chan.map(f => f.c));
  for (const f of chan) {
    const x = f.x + lx * s, z = f.z + lz * s, c = idx(x, z);
    if (x < 1 || z < 1 || x > N - 2 || z > N - 2) return null;   // (the outer ring is shared with the neighbours)
    if (cols[c].some(g => g.fluid === WATER && g.surf === S)) { wet.add(c); continue; }   // water there already
    const g = cols[c].find(h => !h.fluid && h.top >= S && h.bottom <= S);
    if (!g || keptFloor(g) || keptCell(c) || g.layer !== f.layer) return null;
    const below = ctx.nextBelow(g);
    if (!g.merged && below && below.top + HEAD > bed - 1) return null;   // (the slab would get too thin: as pools.js flood)
    floors.push(g); cells.add(c);
  }
  // walled in: every side of it but the lip holds its surface
  const holds = n => cols[n].some(h => h.bottom <= S - 0.25 && (h.fluid ? h.surf : h.top) >= S);
  for (const c of cells) for (const [ex, ez] of DIRS) {
    const n = idx(c % N + ex, ((c / N) | 0) + ez);
    if (!cells.has(n) && !wet.has(n) && n !== drop && !holds(n)) return null;
  }
  return banks(ctx, floors, S) ? floors : null;
}

// does the water at level F the fall pours into (in column c) have a shore somewhere: dry ground
// level with it or a level over it, under the sky, to walk in from and climb out onto?
function shored(ctx, c0, F) {
  const seen = new Set([c0]), todo = [c0];
  while (todo.length) {
    const c = todo.pop();
    for (const [ex, ez] of DIRS) {
      const x = c % N + ex, z = ((c / N) | 0) + ez;
      if (x < 0 || z < 0 || x >= N || z >= N) continue;
      const n = idx(x, z);
      if (seen.has(n)) continue;
      seen.add(n);
      const col = ctx.cols[n];
      if (col.some(f => f.fluid === WATER && f.surf === F)) { todo.push(n); continue; }
      if (col.some(f => !f.fluid && f.top >= F && f.top <= F + 1 && !col.some(g => g.bottom > f.top && g.bottom < f.top + 3))) return true;
    }
  }
  return false;
}

function carve(ctx, fall, s, wide, cells, hollows, walls, F) {
  // first the stream two across (what is over the cave or makes its wall stays the same floor)
  const bed = fall.top - 2;
  banks(ctx, wide, fall.top, true);
  for (const f of wide) { f.top = bed; f.fluid = WATER; f.surf = fall.top; if (!f.merged) f.bottom = Math.min(f.bottom, bed - 1); }
  for (const w of walls.values()) if (w) {
    for (const f of w.under) ctx.removeFloor(f);
    Object.assign(w.up, { bottom: w.base, merged: true });
  }
  const floors = cells.map((c, i) => {
    const { up, under, base, merged } = hollows[i];
    for (const f of under) ctx.removeFloor(f);
    // what was under the roof is the cave's floor now; the roof is a slab of its own for the
    // cutaway (game/cutinfo.js), like a tunnel's
    const floor = Object.assign(ctx.mk(c, F, base, fall.layer), { merged, grotto: true, noSpawn: true });
    Object.assign(up, { bottom: F + ROOF, merged: false, roof: true });
    ctx.cols[c].push(floor);
    ctx.noCross.add(c);   // no stair, bridge or ladder in it
    return floor;
  });
  fall.side = s;
  fall.width = GROTTO_WIDTH;
  fall.grotto = true;
  ctx.grotto = { fall, cells, floors };
  ctx.stats.fluids.push('a hidden cave behind a waterfall');
}

// where /waterfall puts the hero (game/dev.js goWaterfall): in the pool before the curtain, facing
// it (before its middle, else before one of its cells), not under a bridge; swimming where the
// water is deep
function before(ctx, fall) {
  const [dx, dz] = DIRS[fall.d], [sx, sz] = fallShift(fall), [ax, az] = acrossOf(fall);
  const ex = fall.c % N + 0.5 + sx - dx * 0.5, ez = ((fall.c / N) | 0) + 0.5 + sz - dz * 0.5;
  for (const k of [1.6, 1.2, 0.8]) for (const o of fall.side ? [0, -0.5, 0.5] : [0]) {
    const x = ex + dx * k + ax * o, z = ez + dz * k + az * o;
    if (x < 0 || z < 0 || x >= N || z >= N) continue;
    const c = idx(Math.floor(x), Math.floor(z)), w = ctx.cols[c].find(f => f.fluid === WATER && f.surf === fall.bot);
    if (!w || ctx.pieces?.[c]?.length) continue;   // (not under a bridge)
    const bed = floorY(w, x - Math.floor(x), z - Math.floor(z)), surf = w.surf * LH;
    if (bed > surf - 0.1) continue;   // (its bed comes up out of the water there: a bank's corner)
    const swim = surf - bed >= SWIM_DEPTH;
    return { x, z, y: swim ? surf - SWIM_FEET : bed, yaw: Math.atan2(-dx, -dz), swim };
  }
  return null;
}

// After the cube is checked (cubegen/index.js; `safe`: the floors that lead to the exit, null:
// all): the chest, as a reward site of its own beside the ones planned (world/sites.js), and
// map.grotto. A cave that cannot be got to and back from stays empty, behind a curtain like any
// other (it pushes back out), still as broad as its stream.
export function finishGrotto(ctx, safe, sites) {
  const g = ctx.grotto;
  if (!g) return null;
  const { fall, floors } = g, [dx, dz] = DIRS[fall.d];
  const mouth = floors[0], back = floors[1];
  const reach = reachFrom(ctx, ctx.portalFloors, true);
  const front = before(ctx, fall);
  if (!front || !floors.every(f => reach.has(f.id) && (!safe || safe.has(f.id)))) {
    fall.grotto = false;
    ctx.stats.grotto = 'empty: out of reach';
    return null;
  }
  const y = floorY(back, 0.5, 0.5), id = `${ctx.spec.key}:grotto`;
  const anchor = { x: back.x + 0.5, y, z: back.z + 0.5, yaw: Math.atan2(dx, dz) };   // (facing the mouth)
  const approach = { x: mouth.x + 0.5, y: floorY(mouth, 0.5, 0.5), z: mouth.z + 0.5 };
  sites.rewardSites.push({ id, seed: hash32(ctx.spec.seed ^ 0x6a0770), prestige: 'uncommon', biome: ctx.spec.biome,
    setting: 'grotto', form: 'grotto', encounter: null, spawn: 'treasure', layer: back.layer, landmark: null,
    cells: [...g.cells], anchor, floor: back.id, accessFloor: mouth.id, entryFloor: mouth.id, exitFloor: mouth.id, approach });
  sites.sitePlacements.push({ name: 'treasure_chest', ...anchor, s: CHEST_SCALE, site: id });
  const chest = propMetadata.get('treasure_chest');
  const b = { x: anchor.x, z: anchor.z, r: chest.radius * CHEST_SCALE, bottom: y, top: y + chest.maxY * CHEST_SCALE };
  for (let z = Math.max(0, Math.floor(b.z - b.r - CHAR_R)); z <= Math.min(N - 1, Math.floor(b.z + b.r + CHAR_R)); z++)
    for (let x = Math.max(0, Math.floor(b.x - b.r - CHAR_R)); x <= Math.min(N - 1, Math.floor(b.x + b.r + CHAR_R)); x++) sites.staticBlockers[idx(x, z)].push(b);
  sites.siteReservations.push(...floors.map(f => ({ c: f.c, layer: f.layer })));   // (no props in it)
  ctx.stats.grotto = floors.length + ' cells';
  return { fall: ctx.falls.indexOf(fall), cells: [...g.cells], site: id, front };
}
