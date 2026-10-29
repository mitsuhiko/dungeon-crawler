// Inside a house: a walled room in the proportions of the house, outside the cube grid. There
// is no glass box and no way to fall out: walls stand all round. The door takes you back out
// to the house's door in town (game/doors.js). Upstairs there is a gallery (the inn's upper
// storey) or a loft under the gable, up a wooden stair along the house's right-hand wall.
//
// The room stands the way the house does in town: its front wall (with the door) faces where
// the house's front does, so walking in through the door keeps your direction. The camera's
// side of the walls is cut away (render/section.js).
import { N, LH, BASE, DIRS, SHEAD } from '../core/constants.js';
import { edgeKey } from '../core/util.js';
import { runY } from '../core/surfaces.js';
import { indexBlockers } from '../core/blockers.js';
import { createContext } from './context.js';
import { BUILDINGS, TOWN_KEY, interiorKey } from '../world/town.js';

export const INTERIOR_SCALE = 3.8;   // cells per model unit, shared so the inn stays the biggest
export const INTERIOR_LEVEL = 2;     // the ground floor's level
export const WALL = 0.3;             // wall thickness
// storeys fit the character (1.1 tall), not the models' scale; the inn's is the taller
const UPPER = { gallery: { rows: 4, rise: 6, headroom: 2.6 }, loft: { rows: 3, rise: 5, headroom: 2.2 } };
const STAIR = 3;   // flight cells (at most 2 levels each, as in generated stairs)

export const HOUSES = BUILDINGS.filter(b => b.door);
export const houseAt = k => HOUSES.find(b => interiorKey(b.name) === k) || null;
export const dirOf = ([x, z]) => DIRS.findIndex(([dx, dz]) => dx === x && dz === z);

// The room in the house's own frame: u runs along the front (the model's +X, W cells), v from
// the back wall to the front wall (D cells). The door's centre is at u = door on v = D; the
// upper floor covers v < rows; the stair runs up the last column (u = W - 1) from v = rows +
// STAIR towards the back. `front` is where the house's front faces in town (a unit grid
// vector): the room is turned to match, centred in the map.
export function interiorLayout(b, front = [0, 1]) {
  const W = Math.round(b.body.w * INTERIOR_SCALE), D = Math.round(b.body.d * INTERIOR_SCALE), u = UPPER[b.upper];
  // the door sits where the model has it, off the corners and the stair's column
  const along = (b.door.x - b.body.x + b.body.w / 2) / b.body.w;
  const door = Math.max(1, Math.min(W - 3, Math.floor(along * W))) + 0.5;
  const F = front, R = [F[1], -F[0]];   // the model's +X, turned like +Z is turned to F
  const wx = F[0] ? D : W, wz = F[0] ? W : D, x0 = Math.floor((N - wx) / 2), z0 = Math.floor((N - wz) / 2);
  const cx = x0 + wx / 2, cz = z0 + wz / 2;
  const at = (pu, pv) => [cx + (pu - W / 2) * R[0] + (pv - D / 2) * F[0], cz + (pu - W / 2) * R[1] + (pv - D / 2) * F[1]];
  const cell = (i, j) => { const [x, z] = at(i + 0.5, j + 0.5); return Math.floor(z) * N + Math.floor(x); };
  const level = INTERIOR_LEVEL + u.rise;
  return { W, D, F, R, at, cell, room: { x0, z0, x1: x0 + wx, z1: z0 + wz }, door, rows: u.rows, level, k: STAIR,
    wallTop: level * LH + u.headroom };
}

