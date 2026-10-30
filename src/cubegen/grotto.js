// A hidden cave behind a waterfall (docs/world.md "Waterfall grottos"): where a tall clear-water
// fall pours off a slab, a small cave opens right behind the curtain, level with the pool, and an
// uncommon chest waits at its back. Nothing marks it but the curtain, which comes down broader than
// a fall's usually does; the hero wades or swims through the falling water (it does not push them
// back out: physics/hazards.js) into the cave. It is closed all round: carved into the rock, or,
// under an overhang, walled in by bringing the slab down to the ground round it (the way a hill
// merges into a slab over it, cubegen/slabs.js), so it is seen from nowhere else.
//
// carveGrotto runs in the generator once the fluids are settled (before their shores), so the
// moves, routes and checks that follow know the cave; it draws nothing from the generator's
// random stream, so a cube without a grotto comes out exactly as it would without this stage.
// finishGrotto puts the chest in once the cube is checked, if the cave can be got to and back.
import { N, LH, DIRS, WATER, CHAR_R, SWIM_FEET } from '../core/constants.js';
import { idx, hash32 } from '../core/util.js';
import { floorY } from '../core/surfaces.js';
import { propMetadata } from '../core/propcatalog.js';
import { reachFrom } from './reach.js';
import { ROOF } from './tunnel.js';

export const GROTTO_DROP = 7;      // levels the fall drops at least: room for the cave under its lip
export const GROTTO_WIDTH = 2.2;   // world units across the curtain (a fall's usual: render/parts.js FALL_WIDTH)
const CHEST_SCALE = 0.8;

// the cells of the cave, the mouth first: a room of three across behind the mouth, else a short
// passage of two
function shapes(x, z, d) {
  const [dx, dz] = DIRS[d], lx = dz, lz = dx, bx = x - dx, bz = z - dz;
  return [
    [[x, z], [bx, bz], [bx + lx, bz + lz], [bx - lx, bz - lz]],
    [[x, z], [bx, bz]],
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
    if (fall.type !== WATER || fall.in || fall.out || fall.top - fall.bot < GROTTO_DROP) continue;
    const F = fall.bot, [dx, dz] = DIRS[fall.d];
    if (!cols[fall.c].some(f => f.fluid === WATER && f.surf === F)) continue;   // (it pours into its own pool)
    if (!shored(ctx, fall.c, F)) continue;   // (not a pool down a pit, which nobody gets into)
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
    for (const shape of shapes(x0, z0, fall.d)) {
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
        if (set.has(n) || n === fall.c || walls.has(n)) continue;
        if (cols[n].some(f => f.bottom <= F && f.top >= F + ROOF)) { walls.set(n, null); continue; }
        const fill = !ctx.border({ x, z }) && !keptCell(n) && split(n, F + ROOF);
        if (!fill) { closed = false; break; }
        walls.set(n, fill);
      }
      if (!closed) continue;
      carve(ctx, fall, cells, hollows, walls, F);
      return;
    }
  }
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

function carve(ctx, fall, cells, hollows, walls, F) {
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
  fall.width = GROTTO_WIDTH;
  fall.grotto = true;
  ctx.grotto = { fall, cells, floors };
  ctx.stats.fluids.push('a hidden cave behind a waterfall');
}

// where /waterfall puts the hero (game/dev.js goWaterfall): in the pool before the curtain, facing
// it; swimming where the water is deep
function before(ctx, fall) {
  const [dx, dz] = DIRS[fall.d], ex = fall.c % N + 0.5 - dx * 0.5, ez = ((fall.c / N) | 0) + 0.5 - dz * 0.5;
  for (const k of [1.6, 1.2, 0.8]) {
    const x = ex + dx * k, z = ez + dz * k;
    if (x < 0 || z < 0 || x >= N || z >= N) continue;
    const w = ctx.cols[idx(Math.floor(x), Math.floor(z))].find(f => f.fluid === WATER && f.surf === fall.bot);
    if (!w) continue;
    const swim = w.top <= w.surf - 2;
    return { x, z, y: swim ? w.surf * LH - SWIM_FEET : w.top * LH, yaw: Math.atan2(-dx, -dz), swim };
  }
  return null;
}

// After the cube is checked (cubegen/index.js; `safe`: the floors that lead to the exit, null:
// all): the chest, as a reward site of its own beside the ones planned (world/sites.js), and
// map.grotto. A cave that cannot be got to and back from stays empty, its curtain a usual one.
export function finishGrotto(ctx, safe, sites) {
  const g = ctx.grotto;
  if (!g) return null;
  const { fall, floors } = g, [dx, dz] = DIRS[fall.d];
  const mouth = floors[0], back = floors[1];
  const reach = reachFrom(ctx, ctx.portalFloors, true);
  const front = before(ctx, fall);
  if (!front || !floors.every(f => reach.has(f.id) && (!safe || safe.has(f.id)))) {
    fall.width = undefined; fall.grotto = false;
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
