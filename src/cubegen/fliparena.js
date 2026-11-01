// Flip's arena (core/bosses.js BOSS_ARENAS.flip, docs/bosses.md): a box of solid cells that can be
// turned any way up (core/flip.js). A floor (`bottom`, as thick as the doorways' level), four
// walls a cell thick all round, open at the top, and a floating island in the middle. Each wall
// has a few holes up high (the entrance's doorway is one too, low in its wall); when the world
// turns and a wall becomes the floor, they are holes in it (shut while anyone falls, game/
// flipworld.js). On every side stand things to climb and fight round (daises, towers, ledges,
// pyramids, humps, each with its stairs: FEATURES), overhead on a wall, and small clutter glued to
// it. The doorway, the well and the boss's spot on the floor stay clear, and so does the middle of
// every side (where the fight goes on after a turn) and the way from the doorway to the well.
import { N, LH, at16, count16 } from '../core/constants.js';
import { idx } from '../core/util.js';
import { floorY } from '../core/surfaces.js';
import { S, vi, GROUP, SIDES, FACES, IDENTITY, orientedFloors, dirIndex, turnTo, turnPoint } from '../core/flip.js';
import { themeOf } from '../themes/depth.js';
import { rockTint } from '../themes/surfaces.js';
import { smallProps } from './arenaprops.js';
import { finishArena, reachFrom } from './arenamap.js';

export const FLIP_ARENA = Object.freeze({
  island: { r: at16(4.1), y0: Math.round(at16(7)), y1: Math.round(at16(7)) + 2 },   // the floating island: its radius (cells) and the cells it fills up the box
  door: 3,                            // cells the doorway is high
  holes: [count16(3), count16(4)],    // holes in each wall (least, most)
  balcony: { rise: 4, depth: 4, length: 5 },   // a balcony: cells up (its staircase's steps), out of its wall, along it
  features: [count16(3), count16(4)], // things to climb on each side (cubegen/fliparena.js FEATURES)
  pillars: [count16(1), count16(2)],  // ... and pillars
  clutter: [count16(12), count16(18)],   // small things glued to each side
});
// the wall of each face direction (DIRS order: +x, -x, +z, -z)
const WALL = ['px', 'nx', 'pz', 'nz'];

