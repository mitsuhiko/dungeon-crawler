// The static geometry of a cube (terrain, structures, fluid volumes) as plain typed arrays per
// layer, and packed into the parts it is drawn from (render/parts.js). Runs in the world worker;
// the main thread only wraps the parts into meshes, for the active cube as well as for the
// low-detail neighbours.
import { N, BASE, FLUIDS } from '../core/constants.js';
import { packParts } from './parts.js';
import { GeoBuilder } from './builder.js';
import { BEDROCK, usePalette } from './palette.js';
import { themeOf } from '../themes/depth.js';
import { buildFloors } from './floors.js';
import { buildStructures } from './structures.js';
import { buildInteriorWalls } from './interior.js';
import { lowWaterLines } from './surface.js';
import { buildFlipGeometry } from './flipgeo.js';

// The solids are split along the low-water line of the clear fluids in the cells a triangle
// touches (render/surface.js lowWaterLines): what stands out of the water (a bank, a bridge's
// pier) then wavers under it only, never over it (render/underwater.js: the same cells, the same
// line, a vertex on it never moves).
function waterCuts(m) {
  const lines = lowWaterLines(m);
  if (!lines.some(Boolean)) return null;
  return (a, b, c) => {
    const y0 = Math.min(a[1], b[1], c[1]), y1 = Math.max(a[1], b[1], c[1]), out = [];
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]) - 0.01)), x1 = Math.min(N - 1, Math.floor(Math.max(a[0], b[0], c[0]) + 0.01));
    const z0 = Math.max(0, Math.floor(Math.min(a[2], b[2], c[2]) - 0.01)), z1 = Math.min(N - 1, Math.floor(Math.max(a[2], b[2], c[2]) + 0.01));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const w = lines[z * N + x];
      if (w && w.low > y0 && w.low < y1 && !out.includes(w.low)) out.push(w.low);
    }
    return out;
  };
}

export function buildCubeGeometry(m) {
  usePalette(themeOf(m));
  const cutAt = waterCuts(m);
  const layers = Array.from({ length: m.K }, () => ({
    terrain: new GeoBuilder({ cutAt }), stone: new GeoBuilder({ cutAt }), wood: new GeoBuilder({ cutAt }), flags: new GeoBuilder({ sway: true }),
    fluids: Object.fromEntries(FLUIDS.map(t => [t, new GeoBuilder({ uvs: true })])),
  }));
  // bedrock under every column that is not open to the depth below
  // (inside houses the floors reach down themselves, render/interior.js)
  // Flip's box: its cells, nothing else (render/flipgeo.js)
  if (m.flip) { buildFlipGeometry(m, layers); return layers.map(L => ({ terrain: L.terrain.pos.length ? L.terrain.arrays() : null,
    stone: L.stone.pos.length ? L.stone.arrays() : null, wood: L.wood.pos.length ? L.wood.arrays() : null, flags: null, fluids: Object.fromEntries(FLUIDS.map(t => [t, null])) })); }
  const solid = (x, z) => !m.interior && x >= 0 && z >= 0 && x < N && z < N && m.cols[z * N + x].some(f => f.layer === 0 || f.merged && f.bottom === 0);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (solid(x, z))
    layers[0].terrain.box(x, -BASE, z, x + 1, 0, z + 1, BEDROCK[0], BEDROCK[1],
      { py: true, px: solid(x + 1, z), nx: solid(x - 1, z), pz: solid(x, z + 1), nz: solid(x, z - 1) });
  buildFloors(m, layers);
  buildStructures(m, layers);
  if (m.interior) buildInteriorWalls(m, layers);
  const arr = b => b.pos.length ? b.arrays() : null;
  return layers.map(L => ({
    terrain: arr(L.terrain), stone: arr(L.stone), wood: arr(L.wood), flags: arr(L.flags),
    fluids: Object.fromEntries(FLUIDS.map(t => [t, arr(L.fluids[t])])),
  }));
}

// what the main thread gets: the cube's parts (render/parts.js packParts)
export const buildCubeParts = m => packParts(buildCubeGeometry(m), m);
