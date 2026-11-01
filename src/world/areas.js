// Large areas: a stretch of the route laid out as one place over several cubes, planned with the
// layout from the seed alone (like the tableland, world/heights.js). The layout builds the area's
// shape into the route (layout.js, route templates), so its rooms follow each other on the route
// in a fixed order. It is still discovered one cube at a time like everything else: every step of
// the route between its cubes crosses a portal, and a cube shows only once visited. The faces between
// its cubes are never walled, so once both sides are visited and the face opens, the area reads as
// one place. A depth has at most one large area (or tableland).
//
//   spiral   2x2: a mountain on the corner the four cubes share, a railed ramp winding once round
//            it from the foot, where the route comes in, up to a ridge running out to the exit
//   hairpin  2x3: two gorge spans side by side over one canyon, the low one going out and the
//            high one coming back, two rooms climbing at the turn and a summit at the end
//
// The spiral's ground is one function of world position (spiralAt), so the faces between its
// cubes and their insides agree by construction. The hairpin's gorges are ordinary spans
// (world/spans.js, `twin`: side by side, their valleys one canyon).
//
//   spiral:  { id, kind, keys: [foot, flank, flank, summit], O (the shared corner, in cubes),
//              sense (+1 / -1: which way round), t0 (the angle, round O, of the face between the
//              first and the last cube), entry / exit: { dir, pos } (the faces the route comes in
//              and leaves by), fe / fx (how far round, 0..2pi from t0, they are), lo / hi (the
//              ramp's foot and top), core (the mountain's level), rc / w (the ramp's inner
//              radius and width, in cells), crossings: [{ fk, pos, level }], seed }
//   hairpin: { id, kind, keys: [a, b, c, d, e, f], spans: [low, high], top (the summit's level),
//              mid (the level of the pad between c and d), turn: { fk, pos }, exit: { dir, pos },
//              sky, seed }
import { mulberry32, hash32, clamp } from '../core/util.js';
import { N, MAX_L, at16 } from '../core/constants.js';
import { key, parse, step, faceKey } from './coords.js';
import { MAX_DEPTH } from '../themes/depth.js';

const AXES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const direction = (a, b) => AXES.findIndex(([x, z]) => a[0] + x === b[0] && a[1] + z === b[1]);
const TAU = Math.PI * 2;
const wrap = a => ((a % TAU) + TAU) % TAU;
const HIGH = 8;   // from this level on a face is highland (socket H), as for the spans
const sockOf = level => level >= HIGH ? 'H' : 'L';

export const AREA_SIZE = { spiral: 4, hairpin: 6 };

// the cells of an area entered at cell a going f, turning towards l (both [dx, dz]), in route order
export function templateCells(kind, a, f, l) {
  const add = (p, v, k = 1) => [p[0] + v[0] * k, p[1] + v[1] * k];
  return kind === 'spiral' ? [a, add(a, l), add(add(a, l), f), add(a, f)]
    : [a, add(a, f), add(a, f, 2), add(add(a, f, 2), l), add(add(a, f), l), add(a, l)];
}

// the world cell (in cells) at the middle of position t along face `dir` of cube cell [X, Z]
const faceAt = ([X, Z], dir, t) => [
  [(X + 1) * N, Z * N + t + 0.5], [X * N, Z * N + t + 0.5], [X * N + t + 0.5, (Z + 1) * N], [X * N + t + 0.5, Z * N]][dir];

// how far round the spiral (0..2pi from the face between its first and last cube) world cell (wx, wz) is
const phiOf = (p, wx, wz) => wrap(p.sense * (Math.atan2(wz - p.O[1] * N, wx - p.O[0] * N) - p.t0));

export const rampLevel = (p, phi) => Math.round(p.lo + (p.hi - p.lo) * clamp((phi - p.fe) / (p.fx - p.fe), 0, 1));

// distance from (x, z) to the segment a-b
function segment(x, z, [ax, az], [bx, bz]) {
  const dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}

