// Gorge spans: rooms joined by one long bridge over a valley (themes with `spans`). The layout
// plans them from the seed alone: a straight line of cubes, a room at one end, one or two gorge
// cubes in the middle and, at the other end, the next room on the route or a lonely island (a
// branch reached by nothing but the bridge). Every crossing face along the line has a deck
// level, so a span can stay level high over the valley or come down from the top of a headland
// to the valley's far bank. The faces follow it (profile.js, faces.js): the gorge cubes' side
// faces carry the valley's cross-section, so the valley runs on into the rock beside it, and
// between two gorge cubes the bridge rests on a rock pinnacle. cubegen/span.js builds the cubes.
//
// A span may cross bottomless sky instead (`sky`, over the sky islands, the abyss): the valley is
// void, the pinnacle rises out of nothing and the island floats. Only where no other room borders
// the gorge, which would get a slit of void along its edge. Under a cave's rock walls the decks
// stay lower (`deck`, the highest deck level).
//
//   span: { id, keys: [end0, ...gorge, end1], dir (end0 -> end1), n (gorge cubes), pos (along
//           every crossing face), levels (deck level at crossing face j, between keys[j] and
//           keys[j + 1]), island (end1 is an island), sky, river (gorge cube with the river,
//           or -1), seed }
import { mulberry32, hash32 } from '../core/util.js';
import { N } from '../core/constants.js';
import { key, parse, step, faceKey } from './coords.js';
import { MAX_DEPTH } from '../themes/depth.js';
import { pickBridge } from '../themes/builds.js';

const AXES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const id = c => c.join(',');
const cheb = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
const direction = (a, b) => AXES.findIndex(([x, z]) => a[0] + x === b[0] && a[1] + z === b[1]);

// below this a crossing is on low ground (socket L), from here on a highland (H)
const HIGH = 8;

