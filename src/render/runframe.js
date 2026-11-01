// Run-local coordinates for stairs and bridges, and a block primitive in that space.
import { N } from '../core/constants.js';

// s runs along the structure (0..k cells), w across it (-0.5..0.5)
export function runFrame(r) {
  const first = r.cells[0];
  const ox = first % N + 0.5 - r.dx * 0.5, oz = ((first / N) | 0) + 0.5 - r.dz * 0.5;
  const lx = -r.dz, lz = r.dx, width = r.width || 1;
  // The logical path need not be the middle lane (even widths, rotated town spans).
  const starts = r.lanes?.map(lane => lane[0].c) || [first];
  const shiftX = starts.reduce((v, c) => v + c % N - first % N, 0) / starts.length;
  const shiftZ = starts.reduce((v, c) => v + Math.floor(c / N) - Math.floor(first / N), 0) / starts.length;
  return {
    P: (s, w, y) => [ox + shiftX + r.dx * s + lx * w * width, y, oz + shiftZ + r.dz * s + lz * w * width],
    Y: s => { const T = s / r.k; return r.y0 + (r.y1 - r.y0) * T - r.sag * Math.sin(Math.PI * T); },
    D: [r.dx, 0, r.dz], Lt: [lx, 0, lz],
  };
}

// six-sided block between s0..s1 and w0..w1, bottom/top heights given at both ends
export function slab(b, F, s0, s1, w0, w1, b0, t0, b1, t1, top, side) {
  if (t0 - b0 < 0.005 && t1 - b1 < 0.005) return;
  const P = F.P;
  const v = [P(s0, w0, b0), P(s1, w0, b1), P(s1, w1, b1), P(s0, w1, b0), P(s0, w0, t0), P(s1, w0, t1), P(s1, w1, t1), P(s0, w1, t0)];
  const neg = a => a.map(x => -x), sd = side.clone().multiplyScalar(0.85);
  b.quad(v[4], v[5], v[6], v[7], [0, 1, 0], top);
  b.quad(v[0], v[1], v[2], v[3], [0, -1, 0], sd);
  b.quad(v[0], v[1], v[5], v[4], neg(F.Lt), side);
  b.quad(v[3], v[2], v[6], v[7], F.Lt, side);
  b.quad(v[0], v[3], v[7], v[4], neg(F.D), sd);
  b.quad(v[1], v[2], v[6], v[5], F.D, sd);
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// a prism around the polyline pts (logs, vines, ropes that bend): `sides` faces, radius r (or
// r(i) at point i), colour col (or col(i, j) for face j of the stretch after point i), its ends closed with
// `cap` (a colour) if given. The cross-section is carried along the line without twisting.
export function tube(b, pts, r, col, { sides = 6, cap = null } = {}) {
  const n = pts.length;
  if (n < 2) return;
  const rings = [];
  let u = null;
  for (let i = 0; i < n; i++) {
    const t = unit(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
    if (!u) u = unit(cross(t, Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
    else { const d = dot(u, t); u = unit([u[0] - t[0] * d, u[1] - t[1] * d, u[2] - t[2] * d]); }
    const v = cross(t, u), rad = typeof r === 'function' ? r(i) : r, p = pts[i];
    rings.push(Array.from({ length: sides }, (_, j) => {
      const a = 2 * Math.PI * (j + 0.5) / sides, cu = Math.cos(a) * rad, sv = Math.sin(a) * rad;
      return [p[0] + u[0] * cu + v[0] * sv, p[1] + u[1] * cu + v[1] * sv, p[2] + u[2] * cu + v[2] * sv];
    }));
  }
  for (let i = 0; i + 1 < n; i++) {
    const A = rings[i], B = rings[i + 1];
    const mid = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2, (pts[i][2] + pts[i + 1][2]) / 2];
    for (let j = 0; j < sides; j++) {
      const j1 = (j + 1) % sides, f = [(A[j][0] + A[j1][0] + B[j][0] + B[j1][0]) / 4, (A[j][1] + A[j1][1] + B[j][1] + B[j1][1]) / 4, (A[j][2] + A[j1][2] + B[j][2] + B[j1][2]) / 4];
      b.quad(A[j], A[j1], B[j1], B[j], sub(f, mid), typeof col === 'function' ? col(i, j) : col);
    }
  }
  if (cap) for (const [ring, out] of [[rings[0], sub(pts[0], pts[1])], [rings[n - 1], sub(pts[n - 1], pts[n - 2])]])
    for (let j = 1; j + 1 < sides; j++) b.tri(ring[0], ring[j], ring[j + 1], cap, out);
}

// a four-sided spike from a square of half-width r around p, len along dir (default: down;
// icicles, drips of rock)
export function spike(b, p, r, len, col, dir = [0, -1, 0]) {
  const d = unit(dir), u = unit(cross(d, Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0])), v = cross(d, u);
  const tip = [p[0] + d[0] * len, p[1] + d[1] * len, p[2] + d[2] * len];
  const c = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([a, e]) => [p[0] + (u[0] * a + v[0] * e) * r, p[1] + (u[1] * a + v[1] * e) * r, p[2] + (u[2] * a + v[2] * e) * r]);
  for (let j = 0; j < 4; j++) {
    const a = c[j], e = c[(j + 1) % 4], f = [(a[0] + e[0] + tip[0]) / 3 - p[0], (a[1] + e[1] + tip[1]) / 3 - p[1], (a[2] + e[2] + tip[2]) / 3 - p[2]];
    b.tri(a, e, tip, col, f);
  }
  b.quad(c[0], c[1], c[2], c[3], [-d[0], -d[1], -d[2]], col);
}