// Is the box (flip, as far as it is built) a floor to fight on with every side down: the floors
// at the side's level all one walkable piece (but for a few corners), and side `face`'s balcony
// (its cells `cells`) up its staircase from there?
const TURNS = Object.keys(FACES).map(f => [f, f === 'bottom' ? IDENTITY : turnTo(IDENTITY, f, 0).O]);
// the cells `cells` (box frame; stairs are skipped) are tops of the fight's floors with the box turned by O
function reached(flip, O, cells, floors = null) {
  const { cols } = floors ?? orientedFloors(flip, O);
  return cells.every(i => {
    if (flip.stairs[i]) return true;
    const p = turnPoint(O, i % S + 0.5, Math.floor(i / (S * S)) + 0.5, Math.floor(i / S) % S + 0.5), top = (Math.floor(p.y) + 1) * 2;
    return cols[Math.floor(p.z) * S + Math.floor(p.x)].some(f => f.top === top && f.encounter);
  });
}
// (and every balcony there is, `shelves`, up its staircase from its own side)
function walkable(flip, face, cells, shelves = []) {
  for (const [down, O] of TURNS) {
    const turned = orientedFloors(flip, O), { floors } = turned, fight = floors.filter(f => f.encounter);
    if (!fight.length) return false;
    // (upside down the floor is the island, whatever else stands at its height)
    const base = Math.min(...fight.map(f => f.top)), cut = floors.filter(f => f.top === base && !f.encounter && f.link.some(Boolean));
    if (down !== 'top' && cut.length > 2) return false;
    // (a stair leads somewhere both ways: not up against what something of another side put there)
    if (fight.some(f => f.stair && f.link.filter(Boolean).length < 2)) return false;
    if (down === face && !reached(flip, O, cells, turned)) return false;
    for (const sh of shelves) if (sh.face === down && !reached(flip, O, sh.cells, turned)) return false;
  }
  return true;
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// cell i (box frame) as a cell of wall `host` (u * S + v in its frame, as wallCell)
function hostKey(host, i) {
  const x = i % S, z = Math.floor(i / S) % S, y = Math.floor(i / (S * S));
  return host === 'px' || host === 'nx' ? z * S + y : x * S + y;
}
// Each side's frame: at(u, v, h) the cell (u, v) of it h cells out of its surface (box frame),
// way([a, b]) the box-frame way of a along u and b along v, up its outward-in normal (the floor's
// up when it is down). The island's is its underside (the floor upside down).
export function frames(bottom) {
  const I = FLIP_ARENA.island, side = (at, U, V, up) => ({ at, up, way: ([a, b]) => U.map((x, i) => x * a + V[i] * b) });
  return {
    bottom: side((u, v, h) => [u, bottom + h, v], [1, 0, 0], [0, 0, 1], [0, 1, 0]),
    px: side((u, v, h) => [S - 2 - h, v, u], [0, 0, 1], [0, 1, 0], [-1, 0, 0]),
    nx: side((u, v, h) => [1 + h, v, u], [0, 0, 1], [0, 1, 0], [1, 0, 0]),
    pz: side((u, v, h) => [u, v, S - 2 - h], [1, 0, 0], [0, 1, 0], [0, 0, -1]),
    nz: side((u, v, h) => [u, v, 1 + h], [1, 0, 0], [0, 1, 0], [0, 0, 1]),
    island: side((u, v, h) => [u, I.y0 - 1 - h, v], [1, 0, 0], [0, 0, 1], [0, -1, 0]),
  };
}
// The things that stand on a side, in its own frame (a along it, b across, h cells up): solid
// cells and stair cells (`rise`: the way the stair goes up), and in front of each flight of
// stairs the cell it starts from (`fronts`, kept clear). R: the arena's random numbers.
//   dais     a platform a cell high, 2-4 by 2-3, a stair up its front
//   tower    two cells high, 2 by 2, a flight of two stairs up to it
//   ledge    a long low wall a cell high, a stair up each end
//   pyramid  a cell high with a stair up every side
//   hump     two cells high, a flight of two stairs up each end
//   pillar   a cell or two high, nothing to climb
export const FEATURES = {
  dais: R => {
    const w = 2 + Math.floor(R() * 3), d = 2 + Math.floor(R() * 2), m = Math.floor(w / 2), cells = [];
    for (let b = 0; b < d; b++) for (let a = 0; a < w; a++) cells.push({ a, b, h: 0 });
    cells.push({ a: m, b: -1, h: 0, rise: [0, 1] });
    return { cells, fronts: [[m, -2]] };
  },
  tower: () => {
    const cells = [];
    for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) cells.push({ a, b, h: 0 }, { a, b, h: 1 });
    cells.push({ a: 0, b: -1, h: 0 }, { a: 0, b: -1, h: 1, rise: [0, 1] }, { a: 0, b: -2, h: 0, rise: [0, 1] });
    return { cells, fronts: [[0, -3]] };
  },
  ledge: R => {
    const L = 3 + Math.floor(R() * 3), cells = [];
    for (let a = 0; a < L; a++) cells.push({ a, b: 0, h: 0 });
    cells.push({ a: -1, b: 0, h: 0, rise: [1, 0] }, { a: L, b: 0, h: 0, rise: [-1, 0] });
    return { cells, fronts: [[-2, 0], [L + 1, 0]] };
  },
  pyramid: () => ({ cells: [{ a: 0, b: 0, h: 0 }, { a: 1, b: 0, h: 0, rise: [-1, 0] }, { a: -1, b: 0, h: 0, rise: [1, 0] },
    { a: 0, b: 1, h: 0, rise: [0, -1] }, { a: 0, b: -1, h: 0, rise: [0, 1] }], fronts: [[2, 0], [-2, 0], [0, 2], [0, -2]] }),
  hump: () => {
    const cells = [];
    for (let a = 0; a < 2; a++) cells.push({ a, b: 0, h: 0 }, { a, b: 0, h: 1 });
    cells.push({ a: -1, b: 0, h: 0 }, { a: -1, b: 0, h: 1, rise: [1, 0] }, { a: -2, b: 0, h: 0, rise: [1, 0] });
    cells.push({ a: 2, b: 0, h: 0 }, { a: 2, b: 0, h: 1, rise: [-1, 0] }, { a: 3, b: 0, h: 0, rise: [-1, 0] });
    return { cells, fronts: [[-3, 0], [4, 0]] };
  },
  pillar: R => ({ cells: [{ a: 0, b: 0, h: 0 }, ...R() < 0.5 ? [{ a: 0, b: 0, h: 1 }] : []], fronts: [] }),
};

