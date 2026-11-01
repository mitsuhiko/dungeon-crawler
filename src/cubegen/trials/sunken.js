// The sunken room (docs/trials.md, `sunken`), the first combiner: two puzzles of the rotation, each
// mounted as in a room of its own (cubegen/trials/puzzles.js), tied together by the water. You come
// in from up high (the entry portal on the top layer, level 16) and everything under you is
// flooded; each puzzle solved drains the room a stage further, uncovering the way to the next, until
// the ground and the exit come out of the water.
//
// The room is split in two halves along one axis (A), N / 2 - 1 cells each (11): the entry's and the exit's.
// Along the other axis (B) each half holds its puzzle's deck at the far end (the field's short side
// across the half) and, at the near end, its part of the strip (STRIP cells wide) where the portals
// stand. The entry's half stands at the entry's height (its strip the terrace you come in on, the
// first deck), the exit's lower (the second deck, dry once the first is solved), the exit's pad on
// the ground under it. Each deck's way in faces the strip; the two halves' strips are joined by
// whatever the route search builds (stairs, ladders) over the water.
//   build: { puzzles: [pz, pz], water: [W_0, W_1, W_2], levels: [q_0, q_1], layout, exitPad }
import { N } from '../../core/constants.js';
import { idx } from '../../core/util.js';
import { edgeCell } from '../portals.js';
import { mountPuzzle, deckSpan } from './puzzles.js';
import { BASIN } from '../../core/trials.js';

// the strip's width at depth d: what the longest decks leave (9 cells from depth 10, else 8)
export const sunkenStrip = d => d >= 10 ? 5 : 6;

// Which way round a sunken room goes for its entry and exit portals ({ dir, pos }), its strip L cells
// wide: both pads in the strip, in different halves. -> { axis (A: the axis split into halves), end
// (0: the strip at the low end of B), entryHalf (0: A's low half) } or null (none fits)
export function sunkenLayout(entry, exit, L) {
  for (const axis of ['x', 'z']) for (const end of [0, 1]) {
    const across = axis === 'x' ? [0, 1] : [2, 3], near = axis === 'x' ? (end ? 2 : 3) : (end ? 0 : 1);
    const half = ({ dir, pos }) => {
      // on a face across the halves: its half by the face, its pad in the strip
      if (across.includes(dir)) return (end ? pos - 1 >= N - 1 - L : pos + 1 <= L) ? (dir === across[0] ? 1 : 0) : null;
      // on the strip's own face: its half by where it stands along it (the pad all in one)
      if (dir !== near) return null;
      return pos + 1 <= N / 2 - 1 ? 0 : pos - 1 >= N / 2 ? 1 : null;
    };
    const he = half(entry), hx = half(exit);
    if (he != null && hx != null && he !== hx) return { axis, end, entryHalf: he };
  }
  return null;
}

// the water's levels: W_0 under the entry's terrace, W_(n-1) two over the exit, evenly between, the
// last down to the rivers'; a stage platform stands a level over the water it is dry at
export function sunkenLevels(top, exit, n) {
  const W = [top - 1];
  for (let i = 1; i < n; i++) W.push(Math.round(top - 1 - (top - 1 - (exit + 2)) * i / (n - 1)));
  W.push(BASIN);
  const q = [top, ...W.slice(1, n).map(w => w + 1)];
  for (let i = 1; i < n; i++) if (W[i - 1] - W[i] < 2 || q[i] >= W[i - 1]) return null;
  if (W[n - 1] <= exit) return null;
  return { W, q };
}

const SD = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function shapeSunken(ctx) {
  const { spec, lvl0, void0 } = ctx, stages = spec.trial.stages || ['braziers', 'crates'], depth = spec.depth;
  ctx.trialBuild = { kind: 'sunken', failed: true, keep: [] };
  ctx.stats.mode = spec.kind + ' / sunken room';
  const entry = spec.portals.find(p => p.dir === spec.trial.entry), exit = spec.portals.find(p => p.dir === spec.trial.exit);
  if (!entry || !exit || !entry.layer || stages.length !== 2) return;
  const L = sunkenStrip(depth), lay = sunkenLayout(entry, exit, L), levels = lay && sunkenLevels(entry.level, exit.level, 2);
  if (!levels) return;
  const at = (a, b) => lay.axis === 'x' ? idx(a, b) : idx(b, a), xz = (a, b) => lay.axis === 'x' ? [a, b] : [b, a];
  const halfA = h => h ? [N / 2, N - 2] : [1, N / 2 - 1], strip = lay.end ? [N - 1 - L, N - 2] : [1, L];
  const halves = [lay.entryHalf, 1 - lay.entryHalf];   // (stage i's half)
  // every cell of a half its stage's platform: the entry's at the terrace's height
  const terrace = [];
  halves.forEach((h, i) => {
    const [a0, a1] = halfA(h);
    for (let a = a0; a <= a1; a++) for (let b = 1; b <= N - 2; b++) {
      const c = at(a, b);
      lvl0[c] = levels.q[i]; void0[c] = 0; ctx.keep.add(c);
      if (i === 0 && b >= strip[0] && b <= strip[1]) terrace.push(c);
    }
  });
  // the exit's pad down on the ground, under the water until the end
  const exitPad = [];
  for (let t = exit.pos - 1; t <= exit.pos + 1; t++) for (let j = 0; j < 2; j++) exitPad.push(edgeCell(exit.dir, t, j));
  for (const c of exitPad) if (c % N >= 1 && c % N <= N - 2 && c >= N && c < N * (N - 1)) lvl0[c] = exit.level;
  // the decks: at the far end of their halves, their way in facing the strip (a slide's goal's gate too)
  const side = lay.axis === 'x' ? (lay.end ? 2 : 3) : (lay.end ? 0 : 1);
  const built = [];
  for (let i = 0; i < 2; i++) {
    const h = halves[i], kind = stages[i], level = levels.q[i], D = deckSpan(kind, depth).long, [a0, a1] = halfA(h);
    const [b0, b1] = lay.end ? [1, D] : [N - 1 - D, N - 2];
    const [x0, z0] = xz(a0, b0), [x1, z1] = xz(a1, b1);
    const towards = xz((a0 + a1 + 1) / 2, (strip[0] + strip[1] + 1) / 2);
    const pz = mountPuzzle(ctx, kind, depth, { towards, within: { x0, z0, x1, z1, level, walk: 0 }, entrySide: side, goalSides: [side], short: lay.axis });
    if (!pz) return;
    // where you stand to begin it: beyond a slide's or the crates' gap, else on the ring in front of the field
    const [dx, dz] = SD[side], d = pz.deck;
    pz.approach = kind === 'slide' ? pz.entryGap + dx + dz * N : pz.approach != null ? pz.approach
      : idx(dx > 0 ? d.x0 + d.w : dx < 0 ? d.x0 - 1 : d.x0 + (d.w >> 1), dz > 0 ? d.z0 + d.h : dz < 0 ? d.z0 - 1 : d.z0 + (d.h >> 1));
    pz.stage = i; pz.level = level;
    built.push(pz);
  }
  ctx.trialKeep = new Set([...ctx.trialKeep || [], ...terrace]);
  Object.assign(ctx.trialBuild, { failed: false, puzzles: built, water: levels.W, levels: levels.q, layout: lay, entryLevel: entry.level,
    exitLevel: exit.level, exitPad, keep: [...ctx.trialKeep] });
}

// the first stage's plate: the route goes there first (and on, over the platforms, to the exit)
export const sunkenGoal = ctx => ctx.trialBuild.failed ? null : ctx.layerFloor(ctx.trialBuild.puzzles[0].goalCell, 0);
