// A body of fluid as a field (render/fluidbody.js makes it a mesh; no three.js here, so tools can
// look at it too): soft shapes (round-ended tubes and balls, `blobs`) melted into one by a smooth
// minimum, and its surface found on a grid with surface nets: a vertex in every grid cell the
// surface passes through (where the cell's edges cross zero, averaged), a quad round every grid
// edge it crosses. No tables, and the vertices sit on the surface smoothly.
//
// A blob: { kind: 'tube', a: [x, y, z], b, ra, rb } (a round cone: radius ra at a, rb at b) or
// { kind: 'ball', c: [x, y, z], r }; `group` and `melt`, below. The field is squeezed across x by
// `wide` (bodies wider than round), cut flat at y = `floor` (nothing under it), and rippled by
// `ripple` (an amount, its time `t`): small waves running over the surface.
// the smooth minimum of two distances (k: how far apart they still melt together)
export function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
function tube(px, py, pz, b) {
  const [ax, ay, az] = b.a, dx = b.b[0] - ax, dy = b.b[1] - ay, dz = b.b[2] - az;
  const l2 = dx * dx + dy * dy + dz * dz || 1e-9;
  let t = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = px - ax - dx * t, qy = py - ay - dy * t, qz = pz - az - dz * t;
  return Math.sqrt(qx * qx + qy * qy + qz * qz) - (b.ra + (b.rb - b.ra) * t);
}
function ball(px, py, pz, b) {
  const qx = px - b.c[0], qy = py - b.c[1], qz = pz - b.c[2];
  return Math.sqrt(qx * qx + qy * qy + qz * qz) - b.r;
}
const SQUEEZE = 0.85;   // (the field squeezed across is no distance any more: kept under one)
const blobAt = (b, sx, y, z) => (b.kind === 'tube' ? tube(sx, y, z, b) : ball(sx, y, z, b)) * SQUEEZE;
// how far round it a blob matters ([x0, y0, z0, x1, y1, z1], unsqueezed x): its bounds and its melt
function reach(s, b) {
  const m = (b.melt ?? s.melt) + 0.02;
  if (b.kind === 'ball') return [(b.c[0] - b.r - m) * s.wide, b.c[1] - b.r - m, b.c[2] - b.r - m, (b.c[0] + b.r + m) * s.wide, b.c[1] + b.r + m, b.c[2] + b.r + m];
  const r = Math.max(b.ra, b.rb) + m;
  return [(Math.min(b.a[0], b.b[0]) - r) * s.wide, Math.min(b.a[1], b.b[1]) - r, Math.min(b.a[2], b.b[2]) - r,
    (Math.max(b.a[0], b.b[0]) + r) * s.wide, Math.max(b.a[1], b.b[1]) + r, Math.max(b.a[2], b.b[2]) + r];
}
const ripple = (s, x, y, z) => s.ripple ? s.ripple * Math.sin(x * 9.1 + s.t * 5.3) * Math.sin(y * 7.3 - s.t * 6.1) * Math.sin(z * 8.7 + s.t * 4.7) : 0;
// The field of shape s at (x, y, z): < 0 inside (far from every blob: 1). Blobs come in groups
// (b.group: 0, 1, ...), each melted together by its melt, and the groups joined more sharply (by
// s.join): two parts that touch without running into each other (a mouth's lips).
const GROUPS = 2;
const joined = (s, g) => { let d = g[0]; for (let i = 1; i < GROUPS; i++) d = smin(d, g[i], s.join ?? s.melt); return d; };
const acc = [1, 1];
export function field(s, x, y, z) {
  const sx = x / s.wide;
  acc.fill(1);
  for (const b of s.blobs) {
    const r = b.box ?? (b.box = reach(s, b)), g = b.group ?? 0;
    if (x < r[0] || x > r[3] || y < r[1] || y > r[4] || z < r[2] || z > r[5]) continue;
    acc[g] = smin(acc[g], blobAt(b, sx, y, z), b.melt ?? s.melt);
  }
  return Math.max(joined(s, acc) + ripple(s, x, y, z), s.floor - y);
}

