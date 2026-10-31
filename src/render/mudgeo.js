// The pockets of mud of a cube (map.mudPockets, cubegen/mudpools.js) baked into its geometry: the
// part 'mud' (render/parts.js), which only the surroundings draw (render/neighbors.js); the cube
// played in draws its pockets live (game/muddy.js, render/mud.js mudSheet). Each pocket's settled
// field (cubegen/mudpools.js pocketField, the same the game wades through) as a sheet at its
// surface, MUD_LIFT over the ground at least, cut along the line where the mud thins out under
// MUD_EDGE as the live sheet's pixels are, its colours the goop's marbling (render/goop.js) in
// still swirls, its rim lighter. Runs in the world worker (render/cubegeo.js).
import { MUD_RES, MUD_FLOW } from '../core/sollmeldon.js';
import { pocketField } from '../cubegen/mudpools.js';
import { GOOP_COLORS } from './goop.js';
import { C } from './palette.js';

// how high the sheet stays over the ground at least (world units), the depth its edge runs along
export const MUD_LIFT = 0.03, MUD_EDGE = MUD_FLOW.wet * 1.4;
const SUB = 2;   // the sheet's vertices a sample of the field, each way
const COLORS = Object.fromEntries(Object.entries(GOOP_COLORS).map(([k, v]) => [k, C(v)]));

// the goop's marbling (render/goop.js goopColor, standing still) at (x, z)
const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  let fx = x - ix, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
function fbm(x, z) {
  let s = 0, a = 0.5;
  for (let i = 0; i < 4; i++) { s += a * noise(x, z); x = x * 2.03 + 1.7; z = z * 2.03 + 9.2; a *= 0.5; }
  return s;
}
const smoothstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
function goop(x, z, depth) {
  x *= 0.45; z *= 0.45;
  const qx = fbm(x, z), qz = fbm(x + 5.2, z + 1.3), m = fbm(x + 2.4 * qx, z + 2.4 * qz);
  const band = Math.sin(m * 15 + qz * 5);
  const col = COLORS.dark.clone().lerp(COLORS.mid, smoothstep(0.4, 0.68, m));
  col.lerp(COLORS.light, smoothstep(0.62, 0.82, band) * 0.85).lerp(COLORS.cream, smoothstep(0.9, 1, band) * 0.5);
  return col.lerp(COLORS.rim, (1 - smoothstep(MUD_EDGE, MUD_EDGE + 0.04, depth)) * 0.7);
}

// the field at (x, z), between its samples: how deep the mud is and the sheet's height there
function sample(f, x, z) {
  const tx = (x - f.x0) * MUD_RES - 0.5, tz = (z - f.z0) * MUD_RES - 0.5;
  const i = Math.floor(tx), j = Math.floor(tz), u = tx - i, v = tz - j;
  let depth = 0, surf = 0, ground = 0, w = 0;
  for (const [a, b, k] of [[0, 0, (1 - u) * (1 - v)], [1, 0, u * (1 - v)], [0, 1, (1 - u) * v], [1, 1, u * v]]) {
    const ii = Math.min(f.w - 1, Math.max(0, i + a)), jj = Math.min(f.h - 1, Math.max(0, j + b)), s = jj * f.w + ii, g = f.ground[s];
    if (!Number.isFinite(g)) continue;
    depth += f.depth[s] * k; surf += (g + f.depth[s]) * k; ground += g * k; w += k;
  }
  if (!w) return { depth: 0, y: 0 };
  return { depth, y: Math.max(surf / w, ground / w + MUD_LIFT) };
}

// what of triangle (a, b, c) (each [x, y, z, v, depth]) lies where v >= 0: its corners there and
// where its edges cross v = 0 (at the edge's depth)
function clip(tri) {
  const out = [];
  for (let k = 0; k < 3; k++) {
    const p = tri[k], q = tri[(k + 1) % 3];
    if (p[3] >= 0) out.push(p);
    if ((p[3] >= 0) !== (q[3] >= 0)) {
      const t = p[3] / (p[3] - q[3]);
      out.push([0, 1, 2].map(n => p[n] + (q[n] - p[n]) * t).concat(0, MUD_EDGE));
    }
  }
  return out;
}

// m's pockets into builder b (each corner its own colour, so the corners are shared: render/parts.js)
export function buildMudPockets(m, b) {
  const colors = new Map(), colorOf = q => {
    const k = q[0].toFixed(4) + ',' + q[2].toFixed(4);
    if (!colors.has(k)) colors.set(k, goop(q[0], q[2], q[4]));
    return colors.get(k);
  };
  for (const p of m.mudPockets ?? []) {
    const f = pocketField(m, p), step = 1 / (MUD_RES * SUB), nx = f.w * SUB, nz = f.h * SUB;
    const at = (i, j) => {
      const x = f.x0 + i * step, z = f.z0 + j * step, s = sample(f, x, z);
      return [x, s.y, z, s.depth - MUD_EDGE, s.depth];
    };
    const grid = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) grid.push(at(i, j));
    const g = (i, j) => grid[j * (nx + 1) + i];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const A = g(i, j), B = g(i + 1, j), Cc = g(i, j + 1), D = g(i + 1, j + 1);
      if (A[3] < 0 && B[3] < 0 && Cc[3] < 0 && D[3] < 0) continue;
      for (const tri of [[A, Cc, B], [B, Cc, D]]) {
        const poly = clip(tri);
        for (let k = 1; k + 1 < poly.length; k++) {
          const corners = [poly[0], poly[k], poly[k + 1]];
          b.tri(...corners.map(q => q.slice(0, 3)), corners.map(colorOf), [0, 1, 0], true);
        }
      }
    }
  }
}