// what the spiral makes of world cell (wx, wz): { part: 'core' | 'ramp' | 'ridge' | 'foot', level }
// (the foot: the low ground all round, its level up to the cube)
// learn: world.html#heights (see learn/README.md)
export function spiralAt(p, wx, wz) {
  const r = Math.hypot(wx - p.O[0] * N, wz - p.O[1] * N), phi = phiOf(p, wx, wz);
  if (r < p.rc) return { part: 'core', level: p.core };
  // the ridge from the end of the ramp out to the exit
  if (segment(wx, wz, ...p.ridge) < 1.5) return { part: 'ridge', level: p.hi };
  if (r < p.rc + p.w) return phi > p.fx ? { part: 'core', level: p.core } : { part: 'ramp', level: rampLevel(p, phi) };
  return { part: 'foot', level: null };
}

function spiralPiece(seed, d, theme, spine, at, K, R) {
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1)), cells = spine.slice(at, at + 4);
  const O = [Math.max(...cells.map(c => c[0])), Math.max(...cells.map(c => c[1]))];
  const angle = c => Math.atan2(c[1] + 0.5 - O[1], c[0] + 0.5 - O[0]);
  const turn = wrap(angle(cells[1]) - angle(cells[0])), sense = turn < Math.PI ? 1 : -1;
  const walled = theme.cave || theme.walls, hi = walled ? ri(14, 16) : ri(19, 21);
  const p = { id: `${seed}:${K(cells[0])}:spiral`, kind: 'spiral', keys: cells.map(K), O, sense,
    t0: angle(cells[0]) - sense * Math.PI / 4, lo: 5, hi, core: Math.min(MAX_L, hi + 3), rc: 4.6, w: 3.4,
    // (where they meet the faces: as far along them as in a cube of 16 cells, the angles round the
    // mountain as they were)
    entry: { dir: direction(cells[0], spine[at - 1]), pos: ri(Math.round(at16(4)), N - Math.round(at16(5))) },
    exit: { dir: direction(cells[3], spine[at + 4]), pos: ri(Math.round(at16(4)), N - Math.round(at16(5))) }, seed: hash32(seed ^ d ^ 0x5b1a1) };
  p.fe = phiOf(p, ...faceAt(cells[0], p.entry.dir, p.entry.pos));
  const exit = faceAt(cells[3], p.exit.dir, p.exit.pos), end = p.t0 + sense * (p.fx = phiOf(p, ...exit)), mid = p.rc + p.w / 2;
  p.ridge = [[O[0] * N + Math.cos(end) * mid, O[1] * N + Math.sin(end) * mid], exit];
  // the ramp crosses the faces between the cubes on a pad the width of the ramp, at its level there
  p.crossings = [0, 1, 2].map(i => {
    const dir = direction(cells[i], cells[i + 1]);
    let pos = 3;
    for (let t = 2; t < N - 2; t++) {
      const rs = [t - 1, t, t + 1].map(u => { const [x, z] = faceAt(cells[i], dir, u); return Math.hypot(x - O[0] * N, z - O[1] * N); });
      if (rs.every(r => r >= p.rc && r < p.rc + p.w)) { pos = t; break; }
    }
    return { fk: faceKey(K(cells[i]), dir), pos, level: rampLevel(p, phiOf(p, ...faceAt(cells[i], dir, pos))) };
  });
  return p;
}

// cfg: the theme's spans (for the decks and the sky); free(cell): no room there
function hairpinPiece(seed, d, theme, spine, at, K, R, free) {
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1)), cells = spine.slice(at, at + 6), [a, b, c, dd, e, f] = cells;
  const cfg = theme.spans || {}, top = cfg.deck ?? 22, F = direction(a, b), L = AXES[direction(c, dd)];
  const lo = ri(4, 6), hi = ri(top - 3, top), rise = hi - lo;
  const at1 = lo + Math.round(rise * 0.35), mid = lo + Math.round(rise * 0.45), at2 = lo + Math.round(rise * 0.55);
  // over the sky only where no room lies beside the canyon (it would get a slit of void)
  const beside = [[b[0] - L[0], b[1] - L[1]], [e[0] + L[0], e[1] + L[1]]];
  // no river along the canyon floor: the low bridge starts too low for its banks (spans.js riverFits)
  const sky = R() < (cfg.sky || 0) && beside.every(free), river = -1;
  const span = (line, dir, levels, i) => ({ id: `${seed}:${K(line[0])}:span`, keys: line.map(K), dir, n: 1, island: false,
    twin: true, pos: ri(4, N - 5), seed: hash32(seed ^ (0x7a110 + i) ^ d), levels, river, sky });
  const spans = [span([a, b, c], F, [lo, at1], 0), span([dd, e, f], F ^ 1, [at2, hi], 1)];
  return { id: `${seed}:${K(a)}:hairpin`, kind: 'hairpin', keys: cells.map(K), spans, top: hi, mid, sky, beside: sky ? beside : [],
    turn: { fk: faceKey(K(c), direction(c, dd)), pos: ri(4, N - 5) }, exit: { dir: direction(f, spine[at + 6]), pos: ri(4, N - 5) },
    seed: hash32(seed ^ d ^ 0x4a19) };
}

