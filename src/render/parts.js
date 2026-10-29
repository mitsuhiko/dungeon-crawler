// The parts a cube is drawn from, the same for the active cube and its low-detail proxy: one
// merged, indexed and quantized geometry per part (terrain, structure stone, wood, each fluid's
// surface and each fluid's falls). Runs in the world worker (no three.js renderer here); the main
// thread only wraps the arrays (render/partmeshes.js) and decides how each part looks
// (render/materials.js). A new part added here shows up in both the cube and its proxy.
import { N, LH, DIRS, FLUIDS, DRAWN_FLUIDS, FLUID_NAME } from '../core/constants.js';
import { palRow } from '../themes/fluids.js';
import { restY } from './surface.js';
import { layoutLightmap } from './lightmap.js';

// kind: 'solid' (vertex coloured, cut with a section cap of `cap`; `sway`: with uvs saying how
// far each vertex swings in the wind, render/materials.js swayMaterial; `lit`: laid out in the
// cube's lightmap, its fixed lights' shadows baked, render/bake.js), 'fluid' (a surface of
// `fluid`), 'fall' (a sheet of `fluid` pouring over an edge, with uvs for its scrolling streaks)
export const PARTS = [
  { name: 'terrain', kind: 'solid', cap: 'rock', lit: true },
  { name: 'stone', kind: 'solid', cap: 'stone', lit: true },
  { name: 'wood', kind: 'solid', cap: 'wood', lit: true },
  { name: 'flags', kind: 'solid', cap: 'wood', sway: true },   // prayer flags (render/bridges.js)
  ...DRAWN_FLUIDS.map(t => ({ name: FLUID_NAME[t], kind: 'fluid', fluid: t })),   // (mud: a look of water, core/constants.js)
  ...FLUIDS.map(t => ({ name: FLUID_NAME[t] + '-fall', kind: 'fall', fluid: t })),
];

// Vertex layout (all padded to four components so every attribute is 4-byte aligned, which
// Metal and D3D need to use the data as is):
//   position Int16 x4 in units of `scale` (1/1024: +-32 world units, a cube spans -0.6..17)
//   normal   Int8 x4, normalized
//   color    Uint16 x4, normalized (solids only; alpha 1); linear colours keep their dark shades
//   uv       Float32 x2 (fluids, falls and swaying solids only; a fluid's say what each face is
//            and where its shores are, render/floors.js fluidVolume)
//   pal      Uint16 x4 (fluids and falls only): the palette rows of its colours (themes/fluids.js,
//            cubegen/fluidbodies.js): a fall's at its top and at its foot, and how far down the
//            sheet it is (0..1000: the one turns into the other); a surface's twice, 0
//   shore    Float32 x4 (fluids only): the ground under a surface's top (render/shore.js: its
//            height, its slope, 0, 0); elsewhere 0, 0, 0, 1 (none: what a missing attribute reads)
//   lm       Uint16 x2, normalized (the lit solids: terrain, stone, wood): where the corner is in
//            the cube's lightmap atlas (render/lightmap.js; its baked shadows: render/bake.js)
// 20 bytes a vertex for solids instead of 36, and shared corners are stored once.
const SCALE = 1 / 1024, LIMIT = 32767;

// layers: buildCubeGeometry's per-layer GeoBuilder arrays; m: the map (for the falls)
// -> { parts: { [name]: { pos, nor, col?, uv?, pal?, shore?, lm?, index } }, scale, bounds: [x0, y0, z0, x1, y1, z1],
//      lightmap: { w, h, density } (the atlas the lit solids' lm point into) }
export function packParts(layers, m) {
  const sources = {};
  for (const part of PARTS) {
    const list = part.kind === 'solid' ? layers.map(L => L[part.name])
      : part.kind === 'fluid' ? layers.map(L => L.fluids[part.fluid])
      : [fallSheets(m, part.fluid)];
    sources[part.name] = list.filter(a => a && a.pos.length);
  }
  const lightmap = layoutLightmap(PARTS.filter(p => p.lit).flatMap(p => sources[p.name]));
  const bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const list of Object.values(sources)) for (const a of list) for (let i = 0; i < a.pos.length; i += 3)
    for (let j = 0; j < 3; j++) { bounds[j] = Math.min(bounds[j], a.pos[i + j]); bounds[j + 3] = Math.max(bounds[j + 3], a.pos[i + j]); }
  // coarser steps only if something reaches unusually far out
  let scale = SCALE;
  while (Math.max(...bounds.map(Math.abs).filter(Number.isFinite), 0) / scale > LIMIT) scale *= 2;
  const parts = {};
  for (const part of PARTS) if (sources[part.name].length) parts[part.name] = pack(sources[part.name], scale, part);
  if (!Number.isFinite(bounds[0])) bounds.fill(0);
  return { parts, scale, bounds, lightmap };
}

