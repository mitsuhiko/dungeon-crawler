// Accumulates triangles with vertex colours into one BufferGeometry. A builder made with
// { sway: true } also keeps a uv per vertex: u = how far it swings in the wind (0..1, from
// `swayAt(y)`, set while drawing something that hangs), v unused (render/parts.js 'flags'). One
// made with { uvs: true } keeps the uv in `uvNow` for every vertex drawn (the fluids' surfaces,
// render/floors.js fluidVolume), the palette row in `palNow` (themes/fluids.js), and what
// `shoreAt(vertex)` says of the ground under it (four numbers, render/shore.js; none: 0, 0, 0, 1).
// cutAt(a, b, c), if given, names heights to split each triangle along (render/cubegeo.js: the
// clear fluids' low-water lines, so what stands out of them bends under them only).
import * as THREE from '../../vendor/three/three.core.js';   // plain path, no renderer: also loads in the world worker

export class GeoBuilder {
  constructor({ sway = false, uvs = false, cutAt = null } = {}) {
    this.pos = []; this.nor = []; this.col = []; this.smoothKeys = []; this.cutAt = cutAt;
    if (sway) { this.uv = []; this.swayAt = () => 0; }
    else if (uvs) { this.uv = []; this.uvNow = [0, 0]; this.pal = []; this.palNow = 0; this.shore = []; this.shoreAt = null; }
  }

  // triangle; `want` is the intended facing (winding gets flipped to match);
  // smooth=true shares normals with other smooth vertices at the same position; col: its colour,
  // or one for each corner ([a's, b's, c's])
  tri(a, b, c, col, want, smooth = false) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) return;
    if (want && nx * want[0] + ny * want[1] + nz * want[2] < 0) { [b, c] = [c, b]; nx = -nx; ny = -ny; nz = -nz; if (Array.isArray(col)) col = [col[0], col[2], col[1]]; }
    if (this.cutAt) for (const y of this.cutAt(a, b, c)) {
      const parts = splitTri(a, b, c, y);
      if (parts) { for (const [p, q, r] of parts) this.tri(p, q, r, col, [nx, ny, nz], smooth); return; }
    }
    const base = this.pos.length / 3;
    for (const [k, v] of [a, b, c].entries()) {
      const cv = Array.isArray(col) ? col[k] : col;
      this.pos.push(v[0], v[1], v[2]);
      this.nor.push(nx / len, ny / len, nz / len);
      this.col.push(cv.r, cv.g, cv.b);
      if (this.swayAt) this.uv.push(this.swayAt(v[1]), 0);
      else if (this.uv) {
        this.uv.push(this.uvNow[0], this.uvNow[1]); this.pal.push(this.palNow);
        if (this.shoreAt) this.shore.push(...this.shoreAt(v)); else this.shore.push(0, 0, 0, 1);
      }
    }
    if (smooth) [a, b, c].forEach((v, k) =>
      this.smoothKeys.push([base + k, v[0].toFixed(3) + ',' + v[1].toFixed(3) + ',' + v[2].toFixed(3), nx, ny, nz]));
  }

  quad(a, b, c, d, want, col, smooth = false) { this.tri(a, b, c, col, want, smooth); this.tri(a, c, d, col, want, smooth); }

  // axis aligned box; skip: {px,nx,py,ny,pz,nz} -> true to omit that face
  box(x0, y0, z0, x1, y1, z1, top, side, skip = {}) {
    const sd = side.clone().multiplyScalar(0.82);
    if (!skip.py) this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0], top);
    if (!skip.ny) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], sd);
    if (!skip.px) this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0], side);
    if (!skip.nx) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], side);
    if (!skip.pz) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], sd);
    if (!skip.nz) this.quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [0, 0, -1], sd);
  }

  // oriented box between two points with a w x h cross-section (rails, beams)
  beam(p, q, w, h, col) {
    const d = new THREE.Vector3(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    const side = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(w / 2);
    const up = new THREE.Vector3().crossVectors(side, d).normalize().multiplyScalar(h / 2);
    const P = new THREE.Vector3(...p), Q = new THREE.Vector3(...q), C0 = P.clone().add(Q).multiplyScalar(0.5);
    const v = (o, s, u) => o.clone().addScaledVector(side, s).addScaledVector(up, u).toArray();
    const faces = [
      [v(P, -1, 1), v(P, 1, 1), v(Q, 1, 1), v(Q, -1, 1)], [v(P, -1, -1), v(P, 1, -1), v(Q, 1, -1), v(Q, -1, -1)],
      [v(P, 1, -1), v(P, 1, 1), v(Q, 1, 1), v(Q, 1, -1)], [v(P, -1, -1), v(P, -1, 1), v(Q, -1, 1), v(Q, -1, -1)],
      [v(P, -1, -1), v(P, 1, -1), v(P, 1, 1), v(P, -1, 1)], [v(Q, -1, -1), v(Q, 1, -1), v(Q, 1, 1), v(Q, -1, 1)]];
    for (const f of faces) {
      const fc = f.reduce((s, x) => [s[0] + x[0] / 4, s[1] + x[1] / 4, s[2] + x[2] / 4], [0, 0, 0]);
      this.quad(f[0], f[1], f[2], f[3], [fc[0] - C0.x, fc[1] - C0.y, fc[2] - C0.z], col);
    }
  }

  // smoothed normals, as typed arrays (these can be sent from the worker)
  arrays() {
    const acc = new Map();
    for (const [, key, nx, ny, nz] of this.smoothKeys) {
      const a = acc.get(key) || [0, 0, 0];
      a[0] += nx; a[1] += ny; a[2] += nz; acc.set(key, a);
    }
    for (const [vi, key] of this.smoothKeys) {
      const a = acc.get(key), l = Math.hypot(a[0], a[1], a[2]) || 1;
      this.nor[vi * 3] = a[0] / l; this.nor[vi * 3 + 1] = a[1] / l; this.nor[vi * 3 + 2] = a[2] / l;
    }
    const out = { pos: new Float32Array(this.pos), nor: new Float32Array(this.nor), col: new Float32Array(this.col) };
    if (this.uv) out.uv = new Float32Array(this.uv);
    if (this.pal) out.pal = new Float32Array(this.pal);
    if (this.shore) out.shore = new Float32Array(this.shore);
    return out;
  }

  build() { return toGeometry(this.arrays()); }
}

// triangle a b c split along the height y into three (or two, through a corner on it), wound the
// same way; null if it does not cross y
const ON = 1e-4;
function splitTri(a, b, c, y) {
  const V = [a, b, c], s = V.map(v => v[1] - y);
  if (s.every(d => d > -ON) || s.every(d => d < ON)) return null;
  const at = (p, q) => { const t = (y - p[1]) / (q[1] - p[1]); return [p[0] + (q[0] - p[0]) * t, y, p[2] + (q[2] - p[2]) * t]; };
  for (let i = 0; i < 3; i++) if (Math.abs(s[i]) < ON) {
    const A = V[i], B = V[(i + 1) % 3], C = V[(i + 2) % 3], P = at(B, C);
    return [[A, B, P], [A, P, C]];
  }
  for (let i = 0; i < 3; i++) {
    const A = V[i], B = V[(i + 1) % 3], C = V[(i + 2) % 3];
    if (Math.sign(s[i]) !== Math.sign(s[(i + 1) % 3]) && Math.sign(s[i]) !== Math.sign(s[(i + 2) % 3])) {
      const P = at(A, B), Q = at(C, A);
      return [[A, P, Q], [P, B, C], [P, C, Q]];
    }
  }
  return null;
}

export function toGeometry(a) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(a.col, 3));
  return g;
}