// the spans of depth d. cfg: its theme's `spans` (themes/index.js), or null. spine: the route's
// cells ([x, z]), K: cell -> cube key, blocked(key):
// cubes that may not be part of a span (guardians, the horde room), free(cell): an empty cell
// an island branch may take, budget: how many rooms an island branch may add, taken: spans the
// depth has already (a hairpin's twins, world/areas.js, count as one). Returns the
// spans, the cells they claim and `apart`: cubes no other room may border (a sky gorge, an
// island and its gorge).
// learn: world.html#bridges (see learn/README.md)
export function planSpans(seed, d, cfg, spine, K, blocked, free, budget, taken = 0) {
  const spans = [], cells = new Map(), lonely = new Set();
  if (!cfg || d === 0 || d >= MAX_DEPTH) return { spans, cells, apart: lonely };
  const R = mulberry32(hash32(seed ^ Math.imul(d + 1, 0x5ba9e7)));
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1)), top = cfg.deck ?? 22;
  if (R() >= cfg.chance) return { spans, cells, apart: lonely };
  const gorges = [];   // gorge cells of earlier spans: the next keeps two cubes away
  const apart = list => list.every(c => gorges.every(g => cheb(c, g) >= 2));
  // nothing but the span itself next to these cells
  const alone = (line, out) => out.flatMap(o => AXES.map(([x, z]) => [o[0] + x, o[1] + z]))
    .filter(o => !line.some(l => id(l) === id(o))).every(free);
  const add = (line, island) => {
    const n = line.length - 2, dir = direction(line[0], line[1]);
    const sky = R() < (cfg.sky || 0) && alone(line, line.slice(1, island ? undefined : -1));
    const span = { id: `${seed}:${K(line[0])}:span`, keys: line.map(K), dir, n, island, pos: ri(4, N - 5), seed: hash32(seed ^ spans.length * 0x9e37 ^ d) };
    let a, b;   // deck levels at the two ends
    if (island) {
      // the island stands on a plateau in the valley (low enough for a reward site on it)
      const r = R();
      if (r < 0.35) { b = ri(9, 12); a = b; }                 // level: high over the valley
      else if (r < 0.75) { b = ri(9, 12); a = ri(4, 6); }     // up from the valley's edge to the island
      else { a = ri(top - 7, top - 3); b = ri(5, 7); }        // down from a headland to an islet
    } else if (R() < 0.4) {
      a = b = ri(10, Math.min(15, top));                      // level, from headland to headland
    } else {
      const hi = n > 1 ? ri(top - 4, top) : ri(top - 8, top - 2), lo = ri(4, 6);   // from the top tier down to the ground
      [a, b] = R() < 0.5 ? [hi, lo] : [lo, hi];
    }
    span.width = spanWidth(span);
    span.levels = Array.from({ length: n + 1 }, (_, j) => Math.round(a + (b - a) * j / n));
    // a river runs under the bridge only where the deck is high enough for its banks below it
    span.river = R() < 0.8 && !sky ? ri(0, n - 1) : -1;
    if (span.river >= 0 && !riverFits(span, span.river)) span.river = [...Array(n).keys()].find(i => riverFits(span, i)) ?? -1;
    span.sky = sky;
    spans.push(span);
    if (sky || island) for (const c of line.slice(1, island ? undefined : -1)) lonely.add(K(c));
    line.slice(1, -1).forEach((c, i) => { cells.set(K(c), { span, i, role: 'gorge' }); gorges.push(c); });
    if (island) { cells.set(K(line.at(-1)), { span, i: n, role: 'island' }); gorges.push(line.at(-1)); }
  };

  // on the route: a straight run of the spine with one or two gorge cubes in the middle
  const runs = [];
  for (let i = 1; i < spine.length - 2; i++) for (const n of [2, 1]) {
    const line = spine.slice(i - 1, i + n + 1);
    if (line.length !== n + 2 || i + n >= spine.length) continue;
    const dir = direction(line[0], line[1]);
    if (!line.every((c, j) => !j || direction(line[j - 1], c) === dir)) continue;
    if (line.some(c => blocked(K(c)))) continue;
    runs.push({ line, score: n + R() * 1.5 });
  }
  runs.sort((a, b) => b.score - a.score);
  for (const { line } of runs) {
    if (spans.length + taken >= cfg.max) break;
    const inner = line.slice(1, -1);
    if (!apart(line) || spans.some(s => s.keys.some(k => inner.some(c => K(c) === k)))) continue;
    if (R() < cfg.route) add(line, false);
  }

  // a lonely island: off the route, straight out from a route room, its only way in the bridge
  if (spans.length + taken < cfg.max && R() < cfg.island) {
    const options = [];
    for (const c of spine.slice(2, -1)) {
      if (blocked(K(c)) || cells.has(K(c))) continue;
      for (const [dx, dz] of AXES) for (const n of [2, 1]) {
        if (n + 1 > budget) continue;
        const line = Array.from({ length: n + 2 }, (_, j) => [c[0] + dx * j, c[1] + dz * j]), out = line.slice(1);
        // nothing else next to the gorge or the island: it stays apart from every other room
        if (out.every(free) && alone(line, out) && apart(line)) options.push({ line, score: n + R() });
      }
    }
    options.sort((a, b) => b.score - a.score);
    if (options.length) add(options[0].line, true);
  }
  return { spans, cells, apart: lonely };
}

// Width is a separate seed decision: adding lanes never changes the span's route or heights.
// Islands stay narrow; three lanes are rare, reserved for long route crossings.
export function spanWidth(span) {
  const r = hash32(span.seed ^ 0x519e) / 0x100000000;
  return span.island ? (r < .8 ? 1 : 2) : r < .5 ? 1 : r < .9 || span.n < 2 ? 2 : 3;
}

// may gorge cube i of a span carry the river? (its banks come up a level over the water, and the
// deck keeps a head's height over them)
export const riverFits = (span, i) => Math.min(span.levels[i], span.levels[i + 1]) >= 8;

// the socket a span gives a face of one of its cubes, or null (the WFC pins span cubes)
export function spanSocket(span, i, d) {
  const back = (span.dir ^ 1);
  if (d === span.dir) return span.levels[i + 1] >= HIGH ? 'H' : 'L';
  if (d === back) return span.levels[i] >= HIGH ? 'H' : 'L';
  return span.river === i ? 'W' : 'L';
}

// the WFC tiles of a depth's span cubes: gorge cubes and islands have one layer only
export function spanPins(layout) {
  const pins = new Map();
  for (const [k, { span, i, role }] of layout.spanCells || []) {
    pins.set(k, [0, 1, 2, 3].map(d => role === 'island' ? (d === (span.dir ^ 1) ? spanSocket(span, i - 1, span.dir) : 'L') : spanSocket(span, i, d)));
  }
  return pins;
}

