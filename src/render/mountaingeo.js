// The geometry of a mountain (core/mountains.js planMountain; render/mountains.js shows it): its
// cells' floors at their full height built like the cube's own terrain (render/floors.js: its tops in
// the theme's colours by height, cliffs of its rock; its ladders, render/ladders.js), the ground round
// them as it is. Woppylava's volcano in colours of its own made from the theme's (volcanoLook), and
// its glow (volcanoGlow). No renderer: the tests build it too.
import * as THREE from '../../vendor/three/three.core.js';
import { DRAWN_FLUIDS, DIRS, OPP, LH } from '../core/constants.js';
import { idx, inb, mulberry32 } from '../core/util.js';
import { cornersY } from '../core/surfaces.js';
import { sidePoint } from '../core/cuts.js';
import { VOLCANO } from '../core/mountains.js';
import { rockTint, surfacesOf } from '../themes/surfaces.js';
import { themeOf } from '../themes/depth.js';
import { GeoBuilder } from './builder.js';
import { usePalette, gradient } from './palette.js';
import { buildFloors } from './floors.js';
import { buildLadder } from './ladders.js';
import { packParts } from './parts.js';

// The volcano's colours at a theme, its foot at level `b`: a theme like it with its tops and
// strata in basalt (the theme's cliff rock turned towards grey, kept clearly lighter than the
// floor round it: the theme's ground at that height), cooling darker towards the top and scorched
// red-brown up by the crater; the tints of its road (pale ash), its crater's floor and its rim
// (red-hot). Lit like the terrain; its glow is volcanoGlow's.
export function volcanoLook(theme, b) {
  const col = s => new THREE.Color(s), hex = c => '#' + c.getHexString(), H = VOLCANO.top;
  const lum = c => 0.3 * c.r + 0.59 * c.g + 0.11 * c.b;
  const floor = gradient(theme.top, b), basalt = col(rockTint(theme)).lerp(col('#706e6c'), 0.4);
  // (its cliffs lighter than the floor by more than half again, never black; its tops darker than
  // its cliffs, so its pale road shows over them)
  const want = Math.min(0.62, Math.max(0.2, lum(floor) * 1.6 + 0.06));
  basalt.multiplyScalar(want / Math.max(0.02, lum(basalt)));
  const dark = basalt.clone().multiplyScalar(0.78), burnt = basalt.clone().multiplyScalar(0.7).lerp(col('#6e2a18'), 0.5);
  const at = (k, c) => [b + H * k, hex(c)];
  // (its road pale ash, well over the rock: the way up shows from afar)
  const road = col(surfacesOf(theme).crust.top).lerp(col('#ddd3c2'), 0.8);
  if (lum(road) < lum(basalt) * 1.9) road.multiplyScalar(Math.min(1.8, lum(basalt) * 1.95 / Math.max(0.02, lum(road))));
  return {
    theme: { ...theme, top: [at(0, basalt.clone().multiplyScalar(0.66)), at(0.55, basalt.clone().multiplyScalar(0.62)), at(0.85, dark.clone().multiplyScalar(0.7)), at(1, burnt)],
      side: [at(0, basalt.clone().multiplyScalar(0.92)), at(0.3, basalt.clone().multiplyScalar(1.08)), at(0.6, basalt.clone().multiplyScalar(0.9)), at(0.85, dark),
        at(1, burnt)], lip: hex(basalt.clone().multiplyScalar(0.8)) },
    floor, basalt, road, crater: col('#2a120a'), rim: col('#8a2a12').lerp(burnt, 0.3),
  };
}