const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
// The surface of shape s in box, on a grid of `cell`: { pos: [x, y, z, ...], nrm (its normals),
// idx: [...] } (scratch:
// an object whose grids are reused from one call to the next)
export function surfaceNets(s, box, cell, body = {}) {
  const [x0, y0, z0, x1, y1, z1] = box;
  const nx = Math.max(2, Math.ceil((x1 - x0) / cell) + 1), ny = Math.max(2, Math.ceil((y1 - y0) / cell) + 1), nz = Math.max(2, Math.ceil((z1 - z0) / cell) + 1);
  const n = nx * ny * nz;
  if (!body.values || body.values.length < n) { body.values = new Float32Array(n); body.cells = new Int32Array(n); body.group = new Float32Array(n); }
  const V = body.values, G = body.group, C = body.cells, sy = nx, sz = nx * ny;
  // each blob only where it matters, melted into what its group has there; then the groups joined
  const lo = (v, o) => Math.max(0, Math.ceil((v - o) / cell)), hi = (v, o, m) => Math.min(m - 1, Math.floor((v - o) / cell));
  V.fill(1, 0, n);
  for (let g = 0; g < GROUPS; g++) {
    const blobs = s.blobs.filter(b => (b.group ?? 0) === g);
    if (!blobs.length) continue;
    const W = g ? G : V;
    if (g) W.fill(1, 0, n);
    for (const b of blobs) {
      const r = b.box = reach(s, b), k0 = b.melt ?? s.melt;
      for (let k = lo(r[2], z0), K = hi(r[5], z0, nz); k <= K; k++) for (let j = lo(r[1], y0), J = hi(r[4], y0, ny); j <= J; j++)
        for (let i = lo(r[0], x0), I = hi(r[3], x0, nx); i <= I; i++) {
          const c = i + j * sy + k * sz;
          W[c] = smin(W[c], blobAt(b, (x0 + i * cell) / s.wide, y0 + j * cell, z0 + k * cell), k0);
        }
    }
    if (g) for (let c = 0; c < n; c++) V[c] = smin(V[c], G[c], s.join ?? s.melt);
  }
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = i + j * sy + k * sz, x = x0 + i * cell, y = y0 + j * cell, z = z0 + k * cell;
    const d = V[c] < 0.15 && V[c] > -0.15 ? V[c] + ripple(s, x, y, z) : V[c];   // (the ripples only near the surface)
    V[c] = Math.max(d, s.floor - y);
  }
  // a vertex in each cell the surface goes through
  const pos = [], nrm = [], corner = new Float32Array(8);
  C.fill(-1, 0, n);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      const v = corner[c] = V[(i + (c & 1)) + (j + ((c >> 1) & 1)) * sy + (k + (c >> 2)) * sz];
      if (v < 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) continue;
    let ax = 0, ay = 0, az = 0, m = 0;
    for (const [p, q] of E) {
      const a = corner[p], b = corner[q];
      if ((a < 0) === (b < 0)) continue;
      const t = a / (a - b);
      ax += (p & 1) + ((q & 1) - (p & 1)) * t;
      ay += ((p >> 1) & 1) + (((q >> 1) & 1) - ((p >> 1) & 1)) * t;
      az += (p >> 2) + ((q >> 2) - (p >> 2)) * t;
      m++;
    }
    C[i + j * sy + k * sz] = pos.length / 3;
    const u = ax / m, v = ay / m, w = az / m, c = corner;
    pos.push(x0 + (i + u) * cell, y0 + (j + v) * cell, z0 + (k + w) * cell);
    // its normal: the gradient of the field trilinear in the cell, there
    const gx = (1 - v) * (1 - w) * (c[1] - c[0]) + v * (1 - w) * (c[3] - c[2]) + (1 - v) * w * (c[5] - c[4]) + v * w * (c[7] - c[6]);
    const gy = (1 - u) * (1 - w) * (c[2] - c[0]) + u * (1 - w) * (c[3] - c[1]) + (1 - u) * w * (c[6] - c[4]) + u * w * (c[7] - c[5]);
    const gz = (1 - u) * (1 - v) * (c[4] - c[0]) + u * (1 - v) * (c[5] - c[1]) + (1 - u) * v * (c[6] - c[2]) + u * v * (c[7] - c[3]);
    const l = Math.hypot(gx, gy, gz) || 1;
    nrm.push(gx / l, gy / l, gz / l);
  }
  // a quad round every grid edge the surface crosses (the four cells sharing it)
  const idx = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {   // x edges
    const a = V[i + j * sy + k * sz], b = V[i + 1 + j * sy + k * sz];
    if ((a < 0) === (b < 0)) continue;
    const c = i + j * sy + k * sz;
    quad(C[c], C[c - sy], C[c - sy - sz], C[c - sz], a < 0);
  }
  for (let k = 1; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {   // y edges
    const a = V[i + j * sy + k * sz], b = V[i + (j + 1) * sy + k * sz];
    if ((a < 0) === (b < 0)) continue;
    const c = i + j * sy + k * sz;
    quad(C[c], C[c - sz], C[c - 1 - sz], C[c - 1], a < 0);
  }
  for (let k = 0; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {   // z edges
    const a = V[i + j * sy + k * sz], b = V[i + j * sy + (k + 1) * sz];
    if ((a < 0) === (b < 0)) continue;
    const c = i + j * sy + k * sz;
    quad(C[c], C[c - 1], C[c - 1 - sy], C[c - sy], a < 0);
  }
  return { pos, nrm, idx };
}