// facing: where the house's front faces in town (its door's normal there)
export function generateInterior(spec, facing = [0, 1]) {
  const b = houseAt(spec.key);
  if (!b) throw new Error('No house for ' + spec.key);
  const L = interiorLayout(b, facing), ctx = createContext(spec.seed), { cols } = ctx;
  const { W, D, F, R, cell, rows, k } = L, G = INTERIOR_LEVEL, U = L.level, y = G * LH;
  const put = (c, top, bottom, layer) => {
    const f = ctx.mk(c, top, bottom, layer);
    f.cs = Array(4).fill(top * LH); f.split = c % 2;
    cols[c].push(f);
  };
  for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
    put(cell(i, j), G, 0, 0);
    if (j < rows) put(cell(i, j), U, U - 1, 1);
  }
  const floors = [];
  for (const col of cols) for (const f of col) { f.id = floors.length; floors.push(f); }
  const at = (x, z, layer) => x < 0 || z < 0 || x >= N || z >= N ? null : cols[z * N + x].find(f => f.layer === layer) || null;
  for (const f of floors) f.link = DIRS.map(([dx, dz]) => at(f.x + dx, f.z + dz, f.layer));

  // the stair: from the ground floor in front of it up to the upper floor's front row
  const pieces = Array.from({ length: N * N }, () => []), back = [-F[0], -F[1]];
  const foot = cols[cell(W - 1, rows + k)][0], landing = cols[cell(W - 1, rows - 1)].find(f => f.layer === 1);
  const cells = Array.from({ length: k }, (_, j) => cell(W - 1, rows + k - 1 - j));
  const run = { kind: 'stair', wood: true, from: foot, to: landing, d: dirOf(back), dx: back[0], dz: back[1], cells, k, sag: 0,
    layerLo: 0, layerHi: 1, layer: 0, y0: y, y1: U * LH, ymid: (y + U * LH) / 2 };
  run.pieces = cells.map((c, j) => {
    const p = { kind: 'stair', c, j, dx: back[0], dz: back[1], run, ground: y };
    const lo = runY(p, back[0] < 0 ? 1 : 0, back[1] < 0 ? 1 : 0), hi = runY(p, back[0] < 0 ? 0 : 1, back[1] < 0 ? 0 : 1);
    p.y0 = lo; p.y1 = hi;
    p.supported = lo - y < SHEAD * LH;
    p.base = p.supported ? y : lo - 0.4;
    pieces[c].push(p);
    cols[c][0].covered = true;
    return p;
  });

  // a railing along the upper floor's open edge (not where the stair arrives), invisible rails
  // on the stair's open side
  const fences = new Map(), fenceList = [];
  const fence = (c, d, height, show) => {
    const x = c % N, z = (c / N) | 0;
    const pts = [0.07, 0.5, 0.93].map(t => {
      const fx = d === 0 ? 0.93 : d === 1 ? 0.07 : t, fz = d === 2 ? 0.93 : d === 3 ? 0.07 : t;
      return [x + fx, height(fx, fz), z + fz];
    });
    const ys = pts.map(p => p[1]), f = { pts, ymin: Math.min(...ys), ymax: Math.max(...ys), layer: show ? 1 : 0, show };
    fenceList.push(f);
    const key = edgeKey(x, z, x + DIRS[d][0], z + DIRS[d][1]);
    if (!fences.has(key)) fences.set(key, []);
    fences.get(key).push(f);
  };
  for (let i = 0; i < W - 1; i++) fence(cell(i, rows - 1), dirOf(F), () => U * LH, true);
  for (const p of run.pieces) fence(p.c, dirOf([-R[0], -R[1]]), (fx, fz) => runY(p, fx, fz), false);

  // walls just outside the floor, all round; the front one has the door
  const T = WALL, wallTop = L.wallTop, { x0, z0, x1, z1 } = L.room;
  const walls = [
    [0, x1, z0 - T, x1 + T, z1 + T], [1, x0 - T, z0 - T, x0, z1 + T],
    [2, x0, z1, x1, z1 + T], [3, x0, z0 - T, x1, z0],
  ].map(([side, x0, z0, x1, z1]) => ({ shape: 'box', name: 'wall', side, x0, z0, x1, z1, bottom: -BASE, top: wallTop }));
  const staticBlockers = indexBlockers(walls);
  // the door, on the front wall; you stand on its inner side
  const [dx, dz] = L.at(L.door, D);
  const door = { id: 'out', building: b.name, to: TOWN_KEY, x: dx, z: dz, nx: -F[0], nz: -F[1], w: 1, y };

  // for the test bots: in through the door, up the stair and along the upper floor
  const pt = (pu, pv, h) => { const [x, z] = L.at(pu, pv); return { x, y: h + 0.12, z }; };
  const route = [pt(L.door, D - 0.75, y), pt(L.door, rows + k + 0.5, y), pt(W - 0.5, rows + k + 0.5, y),
    pt(W - 0.5, rows - 0.5, U * LH), pt(0.5, rows - 0.5, U * LH)];
  ctx.stats.layers = 2; ctx.stats.mode = 'interior'; ctx.stats.stairs = 1; ctx.stats.fences = W - 1;
  return {
    seed: spec.seed, attempts: 1, K: 2, B: [0, U], cols, floors, pieces, runs: [run], falls: [], ladders: [],
    fences, fenceList, stats: ctx.stats, moves: [], portals: [], exit: null, gateKeys: [null, null, null, null],
    safe: new Uint8Array(floors.length).fill(1),
    kind: 'interior', archetype: 'plain', key: spec.key, depth: 0, cave: false, enemyFree: true, biome: 'meadow',
    staticBlockers, blockers: staticBlockers, occluders: walls, authoredProps: [], doors: [door],
    // front / right: the house's +Z / +X in the map; sides index DIRS (the wall on that side)
    interior: { building: b.name, outside: TOWN_KEY, room: L.room, wall: T, wallTop, W, D, front: F, right: R,
      upper: { rows, level: U }, stair: { cells, k }, door },
    routes: [route],
  };
}