// The volcano's glow, drawn unlit (render/mountains.js: as bright in the dark as in the light, no
// lights): lava trickling down its cliffs from their tops (more of them the higher up and on the
// cliffs facing out, hottest where they come out), its crater's inner walls glowing from the lava
// in it up, and a red-hot line round the rim's inner edge. Triangles: { pos, col } (Float32Arrays,
// world units; the colours linear-ish rgb 0..1, over 1 where they are hottest).
const HOT = [[0, [1.5, 1.05, 0.4]], [0.2, [1.35, 0.55, 0.1]], [0.55, [1, 0.24, 0.04]], [1, [0.45, 0.07, 0.02]]];
const heat = u => {
  for (let i = 1; i < HOT.length; i++) if (u <= HOT[i][0]) {
    const [a, p] = HOT[i - 1], [b, q] = HOT[i], k = (u - a) / (b - a);
    return p.map((v, j) => v + (q[j] - v) * k);
  }
  return HOT.at(-1)[1];
};
export function volcanoGlow(plan, base) {
  const pos = [], col = [], R = mulberry32((plan.spec.seed ^ 0x6a1f) >>> 0), { x: cx, z: cz } = plan.spec;
  const foot = plan.ref * LH, H = VOLCANO.top * LH, OFF = 0.012;
  const tri = (a, b, c, ca, cb, cc) => { pos.push(...a, ...b, ...c); col.push(...ca, ...cb, ...cc); };
  const quad = (a, b, c, d, ca, cb, cc, cd) => { tri(a, b, c, ca, cb, cc); tri(a, c, d, ca, cc, cd); };
  const yOn = (f, cs, d, t) => cornersY(cs, f.split ?? 0, ...sidePoint(d, t));
  for (const m of plan.cells.values()) DIRS.forEach(([dx, dz], d) => {
    const x = m.x + dx, z = m.z + dz, n = plan.cells.get(idx(x, z)), g = n ? null : inb(x, z) ? base.cols[idx(x, z)][0] : null;
    const low = t => n ? yOn(n.f, n.cs, OPP[d], t) : g ? yOn(g, g.cs, OPP[d], t) : foot;
    const at = t => { const [fx, fz] = sidePoint(d, t); return [m.x + fx + dx * OFF, m.z + fz + dz * OFF]; };
    const top0 = yOn(m.f, m.cs, d, 0), top1 = yOn(m.f, m.cs, d, 1);
    const drop = Math.min(top0 - low(0), top1 - low(1));
    if (drop < 0.9) return;
    // the crater's inner walls: glowing all over, hottest down by its lava
    if (n?.crater && !m.crater) {
      const steps = 4;
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps, t1 = (i + 1) / steps, [x0, z0] = at(t0), [x1, z1] = at(t1);
        const lo0 = low(t0), lo1 = low(t1), hi0 = yOn(m.f, m.cs, d, t0), hi1 = yOn(m.f, m.cs, d, t1);
        const mid0 = lo0 + (hi0 - lo0) * 0.55, mid1 = lo1 + (hi1 - lo1) * 0.55;
        quad([x0, lo0, z0], [x1, lo1, z1], [x1, mid1, z1], [x0, mid0, z0], heat(0.05), heat(0.05), heat(0.4), heat(0.4));
        quad([x0, mid0, z0], [x1, mid1, z1], [x1, hi1, z1], [x0, hi0, z0], heat(0.4), heat(0.4), heat(0.95), heat(0.95));
        // (and a red-hot line along its edge, on the rim's top)
        const w = 0.14, ix = -dx * w, iz = -dz * w;
        quad([x0, hi0 + 0.015, z0], [x1, hi1 + 0.015, z1], [x1 + ix, hi1 + 0.015, z1 + iz], [x0 + ix, hi0 + 0.015, z0 + iz], heat(0.3), heat(0.3), heat(0.85), heat(0.85));
      }
      return;
    }
    // trickles down the cliffs: more of them up high and facing out
    const high = Math.min(1, Math.max(0, ((top0 + top1) / 2 - foot) / H));
    const rx = m.x + 0.5 - cx, rz = m.z + 0.5 - cz, rl = Math.hypot(rx, rz) || 1, out = (dx * rx + dz * rz) / rl;
    const chance = Math.min(0.95, 0.12 + 0.6 * high + (out > 0.3 ? 0.3 : 0));
    for (let k = 0; k < 2; k++) {
      if (R() >= (k ? chance * 0.45 : chance)) break;
      let t = 0.15 + R() * 0.7;
      const len = Math.max(0.5, drop * (0.35 + R() * 0.65)), segs = Math.max(3, Math.ceil(len / 0.25)), w0 = 0.05 + R() * 0.06 + 0.04 * high;
      const y0 = yOn(m.f, m.cs, d, t) - 0.02;
      let prev = null;
      for (let i = 0; i <= segs; i++) {
        const u = i / segs, y = y0 - len * u, w = w0 * (1 - 0.7 * u) / 2;
        if (i) t = Math.min(0.95, Math.max(0.05, t + (R() - 0.5) * 0.08));
        const [px, pz] = at(t), ex = -dz * w, ez = dx * w;   // (across the cliff face)
        const cur = [[px - ex, y, pz - ez], [px + ex, y, pz + ez], heat(0.12 + u * 0.88)];
        if (prev) quad(prev[0], prev[1], cur[1], cur[0], prev[2], prev[2], cur[2], cur[2]);
        prev = cur;
      }
    }
  });
  return { pos: new Float32Array(pos), col: new Float32Array(col) };
}

// its geometry: its cells' floors at their full height (the ground round them as it is), drawn as
// the cube's terrain is, with its ladders
export function mountainGeometry(plan, base) {
  const volcano = plan.spec.shape === 'volcano', look = volcano ? volcanoLook(themeOf(base), plan.ref) : null;
  usePalette(look?.theme ?? themeOf(base));
  const tint = m => !look ? undefined : m.road ? look.road : m.crater ? look.crater : m.h >= VOLCANO.top ? look.rim : undefined;
  const up = new Map([...plan.cells.values()].map(m => [m.c, { ...m.f, cs: [...m.cs], top: m.top, surface: undefined, soft: false, ice: false,
    link: m.link.map(l => l?.f ?? null), tint: tint(m) }]));
  const m = { ...base, floors: [...up.values()], cols: base.cols.map((col, c) => up.has(c) ? [up.get(c)] : col), falls: [], town: null, interior: false };
  const layers = Array.from({ length: base.K ?? 1 }, () => ({ terrain: new GeoBuilder(), stone: new GeoBuilder(), wood: new GeoBuilder(),
    flags: new GeoBuilder({ sway: true }), fluids: Object.fromEntries(DRAWN_FLUIDS.map(t => [t, new GeoBuilder({ uvs: true })])) }));
  buildFloors(m, layers);
  for (const l of plan.ladders) buildLadder(l, layers[l.layer] ?? layers[0]);
  if (look) usePalette(themeOf(base));   // (the cube's own again)
  const arr = b => b.pos.length ? b.arrays() : null;
  return packParts(layers.map(L => ({ terrain: arr(L.terrain), stone: arr(L.stone), wood: arr(L.wood), flags: arr(L.flags),
    fluids: Object.fromEntries(DRAWN_FLUIDS.map(t => [t, arr(L.fluids[t])])) })), m);
}