// the buffers to transfer (instead of copy) when posting the parts
export function partBuffers(geo) {
  const out = [];
  for (const p of Object.values(geo.parts)) for (const a of [p.pos, p.nor, p.col, p.uv, p.pal, p.shore, p.lm, p.index]) if (a) out.push(a.buffer);
  return out;
}

// triangle soup -> indexed, quantized arrays; identical corners (after quantizing) are merged
function pack(list, scale, { kind, sway, lit }) {
  const color = kind === 'solid', uvs = kind !== 'solid' || !!sway, pals = kind !== 'solid', shores = kind === 'fluid';
  const lms = !!lit;
  let total = 0;
  for (const a of list) total += a.pos.length / 3;
  const pos = new Int16Array(total * 4), nor = new Int8Array(total * 4);
  const col = color ? new Uint16Array(total * 4) : null, uv = uvs ? new Float32Array(total * 2) : null;
  const pal = pals ? new Uint16Array(total * 4) : null, p = new Int32Array(3), shore = shores ? new Float32Array(total * 4) : null;
  const lm = lms ? new Uint16Array(total * 2) : null, l = new Int32Array(2);
  const index = new Uint32Array(total), seen = new Map();
  let n = 0, k = 0;
  const q = new Int32Array(6), c = new Int32Array(3);
  for (const a of list) for (let i = 0; i < a.pos.length / 3; i++) {
    for (let j = 0; j < 3; j++) {
      q[j] = Math.round(a.pos[i * 3 + j] / scale);
      q[j + 3] = Math.max(-127, Math.min(127, Math.round(a.nor[i * 3 + j] * 127)));
      if (color) c[j] = Math.max(0, Math.min(65535, Math.round(a.col[i * 3 + j] * 65535)));
    }
    let key = q.join(',');
    if (color) key += ',' + c.join(',');
    if (uvs) key += ',' + a.uv[i * 2] + ',' + a.uv[i * 2 + 1];
    if (pals) {
      // (a surface's: one row; a fall's: top, foot, how far down)
      if (a.pal.length === a.pos.length) { p[0] = a.pal[i * 3]; p[1] = a.pal[i * 3 + 1]; p[2] = Math.round(a.pal[i * 3 + 2] * 1000); }
      else { p[0] = p[1] = a.pal[i]; p[2] = 0; }
      key += ',' + p.join(',');
    }
    if (shores) for (let j = 0; j < 4; j++) key += ',' + a.shore[i * 4 + j];
    if (lms) {
      for (let j = 0; j < 2; j++) l[j] = Math.max(0, Math.min(65535, Math.round(a.lm[i * 2 + j] * 65535)));
      key += ',' + l[0] + ',' + l[1];
    }
    let v = seen.get(key);
    if (v === undefined) {
      v = n++;
      seen.set(key, v);
      for (let j = 0; j < 3; j++) { pos[v * 4 + j] = q[j]; nor[v * 4 + j] = q[j + 3]; }
      if (color) { for (let j = 0; j < 3; j++) col[v * 4 + j] = c[j]; col[v * 4 + 3] = 65535; }
      if (uvs) { uv[v * 2] = a.uv[i * 2]; uv[v * 2 + 1] = a.uv[i * 2 + 1]; }
      if (pals) for (let j = 0; j < 3; j++) pal[v * 4 + j] = p[j];
      if (shores) for (let j = 0; j < 4; j++) shore[v * 4 + j] = a.shore[i * 4 + j];
      if (lms) { lm[v * 2] = l[0]; lm[v * 2 + 1] = l[1]; }
    }
    index[k++] = v;
  }
  return {
    pos: pos.slice(0, n * 4), nor: nor.slice(0, n * 4), col: col ? col.slice(0, n * 4) : null, uv: uv ? uv.slice(0, n * 2) : null,
    pal: pal ? pal.slice(0, n * 4) : null, shore: shore ? shore.slice(0, n * 4) : null, lm: lm ? lm.slice(0, n * 2) : null,
    index: n <= 65535 ? Uint16Array.from(index) : index,
  };
}