// the valley floor at world cell (wx, wz): just over the river's surface, or the void (-1,
// profile.js VOID) under a sky span
export const valleyFloor = (span, noise, wx, wz, Y) => span.sky ? -1 : 2 + (noise(wx * 0.23 + 900, wz * 0.23 + Y * 17) > 0.62 ? 1 : 0);

// what a span makes of side face fk (stored under the cube on its low side, d 0 or 2), or null:
//   { kind: 'cross', span, j }   a crossing face (the deck passes over it at levels[j])
//   { kind: 'side', span, i, g }  a side face of gorge cube i (g its key)
//   { kind: 'island', span }      a face of the island other than its crossing
export function spanFace(world, fk) {
  const [k, ds] = fk.split('/'), d = +ds, d6 = -parse(k)[1];
  if (d6 < 0 || d6 > MAX_DEPTH) return null;
  const L = world.layout(d6);
  if (!L.spans?.length) return null;
  const cross = L.spanFaces.get(fk);
  if (cross) return { kind: 'cross', ...cross };
  for (const c of [k, step(k, d)]) {
    const s = L.spanCells.get(c);
    if (!s) continue;
    if (s.role === 'island') return { kind: 'island', span: s.span };
    if ((d >> 1) !== (s.span.dir >> 1)) return { kind: 'side', span: s.span, i: s.i, g: c };
  }
  return null;
}

// along-span coordinate of world cell column (wx, wz) inside gorge cube i: 0 at the face
// towards end0, N - 1 at the face towards end1
export function spanU(span, i, wx, wz) {
  const [X, , Z] = parse(span.keys[i + 1]), lx = Math.floor(wx) - X * N, lz = Math.floor(wz) - Z * N;
  return [lx, N - 1 - lx, lz, N - 1 - lz][span.dir];
}

// a span's corner at world vertex (vx, vz) (in cubes): { span, natural }, or null. Corners on a
// natural end (the crossing into a room) keep their usual level; every other corner of a gorge
// cube or the island lies in the valley.
export function spanVertex(world, vx, Y, vz) {
  const L = world.layout(-Y);
  if (!L.spans?.length) return null;
  const around = [key(vx - 1, Y, vz - 1), key(vx, Y, vz - 1), key(vx - 1, Y, vz), key(vx, Y, vz)];
  let span = null;
  for (const c of around) { const s = L.spanCells.get(c); if (s) span = s.span; }
  if (!span) return null;
  // the vertex lies on crossing face j if it is a corner of that face
  const [x0, , z0] = parse(span.keys[0]), along = span.dir < 2 ? vx : vz, a0 = span.dir < 2 ? x0 : z0;
  const face = span.dir % 2 ? a0 - along : along - a0 - 1;   // index of the crossing plane (end0's face is 0)
  return { span, natural: face === 0 || face === span.n && !span.island };
}

// the layout's lookup tables for its spans
export function indexSpans(layout, spans, cells) {
  layout.spans = spans;
  layout.spanCells = cells;
  layout.spanFaces = new Map();
  for (const span of spans) for (let j = 0; j <= span.n; j++)
    layout.spanFaces.set(faceKey(span.keys[j], span.dir), { span, j });
  return layout;
}

// how a span's bridge is built: one of the theme's bridge styles that fits (themes/builds.js:
// no stone arches over the sky, their piers would stand on nothing; natural arches only where
// the deck is level), the same in all its cubes
export const spanStyle = (span, weights) => pickBridge(weights,
  { span: true, width: span.width ?? 1, sky: span.sky, level: span.levels.every(v => v === span.levels[0]) }, mulberry32(span.seed)());

// what the generator needs to know about cube k's part in a span (cubegen/span.js), or null
//   gorge:  { role, i, n, dir, pos, hi, lo, sky, room0, room1, style } (hi / lo: the deck's level
//           at the face towards end0 / end1; room0 / room1: that face leads into a room)
//   island: { role, dir, pos, level, sky }
export function spanSpec(layout, k, weights) {
  const s = layout.spanCells?.get(k);
  if (!s) return null;
  const { span, i, role } = s;
  if (role === 'island') return { role, dir: span.dir, pos: span.pos, width: span.width ?? 1, level: span.levels[span.n], sky: span.sky };
  return { role, i, n: span.n, dir: span.dir, pos: span.pos, width: span.width ?? 1, hi: span.levels[i], lo: span.levels[i + 1], sky: span.sky,
    room0: i === 0, room1: i === span.n - 1 && !span.island, style: spanStyle(span, weights) };
}