// the area of kind `kind` whose cells start at spine[at] (layout.js routed it there)
export function planArea(seed, d, theme, kind, spine, at, K, free) {
  const R = mulberry32(hash32(seed ^ Math.imul(d + 1, 0x2b7e151) ^ 0xa2ea));
  return kind === 'spiral' ? spiralPiece(seed, d, theme, spine, at, K, R) : hairpinPiece(seed, d, theme, spine, at, K, R, free);
}

// the layout's lookup tables for its area: cube -> { piece, i }, inner face -> piece
export function indexAreas(layout, pieces) {
  layout.areas = pieces;
  layout.areaCells = new Map();
  layout.areaFaces = new Map();
  for (const piece of pieces) {
    piece.keys.forEach((k, i) => layout.areaCells.set(k, { piece, i }));
    for (const k of piece.keys) for (const d of [0, 2]) if (piece.keys.includes(step(k, d))) layout.areaFaces.set(faceKey(k, d), piece);
  }
  return layout;
}

const layoutOf = (world, k) => { const d = -parse(k)[1]; return d >= 0 && d <= MAX_DEPTH ? world.layout(d) : null; };
export const areaOf = (world, k) => layoutOf(world, k)?.areaCells?.get(k) || null;

// the faces between an area's own cubes (never walled)
export const innerFaces = piece => piece.keys.flatMap(k => [0, 2].filter(d => piece.keys.includes(step(k, d))).map(d => faceKey(k, d)));
export const isInnerFace = (world, fk) => !!layoutOf(world, fk.split('/')[0])?.areaFaces?.get(fk);
// does an inner face end at corner vertex (vx, vz) (in cubes) of depth -Y? (no face is walled there:
// the corner cells of all four cubes must agree)
export function innerCorner(world, vx, Y, vz) {
  const L = world.layout(-Y);
  if (!L.areaFaces?.size) return false;
  return [faceKey(key(vx - 1, Y, vz - 1), 0), faceKey(key(vx - 1, Y, vz), 0), faceKey(key(vx - 1, Y, vz - 1), 2), faceKey(key(vx, Y, vz - 1), 2)]
    .some(fk => L.areaFaces.has(fk));
}

// the socket an area gives the faces of its own cubes (the WFC pins them, with one layer); the
// hairpin's gorges are pinned as spans (spans.js spanPins)
export function areaPins(layout) {
  const pins = new Map();
  for (const piece of layout.areas || []) {
    const sock = (k, d) => {
      const fk = faceKey(k, d);
      if (piece.kind === 'spiral') return piece.exit.dir === d && k === piece.keys[3] ? sockOf(piece.hi) : 'L';
      const [a, , c, dd, , f] = piece.keys, [low, high] = piece.spans;
      if (k === f || step(k, d) === f) return sockOf(piece.top);
      if (fk === piece.turn.fk) return sockOf(piece.mid);
      if (k === a && d === low.dir) return sockOf(low.levels[0]);
      if (k === c && d === (low.dir ^ 1)) return sockOf(low.levels[1]);
      if (k === dd && d === high.dir) return sockOf(high.levels[0]);
      return 'L';
    };
    for (const k of piece.keys) {
      if (layout.spanCells?.has(k)) continue;
      pins.set(k, [0, 1, 2, 3].map(d => sock(k, d)));
    }
  }
  return pins;
}

