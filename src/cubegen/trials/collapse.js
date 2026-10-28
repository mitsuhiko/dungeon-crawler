// The crumbling floor's room (docs/trials.md, `collapse`): an entry apron and an exit apron
// (3x3, solid) in front of the two portals, and between them the crust: a winding causeway two
// cells wide, 25-40 cells along, with a dead end or two and now and then a one-cell gap to jump.
// Under it a basin of the depth's fluid; rock walls all round (world/profile.js caveWall), so
// the crust is the only way. Once armed, the crust crumbles behind you in a wave from the entry.
//
// The causeway is laid on a grid of 2x2 blocks: a path of blocks no two of which touch (not even
// at a corner) unless they follow each other, so nothing leads across from one stretch to the next.
import { N } from '../../core/constants.js';
import { idx } from '../../core/util.js';
import { edgeCell } from '../portals.js';

const inner = fn => { for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) fn(x, z, idx(x, z)); };
const cheb = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
const AX = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// a portal's pad (2 deep), apron (3x3 in front of it; inner: its row towards the room) and the
// ground beside the pad on the face, where the wall leaves the portal room (the ears)
export function apron(spec, dir) {
  const p = spec.portals.find(q => q.dir === dir);
  if (!p) return null;
  const pad = [], cells = [], inner = [], rows = [];
  for (let t = p.pos - 1; t <= p.pos + 1; t++) {
    for (let j = 0; j < 2; j++) pad.push(edgeCell(dir, t, j));
    for (let j = 2; j < 5; j++) { cells.push(edgeCell(dir, t, j)); rows.push([edgeCell(dir, t, j), j - 2]); }
    inner.push(edgeCell(dir, t, 4));
  }
  const ears = [p.pos - 2, p.pos + 2].filter(t => t >= 0 && t < N).flatMap(t => [edgeCell(dir, t, 0), edgeCell(dir, t, 1)]);
  return { p, pad, cells, inner, rows, ears, level: p.level, centre: edgeCell(dir, p.pos, 3) };
}

// the cells of block b (origin o: the grid starts on the ring inside the walls, or one cell further in)
const blockCells = (o, [bx, bz]) => {
  const x = 1 + o[0] + 2 * bx, z = 1 + o[1] + 2 * bz;
  return [idx(x, z), idx(x + 1, z), idx(x, z + 1), idx(x + 1, z + 1)];
};
const xz = c => [c % N, (c / N) | 0];
const touches = (cells, set, d = 1) => cells.some(c => { const [x, z] = xz(c); return set.some(s => cheb([x, z], xz(s)) <= d); });
const edgeTouch = (cells, set) => cells.some(c => { const [x, z] = xz(c); return set.some(s => { const [sx, sz] = xz(s); return Math.abs(sx - x) + Math.abs(sz - z) === 1; }); });

