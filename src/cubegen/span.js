// The cubes of a gorge span (world/spans.js): the valley under the bridge and the island at the
// end of one. A gorge cube is the valley's cross-section all the way through: a ledge along the
// room it starts from (a headland where the bridge leaves high up), a sheer drop to the valley
// floor and the river (or the void, over the sky), and the far side's bank, a pinnacle or the
// island's foot. Its bridge is
// laid down whole, pad to pad (spanBridge), instead of being found by the route search, whose
// bridges are short and nearly level. An island is a plateau standing in the valley.
import { N, LH, MAX_L, SHEAD, DIRS, at16 } from '../core/constants.js';
import { idx, clamp } from '../core/util.js';
import { valleyFloor } from '../world/spans.js';
import { VOID } from '../world/profile.js';
import { edgeCell } from './portals.js';
import { BRIDGE_STYLES } from '../themes/builds.js';


// cell (x, z) in span terms: u along the span (0 at the face towards end0), w across it
const along = (dir, x, z) => [[x, z], [N - 1 - x, z], [z, x], [N - 1 - z, x]][dir];

// learn: world.html#bridges (see learn/README.md)
export function shapeGorge(ctx) {
  const { spec } = ctx, s = spec.span, back = s.dir ^ 1;
  const P0 = spec.faces[back].profile, P1 = spec.faces[s.dir].profile;
  const k = N - 4, sag = BRIDGE_STYLES[s.style].sag(k, true) / LH;   // the generator keeps the ground clear of the sag
  // the deck's level over cell u (its run covers u = 2 .. N - 3)
  const deck = u => { const T = (u - 1.5) / k; return s.hi + (s.lo - s.hi) * T - sag * Math.sin(Math.PI * clamp(T, 0, 1)); };
  for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) {
    const [u, w] = along(s.dir, x, z), i = idx(x, z);
    let v = valleyFloor(s, spec.noise, spec.X * N + x + 0.5, spec.Z * N + z + 0.5, spec.Y);
    if (u <= 1) v = P0[w];                                   // the ledge, headland or pinnacle
    else if (u >= N - 2) v = P1[w];
    // a low bank comes up to its room, so the valley floor is never a pit without a way out
    else if (u === 2 && s.room0 && P0[w] < 8 && !s.sky) v = Math.max(v, P0[w] - 2);
    else if (u === N - 3 && s.room1 && P1[w] < 8 && !s.sky) v = Math.max(v, P1[w] - 2);
    // under the deck: room to walk beneath it
    if (v !== VOID && w >= s.pos - (s.width === 3 ? 1 : 0) && w <= s.pos + (s.width > 1 ? 1 : 0) && u >= 2 && u <= N - 3) v = Math.min(v, Math.floor(deck(u) - 1 - SHEAD));
    put(ctx, i, v, (u < N / 2 ? P0 : P1)[s.pos] - 4);
  }
  ctx.stats.mode = spec.kind + (s.sky ? ' / sky gorge' : ' / gorge');
}

export function shapeIsland(ctx) {
  const { spec, noise } = ctx, s = spec.span, back = s.dir ^ 1, P = spec.faces[back].profile;
  const cw = clamp(s.pos, 5, N - 6), rw = at16(4.6 + ctx.R() * 0.8), ru = at16(5.2 + ctx.R() * 0.6);
  for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) {
    const [u, w] = along(s.dir, x, z), i = idx(x, z);
    const du = Math.abs(u + 0.5 - at16(7.2)) / ru, dw = Math.abs(w + 0.5 - cw - 0.5) / rw;
    const on = du ** 4 + dw ** 4 + (noise(x * 0.6 + 7, z * 0.6 + 3) - 0.5) * 0.7 < 1 || (u <= 2 && Math.abs(w - s.pos) <= 1);
    put(ctx, i, u <= 1 && !on ? P[w] : on ? s.level : valleyFloor(s, spec.noise, spec.X * N + x + 0.5, spec.Z * N + z + 0.5, spec.Y), s.level - 4);
  }
  ctx.stats.mode = spec.kind + (s.sky ? ' / sky island' : ' / island');
}

// ground at level v in cell i, or the void (sky spans); a void cell keeps a level in case the
// ground around a pad is made solid again (portals.js): a step below the pad
function put(ctx, i, v, under) {
  ctx.void0[i] = v === VOID ? 1 : 0;
  ctx.lvl0[i] = clamp(v === VOID ? under : v, v === VOID ? 2 : 0, MAX_L);
}

// the gorge's bridge as a move from pad to pad (both ways), for the route search to take
// learn: world.html#bridges (see learn/README.md)
export function spanBridge(ctx) {
  const s = ctx.spec.span;
  if (s?.role !== 'gorge') return;
  const back = s.dir ^ 1, pad = (d, j) => ctx.cols[edgeCell(d, s.pos, j)].find(f => f.prot);
  const a = pad(back, 1), b = pad(s.dir, 1);
  if (!a || !b) return;
  const cells = [];
  for (let j = 2; j <= N - 3; j++) cells.push(edgeCell(back, s.pos, j));
  const [dx, dz] = DIRS[s.dir];
  // the ground right under the deck is kept low, but a river's bank may come up to hold the
  // water: under a low deck that leaves no head room, so no way leads onto or off it (the way
  // goes round it; placeStructures' test, cell by cell along the deck)
  const offsets = s.width === 3 ? [-1, 0, 1] : s.width === 2 ? [0, 1] : [0];
  const lanes = offsets.map(o => cells.map(c => c + (s.dir < 2 ? o * N : o)));
  const k = cells.length, under = new Map(lanes.flatMap(lane => lane.map((c, j) => {
    const y0 = a.top + (b.top - a.top) * j / k, y1 = a.top + (b.top - a.top) * (j + 1) / k;
    return [c, [Math.min(y0, y1) - 1, Math.max(y0, y1)]];
  })));
  const cramped = g => { const u = under.get(g.c); return !!u && g.top > u[0] - SHEAD && g.top <= u[1] + 1; };
  const movesFrom = ctx.movesFrom;
  ctx.movesFrom = (f, ...rest) => movesFrom(f, ...rest).filter(m => m.span || !cramped(m.from) && !cramped(m.to));
  ctx.extraMoves = new Map([
    [a.id, [{ kind: 'bridge', from: a, to: b, d: s.dir, dx, dz, cells, lanes, width: s.width, cost: 1, span: true }]],
    [b.id, [{ kind: 'bridge', from: b, to: a, d: back, dx: -dx, dz: -dz, cells: [...cells].reverse(), lanes: lanes.map(lane => [...lane].reverse()), width: s.width, cost: 1, span: true }]],
  ]);
}
