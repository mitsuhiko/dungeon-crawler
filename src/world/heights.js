// Big height differences, planned with the layout from the seed alone (like the gorge spans,
// world/spans.js), on their own random stream:
//
//   tableland  three rooms on the route: an ascent
//              (you come in at the foot of an escarpment and climb to the shelf along its top),
//              a plateau high above everything around it, and a descent from its edge: a
//              plunge (a leap off the cliff onto something soft), a climb down, or a great
//              shaft (a ramp winding down round a hole that opens into the depth below)
//   pinnacle   a needle of rock with a ramp winding up round it to a reward site on its top
//
// The faces follow the tableland (profile.js): every face of the plateau is high, the faces
// between the three rooms carry the pads up there, and the side faces of the ascent and the
// descent carry the escarpment's cross-section, so the cliff runs on into the rock beside them.
// cubegen/heights.js builds the cubes. Whether a descent can be a shaft depends on the depth
// below (the shaft needs a room right under it), so it is decided per world (shaftOf): a planned
// shaft without one becomes a plunge.
//
//   piece: { id, kind: 'tableland', keys: [ascent, plateau, descent], dirs: [d0, d1] (the
//            direction from the ascent to the plateau, and from the plateau to the descent),
//            ways: [w0, w1] (the faces the route comes into the ascent by, and leaves the descent
//            by: they keep their own profile), hi (the shelf level),
//            cu: [ascent, descent] (where the cliff stands, along the travel direction),
//            descent: 'plunge' | 'stairs' | 'shaft', seed }
import { mulberry32, hash32 } from '../core/util.js';
import { N, at16 } from '../core/constants.js';
import { key, parse, step } from './coords.js';
import { MAX_DEPTH } from '../themes/depth.js';

const AXES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const direction = (a, b) => AXES.findIndex(([x, z]) => a[0] + x === b[0] && a[1] + z === b[1]);
const cheb = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));

// a theme's height pieces: the depth's large area (one at most: a tableland or one of the large areas,
// world/areas.js, by weight) and its set piece (a pinnacle, or one of the set-piece cubes,
// cubegen/setpieces.js), each by chance; how likely a cube gets a tunnel (cubegen/tunnel.js); the
// shelf levels and the pinnacle's top (lower under a cave's or canyon's rock walls)
export function heightsOf(theme) {
  const walled = theme.cave || theme.walls, o = theme.heights || {};
  const big = { chance: 0.75, tableland: 0.45, spiral: walled ? 0.45 : 0.35, hairpin: walled ? 0.1 : theme.spans?.sky ? 0.35 : 0.2 };
  const small = { chance: 0.7, pinnacle: 0.4, peak: 0.3, lake: 0.3 };
  return { tunnel: walled ? 0.4 : 0.25, shelf: walled ? [13, 15] : [17, 20], top: walled ? [14, 16] : [19, 21], ...o,
    big: { ...big, ...o.big }, small: { ...small, ...o.small } };
}

// one of the weighted kinds ({ kind: weight }) at r in [0, 1)
function weighted(weights, r) {
  const list = Object.entries(weights).filter(([, w]) => w > 0);
  let x = r * list.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of list) if ((x -= w) < 0) return k;
  return list.at(-1)?.[0] ?? null;
}

// the depth's two slots, on their own random stream: big (tableland, spiral, hairpin) and small
// (pinnacle, peak, lake), each null when the depth gets none; pick: where the small one goes
// learn: world.html#heights (see learn/README.md)
export function planSlots(seed, d, theme) {
  if (d === 0 || d >= MAX_DEPTH) return { big: null, small: null, pick: 0 };
  const cfg = heightsOf(theme), R = mulberry32(hash32(seed ^ Math.imul(d + 1, 0x51a75) ^ 0x3e9));
  const { chance: bc, ...bw } = cfg.big, { chance: sc, ...sw } = cfg.small;
  const big = R() < bc ? weighted(bw, R()) : null, small = R() < sc ? weighted(sw, R()) : null;
  return { big, small, pick: R() };
}

