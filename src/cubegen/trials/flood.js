// The flood's room (docs/trials.md, `flood`): a flat field with a summit in it, a needle of rock
// with a railed ramp once round it (the pinnacle's shape, cubegen/heights.js), its top 19-21
// levels up under the sky, 14-16 under rock walls, at least ten over its foot. You come in on
// the ground, the water rises, and you climb to the button on the summit.
import { N, MAX_L } from '../../core/constants.js';
import { idx, clamp } from '../../core/util.js';
import { PINNACLE_TOP } from '../heights.js';

const TAU = Math.PI * 2;
const wrap = a => ((a % TAU) + TAU) % TAU;
const inner = fn => { for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) fn(x, z, idx(x, z)); };
const ring = (x, z) => Math.min(x, z, N - 1 - x, N - 1 - z);   // 0 on the cube's outer ring

// where the side portals' pads are (their cells one step in from the face)
const pads = spec => spec.portals.filter(p => p.dir < 4).map(p => {
  const t = p.pos;
  return [[N - 2, t], [1, t], [t, N - 2], [t, 1]][p.dir];
});

export function shapeFlood(ctx) {
  const { spec, lvl0, void0, R } = ctx, walled = spec.walled;
  const rt = PINNACLE_TOP, ramp = rt + 1.7, foot = ramp + 1.2;
  // the summit's centre: in the middle of the room, as far from the pads as it gets
  const ps = pads(spec), spots = [];
  for (let z = N / 2 - 2; z <= N / 2 + 1; z++) for (let x = N / 2 - 2; x <= N / 2 + 1; x++)
    spots.push({ x, z, d: Math.min(...ps.map(([px, pz]) => Math.hypot(px - x, pz - z))) + R() * 1.5 });
  spots.sort((a, b) => b.d - a.d);
  const { x: sx, z: sz } = spots[0], cx = sx + 0.5, cz = sz + 0.5;
  const t0 = R() * TAU, arc = TAU * 0.9, sense = R() < 0.5 ? 1 : -1;
  // the field: the ground worn flat round its foot
  const around = [];
  inner((x, z, i) => { if (ring(x, z) >= 2) around.push(lvl0[i]); });
  const lo = clamp(Math.round(around.reduce((s, v) => s + v, 0) / Math.max(1, around.length)), 3, 8);
  const want = walled ? 14 + Math.floor(R() * 3) : 19 + Math.floor(R() * 3);
  const top = ctx.pinnacleTop = clamp(Math.max(want, lo + 10), want, MAX_L - 2);
  const summit = new Set(), ways = new Set();
  inner((x, z, i) => {
    void0[i] = 0;
    const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
    if (d >= foot + 1) { if (ring(x, z) >= 2) lvl0[i] = clamp(lvl0[i], lo - 1, lo + 1); return; }
    ctx.keep.add(i);
    if (d < rt) { lvl0[i] = top; summit.add(i); ctx.pinnacle.add(i); ctx.rails.add(i); return; }
    if (d < ramp) {
      const a = wrap(sense * (Math.atan2(z + 0.5 - cz, x + 0.5 - cx) - t0));
      lvl0[i] = a <= arc ? Math.round(lo + (top - 1 - lo) * a / arc) : lo;
      if (a <= arc) { ctx.pinnacle.add(i); ctx.rails.add(i); ways.add(i); }
    } else if (d < foot) lvl0[i] = lo;
    else lvl0[i] = Math.min(lvl0[i], lo + 2);
  });
  ctx.trialKeep = new Set([...summit, ...ways]);
  ctx.trialBuild = { kind: 'flood', summit: { x: sx, z: sz, c: idx(sx, sz), level: top, cells: [...summit] }, ramp: [...ways], lo, keep: [...summit, ...ways] };
  ctx.stats.mode = spec.kind + ' / flood';
}

// the way up the summit is its ramp: any structure onto or off the needle (but a walk, or a drop
// off it: one way, down) costs a lot more, so the route and the ways out keep to the ramp
export function floodRoute(ctx) {
  const movesFrom = ctx.movesFrom, on = f => ctx.trialKeep.has(f.c);
  ctx.movesFrom = (f, ...rest) => movesFrom(f, ...rest).map(m => m.kind === 'walk' || (m.kind === 'drop' && on(f)) || (!on(f) && !on(m.to))
    ? m : { ...m, cost: m.cost + 60 });
}

// the goal of the way up: the button's floor in the middle of the summit
export const floodGoal = ctx => ctx.layerFloor(ctx.trialBuild.summit.c, 0);