// The cell of wall `face` at (u along it, v up it), j cells in from the outside (box frame)
function wallCell(face, u, v, j = 0) {
  if (face === 'px') return [S - 1 - j, v, u];
  if (face === 'nx') return [j, v, u];
  if (face === 'pz') return [u, v, S - 1 - j];
  return [u, v, j];
}

// spec: the arena's; ctx: the guardian's context, its portals placed (cubegen/guardian.js); U: the
// boss's spot (cell); approach: the way he looks; level: the doorways' level
export function flipArena({ spec, ctx, level, U, approach: [dx, dz], exit, role, R, own }) {
  const bottom = Math.max(1, Math.ceil(level / 2)), solid = new Uint8Array(S * S * S);
  const rand = (a, b) => a + Math.floor(R() * (b - a + 1));
  for (let y = 0; y < S; y++) for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
    let g = 0;
    if (y < bottom) g = GROUP.bottom;
    else if (x === S - 1) g = GROUP.px;
    else if (x === 0) g = GROUP.nx;
    else if (z === S - 1) g = GROUP.pz;
    else if (z === 0) g = GROUP.nz;
    solid[vi(x, y, z)] = g;
  }
  const holes = [];
  // the entrance's doorway: a hole low in its wall, the width of the portal
  const entrance = ctx.portals.find(p => p.kind === 'side'), wall = WALL[entrance.dir];
  const door = [];
  for (let u = entrance.pos - 1; u <= entrance.pos + 1; u++) for (let v = bottom; v < bottom + FLIP_ARENA.door; v++) {
    const [x, y, z] = wallCell(wall, u, v);
    solid[vi(x, y, z)] = 0; door.push(vi(x, y, z));
  }
  holes.push({ id: 0, face: wall, cells: door, depth: 1, door: true });
  // holes up high in every wall, apart, clear of the doorway
  // taken: no feature there (with a cell round them); blocked: nothing at all (a hole, a feature)
  const taken = Object.fromEntries(SIDES.map(f => [f, new Set()])), blocked = Object.fromEntries(SIDES.map(f => [f, new Set()]));
  const mark = (face, u0, v0, w, h, pad) => {
    for (let v = v0 - pad; v < v0 + h + pad; v++) for (let u = u0 - pad; u < u0 + w + pad; u++) taken[face].add(u * S + v);
    for (let v = v0; v < v0 + h; v++) for (let u = u0; u < u0 + w; u++) blocked[face].add(u * S + v);
  };
  const free = (face, u0, v0, w, h) => { for (let v = v0; v < v0 + h; v++) for (let u = u0; u < u0 + w; u++) if (taken[face].has(u * S + v)) return false; return true; };
  mark(wall, entrance.pos - 1, bottom, 3, FLIP_ARENA.door, 1);
  // the floating island in the middle (first: what comes after keeps clear of it)
  const I = FLIP_ARENA.island;
  for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) if (Math.hypot(x + 0.5 - S / 2, z + 0.5 - S / 2) < I.r)
    for (let y = I.y0; y < I.y1; y++) solid[vi(x, y, z)] = GROUP.island;
  // stairs: the way each stair cell rises and the way its treads face (1 + core/flip.js DIR6);
  // shelf: the cells of the balconies and their staircases
  const stairs = new Uint8Array(S * S * S), stairUp = new Uint8Array(S * S * S), shelf = new Uint8Array(S * S * S), F = frames(bottom);
  const portalCells = new Set(ctx.portals.flatMap(p => p.cells));
  const gate = ctx.portals.find(p => p.kind !== 'side'), [ex, ez] = [entrance.c % N, Math.floor(entrance.c / N)];
  const [gx, gz] = [gate.c % N, Math.floor(gate.c / N)];
  const lane = (x, z) => [[ex, ez, U[0], U[1]], [U[0], U[1], gx, gz]].some(([ax, az, bx, bz]) => {
    const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
    return Math.hypot(x - ax - vx * t, z - az - vz * t) < 2;
  });
  // the floor of the box keeps its doorway, its well, the boss's spot and the way between them
  const floorOk = (u, v) => !portalCells.has(idx(u, v)) && !lane(u, v) && Math.hypot(u - U[0], v - U[1]) >= 2.5
    && [...portalCells].every(c => Math.hypot(c % N - u, Math.floor(c / N) - v) >= 2);
  taken.bottom = new Set(); blocked.bottom = new Set(); taken.island = new Set(); blocked.island = new Set();
  const heights = Object.fromEntries([...SIDES, 'bottom', 'island'].map(f => [f, new Map()]));

  // A balcony for every side that can be the floor: a platform a cell thick jutting out of one of
  // the walls beside it (`host`), high over the floor, and a staircase up to it along that wall.
  // Turned so that its side is down, the fight may go on up there (game/flipworld.js); on other
  // sides it is a fin or a ledge like the rest. Placed first: nothing else of either side (holes,
  // things to climb) comes near it, and on the floor of the box it keeps clear of the doorway,
  // the well and the way between them.
  const B = FLIP_ARENA.balcony, shelves = [];
  for (const face of ['bottom', ...SIDES]) {
    const U0 = F[face].way([1, 0]), hosts = SIDES.filter(g => dot(FACES[g], F[face].up) === 0)
      .map(g => [g, R()]).sort((a, b) => a[1] - b[1]).map(([g]) => g);
    placing: for (const host of hosts) for (let tries = 0; tries < 30; tries++) {
      const n = FACES[host], alongU = n.some((x, i) => x && U0[i]), sign = alongU ? dot(n, U0) : dot(n, F[face].way([0, 1]));
      // (e: along the wall, d: out of it; up a wall clear of the floor of the box)
      const c0 = sign > 0 ? S - 2 : 1, eLo = face === 'bottom' || alongU ? 2 : bottom + 1, eHi = S - 3;
      const e0 = rand(eLo, eHi - B.length + 1), mid = e0 + rand(1, B.length - 2);
      const at = (e, d) => alongU ? [c0 - sign * d, e] : [e, c0 - sign * d];
      const rise = alongU ? [sign, 0] : [0, sign];   // (towards the wall)
      const cells = [];
      for (let j = 0; j < B.length; j++) for (let d = 0; d < B.depth; d++) cells.push({ uv: at(e0 + j, d), h: B.rise - 1 });
      // the staircase straight out from the middle of its front, floating free of the floor
      for (let k = 0; k < B.rise; k++) cells.push({ uv: at(mid, B.depth + k), h: B.rise - 1 - k, rise });
      const front = at(mid, B.depth + B.rise);
      const voxels = cells.map(c => vi(...F[face].at(...c.uv, c.h)));
      const onHost = voxels.map(i => hostKey(host, i));
      const low = cells.filter(c => c.h < 2);   // (what stands in the way on the floor)
      if (voxels.some(i => solid[i]) || onHost.some(k => taken[host].has(k)) || cells.some(c => taken[face].has(c.uv[0] * S + c.uv[1]))) continue;
      if (blocked[face].has(front[0] * S + front[1]) || front.some(x => x < 1 || x > S - 2)) continue;
      if (face === 'bottom' && (!low.every(c => floorOk(...c.uv)) || portalCells.has(idx(...front)))) continue;
      cells.forEach((c, i) => {
        solid[voxels[i]] = GROUP[host]; shelf[voxels[i]] = 1;
        if (c.rise) { stairs[voxels[i]] = 1 + dirIndex(F[face].way(c.rise)); stairUp[voxels[i]] = 1 + dirIndex(F[face].up); }
      });
      // whatever side is down, it must not cut the floor in two, and from its own side it is climbed
      if (!walkable({ solid, stairs, stairUp, shelf, holes, bottom, level }, face, voxels, shelves)) {
        for (const i of voxels) solid[i] = stairs[i] = stairUp[i] = shelf[i] = 0;
        continue;
      }
      cells.forEach((c, i) => {
        if (!c.rise) heights[face].set(c.uv[0] * S + c.uv[1], c.h + 1);
        for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) taken[face].add((c.uv[0] + a) * S + c.uv[1] + b);
        blocked[face].add(c.uv[0] * S + c.uv[1]);
        if (c.rise) blocked[face].add(-1 - (c.uv[0] * S + c.uv[1]));
        taken[host].add(onHost[i]); blocked[host].add(onHost[i]);   // (out of its wall: nothing else of the wall there)
      });
      taken[face].add(front[0] * S + front[1]);
      shelves.push({ face, host, cells: voxels });
      break placing;
    }
  }
  const lowHole = Math.max(5, bottom + FLIP_ARENA.door + 1);
  for (const face of SIDES) {
    const want = rand(...FLIP_ARENA.holes);
    for (let tries = 0, made = 0; made < want && tries < 60; tries++) {
      const w = R() < 0.5 ? 2 : 1, h = R() < 0.5 ? 2 : 1, u0 = rand(3, S - 4 - w + 1), v0 = rand(lowHole, S - 2 - h);
      if (!free(face, u0, v0, w, h)) continue;
      mark(face, u0, v0, w, h, 1);
      const cells = [];
      for (let v = v0; v < v0 + h; v++) for (let u = u0; u < u0 + w; u++) {
        const [x, y, z] = wallCell(face, u, v);
        solid[vi(x, y, z)] = 0; cells.push(vi(x, y, z));
      }
      holes.push({ id: holes.length, face, cells, depth: 1 });
      made++;
    }
  }

  // What stands on every side (that can be the floor): things to climb and fight round, each
  // reached by its stairs (stair cells: map.flip.stairs, slopes a cell up, core/flip.js), apart
  // from each other, clear of the holes and of the middle of the side (where the fight goes on
  // after a turn). On a wall they stand out of it overhead: two cells up from the floor at least,
  // and two from every edge, so whatever side is down nothing of another side stands in the way.
  const middle = (u, v) => Math.abs(u - (S / 2 - 0.5)) < 2 && Math.abs(v - (S / 2 - 0.5)) < 2;
  const place = (face, kind, lo, hi, ok = () => true) => {
    for (let tries = 0; tries < 150; tries++) {
      const r = rand(0, 3), u0 = rand(lo[0], hi[0]), v0 = rand(lo[1], hi[1]), f = FEATURES[kind](R);
      const turn = ([a, b]) => [[a, b], [-b, a], [-a, -b], [b, -a]][r];
      const cells = f.cells.map(c => { const [a, b] = turn([c.a, c.b]); return { u: u0 + a, v: v0 + b, h: c.h, rise: c.rise && turn(c.rise) }; });
      const fronts = f.fronts.map(q => { const [a, b] = turn(q); return [u0 + a, v0 + b]; });
      const inside = (u, v, pad) => u >= lo[0] - pad && v >= lo[1] - pad && u <= hi[0] + pad && v <= hi[1] + pad;
      if (!cells.every(c => inside(c.u, c.v, 0) && (face === 'island' || !middle(c.u, c.v)) && !taken[face].has(c.u * S + c.v) && ok(c.u, c.v))) continue;
      if (!fronts.every(([u, v]) => inside(u, v, 1) && !blocked[face].has(u * S + v) && !portalCells.has(face === 'bottom' ? idx(u, v) : -1))) continue;
      const voxels = cells.map(c => vi(...F[face].at(c.u, c.v, c.h)));
      if (voxels.some(i => solid[i])) continue;
      cells.forEach((c, k) => {
        solid[voxels[k]] = GROUP[face];
        if (c.rise) { stairs[voxels[k]] = 1 + dirIndex(F[face].way(c.rise)); stairUp[voxels[k]] = 1 + dirIndex(F[face].up); }
      });
      // from its own side, its tops are climbed (nothing over it in the way): else not here
      const tops = voxels.filter((i, k) => !cells.some(o => o.u === cells[k].u && o.v === cells[k].v && o.h > cells[k].h));
      // (and it leaves every floor whole and every balcony climbed, whatever side is down)
      if (!walkable({ solid, stairs, stairUp, shelf, holes, bottom, level }, face === 'island' ? 'top' : face, kind === 'pillar' ? [] : tops, shelves)) {
        for (const i of voxels) solid[i] = stairs[i] = stairUp[i] = 0;
        continue;
      }
      for (const c of cells) {
        heights[face].set(c.u * S + c.v, Math.max(heights[face].get(c.u * S + c.v) ?? 0, c.h + 1));
        blocked[face].add(c.u * S + c.v);
        if (c.rise) blocked[face].add(-1 - (c.u * S + c.v));   // (a stair: no clutter on it)
        for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) taken[face].add((c.u + a) * S + c.v + b);
      }
      for (const [u, v] of fronts) taken[face].add(u * S + v);
      return true;
    }
    return false;
  };
  const kinds = Object.keys(FEATURES).filter(k => k !== 'pillar');
  for (const face of ['bottom', ...SIDES]) {
    const lo = face === 'bottom' ? [3, 3] : [3, bottom + 2], hi = [S - 4, S - 3], ok = face === 'bottom' ? floorOk : undefined;
    const order = kinds.map(k => [k, R()]).sort((a, b) => a[1] - b[1]).map(([k]) => k);   // (every side its own mix)
    const want = rand(...FLIP_ARENA.features);
    for (let i = 0, made = 0; i < order.length * 4 && made < want; i++) if (place(face, order[i % order.length], lo, hi, ok)) made++;
    for (let i = rand(...FLIP_ARENA.pillars); i > 0; i--) place(face, 'pillar', lo, hi, ok);
  }
  // on the island's underside (its floor upside down) a little stepped pyramid in the middle
  place('island', 'pyramid', [S / 2 - 2, S / 2 - 2], [S / 2 + 1, S / 2 + 1]);

  // Clutter on every side (the theme's small things and loose stones of its rock, and what the
  // arena brings: core/bosses.js BOSS_ARENAS `props`): glued to it, its up the side's, so it is
  // right whichever side is down and turns with the box (render/flipview.js). It stands in
  // nobody's way (none of it blocks) and keeps off the holes, the stairs and the portals.
  const theme = themeOf(spec), tint = rockTint(theme);
  const pool = smallProps([theme.props, 'any', ...own?.props ?? []], 0.55);
  const clutter = [];
  if (pool.length) for (const face of ['bottom', ...SIDES, 'island']) {
    const cand = [];
    for (let v = 1; v < S - 1; v++) for (let u = 1; u < S - 1; u++) {
      const k = u * S + v, h = heights[face].get(k) ?? 0;
      if (blocked[face].has(-1 - k) || (h === 0 && blocked[face].has(k))) continue;   // a stair, a hole
      if (face === 'bottom' && portalCells.has(idx(u, v))) continue;
      if (face !== 'bottom' && face !== 'island' && (v < bottom || u < 1)) continue;
      if (face === 'island' && Math.hypot(u + 0.5 - S / 2, v + 0.5 - S / 2) > I.r - 0.6) continue;
      if (solid[vi(...F[face].at(u, v, h))]) continue;   // (something of another side there)
      if (face !== 'bottom' && face !== 'island' && solid[vi(...F[face].at(u, v, -1))] !== GROUP[face]) continue;   // (a gap: a hole)
      cand.push([u, v, h]);
    }
    for (let n = Math.min(cand.length, rand(...FLIP_ARENA.clutter)); n > 0; n--) {
      const [u, v, h] = cand.splice(Math.floor(R() * cand.length), 1)[0], name = pool[Math.floor(R() * pool.length)];
      const c = F[face].at(u, v, h), up = F[face].up, ju = (R() - 0.5) * 0.5, jv = (R() - 0.5) * 0.5;
      const [du, dv] = [F[face].way([1, 0]), F[face].way([0, 1])];
      clutter.push({ name, tint: name.startsWith('any_') ? tint : null, side: face === 'island' ? 'island' : face, on: vi(...F[face].at(u, v, h - 1)), yaw: R() * Math.PI * 2, s: 0.85 + R() * 0.35, normal: up,
        x: c[0] + 0.5 - up[0] * 0.5 + du[0] * ju + dv[0] * jv, y: c[1] + 0.5 - up[1] * 0.5 + du[1] * ju + dv[1] * jv,
        z: c[2] + 0.5 - up[2] * 0.5 + du[2] * ju + dv[2] * jv });
    }
  }

  const flip = { solid, stairs, stairUp, shelf, shelves, holes, bottom, level, island: { ...I }, clutter };
  const { cols, floors } = orientedFloors(flip, IDENTITY);
  for (const f of floors) if (f === cols[f.c][0] && ctx.prot0[f.c]) f.prot = ctx.prot0[f.c];
  const portals = ctx.portals.map(p => ({ id: p.id, kind: p.kind, dir: p.dir, layer: 0, cells: p.cells,
    x: p.c % N, z: Math.floor(p.c / N), y: level * LH, floor: cols[p.c][0] }));
  const guardFloor = cols[idx(...U)][0];
  const boss = role === 'descent' ? spec.guardian.boss ?? null : null;
  const guardian = { role, bossPlaceholder: false, boss, exit, floor: guardFloor, x: guardFloor.x + .5, z: guardFloor.z + .5,
    y: floorY(guardFloor, .5, .5), yaw: Math.atan2(dx, dz), approach: [dx, dz], portalId: portals[1].id };
  // the way from the doorway to the well
  const reached = reachFrom(portals[0].floor);
  if (!reached.has(guardFloor) || !reached.has(portals[1].floor) || !guardFloor.encounter) throw new Error('Disconnected flip arena');
  ctx.stats.layers = 1; ctx.stats.mode = 'guardian arena (flip)';
  return finishArena({ spec, ctx, role, cols, floors, portals, exit, guardian, reached,
    arena: { type: 'flip', requested: 'flip' }, walled: true, more: { flip } });
}
