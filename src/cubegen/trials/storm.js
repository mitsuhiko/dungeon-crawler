// The storm (docs/trials.md, `storm`): a tall hill in the room with the lightning rod on its summit
// (a needle of rock, sixteen levels over its foot), the way up a ramp once round it (the pinnacle's
// shape, cubegen/heights.js), with no rails. The gusts tear outwards off the hill (core/trials.js stormPhase,
// game/trials.js stepStorm): out on the ramp a gust carries you over its edge, down a lap or to the
// ground. Boulders stand on the ramp's outer edge, evenly, as few as let a slow player run from one
// to the next between two gusts (core/trials.js stormAllowance); the cells inside one are shelter
// (the gust only presses you against it). The summit is the storm's calm eye.
//   build: { eye: { x, z } (the hill's middle, cells), ramp: [cells], stones: [cells],
//            exposed: [cells] (the ramp's cells out in the wind), summit: [cells], rod: { c } }
import { N, MAX_L, RUN_SPEED } from '../../core/constants.js';
import { idx, clamp } from '../../core/util.js';
import { stormAllowance } from '../../core/trials.js';

const TAU = Math.PI * 2;
export const HILL = { summit: 2.3, lap: 2, arc: 0.9, rise: 16, reach: 0.75, up: 3 };   // (radii and widths in cells, arc in turns; reach: how much of the run allowed between boulders the way along the ramp's middle may take)

// where the side portals' pads are (their cells one step in from the face)
const pads = spec => spec.portals.filter(p => p.dir < 4).map(p => [[N - 2, p.pos], [1, p.pos], [p.pos, N - 2], [p.pos, 1]][p.dir]);

export function shapeStorm(ctx) {
  const { spec, lvl0, void0, R } = ctx;
  ctx.trialBuild = { kind: 'storm', failed: true, keep: [] };
  ctx.stats.mode = `${spec.kind} / storm`;
  const { summit: rs, lap: w, rise } = HILL, rOut = rs + w, foot = rOut + 1;
  // the hill's middle: in the middle of the room, as far from the pads as it gets
  const ps = pads(spec), spots = [];
  for (let z = N / 2 - 2; z <= N / 2 + 1; z++) for (let x = N / 2 - 2; x <= N / 2 + 1; x++)
    spots.push({ x, z, d: Math.min(...ps.map(([px, pz]) => Math.hypot(px - x, pz - z))) + R() * 1.5 });
  spots.sort((a, b) => b.d - a.d);
  const cx = spots[0].x + 0.5, cz = spots[0].z + 0.5;
  const t0 = R() * TAU, sense = R() < 0.5 ? 1 : -1, total = TAU * HILL.arc;   // (the way up, in radians from its foot)
  const around = [];
  for (let z = 2; z < N - 2; z++) for (let x = 2; x < N - 2; x++) if (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) >= foot) around.push(lvl0[idx(x, z)]);
  const lo = clamp(Math.round(around.reduce((s, v) => s + v, 0) / Math.max(1, around.length)), 3, 6), top = Math.min(lo + rise, MAX_L - 2);
  const ramp = [], summit = [], stones = [], info = new Map();
  for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) {
    const i = idx(x, z), dx = x + 0.5 - cx, dz = z + 0.5 - cz, d = Math.hypot(dx, dz);
    if (d >= foot + 1) { lvl0[i] = clamp(lvl0[i], lo - 1, lo + 1); continue; }   // (the field round it worn about flat)
    void0[i] = 0; ctx.keep.add(i);
    if (d < rs) { lvl0[i] = top; summit.push(i); continue; }
    if (d >= rOut) { lvl0[i] = lo; continue; }   // (the foot: a ring of flat ground round it)
    const u = ((sense * Math.atan2(dz, dx) - t0) % TAU + TAU) % TAU;   // (the way's angle from its foot)
    if (u > total) { lvl0[i] = lo; continue; }   // (the gap between the way's foot and its top: the foot)
    lvl0[i] = Math.round(lo + (top - 1 - lo) * u / total);
    ramp.push(i); info.set(i, { u, off: d - (rs + w / 2) });
  }
  const radius = () => rs + w / 2;
  // the boulders: on the outer edge of the way, evenly along it (by its middle line's length), as few
  // as keep each stretch within the run allowed between two gusts; but near its foot and its top
  const along = u => radius() * u, most = stormAllowance() * RUN_SPEED * HILL.reach;
  const every = along(total) / Math.max(2, Math.ceil(along(total) / most));
  const inward = i => { const x = i % N + 0.5, z = ((i / N) | 0) + 0.5, d = Math.hypot(x - cx, z - cz); return idx(Math.floor(x - (x - cx) / d), Math.floor(z - (z - cz) / d)); };
  for (const i of ramp) {
    const { u, off } = info.get(i), s = along(u), j = inward(i);
    if (off < w / 2 - 1 || s < 3 || u > total - 0.5 || s % every >= 1.6) continue;
    if (!info.has(j) || Math.abs(lvl0[j] - lvl0[i]) > 1 || info.get(j).off > w / 2 - 1) continue;   // (room to pass inside it)
    if (stones.some(q => Math.abs(q % N - i % N) <= 1 && Math.abs(((q / N) | 0) - ((i / N) | 0)) <= 1)) continue;
    stones.push(i);
  }
  for (const i of stones) lvl0[i] += HILL.up;
  // shelter: a ramp cell whose way out (from the eye) meets a boulder within a cell and a half
  const stoneSet = new Set(stones), exposed = [];
  for (const i of ramp) {
    if (stoneSet.has(i)) continue;
    const x = i % N + 0.5, z = ((i / N) | 0) + 0.5, d = Math.hypot(x - cx, z - cz), ux = (x - cx) / d, uz = (z - cz) / d;
    let shelter = false;
    for (const r of [0.6, 1, 1.4]) if (stoneSet.has(idx(Math.floor(x + ux * r), Math.floor(z + uz * r)))) shelter = true;
    if (!shelter) exposed.push(i);
  }
  // the rod in the middle of the summit
  const rod = summit.slice().sort((a, b) => Math.hypot(a % N + 0.5 - cx, ((a / N) | 0) + 0.5 - cz) - Math.hypot(b % N + 0.5 - cx, ((b / N) | 0) + 0.5 - cz))[0];
  const hill = [...summit, ...ramp];
  ctx.trialKeep = new Set(hill);
  ctx.noFence = new Set([...ctx.noFence || [], ...hill]);   // (no rails: the gusts carry you off)
  ctx.noBuild ??= new Set();
  for (const i of hill) ctx.noBuild.add(i);
  Object.assign(ctx.trialBuild, { failed: false, eye: { x: cx, z: cz }, lo, top, ramp, stones, exposed, summit, hill: new Set(hill),
    rod: { c: rod }, keep: hill });
}

// the way up is the ramp: nothing built onto, off or over the hill (walks, jumps and drops only)
export function stormRoute(ctx) {
  const movesFrom = ctx.movesFrom, on = f => !!ctx.trialBuild?.hill?.has(f.c);
  ctx.movesFrom = (f, ...rest) => movesFrom(f, ...rest).filter(m => m.kind === 'walk' || m.kind === 'drop' || m.kind === 'jump'
    || (!on(f) && !on(m.to) && !m.cells?.some(c => ctx.trialBuild?.hill?.has(c))));
}

export const stormGoal = ctx => ctx.trialBuild.failed ? null : ctx.layerFloor(ctx.trialBuild.rod.c, 0);