// The sheets of the falls of one fluid: a curtain, not a block. It leaves the pool a little
// behind the edge, curls over the lip and drops, drifting out and bulging a little, wider towards
// the bottom; one ribbon, drawn from both sides (its outline is the shader's, render/materials.js).
// u runs across (0..1), v down the sheet from where it leaves the pool, 0.7 per world unit
// (splash rings and lights stay with the active cube, render/falls.js).
export const FALL_WIDTH = 0.9;   // world units across at the lip
function fallSheets(m, type) {
  const pos = [], nor = [], uv = [], pal = [], ACROSS = 6, R = 0.22, LIP = 0.25;
  // falls of lower layers first: drawn back to front from above
  for (const f of (m.falls || []).filter(f => f.type === type).sort((a, b) => a.layer - b.layer)) {
    const [dx, dz] = DIRS[f.d], bx = f.c % N, bz = (f.c / N) | 0;
    // (its foot well under the pool's surface: the water's swell dips, render/materials.js)
    const yTop = restY(f.top * LH) + 0.02, y0 = restY(f.bot * LH) - 0.34, h = yTop - y0;
    const ex = dx > 0 ? bx : dx < 0 ? bx + 1 : bx + 0.5, ez = dz > 0 ? bz : dz < 0 ? bz + 1 : bz + 0.5;
    // the profile: [out from the edge, y, distance along the sheet]: flat over the pool, the
    // curl over the lip, the drop
    const prof = [[-0.05 - LIP, yTop], [-0.05, yTop]];
    for (let i = 1; i <= 5; i++) { const t = i / 5 * Math.PI / 2; prof.push([-0.05 + R * Math.sin(t), yTop - R + R * Math.cos(t)]); }
    const top = yTop - R, drop = Math.max(0.01, top - y0), rows = Math.max(3, Math.ceil(drop / 0.4));
    for (let i = 1; i <= rows; i++) { const k = i / rows; prof.push([-0.05 + R + 0.1 * Math.sqrt(k), top - drop * k]); }
    prof.forEach((p, i) => p.push(i ? prof[i - 1][2] + Math.hypot(p[0] - prof[i - 1][0], p[1] - prof[i - 1][1]) : 0));
    // across (a, -1..1): flared lower down, bulging out a little where it drops
    const point = (j, i) => {
      const [o, y, sAlong] = prof[i], a = j / ACROSS * 2 - 1, k = Math.max(0, (yTop - R - y) / Math.max(h, 0.01));
      const half = (f.width ?? FALL_WIDTH) / 2 * (1 + 0.12 * k), out = o + 0.05 * (1 - a * a) * Math.min(1, k * 4);
      return [ex + dx * out + -dz * a * half, y, ez + dz * out + dx * a * half, j / ACROSS, sAlong * 0.7];
    };
    const grid = prof.map((_, i) => Array.from({ length: ACROSS + 1 }, (_, j) => point(j, i)));
    // normals: across x down the sheet, turned outwards (or up on the lip)
    const normal = (i, j) => {
      const A = grid[i][Math.min(ACROSS, j + 1)], B = grid[i][Math.max(0, j - 1)];
      const C = grid[Math.min(grid.length - 1, i + 1)][j], D = grid[Math.max(0, i - 1)][j];
      const ax = A[0] - B[0], ay = A[1] - B[1], az = A[2] - B[2], tx = C[0] - D[0], ty = C[1] - D[1], tz = C[2] - D[2];
      let nx = ay * tz - az * ty, ny = az * tx - ax * tz, nz = ax * ty - ay * tx;
      if (nx * dx + nz * dz + ny * 0.5 < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const l = Math.hypot(nx, ny, nz) || 1;
      return [nx / l, ny / l, nz / l];
    };
    // its colours: from its top's to its foot's, turning over the drop (cubegen/fluidbodies.js)
    const [palTop, palFoot] = f.pal ?? [palRow(m.depth ?? 0, type, 0), palRow(m.depth ?? 0, type, 0)], total = prof[prof.length - 1][2] || 1;
    const vert = (i, j) => {
      const g = grid[i][j];
      pos.push(g[0], g[1], g[2]); nor.push(...normal(i, j)); uv.push(g[3], g[4]);
      pal.push(palTop, palFoot, Math.min(1, Math.max(0, (prof[i][2] / total - 0.15) / 0.75)));
    };
    for (let i = 0; i + 1 < grid.length; i++) for (let j = 0; j < ACROSS; j++) {
      vert(i, j); vert(i + 1, j); vert(i + 1, j + 1);
      vert(i, j); vert(i + 1, j + 1); vert(i, j + 1);
    }
  }
  return { pos, nor, uv, pal };
}
