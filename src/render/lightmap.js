// The lightmap layout of a cube's solids (terrain, stone, wood): every triangle gets a place in
// one atlas, where the baked shadows of the cube's fixed lights are kept (render/bake.js). Runs in
// the world worker with the rest of the cube's geometry (render/parts.js packParts).
//
// Charts: the triangles facing mostly the same way (one of the six axis directions), connected
// by their edges, projected along that axis. A floor is one chart, a cliff face another, a slope
// the floor's or the wall's, whichever it faces more. Where a chart would come back over itself
// (a spiral ramp seen from above) the triangle that would land where it already lies starts a
// chart of its own. Each chart keeps PAD texels round it (the shadows are interpolated between
// texels: render/bake.js fills the pad from the chart's edge).
//
// The atlas's texels are DENSITY a world unit (or what the world asks for), fewer if the cube would not fit in MAX texels
// square; its width a power of two that holds the charts about square.
// learn: light.html#unfold (see learn/README.md)
export const DENSITY = 16;           // texels a world unit
const PAD = 2;                       // texels round a chart
const MAX = 4096;                    // the largest atlas side
// what the world asks for (render/bake.js bakeDensity: fewer on the lower quality levels, a
// quarter of the memory; world/worker.js sets it when the world starts)
let density0 = DENSITY;
export function setLightmapDensity(d) { density0 = d > 0 ? d : DENSITY; }

// arrays: triangle soups ({ pos }: xyz per corner, three corners a triangle). Sets a.lm (uv per
// corner, 0..1 in the atlas) on each; -> { w, h, density } (the atlas's size in texels)
// learn: light.html#unfold (see learn/README.md)
export function layoutLightmap(arrays) {
  const tris = [];
  for (const a of arrays) {
    a.lm = new Float32Array(a.pos.length / 3 * 2);
    for (let i = 0; i < a.pos.length / 9; i++) tris.push({ a, i });
  }
  if (!tris.length) return { w: 1, h: 1, density: density0 };
  const charts = chartsOf(tris);
  for (let density = density0; ; density *= 0.8) {
    const atlas = pack(charts, density);
    if (atlas) { place(charts, atlas, density); return { w: atlas.w, h: atlas.h, density }; }
  }
}

const corner = (t, k, out) => {
  const p = t.a.pos, o = t.i * 9 + k * 3;
  out[0] = p[o]; out[1] = p[o + 1]; out[2] = p[o + 2];
  return out;
};
// the axis (0 x, 1 y, 2 z) and side (1, -1) a triangle faces most
function facing(t) {
  const A = corner(t, 0, []), B = corner(t, 1, []), C = corner(t, 2, []);
  const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
  const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  let k = 0;
  for (let j = 1; j < 3; j++) if (Math.abs(n[j]) > Math.abs(n[k])) k = j;
  return k * 2 + (n[k] >= 0 ? 0 : 1);
}
// the two axes a chart facing `axis` is laid out along (u, v)
const PLANE = [[2, 1], [0, 2], [0, 1]];

// (a corner's place, to a 512th of a unit, as one number: up to 128 units from the origin each way)
const Q = 2 ** 17, H = Q / 2;
const key = (p, o) => ((Math.round(p[o] * 512) + H) * Q + Math.round(p[o + 1] * 512) + H) * Q + Math.round(p[o + 2] * 512) + H;