// where the area puts the portal of side face fk (its pad), or null
export function areaPad(world, fk) {
  const [k, ds] = fk.split('/'), d = +ds, other = step(k, d);
  const area = areaOf(world, k) || areaOf(world, other);
  if (!area) return null;
  const p = area.piece;
  if (p.kind === 'spiral') {
    const cross = p.crossings.find(c => c.fk === fk);
    if (cross) return { pos: cross.pos };
    for (const [w, cube] of [[p.entry, p.keys[0]], [p.exit, p.keys[3]]]) if (faceKey(cube, w.dir) === fk) return { pos: w.pos };
    return null;
  }
  if (p.turn.fk === fk) return { pos: p.turn.pos };
  if (faceKey(p.keys[5], p.exit.dir) === fk) return { pos: p.exit.pos };
  return null;
}

// what an area makes of the profile `out` of side face fk (d 0 or 2); returns whether it did anything
export function areaProfile(world, fk, out) {
  const [k, ds] = fk.split('/'), d = +ds, other = step(k, d), [X, , Z] = parse(k);
  const area = areaOf(world, k) || areaOf(world, other);
  if (!area) return false;
  const p = area.piece, at = t => faceAt([X, Z], d, t);
  const pad = (pos, level) => {
    for (const t of [pos - 2, pos + 2]) out[t] = Math.max(out[t], level - 1);
    for (const t of [pos - 3, pos + 3]) if (t > 0 && t < N - 1) out[t] = Math.min(out[t], level - 4);
    for (let t = pos - 1; t <= pos + 1; t++) out[t] = level;
  };
  if (p.kind === 'spiral') {
    if (isInnerFace(world, fk)) {
      // the mountain, the ramp (a wall where the spiral starts and ends), the low ground round it
      const closing = !p.crossings.some(c => c.fk === fk);
      for (let t = 1; t < N - 1; t++) {
        const s = spiralAt(p, ...at(t));
        if (s.part === 'foot') out[t] = Math.min(out[t], p.lo + 1);
        else out[t] = closing && s.part === 'ramp' ? p.core : s.level;
      }
      return true;
    }
    // the exit: a headland where the ridge ends, the rest as low as the foot
    if (faceKey(p.keys[3], p.exit.dir) === fk) { for (let t = 1; t < N - 1; t++) out[t] = Math.min(out[t], p.lo + 1); pad(p.exit.pos, p.hi); return true; }
    return false;
  }
  // the hairpin: the summit high all round, a pad between the two rooms at the turn
  const f = p.keys[5];
  if (k === f || other === f) { for (let t = 1; t < N - 1; t++) out[t] = p.top; return true; }
  if (fk === p.turn.fk) { pad(p.turn.pos, p.mid); return true; }
  return false;
}

// the level at corner vertex (vx, vz) (in cubes) of depth -Y, or null: the spiral's mountain at its
// middle, the hairpin's summit at its corners
export function areaVertex(world, vx, Y, vz) {
  const L = world.layout(-Y);
  for (const p of L.areas || []) {
    if (p.kind === 'spiral' && p.O[0] === vx && p.O[1] === vz) return p.core;
    if (p.kind === 'hairpin') {
      const [X, , Z] = parse(p.keys[5]);
      if ((vx === X || vx === X + 1) && (vz === Z || vz === Z + 1)) return p.top;
    }
  }
  return null;
}

// the roles of an area's cubes (its archetypes, cubegen/areas.js)
const ROLES = { spiral: ['spiral', 'spiral', 'spiral', 'spiral'], hairpin: ['foot', 'gorge', 'turn', 'turn', 'gorge', 'summit'] };

// what the generator needs to know about cube k's part in an area, or null:
//   { id, kind, role, i, keys, piece }
export function areaSpec(world, k) {
  const a = areaOf(world, k);
  if (!a) return null;
  const { piece, i } = a;
  return { id: piece.id, kind: piece.kind, role: ROLES[piece.kind][i], i, keys: piece.keys, piece };
}