// A path of blocks from one by the entry apron to one by the exit apron, `want` blocks long or
// more (at most `most`), found by a randomized search with backtracking (null: none)
// (what a jump can cross: one cell of basin always, two with a long drop; so the stretches of the
// way keep two cells of basin between them, at one level, and three from the aprons, the pads and
// the ground beside them)
function causeway(R, o, entry, exit, want, most) {
  const nb = (12 - o[0]) >> 1, nz = (12 - o[1]) >> 1, ok = new Map();
  const anchored = a => [...a.cells, ...a.pad, ...a.ears];
  const all = [...anchored(entry), ...anchored(exit)];
  for (let bz = 0; bz <= nz; bz++) for (let bx = 0; bx <= nb; bx++) {
    const cells = blockCells(o, [bx, bz]);
    if (touches(cells, all, 0)) continue;
    const nearE = touches(cells, anchored(entry), 2), nearX = touches(cells, anchored(exit), 2);
    // by the entry: only where it meets the apron's inner row along an edge, well clear of the rest
    // of it and of the exit's (and the other way round)
    const start = !nearX && edgeTouch(cells, entry.inner) && !touches(cells, [...entry.pad, ...entry.ears], 2);
    const end = !nearE && edgeTouch(cells, exit.inner) && !touches(cells, [...exit.pad, ...exit.ears], 2);
    ok.set(`${bx},${bz}`, { b: [bx, bz], cells, near: nearE || nearX, nearE, nearX, start, end });
  }
  const starts = [...ok.values()].filter(v => v.start);
  let budget = 40000;
  const path = [];
  // near its own apron a block may only be at the start of the way (or its end): a jump there
  // skips little
  const fits = v => {
    const n = path.length;
    if (n === 0 ? !v.start : v.start || (v.nearE && (n > 2 || v.nearX)) || (v.nearX && v.nearE)) return false;
    for (let j = 0; j < n; j++) {
      const d = cheb(v.b, path[j].b);
      if (d === 0 || (j < n - 2 && d <= 1)) return false;
    }
    return true;
  };
  function dfs() {
    if (--budget < 0) return false;
    const last = path.at(-1);
    if (last.end) return path.length >= want;
    if (path.length >= most) return false;
    const firstX = path.findIndex(w => w.nearX);
    if (firstX >= 0 && path.length - 1 - firstX >= 2) return false;   // by the exit: the end within two blocks
    const next = AX.map(([dx, dz]) => ok.get(`${last.b[0] + dx},${last.b[1] + dz}`)).filter(v => v && fits(v));
    for (let i = next.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [next[i], next[j]] = [next[j], next[i]]; }
    for (const v of next) { path.push(v); if (dfs()) return true; path.pop(); }
    return false;
  }
  for (const s of starts.sort(() => R() - 0.5)) {
    path.length = 0; path.push(s);
    if (dfs()) return { path: path.slice(), ok };
    if (budget < 0) break;
  }
  return null;
}

export function shapeCollapse(ctx) {
  const { spec, lvl0, void0, R, ri } = ctx;
  const entry = apron(spec, spec.trial.entry), exit = apron(spec, spec.trial.exit);
  ctx.trialBuild = { kind: 'collapse', failed: true, keep: [] };
  ctx.stats.mode = spec.kind + ' / collapse';
  if (!entry || !exit) return;
  // the crust stands at one level, the higher apron's; the lower apron climbs to it row by row
  const level = Math.max(entry.level, exit.level);
  if (level - Math.min(entry.level, exit.level) > 6) return;
  // the way: a few tries, the first with room for a dead end off it (else the best without)
  let found = null, spare = null;
  for (let tries = 0; tries < 6 && !found; tries++) for (const want of [13, 12, 11, 10, 9, 8]) {
    let way = null;
    for (const o of [[0, 0], [1, 0], [0, 1], [1, 1]].sort(() => R() - 0.5)) {
      way = causeway(R, o, entry, exit, want, 16);
      if (way) { way.o = o; break; }
    }
    if (!way) continue;
    way.branches = deadEnds(way, ri, R);
    if (way.branches.length) { found = way; break; }
    spare ??= way;
  }
  found ??= spare;
  if (!found) return;
  const { path, o, branches } = found;
  build(ctx, entry, exit, level, path, o, branches);
}

// dead ends: one or two, two or three blocks off the way, touching nothing but where they leave it
function deadEnds({ path, ok }, ri) {
  const used = new Set(path.map(v => `${v.b}`)), branches = [];
  for (let n = ri(1, 2), tries = 0; branches.length < n && tries < 40; tries++) {
    const i = ri(2, path.length - 3);
    if (i < 2 || i > path.length - 3) break;
    const len = ri(2, 3), [dx, dz] = AX[ri(0, 3)], blocks = [];
    for (let s = 1; s <= len; s++) {
      const b = [path[i].b[0] + dx * s, path[i].b[1] + dz * s], v = ok.get(`${b}`);
      if (!v || v.near || used.has(`${b}`)) break;
      // it touches nothing but the block it leaves (and, the first one, at a corner the blocks
      // either side of that), nor another dead end
      const clear = path.every((w, j) => j === i || cheb(w.b, b) > 1 || (s === 1 && Math.abs(j - i) === 1 && cheb(w.b, b) === 1
        && Math.abs(w.b[0] - b[0]) + Math.abs(w.b[1] - b[1]) === 2)) && branches.flat().every(w => cheb(w.b, b) > 1);
      if (!clear) break;
      blocks.push(v);
    }
    if (blocks.length !== len) continue;
    blocks.forEach(v => used.add(`${v.b}`));
    branches.push(blocks.map(v => ({ ...v, from: i })));
  }
  return branches;
}