function chartsOf(tris) {
  // neighbours across shared edges, among the triangles facing the same way
  const dir = tris.map(facing), corners = new Map(), edges = new Map(), next = tris.map(() => []);
  const id = k => { let v = corners.get(k); if (v === undefined) corners.set(k, v = corners.size); return v; };
  tris.forEach((t, n) => {
    const p = t.a.pos, ks = [0, 1, 2].map(k => id(key(p, t.i * 9 + k * 3)));
    for (let k = 0; k < 3; k++) {
      const a = ks[k], b = ks[(k + 1) % 3], e = (Math.min(a, b) * 2 ** 21 + Math.max(a, b)) * 8 + dir[n];
      const other = edges.get(e);
      if (other === undefined) edges.set(e, n);
      else { next[n].push(other); next[other].push(n); }
    }
  });
  // grown from a seed over the neighbours; a triangle that lands on texels the chart already
  // covers waits for a chart of its own (checked at the finest density the layout may use)
  const chart = new Int32Array(tris.length).fill(-1), charts = [];
  // (those left out are picked up again as seeds; a triangle can always start a chart)
  for (let left = true; left;) {
    left = false;
    for (let s = 0; s < tris.length; s++) if (chart[s] < 0) { grow(s); left = true; }
  }
  function grow(s) {
    const c = { axis: dir[s] >> 1, tris: [], taken: new Set() }, id = charts.length, queue = [s];
    charts.push(c);
    chart[s] = id;
    for (let q = 0; q < queue.length; q++) {
      const n = queue[q];
      if (!claim(c, tris[n])) { chart[n] = -1; continue; }
      c.tris.push(tris[n]);
      for (const m of next[n]) if (chart[m] < 0 && dir[m] === dir[s]) { chart[m] = id; queue.push(m); }
    }
    delete c.taken;
    for (const t of c.tris) t.chart = c;
  }
  // a chart's extent along its two axes
  for (const c of charts) {
    const [U, V] = PLANE[c.axis], P = [];
    c.u0 = c.v0 = Infinity; c.u1 = c.v1 = -Infinity;
    for (const t of c.tris) for (let k = 0; k < 3; k++) {
      corner(t, k, P);
      c.u0 = Math.min(c.u0, P[U]); c.u1 = Math.max(c.u1, P[U]); c.v0 = Math.min(c.v0, P[V]); c.v1 = Math.max(c.v1, P[V]);
    }
  }
  return charts.filter(c => c.tris.length);
}

// mark the cells (CLAIM a unit) whose centres the triangle covers in the chart; false if any is
// taken (folds closer than a cell are not found: rare, and only a smudge where they are)
const CLAIM = 4;
const P0 = [], P1 = [], P2 = [];
function claim(c, t) {
  const [U, V] = PLANE[c.axis];
  corner(t, 0, P0); corner(t, 1, P1); corner(t, 2, P2);
  const ax = P0[U] * CLAIM, ay = P0[V] * CLAIM, bx = P1[U] * CLAIM, by = P1[V] * CLAIM, cx = P2[U] * CLAIM, cy = P2[V] * CLAIM;
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (Math.abs(area) < 1e-9) return true;
  const s = area > 0 ? 1 : -1, cells = [];
  const x0 = Math.floor(Math.min(ax, bx, cx)), x1 = Math.ceil(Math.max(ax, bx, cx)), y0 = Math.floor(Math.min(ay, by, cy)), y1 = Math.ceil(Math.max(ay, by, cy));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5, py = y + 0.5;
    const w0 = ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) * s, w1 = ((cx - bx) * (py - by) - (cy - by) * (px - bx)) * s, w2 = ((ax - cx) * (py - cy) - (ay - cy) * (px - cx)) * s;
    if (w0 > 1e-6 && w1 > 1e-6 && w2 > 1e-6) {
      const k = (x + 32768) * 65536 + y + 32768;
      if (c.taken.has(k)) return false;
      cells.push(k);
    }
  }
  for (const k of cells) c.taken.add(k);
  return true;
}

// shelves, tallest charts first, in an atlas a power of two wide; null if it would not fit
function pack(charts, density) {
  let area = 0;
  for (const c of charts) {
    c.w = Math.ceil((c.u1 - c.u0) * density) + 1 + PAD * 2;
    c.h = Math.ceil((c.v1 - c.v0) * density) + 1 + PAD * 2;
    area += c.w * c.h;
  }
  let w = 256;
  while (w * w < area * 1.15 && w < MAX) w *= 2;
  const order = [...charts].sort((a, b) => b.h - a.h || b.w - a.w);
  let x = 0, y = 0, row = 0;
  for (const c of order) {
    if (c.w > w) return null;
    if (x + c.w > w) { y += row; x = 0; row = 0; }
    c.x = x; c.y = y;
    x += c.w; row = Math.max(row, c.h);
  }
  const h = y + row;
  return h > MAX ? null : { w, h };
}

function place(charts, atlas, density) {
  const P = [];
  for (const c of charts) {
    const [U, V] = PLANE[c.axis];
    for (const t of c.tris) for (let k = 0; k < 3; k++) {
      corner(t, k, P);
      const o = (t.i * 3 + k) * 2;
      t.a.lm[o] = (c.x + PAD + 0.5 + (P[U] - c.u0) * density) / atlas.w;
      t.a.lm[o + 1] = (c.y + PAD + 0.5 + (P[V] - c.v0) * density) / atlas.h;
    }
  }
}