// the height pieces of depth d (spine: the route's cells, K: cell -> cube key,
// blocked(cell): cubes no piece may use), if the depth's large area is a tableland (planSlots)
// learn: world.html#heights (see learn/README.md)
export function planHeights(seed, d, theme, spine, K, blocked, tableland) {
  const pieces = [], cells = new Map();
  if (d === 0 || d >= MAX_DEPTH) return { pieces, cells };
  const cfg = heightsOf(theme), R = mulberry32(hash32(seed ^ Math.imul(d + 1, 0x6e1a2b3d) ^ 0x4e19));
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  if (tableland) {
    // [before, ascent, plateau, descent, after], never at the ends of the route
    const runs = [];
    for (let i = 1; i + 3 < spine.length; i++) {
      const run = spine.slice(i - 1, i + 4);
      if (!run.slice(1, 4).some(blocked)) runs.push(run);
    }
    if (runs.length) {
      const [p, a, b, c, n] = runs[Math.floor(R() * runs.length)], hi = ri(...cfg.shelf), r = R();
      const piece = { id: `${seed}:${K(a)}:tableland`, kind: 'tableland', keys: [a, b, c].map(K),
        dirs: [direction(a, b), direction(b, c)], ways: [direction(a, p), direction(c, n)], hi, cu: [ri(...[7, 9].map(v => Math.round(at16(v)))), ri(...[5, 7].map(v => Math.round(at16(v))))],
        descent: r < 0.6 ? 'shaft' : r < 0.85 ? 'plunge' : 'stairs', seed: hash32(seed ^ d ^ 0x7ab1e) };
      pieces.push(piece);
      ['ascent', 'plateau', 'descent'].forEach((role, i) => cells.set(piece.keys[i], { piece, role }));
    }
  }
  return { pieces, cells };
}

// the depth's set piece (planSlots), in a room no other piece uses: { pinnacle, peak, lake } (cube
// keys, at most one of them set). A pinnacle or a lone peak stands in one of the depth's
// discoveries (a reward site that is not built round a landmark) and carries it on top; the peak's
// field is pinned flat, so it keeps off the cubes that are pinned already. A great lake fills a
// room of the route or a branch (not the entrance with its ring, nor the arenas or the horde room);
// a discovery there waits on an islet.
// learn: world.html#heights (see learn/README.md)
export function planSetPiece(layout, slots) {
  const out = { pinnacle: null, peak: null, lake: null };
  if (!slots.small) return out;
  const busy = k => layout.heightCells.has(k) || layout.spanCells.has(k) || layout.areaCells?.has(k) || k === layout.annex?.key
    || layout.trialCells?.has(k);
  const near = k => [0, 1, 2, 3].some(d => busy(step(k, d)));
  const discovery = [...layout.sitePlans].filter(([k, intents]) => !busy(k) && intents.every(i => !i.landmark)).map(([k]) => k).sort();
  const options = {
    pinnacle: discovery,
    peak: discovery.filter(k => !near(k)),
    lake: [...layout.exists].filter(k => !busy(k) && !near(k) && k !== layout.up && k !== layout.down && !layout.guardians.has(k)
      && !layout.hordes.has(k) && !(layout.sitePlans.get(k) || []).some(i => i.landmark)).sort(),
  };
  for (const kind of [slots.small, ...['pinnacle', 'peak', 'lake'].filter(x => x !== slots.small)])
    if (options[kind].length) { out[kind] = options[kind][Math.floor(slots.pick * options[kind].length)]; break; }
  return out;
}

// is cell c (in cubes) next to (or on) one of the cells in `list`?
export const near = (c, list) => list.some(o => cheb(c, o) <= 1);

// the socket a tableland gives the faces of its cubes (the WFC pins them, with one layer)
export function heightPins(layout) {
  const pins = new Map();
  for (const [k, { piece, role }] of layout.heightCells || []) {
    if (role === 'plateau') { pins.set(k, ['H', 'H', 'H', 'H']); continue; }
    // towards the plateau high, the rest low
    const up = role === 'ascent' ? piece.dirs[0] : piece.dirs[1] ^ 1;
    pins.set(k, [0, 1, 2, 3].map(d => d === up ? 'H' : 'L'));
  }
  return pins;
}

// along the travel direction through a tableland cube: u = 0 at the face it is entered by
const alongU = (dir, lx, lz) => [lx, N - 1 - lx, lz, N - 1 - lz][dir];

// the tableland cube k is part of, and its role, or null
const cellOf = (world, k) => world.layout(-parse(k)[1]).heightCells?.get(k) || null;