function build(ctx, entry, exit, level, path, o, branches) {
  const { spec, lvl0, void0, R, ri } = ctx;
  // gaps: now and then a block's first row is gone (a one-cell gap to jump), on a straight stretch
  // (two blocks of it before the gap: a run-up)
  const gaps = new Set(), straight = (a, b, c) => b[0] - a[0] === c[0] - b[0] && b[1] - a[1] === c[1] - b[1];
  for (let n = ri(1, 2), tries = 0; gaps.size < n && tries < 30; tries++) {
    const i = ri(3, path.length - 4);
    if (i < 3 || i > path.length - 4 || [...gaps].some(g => Math.abs(g - i) < 4)) continue;
    const [z, a, b, c] = [path[i - 2].b, path[i - 1].b, path[i].b, path[i + 1].b];
    if (!straight(a, b, c) || !straight(z, a, b)) continue;
    gaps.add(i);
  }
  const n = path.length, levelAt = () => level;
  const crust = new Map();   // cell -> { level, i (block on the way), branch }
  path.forEach((v, i) => {
    let cells = v.cells;
    if (gaps.has(i)) {   // the row next to the block before is gone
      const [ax, az] = path[i - 1].b, [bx, bz] = v.b, dx = bx - ax, dz = bz - az;
      cells = cells.filter(c => { const [x, z] = xz(c), lx = x - (1 + o[0] + 2 * bx), lz = z - (1 + o[1] + 2 * bz); return dx ? (dx > 0 ? lx === 1 : lx === 0) : (dz > 0 ? lz === 1 : lz === 0); });
    }
    for (const c of cells) crust.set(c, { level: levelAt(i), i, branch: false });
  });
  for (const b of branches) for (const v of b) for (const c of v.cells) crust.set(c, { level: levelAt(v.from), i: v.from, branch: true });
  // the room: the basin everywhere inside, the aprons and the crust standing in it
  // the aprons: from the pad's level up to the crust's, a third of the way each row
  const aprons = new Map();
  for (const a of [entry, exit]) for (const [c, row] of a.rows) aprons.set(c, Math.round(a.level + (level - a.level) * (row + 1) / 3));
  const pads = new Set([...entry.pad, ...exit.pad]);
  inner((x, z, i) => {
    if (pads.has(i)) { void0[i] = 0; ctx.keep.add(i); return; }
    if (aprons.has(i)) { void0[i] = 0; lvl0[i] = aprons.get(i); ctx.keep.add(i); return; }
    const c = crust.get(i);
    if (c) { void0[i] = 0; lvl0[i] = c.level; ctx.keep.add(i); return; }
    void0[i] = 0; lvl0[i] = 0; ctx.seaCells.push(i); ctx.keep.add(i);
  });
  ctx.trialKeep = new Set([...crust.keys(), ...entry.cells, ...exit.cells]);
  ctx.noFence = new Set(crust.keys());
  Object.assign(ctx.trialBuild, { failed: false, entryApron: entry.cells, exitApron: exit.cells, entryCentre: entry.centre, exitCentre: exit.centre,
    crust, gaps: [...gaps], branches: branches.length, blocks: n, keep: [...ctx.trialKeep] });
}

// no structures in the crumbling room: the crust (and its gaps, jumped) is the only way
export function collapseRoute(ctx) {
  const movesFrom = ctx.movesFrom;
  ctx.movesFrom = (f, ...rest) => movesFrom(f, ...rest).filter(m => m.kind === 'walk' || m.kind === 'jump' || m.kind === 'drop');
}

// the goal: the middle of the exit apron
export const collapseGoal = ctx => ctx.trialBuild.failed ? null : ctx.layerFloor(ctx.trialBuild.exitCentre, 0);
