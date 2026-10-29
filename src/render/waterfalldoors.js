// A small weathered door under the overhang, behind the water curtain. Travel and interaction
// use map.doors, exactly like town houses; this is only its geometry, not a new portal system.
import { C } from './palette.js';
const STONE = C('#60716b'), WOOD = C('#554231'), DARK = C('#302c29'), BRASS = C('#b09b61');
export function buildWaterfallDoors(m, layers) {
  for (const d of (m.doors ?? []).filter(d => d.waterfall)) {
    const b = layers[d.layer].stone;
    const box = (u0, y0, v0, u1, y1, v1, color) => {
      const points = [[u0, v0], [u1, v0], [u0, v1], [u1, v1]].map(([u, v]) =>
        [d.x - d.nz * u + d.nx * v, d.z + d.nx * u + d.nz * v]);
      b.box(Math.min(...points.map(p => p[0])), d.y + y0, Math.min(...points.map(p => p[1])),
        Math.max(...points.map(p => p[0])), d.y + y1, Math.max(...points.map(p => p[1])), color, color);
    };
    box(-0.69, 0, -0.08, -0.5, 1.65, 0.14, STONE);
    box(0.5, 0, -0.08, 0.69, 1.65, 0.14, STONE);
    box(-0.69, 1.45, -0.08, 0.69, 1.65, 0.14, STONE);
    box(-0.5, 0, -0.04, 0.5, 1.45, 0.04, DARK);
    for (let i = 0; i < 5; i++) box(-0.49 + i * 0.2, 0.03, 0.04, -0.31 + i * 0.2, 1.42, 0.065, WOOD);
    box(0.28, 0.67, 0.065, 0.36, 0.83, 0.1, BRASS);
  }
}
