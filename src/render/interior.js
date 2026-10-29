// Geometry inside houses (cubegen/interior.js): plank floors, plastered walls in a timber frame,
// windows, and the door back out. Everything is boxes; it runs in the world worker with the
// rest of the cube geometry. The room may stand in any of four directions; walls are indexed
// like DIRS (0: +x, 1: -x, 2: +z, 3: -z).
//
// No two faces share a plane: details stand out of the wall by clearly different depths and
// never overlap each other, so nothing flickers (z-fighting), also not in the cutaway.
// Walls and everything on them go into the `stone` mesh, which casts no shadow (the walls on
// the camera's side are cut away, render/section.js) and is cut within WALL_CUT of the room;
// only the door stands in front of that, so it stays when its wall is cut.
import { N, LH, BASE } from '../core/constants.js';
import { hash32 } from '../core/util.js';
import { C, CAP_ONLY } from './palette.js';
import { dirOf } from '../cubegen/interior.js';

const PLANK = ['#9a7650', '#8d6a46', '#a07d55'].map(C), PLANK_SIDE = C('#6d4f33');
const PLASTER = C('#dfd0ad'), PLASTER_SIDE = C('#cbbb97'), FOOTING = C('#606060'), TIMBER = C('#573c2b');
const DOOR = C('#82603b'), DOOR_DARK = C('#6a4c30'), GLASS = C('#698b87'), IRON = C('#484852');
export const TIMBER_DEPTH = 0.05;   // how far the frame stands out of the plaster
export const WALL_CUT = 0.1;        // wall details stand out less than this; the door more
export const CUT_HEIGHT = 0.01;     // the walls come down to this over the floor ...
const LIFT = 0.03;                  // ... and what hangs on them starts above it
const END_INSET = WALL_CUT + 0.01;  // upper boards' ends against a wall: in front of its details
const DARK = C('#302d2c');

// boards run along the house's front; each row of cells is a board, shaded a little apart
export function buildInteriorFloors(m, layers) {
  const at = (x, z, layer) => x >= 0 && z >= 0 && x < N && z < N && m.cols[z * N + x].some(f => f.layer === layer);
  const across = m.interior.front[0] ? 'x' : 'z', room = m.interior.room;
  for (const f of m.floors) {
    const b = layers[f.layer].wood, x = f.x, z = f.z, y0 = f.bottom * LH, y1 = f.top * LH;
    const top = PLANK[f[across] % PLANK.length].clone().multiplyScalar(0.97 + (hash32(f.c * 13 + f.layer) % 4) / 100);
    // the ground floor is boxed in by the walls; the upper floor shows its open edges and
    // underside (not the sides against the walls)
    const open = (dx, dz) => f.layer > 0 && !at(x + dx, z + dz, f.layer) && m.cols[(z + dz) * N + x + dx]?.length > 0;
    // the ground floor reaches down to the walls' footing (no bedrock under houses)
    b.box(x, f.layer ? y0 : -BASE, z, x + 1, y1, z + 1, top, PLANK_SIDE,
      { px: !open(1, 0), nx: !open(-1, 0), pz: !open(0, 1), nz: !open(0, -1) });
    // where the cutaway opens an upper board, its end at a wall must look solid, not show the
    // wall through it: a cap-only end face facing the wall (seen from inside the room it is a
    // back face, so drawn as the cap; from beyond a cut-down wall it is not drawn), just in
    // front of the wall's details so they cannot poke through it
    if (f.layer > 0) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx >= room.x0 && nx < room.x1 && nz >= room.z0 && nz < room.z1) continue;
      const a = dx > 0 ? x + 1 - END_INSET : dx < 0 ? x + END_INSET : null, c = dz > 0 ? z + 1 - END_INSET : dz < 0 ? z + END_INSET : null;
      if (a !== null) b.quad([a, y0, z], [a, y1, z], [a, y1, z + 1], [a, y0, z + 1], [dx, 0, 0], CAP_ONLY);
      else b.quad([x, y0, c], [x, y1, c], [x + 1, y1, c], [x + 1, y0, c], [0, 0, dz], CAP_ONLY);
    }
  }
}

