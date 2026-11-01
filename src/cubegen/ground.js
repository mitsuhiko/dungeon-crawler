// Layer count / heights and the rolling ground of layer 0. The four face profiles (shared with
// the neighbouring cubes) pin the edge cells; inwards the ground blends from them into local
// detail, hills and plateaus.
import { N, MAX_L, ROOM_SCALE, count16 } from '../core/constants.js';
import { idx, clamp } from '../core/util.js';
import { VOID } from '../world/profile.js';
import { isVoid } from '../world/voids.js';
import { themeOf } from '../themes/depth.js';

export function chooseLayers(ctx) {
  ctx.K = ctx.spec.K; ctx.B = ctx.spec.B; ctx.stats.layers = ctx.K;
}

// local relief added on top of the blended profiles (faded out towards the edges); a theme may ask
// for more hills (themes/index.js `hills`: the dark forest's hills, on its highlands too)
function relief(ctx, theme) {
  const { R, ri, noise, spec } = ctx;
  const extra = new Float32Array(N * N);
  if (spec.height || spec.pinnacle || spec.area || spec.peak || spec.lake || spec.trial) return extra;   // shaped whole (cubegen/heights.js, areas.js, setpieces.js, trials/)
  const many = theme.hills?.count;
  // (hills keep their size: a bigger room has more of them)
  const hills = many ? ri(spec.kind === 'highland' ? 0 : count16(many[0]), spec.kind === 'highland' ? count16(1) : count16(many[1]))
    : spec.kind === 'highland' ? 0 : ri(count16(1), count16(2));
  for (let h = 0; h < hills; h++) {
    const cx = 3 + R() * (N - 6), cz = 3 + R() * (N - 6), rad = 2.2 + R() * 2.5, amp = ri(1, 3 + Math.round(2 * spec.relief));
    for (let i = 0; i < N * N; i++) extra[i] += amp * Math.max(0, 1 - Math.hypot(i % N + 0.5 - cx, ((i / N) | 0) + 0.5 - cz) / rad);
  }
  const plateaus = spec.kind === 'highland' || spec.kind === 'meadow' && ctx.K === 1 ? ri(1, Math.round(2 * ROOM_SCALE)) : 0;
  for (let p = 0; p < plateaus; p++) {
    const cx = ri(4, N - 5) + 0.5, cz = ri(4, N - 5) + 0.5;
    const hx = 1.5 + R() * 2.5, hz = 1.5 + R() * 2.5, raise = ri(3, 6 + Math.round(6 * spec.relief));
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const dx = Math.abs(x + 0.5 - cx) / hx, dz = Math.abs(z + 0.5 - cz) / hz;
      if (dx ** 4 + dz ** 4 + (noise(x * 0.8 + 40, z * 0.8 + 40) - 0.5) * 0.8 < 1) extra[idx(x, z)] += raise;
    }
  }
  return extra;
}

// void0: columns open to the depth below (no ground at all); edge cells follow the profiles,
// inside the cube the world-space void field decides (where the world allows void here)
export function groundHeights(ctx) {
  const { noise, spec } = ctx;
  const theme = themeOf(spec), P = spec.faces.map(f => f.profile), extra = relief(ctx, theme), roll = 3 * (theme.hills?.roll ?? 1);
  const lvl0 = new Int16Array(N * N), void0 = new Uint8Array(N * N);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const d = [N - 1 - x, x, N - 1 - z, z], p = [P[0][z], P[1][z], P[2][x], P[3][x]];
    const near = d.indexOf(Math.min(...d)), i = idx(x, z);
    let s = 0, ws = 0;
    for (let k = 0; k < 4; k++) if (p[k] !== VOID) { const w = 1 / (d[k] + 0.6) ** 2; s += w * p[k]; ws += w; }
    const base = ws ? s / ws : 4, e = clamp(d[near] / 3, 0, 1);
    if (d[near] === 0) void0[i] = p[near] === VOID ? 1 : 0;
    else void0[i] = spec.voidOK && isVoid(spec.noise, spec.X * N + x + 0.5, spec.Z * N + z + 0.5, spec.depth, theme.void) ? 1 : 0;
    let v = d[near] === 0 && p[near] !== VOID ? p[near] : Math.round(base + e * ((noise(x * 0.21 + 0.5, z * 0.21 + 0.5) - 0.5) * roll + extra[i]));
    // cave walls: the outer ring is rock, the ring inside it a rough half-height foot
    const wall = d[near] <= 1 ? spec.faces[near].wall?.[near < 2 ? z : x] : 0;
    if (wall) { void0[i] = 0; v = d[near] === 0 ? wall : Math.max(v, Math.round(v + (wall - v) * (0.25 + noise(x * 1.3, z * 1.3) * 0.4))); }
    lvl0[i] = clamp(v, 2, MAX_L);
  }
  ctx.lvl0 = lvl0; ctx.void0 = void0; ctx.flat = ctx.K > 1;
}
