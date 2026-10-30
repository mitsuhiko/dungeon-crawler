// Where the ground opens onto the depth below. A cube may only have void above a cube that
// exists one depth down (falling through lands you there); how much depends on the theme.
// The void field is world-space noise, so open areas continue across cube faces.
import { N } from '../core/constants.js';
import { key, parse } from './coords.js';
import { MAX_DEPTH } from '../themes/depth.js';
import { isTown } from './town.js';
import { shaftAbove } from './heights.js';

export function voidAllowed(world, k) {
  const [X, Y, Z] = parse(k), d = -Y;
  return !isTown(k, world.seed) && !world.layout(d).guardians.has(k) && !world.layout(d).spanCells?.has(k)
    && !world.layout(d).heightCells?.has(k) && !world.layout(d).areaCells?.has(k) && world.layout(d).peak !== k && world.layout(d).lake !== k
    && d < MAX_DEPTH && world.layout(d).theme.void > 0 && world.layout(d + 1).exists.has(key(X, Y - 1, Z))
    // a trial room (world/trials.js) has no void, and nothing falls into one from above
    && !world.layout(d).trialCells?.has(k) && !world.layout(d + 1).trialCells?.has(key(X, Y - 1, Z));
}

// is the world-space cell centre (wx, wz) at depth d open? a: how much its theme opens (void)
export function isVoid(noise, wx, wz, d, a) {
  return a > 0 && noise(wx * 0.11 + 500 + d * 37, wz * 0.11 - 300) < 0.22 + a * 0.55;
}

// where the character may fall in from the cube above (its void field, or the hole of a great
// shaft over it, heights.js; a cell wider), or null
export function fallMask(world, k) {
  const [X, Y, Z] = parse(k), up = key(X, Y + 1, Z);
  if (Y >= 0) return null;
  const shaft = shaftAbove(world, k), open = voidAllowed(world, up);
  if (!open && !shaft) return null;
  const m = new Uint8Array(N * N), a = world.layout(-Y - 1).theme.void;
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    if (shaft && Math.hypot(x + 0.5 - shaft.cx, z + 0.5 - shaft.cz) < shaft.r + 1) { m[z * N + x] = 1; continue; }
    if (!open) continue;
    if (!isVoid(world.noise, X * N + x + 0.5, Z * N + z + 0.5, -Y - 1, a)) continue;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, nz = z + dz;
      if (nx >= 0 && nz >= 0 && nx < N && nz < N) m[nz * N + nx] = 1;
    }
  }
  return m;
}