export function buildInteriorWalls(m, layers) {
  const { room, wall: T, wallTop: top, upper, door, front, right, stair } = m.interior, { x0, z0, x1, z1 } = room;
  const S = layers[0].stone, y = door.y, bottom = -BASE;
  // the four walls: a stone footing up to the floor, plaster above; the x walls run through
  // the corners, the z walls stop at them
  // (a z wall's ends would lie in the faces of the x walls: they are left out)
  for (const [ax, az, bx, bz, ends] of [[x1, z0 - T, x1 + T, z1 + T, false], [x0 - T, z0 - T, x0, z1 + T, false],
    [x0, z1, x1, z1 + T, true], [x0, z0 - T, x1, z0, true]]) {
    S.box(ax, bottom, az, bx, y, bz, FOOTING, FOOTING, { py: true, px: ends, nx: ends });
    S.box(ax, y, az, bx, top, bz, PLASTER, PLASTER_SIDE, { ny: true, px: ends, nx: ends });
  }
  // a box on the inner face of wall `side`, from a0 to a1 along it, from d0 to d1 out of it
  const onWall = (side, a0, a1, y0, y1, d1, col, d0 = 0) => {
    if (side === 0) S.box(x1 - d1, y0, a0, x1 - d0, y1, a1, col, col);
    else if (side === 1) S.box(x0 + d0, y0, a0, x0 + d1, y1, a1, col, col);
    else if (side === 2) S.box(a0, y0, z1 - d1, a1, y1, z1 - d0, col, col);
    else S.box(a0, y0, z0 + d0, a1, y1, z0 + d1, col, col);
  };
  // the x walls' timbers run into the corners, the z walls' stop short of them
  const span = side => side < 2 ? [z0, z1] : [x0 + TIMBER_DEPTH, x1 - TIMBER_DEPTH];
  const alongOf = (side, [px, pz]) => side < 2 ? pz : px;
  const doorSide = dirOf(front), doorAt = alongOf(doorSide, [door.x, door.z]);
  const backSide = dirOf([-front[0], -front[1]]), rightSide = dirOf(right);
  // openings in each wall (along, half width, from y0 to y1): the frame keeps clear of them
  const openings = [[], [], [], []];
  const windows = [];
  const uv = (u, v) => [x0 + (x1 - x0) / 2 + (u - m.interior.W / 2) * right[0] + (v - m.interior.D / 2) * front[0],
    z0 + (z1 - z0) / 2 + (u - m.interior.W / 2) * right[1] + (v - m.interior.D / 2) * front[1]];
  // windows: on the back wall upstairs, on the right wall downstairs past the stair
  for (let u = 2.5; u < m.interior.W - 1; u += 3) windows.push([backSide, alongOf(backSide, uv(u, 0)), upper.level * LH + 0.75]);
  for (let v = upper.rows + stair.k + 1.5; v < m.interior.D - 1; v += 3) windows.push([rightSide, alongOf(rightSide, uv(m.interior.W, v)), y + 0.85]);
  for (const [side, at, wy] of windows) openings[side].push([at, 0.52, wy - 0.12, wy + 0.87]);
  openings[doorSide].push([doorAt, door.w * 0.45 + 0.14, y, y + 1.64]);
  const clear = (side, a0, a1, y0, y1) => openings[side].every(([at, hw, oy0, oy1]) => a1 <= at - hw || a0 >= at + hw || y1 <= oy0 || y0 >= oy1);
  // the timber frame: rails at the floor, under the upper floor and at the top, posts between;
  // rails are split around openings and posts, so no two timbers overlap
  // (all of it clear of the floor: the cut leaves nothing standing on it, render/section.js)
  const e = TIMBER_DEPTH, y1 = y + LIFT, rails = [[y1, y1 + 0.14], [upper.level * LH - 0.72, upper.level * LH - 0.56], [top - 0.22, top]];
  for (let side = 0; side < 4; side++) {
    const [a, b] = span(side), n = Math.max(2, Math.round((b - a) / 3));
    const posts = Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n)
      .map(p => [Math.max(a, p - 0.1), Math.min(b, p + 0.1)])
      .filter(([p0, p1]) => clear(side, p0, p1, y1, top));
    for (const [p0, p1] of posts) onWall(side, p0, p1, y1, top, e, TIMBER);
    for (const [r0, r1] of rails) {
      // cut the rail where a post or an opening is
      const cuts = [...posts, ...openings[side].filter(([, , oy0, oy1]) => !(r1 <= oy0 || r0 >= oy1)).map(([at, hw]) => [at - hw, at + hw])]
        .sort((p, q) => p[0] - q[0]);
      let from = a;
      for (const [c0, c1] of [...cuts, [b, b]]) {
        if (c0 - from > 0.02) onWall(side, from, c0, r0, r1, e, TIMBER);
        from = Math.max(from, c1);
      }
    }
  }
  // windows: a frame, the glass set back inside it and a mullion in front
  for (const [side, at, wy] of windows) {
    const w = 0.8, h = 0.75;
    onWall(side, at - w / 2 - 0.1, at - w / 2, wy - 0.1, wy + h + 0.1, 0.09, TIMBER);
    onWall(side, at + w / 2, at + w / 2 + 0.1, wy - 0.1, wy + h + 0.1, 0.09, TIMBER);
    onWall(side, at - w / 2, at + w / 2, wy - 0.1, wy, 0.09, TIMBER);
    onWall(side, at - w / 2, at + w / 2, wy + h, wy + h + 0.1, 0.09, TIMBER);
    onWall(side, at - w / 2, at - 0.03, wy, wy + h, 0.02, GLASS);
    onWall(side, at + 0.03, at + w / 2, wy, wy + h, 0.02, GLASS);
    onWall(side, at - 0.03, at + 0.03, wy, wy + h, 0.07, TIMBER);
  }
  // the door: plank leaves in a timber frame, in front of a dark recess in the wall; the door
  // itself stands beyond WALL_CUT, so it stays when its wall is cut away
  const hw = door.w * 0.45, dh = 1.5, d0 = WALL_CUT + 0.02, D = (side, a0, a1, y0, y1, d, col) => onWall(side, a0, a1, y0, y1, d0 + d, col, d0);
  onWall(doorSide, doorAt - hw - 0.12, doorAt + hw + 0.12, y + LIFT, y + dh + 0.12, WALL_CUT - 0.02, DARK);
  D(doorSide, doorAt - hw - 0.12, doorAt - hw, y, y + dh + 0.12, 0.12, TIMBER);
  D(doorSide, doorAt + hw, doorAt + hw + 0.12, y, y + dh + 0.12, 0.12, TIMBER);
  D(doorSide, doorAt - hw, doorAt + hw, y + dh, y + dh + 0.12, 0.12, TIMBER);
  for (let i = 0; i < 4; i++) {
    const a = doorAt - hw + (2 * hw) * i / 4, b = doorAt - hw + (2 * hw) * (i + 1) / 4;
    D(doorSide, a, b, y, y + dh, i % 2 ? 0.07 : 0.08, i % 2 ? DOOR : DOOR_DARK);
  }
  for (const yy of [y + 0.3, y + dh - 0.36]) D(doorSide, doorAt - hw * 0.9, doorAt + hw * 0.9, yy, yy + 0.06, 0.1, IRON);
  D(doorSide, doorAt + hw * 0.55, doorAt + hw * 0.7, y + 0.72, y + 0.8, 0.14, IRON);
}
