// Ground profiles along side faces (shared by the two cubes of a face): levels from world-space
// noise in the face socket's band (highlands get taller where the theme has more relief), and
// VOID where both cubes may open onto the depth below. Where four faces meet, the corner
// column gets one value all four agree on.
import { N } from '../core/constants.js';
import { clamp } from '../core/util.js';
import { key, parse, step } from './coords.js';
import { MAX_DEPTH } from '../themes/depth.js';
import { voidAllowed, isVoid } from './voids.js';
import { isTown, TOWN_LEVEL } from './town.js';
import { spanFace, spanVertex, spanU, valleyFloor } from './spans.js';
import { heightProfile, heightVertex } from './heights.js';
import { areaProfile, areaVertex, innerCorner } from './areas.js';

export const VOID = -1;

// relief: how tall the theme's highlands get
export function levelAt(noise, sock, wx, wz, Y, relief) {
  const n = clamp((noise(wx * 0.21 + Y * 101, wz * 0.21) - 0.25) / 0.5, 0, 1);
  return sock === 'H' ? 8 + Math.floor(n * (3.99 + 6 * relief)) : 3 + Math.floor(n * 3.99);
}

// socket of the east (d=0) or south (d=2) face of cube (X,Y,Z), from whichever side is collapsed
function sockAt(world, X, Y, Z, d) {
  const t = world.wfc.tiles, a = t.get(key(X, Y, Z)), b = t.get(d ? key(X, Y, Z + 1) : key(X + 1, Y, Z));
  return a ? a.sock[d] : b.sock[d + 1];
}

// vertex between cubes vx-1..vx, vz-1..vz: void only if all four cubes may open, otherwise
// highland if most of the four faces there are
function vertexLevel(world, vx, Y, vz) {
  const cubes = [key(vx - 1, Y, vz - 1), key(vx, Y, vz - 1), key(vx - 1, Y, vz), key(vx, Y, vz)];
  if (cubes.some(k => isTown(k, world.seed))) return TOWN_LEVEL;
  const sv = spanVertex(world, vx, Y, vz);
  if (sv && !sv.natural) return valleyFloor(sv.span, world.noise, vx * N, vz * N, Y);
  const hv = heightVertex(world, vx, Y, vz) ?? areaVertex(world, vx, Y, vz);
  if (hv !== null) return hv;
  const theme = world.layout(-Y).theme;
  if (cubes.every(c => voidAllowed(world, c)) && isVoid(world.noise, vx * N, vz * N, -Y, theme.void)) return VOID;
  const s = [sockAt(world, vx - 1, Y, vz - 1, 0), sockAt(world, vx - 1, Y, vz, 0), sockAt(world, vx - 1, Y, vz - 1, 2), sockAt(world, vx, Y, vz - 1, 2)];
  return levelAt(world.noise, s.filter(x => x === 'H').length > 2 ? 'H' : 'L', vx * N, vz * N, Y, theme.relief);
}

export function profile(world, fk, sock) {
  const [k, d] = fk.split('/'), [X, Y, Z] = parse(k), out = new Int16Array(N);
  const other = d === '0' ? key(X + 1, Y, Z) : key(X, Y, Z + 1);
  if (isTown(k, world.seed) || isTown(other, world.seed)) return out.fill(TOWN_LEVEL);
  const open = voidAllowed(world, k) && voidAllowed(world, d === '0' ? key(X + 1, Y, Z) : key(X, Y, Z + 1));
  const theme = world.layout(-Y).theme;
  for (let t = 0; t < N; t++) {
    const wx = d === '0' ? (X + 1) * N : X * N + t + 0.5, wz = d === '0' ? Z * N + t + 0.5 : (Z + 1) * N;
    out[t] = open && isVoid(world.noise, wx, wz, -Y, theme.void) ? VOID : levelAt(world.noise, sock, wx, wz, Y, theme.relief);
  }
  out[0] = d === '0' ? vertexLevel(world, X + 1, Y, Z) : vertexLevel(world, X, Y, Z + 1);
  out[N - 1] = vertexLevel(world, X + 1, Y, Z + 1);
  spanProfile(world, fk, out);
  heightProfile(world, fk, out, t => {
    const wx = d === '0' ? (X + 1) * N : X * N + t + 0.5, wz = d === '0' ? Z * N + t + 0.5 : (Z + 1) * N;
    return levelAt(world.noise, sock, wx, wz, Y, theme.relief);
  });
  areaProfile(world, fk, out);   // the large areas (areas.js)
  return out;
}