// what a tableland makes of the face profile `out` of side face fk (k/d, d 0 or 2); levelAt(t):
// the face's own level at t (when the tableland leaves it alone). Returns whether it did anything.
export function heightProfile(world, fk, out, levelAt) {
  const [k, ds] = fk.split('/'), d = +ds, other = step(k, d), [X, Y, Z] = parse(k);
  const a = cellOf(world, k), b = cellOf(world, other);
  if (!a && !b) return false;
  const piece = (a || b).piece, wcell = t => d === 0 ? [(X + 1) * N, Z * N + t + 0.5] : [X * N + t + 0.5, (Z + 1) * N];
  // the plateau's faces (the pads to its neighbours on the route among them): all up high
  if (a?.role === 'plateau' || b?.role === 'plateau') { for (let t = 1; t < N - 1; t++) out[t] = piece.hi; return true; }
  // a side face of the ascent or the descent: the escarpment's cross-section (not where the route
  // comes into the ascent or leaves the descent, nor the faces across the way through)
  for (const [c, cube, side] of [[a, k, d], [b, other, d ^ 1]]) {
    if (!c) continue;
    const dir = c.role === 'ascent' ? piece.dirs[0] : piece.dirs[1];
    if ((d >> 1) === (dir >> 1) || side === piece.ways[c.role === 'ascent' ? 0 : 1]) continue;
    const [cx, , cz] = parse(cube);
    for (let t = 1; t < N - 1; t++) {
      const [wx, wz] = wcell(t), u = alongU(dir, Math.floor(wx) - cx * N, Math.floor(wz) - cz * N);
      const high = c.role === 'ascent' ? u > piece.cu[0] : u < shelfEnd(world, piece);
      out[t] = high ? piece.hi : Math.min(levelAt(t), piece.hi - 9);
    }
    return true;
  }
  return false;
}

// where the descent's shelf ends (a shaft's rim reaches almost to its far face)
const shelfEnd = (world, piece) => shaftOf(world, piece) ? N - 4 : piece.cu[1];

// the level at the corner vertex (vx, vz) (in cubes) of depth -Y, or null: up on the plateau
// for its corners
export function heightVertex(world, vx, Y, vz) {
  const L = world.layout(-Y);
  if (!L.heightCells?.size) return null;
  for (const c of [key(vx - 1, Y, vz - 1), key(vx, Y, vz - 1), key(vx - 1, Y, vz), key(vx, Y, vz)]) {
    const h = L.heightCells.get(c);
    if (h?.role === 'plateau') return h.piece.hi;
  }
  return null;
}

// may the descent of this tableland be a great shaft? Only over a room of the depth below that
// nothing else shapes (no guardian, horde, span, height piece, large area or set piece) and no river
// crosses (its channel would run under the hole): the shaft opens into it. (Without the WFC, on the
// main thread, the rivers are not known: the dev tools ask so.)
export function shaftOf(world, piece) {
  if (piece.descent !== 'shaft') return null;
  const k = piece.keys[2], [X, Y, Z] = parse(k), d = -Y;
  if (d + 1 >= MAX_DEPTH) return null;
  const below = key(X, Y - 1, Z), L = world.layout(d + 1);
  if (!L.exists.has(below) || L.guardians.has(below) || L.hordes.has(below) || L.spanCells?.has(below) || L.heightCells?.has(below)
    || L.areaCells?.has(below) || L.peak === below || L.lake === below || L.trialCells?.has(below)) return null;
  if (world.wfc) { world.wfc.collapseDepth(d + 1); if (world.wfc.tiles.get(below).sock.includes('W')) return null; }
  return below;
}

// the hole of a shaft, in the shaft cube's (and the room below's) cells: centre and radius
export function shaftHole(piece) {
  const R = mulberry32(piece.seed ^ 0x5a4f7);
  return { cx: at16(7 + R() * 2), cz: at16(7 + R() * 2), r: at16(2.6 + R() * 0.6) };
}

// what the generator needs to know about cube k's part in a tableland (cubegen/heights.js), or null
//   { role, dir (the travel direction through it), hi, way (the face the route comes into the
//     ascent by, or leaves the descent by), cu, descent (the descent's kind; a shaft
//     only where shaftOf allows it, else a plunge), hole (a shaft's), seed }
export function heightSpec(world, k) {
  const c = cellOf(world, k);
  if (!c) return null;
  const { piece, role } = c, shaft = shaftOf(world, piece);
  const descent = piece.descent === 'shaft' && !shaft ? 'plunge' : piece.descent;
  return { role, dir: role === 'descent' ? piece.dirs[1] : piece.dirs[0], hi: piece.hi,
    way: role === 'ascent' ? piece.ways[0] : role === 'descent' ? piece.ways[1] : null,
    cu: role === 'ascent' ? piece.cu[0] : shelfEnd(world, piece), descent, seed: piece.seed,
    hole: role === 'descent' && shaft ? shaftHole(piece) : null };
}

// the shaft over room k (in the depth above), as its hole, or null
export function shaftAbove(world, k) {
  const [X, Y, Z] = parse(k), d = -Y;
  if (d < 1) return null;
  const c = world.layout(d - 1).heightCells?.get(key(X, Y + 1, Z));
  return c?.role === 'descent' && shaftOf(world, c.piece) ? shaftHole(c.piece) : null;
}

// the layout's lookup table for its height pieces
export function indexHeights(layout, plan) {
  layout.heights = plan.pieces;
  layout.heightCells = plan.cells;
  return layout;
}
