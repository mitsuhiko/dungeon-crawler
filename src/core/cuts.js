// Cut cells: a floor whose top a straight line parts in two (cubegen/cuts.js makes them). The
// floor keeps the side of the line its middle is on; the other side, `cut.part`, is the ground
// beyond the line, carried on into the cell: a floor-like piece with its own corner heights,
// from the floor's bottom up, that physics finds where it lies (core/surfaces.js floorY, partAt).
//   f.cut = { n: [nx, nz] (unit, towards the part), c (the line: n . (fx, fz) = c), a, b (where
//             the line meets the cell's sides, local [fx, fz]), part }
// Geometry shared by the generator, physics and rendering, in a cell's local coordinates.
import { cornersY } from './surfaces.js';

// where along the side d of a cell a local point on it lies (render/floors.js edgePts order)
export const sideT = (d, fx, fz) => d < 2 ? fz : fx;
// the local point at t along side d
export const sidePoint = (d, t) => [[1, t], [0, t], [t, 1], [t, 0]][d];
const EPS = 1e-6;
// is the local point on side d?
export const onSide = (d, [fx, fz]) => Math.abs([fx - 1, fx, fz - 1, fz][d]) < EPS;

// Where floor f's cut meets its side d, strictly between the corners (t in (0, 1)): [] or [t]
export function cutPoints(f, d) {
  if (!f.cut) return [];
  const out = [];
  for (const p of [f.cut.a, f.cut.b]) if (onSide(d, p)) { const t = sideT(d, ...p); if (t > EPS && t < 1 - EPS) out.push(t); }
  return out;
}

// Clip the convex polygon `poly` ([[fx, fz], ...]) to the side of the line n . p = c that
// `keep` says: 0, n . p <= c (the floor's own), 1, n . p >= c (its part)
export function clipPoly(poly, n, c, keep) {
  const s = p => (n[0] * p[0] + n[1] * p[1] - c) * (keep ? -1 : 1), out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], sp = s(p), sq = s(q);
    if (sp <= 0) out.push(p);
    if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}
// a cell's two top triangles (corners 0 (0, 0), 1 (1, 0), 2 (0, 1), 3 (1, 1)), as local polygons
const CORNER = [[0, 0], [1, 0], [0, 1], [1, 1]];
export const trianglesOf = split => (split ? [[0, 1, 2], [1, 3, 2]] : [[0, 1, 3], [0, 3, 2]]).map(t => t.map(k => CORNER[k]));
// The top of floor f (its own side of a cut, or all of it) as triangles of local points with
// their heights: [[fx, y, fz] x 3, ...]; s: f or its part (side 1)
export function topTriangles(f, side = 0) {
  const s = side ? f.cut.part : f, out = [];
  for (const tri of trianglesOf(s.split)) {
    const poly = f.cut ? clipPoly(tri, f.cut.n, f.cut.c, side) : tri;
    for (let i = 1; i + 1 < poly.length; i++) {
      const t = [poly[0], poly[i], poly[i + 1]];
      // (no slivers left over from clipping)
      const area = Math.abs((t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[1][1] - t[0][1]) * (t[2][0] - t[0][0]));
      if (area > 1e-7) out.push(t.map(([x, z]) => [x, cornersY(s.cs, s.split, x, z), z]));
    }
  }
  return out;
}
// the cut's line through floor f as pieces along which both sides' heights run straight (split at
// either side's diagonal): [{ p, q (local [fx, fz]), own: [y at p, y at q], part: [...] }]
export function cutLine(f) {
  const { a, b, part } = f.cut, ts = [0, 1];
  // where a -> b crosses the diagonals: fx = fz (split 0) and fx + fz = 1 (split 1)
  const dx = b[0] - a[0], dz = b[1] - a[1];
  for (const [u, v, w] of [[1, -1, 0], [1, 1, 1]]) {   // u fx + v fz = w
    const den = u * dx + v * dz;
    if (Math.abs(den) > EPS) { const t = (w - u * a[0] - v * a[1]) / den; if (t > EPS && t < 1 - EPS) ts.push(t); }
  }
  ts.sort((x, y) => x - y);
  const at = t => [a[0] + dx * t, a[1] + dz * t], out = [];
  for (let i = 0; i + 1 < ts.length; i++) {
    if (ts[i + 1] - ts[i] < EPS) continue;
    const p = at(ts[i]), q = at(ts[i + 1]), m = at((ts[i] + ts[i + 1]) / 2);
    // heights at the ends, of the triangle the piece lies in (nudged off the line to each side)
    const e = 1e-4, own = [m[0] - f.cut.n[0] * e, m[1] - f.cut.n[1] * e], pt = [m[0] + f.cut.n[0] * e, m[1] + f.cut.n[1] * e];
    out.push({ p, q, own: [p, q].map(r => onTri(f.cs, f.split, own, r)), part: [p, q].map(r => onTri(part.cs, part.split, pt, r)) });
  }
  return out;
}
// the height at r of the plane of the triangle (corners cs, diagonal split) that point `in` lies in
function onTri(cs, split, inside, r) {
  const k = split ? (inside[0] + inside[1] <= 1 ? 0 : 1) : (inside[0] >= inside[1] ? 0 : 1);
  // the plane through that triangle's corners, evaluated at r (it may lie on its edge)
  const tri = (split ? [[0, 1, 2], [1, 3, 2]] : [[0, 1, 3], [0, 3, 2]])[k];
  const P = tri.map(i => [CORNER[i][0], cs[i], CORNER[i][1]]);
  const ux = P[1][0] - P[0][0], uy = P[1][1] - P[0][1], uz = P[1][2] - P[0][2];
  const vx = P[2][0] - P[0][0], vy = P[2][1] - P[0][1], vz = P[2][2] - P[0][2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  return P[0][1] - (nx * (r[0] - P[0][0]) + nz * (r[1] - P[0][2])) / ny;
}

// Does the segment (ax, az) -> (bx, bz) cross the segment (cx, cz) -> (dx, dz)? (2D, the
// cube's coordinates; touching counts)
export function crosses(ax, az, bx, bz, cx, cz, dx, dz) {
  const o = (px, pz, qx, qz, rx, rz) => (qx - px) * (rz - pz) - (qz - pz) * (rx - px);
  const d1 = o(cx, cz, dx, dz, ax, az), d2 = o(cx, cz, dx, dz, bx, bz), d3 = o(ax, az, bx, bz, cx, cz), d4 = o(ax, az, bx, bz, dx, dz);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0) || Math.abs(d1) < 1e-9 || Math.abs(d2) < 1e-9)
    && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0) || Math.abs(d3) < 1e-9 || Math.abs(d4) < 1e-9)
    && Math.min(ax, bx) <= Math.max(cx, dx) + 1e-9 && Math.min(cx, dx) <= Math.max(ax, bx) + 1e-9
    && Math.min(az, bz) <= Math.max(cz, dz) + 1e-9 && Math.min(cz, dz) <= Math.max(az, bz) + 1e-9;
}
// the node of the floor graph a surface belongs to: a cut's part is the ground it carries on
// (its donor's), anything else itself
export const nodeOf = s => s?.donor ?? s;
// The fluids in a column: its fluid floors, and the fluids in the parts of its cut floors
export const fluidsOf = col => col.flatMap(g => g.fluid ? [g] : g.cut?.part.fluid ? [g.cut.part] : []);