// a span's faces (spans.js): the valley's cross-section on the gorge cubes' sides, the valley
// floor around the island, and a pad at the deck's level where the bridge crosses (a
// headland where that is high, a rock pinnacle between two gorge cubes)
function spanProfile(world, fk, out) {
  const s = spanFace(world, fk);
  if (!s) return;
  const [k, d] = fk.split('/'), [X, Y, Z] = parse(k);
  const at = t => d === '0' ? [(X + 1) * N, Z * N + t + 0.5] : [X * N + t + 0.5, (Z + 1) * N];
  const floor = t => valleyFloor(s.span, world.noise, ...at(t), Y);
  if (s.kind === 'island') { for (let t = 1; t < N - 1; t++) out[t] = floor(t); return; }
  if (s.kind === 'side') {
    const { span, i } = s, t0 = span.dir % 2 ? N - 1 : 0, t1 = N - 1 - t0;
    for (let t = 1; t < N - 1; t++) {
      const u = spanU(span, i, ...at(t));
      // the ledge along a room at the end: two cells at the corner's level, then the drop
      if (i === 0 && u === 1) out[t] = out[t0];
      else if (i === span.n - 1 && !span.island && u === N - 2) out[t] = out[t1];
      else out[t] = floor(t);
    }
    return;
  }
  const { span, j } = s, level = span.levels[j], room = j === 0 || (j === span.n && !span.island);
  if (!room) for (let t = 1; t < N - 1; t++) out[t] = floor(t);
  // shoulders beside the pad: a headland (or the island's edge), not around a pinnacle
  if (room || span.island && j === span.n)
    for (const t of [span.pos - 2, span.pos + 2]) out[t] = Math.max(room ? out[t] : 0, level - 1);
  for (let t = span.pos - 1; t <= span.pos + 1; t++) out[t] = level;
}

// cave depths and canyons: a rock wall along the face (both cubes build their half of it), open around the
// portal and the river crossing. Heights come from world noise sampled at the face (corners at
// the shared vertex), so the four faces meeting at a corner agree.
// (a trial room that has to be walled in, world/trials.js: the crumbling floor's and the timed
// gate's, where the causeway is the only way, and the balance's stones, gets rock walls along its
// faces even under the sky)
const WALLED = new Set(['collapse', 'timedgate', 'balance']);
const walledTrial = (world, k) => { const d = -parse(k)[1]; return d >= 0 && d <= MAX_DEPTH && WALLED.has(world.layout(d).trialCells?.get(k)?.kind); };
export function caveWall(world, fk, f) {
  const [k, d] = fk.split('/'), [X, Y, Z] = parse(k);
  const theme = world.layout(-Y).theme;
  const trialOnly = !theme.cave && !theme.walls;
  if (trialOnly && !walledTrial(world, k) && !walledTrial(world, step(k, +d))) return null;
  const out = new Int16Array(N);
  // (none at a corner where a large area's unwalled inner face ends, areas.js)
  const open = [innerCorner(world, d === '0' ? X + 1 : X, Y, d === '0' ? Z : Z + 1), innerCorner(world, X + 1, Y, Z + 1)];
  for (let t = 0; t < N; t++) {
    if ((f.portal && Math.abs(t - f.portal.pos) <= 2) || (f.spout && Math.abs(t - f.spout.pos) <= 2)) continue;
    if ((t === 0 && open[0]) || (t === N - 1 && open[1])) continue;
    if (trialOnly && (t === 0 || t === N - 1)) continue;   // (the corners belong to the faces beside it too)
    if (f.river && t >= f.river.pos - 1 && t <= f.river.pos + f.river.w) continue;
    const a = t === 0 ? 0 : t === N - 1 ? N : t + 0.5;
    const wx = d === '0' ? (X + 1) * N : X * N + a, wz = d === '0' ? Z * N + a : (Z + 1) * N;
    out[t] = 17 + Math.floor(world.noise(wx * 0.3 + 77, wz * 0.3 + Y * 13) * 7);
  }
  return out;
}
