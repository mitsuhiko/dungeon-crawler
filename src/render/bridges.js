// Bridge styles (picked per theme in themes/builds.js): stone arches, sagging plank bridges,
// rope bridges (spaced slats hanging between two posts, rope hand lines), iron bridges (a flat
// girder deck with railings and bracing), log bridges, chain bridges (a plank deck hung from
// chains between iron towers), ice bridges, natural rock arches and rope bridges hung with
// prayer flags.
import { LH, N } from '../core/constants.js';
import { clamp, hash32, mulberry32 } from '../core/util.js';
import { BRIDGE_STYLES } from '../themes/builds.js';
import { STONE, STONE2, CHEEK, CAP, PIER, WOOD, WOOD2, BEAM, POST, ROPE, IRON, IRON2, BARK, BARK2, ICE, ICE2, ICE3, FLAGS,
  gradient, TOP_STOPS, SIDE_STOPS, LIP, UNDERSIDE } from './palette.js';
import { runFrame, slab, tube, spike } from './runframe.js';
import { pillarBox } from './stairs.js';

// the same little variations (bark, icicles, rocks) every time a bridge is drawn
const rngOf = r => mulberry32(hash32(r.cells[0] * 7919 + r.d * 131 + r.k * 17 + 1));

// stone deck with parapets, carried by round arches that spring from the banks / piers
export function buildStoneBridge(r, L) {
  const S = L.stone, F = runFrame(r), k = r.k, segs = k * 4;
  for (let i = 0; i < segs; i++) {
    const s0 = i * k / segs, s1 = (i + 1) * k / segs, ya = F.Y(s0), yb = F.Y(s1);
    slab(S, F, s0, s1, -0.5, 0.5, ya - 0.25, ya, yb - 0.25, yb, (i >> 1) & 1 ? STONE : STONE2, CHEEK);
    for (const [w0, w1] of [[-0.5, -0.4], [0.4, 0.5]]) slab(S, F, s0, s1, w0, w1, ya, ya + 0.3, yb, yb + 0.3, CAP, CHEEK);
  }
  const bounds = [0, ...(r.splits || []), k];
  for (let a = 0; a + 1 < bounds.length; a++) {
    const s0 = bounds[a], s1 = bounds[a + 1], span = s1 - s0;
    let deckMin = Infinity;
    for (let i = 0; i <= 8; i++) deckMin = Math.min(deckMin, F.Y(s0 + span * i / 8) - 0.25);
    const H = Math.min(span * 0.5, 1.1), spring = deckMin - H - 0.12;
    const under = t => spring + H * Math.sqrt(Math.max(0, 1 - (2 * (t - s0) / span - 1) ** 2));
    const steps = Math.max(8, Math.round(span * 10));
    for (let i = 0; i < steps; i++) {
      const sa = s0 + span * i / steps, sb = s0 + span * (i + 1) / steps;
      slab(S, F, sa, sb, -0.45, 0.45, under(sa), F.Y(sa) - 0.25, under(sb), F.Y(sb) - 0.25, CHEEK, CHEEK);
    }
  }
  for (const q of r.pillars || []) pillarBox(S, q, PIER);
}

// planks across the whole run, half wide
function plankDeck(W, F, k, half) {
  const planks = Math.round(k / 0.2);
  for (let i = 0; i < planks; i++) {
    const sc = (i + 0.5) * k / planks, sa = sc - 0.088, sb = sc + 0.088;
    slab(W, F, sa, sb, -half, half, F.Y(sa) - 0.07, F.Y(sa), F.Y(sb) - 0.07, F.Y(sb), i & 1 ? WOOD : WOOD2, BEAM);
  }
}

// plank bridge: sagging deck, stringers, posts with rope rails, timber legs
export function buildPlankBridge(r, L) {
  const W = L.wood, F = runFrame(r), k = r.k;
  plankDeck(W, F, k, 0.46);
  const segs = k * 4;
  for (let i = 0; i < segs; i++) {
    const s0 = i * k / segs, s1 = (i + 1) * k / segs;
    for (const [w0, w1] of [[-0.42, -0.32], [0.32, 0.42]])
      slab(W, F, s0, s1, w0, w1, F.Y(s0) - 0.2, F.Y(s0) - 0.07, F.Y(s1) - 0.2, F.Y(s1) - 0.07, BEAM, BEAM);
  }
  for (const side of [-0.47, 0.47]) {
    let last = null;
    for (let s = 0; s <= k + 1e-6; s += 0.5) {
      const [px, py, pz] = F.P(s, side, F.Y(s));
      W.box(px - 0.04, py - 0.1, pz - 0.04, px + 0.04, py + 0.56, pz + 0.04, BEAM, BEAM);
      if (last) for (const ry of [0.28, 0.5]) W.beam([last[0], last[1] + ry, last[2]], [px, py + ry, pz], 0.035, 0.035, ROPE);
      last = [px, py, pz];
    }
  }
  for (const q of r.pillars || []) pillarBox(W, q, BEAM);
}

// rope bridge: spaced slats between two posts, rope hand lines
export function buildRopeBridge(r, L) {
  const W = L.wood, F = runFrame(r), k = r.k, slats = Math.round(k / 0.26);
  for (let i = 0; i < slats; i++) {
    const sc = (i + 0.5) * k / slats, sa = sc - 0.09, sb = sc + 0.09, w = 0.4 + (i % 3) * 0.03;
    slab(W, F, sa, sb, -w, w, F.Y(sa) - 0.06, F.Y(sa), F.Y(sb) - 0.06, F.Y(sb), i & 1 ? WOOD : WOOD2, BEAM);
  }
  // a post at each end, rope hand lines and the ropes under the slats
  for (const side of [-0.45, 0.45]) {
    for (const s of [0, k]) {
      const [px, py, pz] = F.P(s, side, F.Y(s));
      W.box(px - 0.05, py - 0.15, pz - 0.05, px + 0.05, py + 0.7, pz + 0.05, BEAM, BEAM);
    }
    let last = null;
    for (let i = 0; i <= k * 4; i++) {
      const s = i / 4, [px, py, pz] = F.P(s, side, F.Y(s));
      if (last) for (const ry of [-0.04, 0.6]) W.beam([last[0], last[1] + ry, last[2]], [px, py + ry, pz], 0.03, 0.03, ROPE);
      last = [px, py, pz];
    }
  }
}

// iron bridge: flat girder deck with railings and bracing
export function buildIronBridge(r, L) {
  const W = L.wood, F = runFrame(r), k = r.k, segs = k * 4;
  for (let i = 0; i < segs; i++) {
    const s0 = i * k / segs, s1 = (i + 1) * k / segs, ya = F.Y(s0), yb = F.Y(s1);
    slab(W, F, s0, s1, -0.48, 0.48, ya - 0.08, ya, yb - 0.08, yb, i & 1 ? IRON : IRON2, IRON2);   // deck plates
    for (const [w0, w1] of [[-0.48, -0.4], [0.4, 0.48]]) slab(W, F, s0, s1, w0, w1, ya - 0.32, ya - 0.08, yb - 0.32, yb - 0.08, IRON2, IRON2);   // girders
  }
  for (const side of [-0.45, 0.45]) {
    let last = null;
    for (let s = 0; s <= k + 1e-6; s += 0.5) {
      const [px, py, pz] = F.P(s, side, F.Y(s));
      W.box(px - 0.03, py, pz - 0.03, px + 0.03, py + 0.55, pz + 0.03, IRON, IRON);
      if (last) {
        W.beam([last[0], last[1] + 0.55, last[2]], [px, py + 0.55, pz], 0.04, 0.04, IRON);
        W.beam([last[0], last[1] + 0.05, last[2]], [px, py + 0.5, pz], 0.025, 0.025, IRON2);   // bracing
      }
      last = [px, py, pz];
    }
  }
  for (const q of r.pillars || []) pillarBox(W, q, IRON2);
}

// log bridge: three logs side by side reaching onto both banks, lashed at the ends, a stub of a
// branch here and there, a rope hand line on one side
export function buildLogBridge(r, L) {
  const W = L.wood, F = runFrame(r), k = r.k, R = rngOf(r), over = 0.16;
  const steps = Math.max(2, Math.ceil((k + 2 * over) / 0.4));
  for (let i = 0; i < 3; i++) {
    const w = (i - 1) * 0.3 + (R() - 0.5) * 0.03, rad = 0.14 + R() * 0.025, drop = i === 1 ? 0.005 : 0.02 + R() * 0.015;
    const pts = [];
    for (let j = 0; j <= steps; j++) {
      const s = -over - R() * 0.06 * (j === 0) + (k + 2 * over) * j / steps + R() * 0.06 * (j === steps);
      pts.push(F.P(s, w, F.Y(clamp(s, 0, k)) - rad - drop));
    }
    const bark = [BARK, BARK2, BARK.clone().multiplyScalar(1.12)], turn = Math.floor(R() * 3);
    tube(W, pts, rad, (_, j) => bark[(j + turn) % 3], { sides: 7, cap: WOOD2 });
    // a stub or two of a branch on the outer logs
    if (i !== 1) for (let n = R() < 0.6 ? 1 + (R() < 0.4) : 0; n > 0; n--) {
      const s = 0.3 + R() * Math.max(0.1, k - 0.6), out = Math.sign(w), y = F.Y(s) - rad - drop;
      W.beam(F.P(s, w + out * rad * 0.7, y), F.P(s + (R() - 0.5) * 0.1, w + out * (rad + 0.12), y + 0.05 + R() * 0.05), 0.045, 0.045, BARK2);
    }
  }
  for (const s of [0.1, k - 0.1]) W.beam(F.P(s, -0.46, F.Y(s) - 0.01), F.P(s, 0.46, F.Y(s) - 0.01), 0.035, 0.035, ROPE);   // lashings
  if (k < 2) return;
  const side = R() < 0.5 ? -0.48 : 0.48;
  let last = null;
  for (const s of [0, k]) {
    const [px, py, pz] = F.P(s, side, F.Y(s));
    W.box(px - 0.035, py - 0.15, pz - 0.035, px + 0.035, py + 0.62, pz + 0.035, BEAM, BEAM);
  }
  for (let j = 0; j <= k * 4; j++) {
    const s = j / 4, T = s / k, y = F.Y(0) + (F.Y(k) - F.Y(0)) * T + 0.55 - 0.08 * Math.sin(Math.PI * T), p = F.P(s, side, y);
    if (last) W.beam(last, p, 0.03, 0.03, ROPE);
    last = p;
  }
}

// chain bridge: a plank deck on iron edge beams, hung by rods from two chains that run from tower
// to tower and dip down to just over the deck in the middle
export function buildChainBridge(r, L) {
  const W = L.wood, F = runFrame(r), k = r.k, H = BRIDGE_STYLES.chain.towers, segs = k * 4;
  plankDeck(W, F, k, 0.44);
  for (let i = 0; i < segs; i++) {
    const s0 = i * k / segs, s1 = (i + 1) * k / segs;
    for (const [w0, w1] of [[-0.47, -0.39], [0.39, 0.47]])
      slab(W, F, s0, s1, w0, w1, F.Y(s0) - 0.17, F.Y(s0) - 0.07, F.Y(s1) - 0.17, F.Y(s1) - 0.07, IRON2, IRON2);
  }
  for (const s of [0, k]) {
    const y = F.Y(s);
    for (const side of [-0.52, 0.52]) {
      const [px, py, pz] = F.P(s, side, y);
      W.box(px - 0.065, py - 0.4, pz - 0.065, px + 0.065, py + H - 0.06, pz + 0.065, IRON, IRON2);
      W.box(px - 0.09, py + H - 0.06, pz - 0.09, px + 0.09, py + H, pz + 0.09, IRON, IRON);
    }
    W.beam(F.P(s, -0.52, y + H - 0.16), F.P(s, 0.52, y + H - 0.16), 0.07, 0.08, IRON2);   // a crossbeam over the top
  }
  // the chains: from the tower tops down to a little over the deck in the middle
  const top0 = F.Y(0) + H - 0.12, top1 = F.Y(k) + H - 0.12, dip = Math.max(0, (top0 + top1) / 2 - F.Y(k / 2) - 0.32);
  const chain = s => { const T = s / k; return Math.max(F.Y(s) + 0.28, top0 + (top1 - top0) * T - dip * 4 * T * (1 - T)); };
  for (const side of [-0.5, 0.5]) {
    const links = Math.ceil(k / 0.11);
    for (let i = 0; i < links; i++) {
      const sa = i * k / links - 0.01, sb = (i + 1) * k / links + 0.01;
      const [w, h] = i & 1 ? [0.022, 0.07] : [0.07, 0.022];
      W.beam(F.P(sa, side, chain(sa)), F.P(sb, side, chain(sb)), w, h, IRON);
    }
    for (let s = 0.5; s < k - 0.25; s += 0.5) {   // hangers down to the edge beams
      const [px, py, pz] = F.P(s, side * 0.86, F.Y(s) - 0.12), top = chain(s);
      W.box(px - 0.014, py, pz - 0.014, px + 0.014, top, pz + 0.014, IRON2, IRON2);
    }
  }
}

// ice bridge: a slab of ice, thicker in places, with shards along its edges and icicles under it
export function buildIceBridge(r, L) {
  const S = L.stone, F = runFrame(r), k = r.k, R = rngOf(r), segs = Math.max(2, Math.round(k * 4));
  const depth = Array.from({ length: segs + 1 }, () => 0.2 + R() * 0.16);
  const under = s => { const t = clamp(s / k * segs, 0, segs), i = Math.min(segs - 1, Math.floor(t)); return F.Y(s) - depth[i] - (depth[i + 1] - depth[i]) * (t - i); };
  for (let i = 0; i < segs; i++) {
    const s0 = i * k / segs, s1 = (i + 1) * k / segs;
    slab(S, F, s0, s1, -0.5, 0.5, F.Y(s0) - depth[i], F.Y(s0), F.Y(s1) - depth[i + 1], F.Y(s1), i % 3 ? ICE : ICE2, ICE2);
    // shards of ice along the edges, leaning out
    for (const side of [-1, 1]) if (R() < 0.45) {
      const sc = s0 + R() * (s1 - s0), [ox, , oz] = F.Lt, lean = 0.25 + R() * 0.3;
      spike(S, F.P(sc, side * (0.44 - R() * 0.04), F.Y(sc) - 0.03), 0.03 + R() * 0.03, 0.1 + R() * 0.18, R() < 0.5 ? ICE : ICE2, [ox * side * lean, 1, oz * side * lean]);
    }
    // icicles, no longer than the room under them
    for (let n = R() < 0.7 ? 1 + (R() < 0.5) : 0; n > 0; n--) {
      const s = s0 + R() * (s1 - s0), w = (R() - 0.5) * 0.8, y = under(s) + 0.02;
      const [px, , pz] = F.P(s, w, y), j = clamp(Math.floor(s), 0, k - 1);
      // The banks can differ across the deck: an icicle must clear its own lane's ground.
      const candidates = (r.lanes || [r.pieces]).map(lane => lane[j]);
      const distance = p => (p.c % N + .5 - px) ** 2 + (Math.floor(p.c / N) + .5 - pz) ** 2;
      const below = candidates.reduce((a, b) => distance(a) < distance(b) ? a : b);
      const room = y - below.ground - 0.15;
      const len = Math.min(0.12 + R() * 0.45, room);
      if (len > 0.06) spike(S, F.P(s, w, y), 0.035 + R() * 0.045, len, R() < 0.5 ? ICE2 : ICE3);
    }
  }
}

// natural rock arch: the ground's own rock (its strata, its grass on top) in one rough arch from
// bank to bank, its feet down on the ground (a river's bed) where that is close, drips of rock under it
export function buildRockArch(r, L) {
  // Each strip's feet follow its own bed. A single centreline bed stretched sideways could
  // leave an outer foot hanging, or bury the arch in the higher bank beside it.
  if (r.lanes?.length > 1) {
    for (const lane of r.lanes) buildRockArch({ ...r, width: 1, lanes: undefined,
      cells: lane.map(p => p.c), pieces: lane }, L);
    return;
  }
  const T = L.terrain, F = runFrame(r), k = r.k, R = rngOf(r), steps = Math.max(8, Math.round(k * 5));
  const bed = p => p.bed ?? p.ground, groundAt = s => {   // between the pieces' grounds (beds under fluids)
    const t = clamp(s - 0.5, 0, k - 1), j = Math.min(k - 2, Math.floor(t));
    if (k === 1) return bed(r.pieces[0]);
    return bed(r.pieces[j]) + (bed(r.pieces[j + 1]) - bed(r.pieces[j])) * (t - j);
  };
  let deckMin = Infinity;
  for (let i = 0; i <= steps; i++) deckMin = Math.min(deckMin, F.Y(i * k / steps));
  const thick = r.span ? 0.6 : 0.38, H = Math.min(k * 0.6, r.span ? 4 : 2.5), spring = deckMin - thick - H;
  const jag = Array.from({ length: steps + 1 }, () => (R() - 0.5) * 0.14);
  const under = i => {
    const s = i * k / steps, e = Math.max(0, 1 - (2 * s / k - 1) ** 2) ** 0.3;   // a wide opening, steep feet
    return Math.min(F.Y(s) - thick + 0.1, Math.max(groundAt(s) - 0.05, spring + H * e + jag[i]));
  };
  const top = gradient(TOP_STOPS, deckMin / LH), lip = 0.12;
  for (let i = 0; i < steps; i++) {
    const s0 = i * k / steps, s1 = (i + 1) * k / steps, y0 = F.Y(s0), y1 = F.Y(s1), b0 = under(i), b1 = under(i + 1);
    const bulge = R() * 0.07;
    slab(T, F, s0, s1, -0.5, 0.5, y0 - lip, y0, y1 - lip, y1, top.clone().multiplyScalar(0.94 + R() * 0.08), LIP);   // the grass on top
    // the rock below in 1 unit strata, as on the cliffs (walls.js)
    const lo = Math.min(b0, b1), hi = Math.max(y0, y1) - lip;
    for (let j = Math.floor(lo); j < hi; j++) {
      const col = gradient(SIDE_STOPS, j / LH).multiplyScalar(j & 1 ? 1 : 0.88);
      const bb0 = Math.max(b0, j), bb1 = Math.max(b1, j), tt0 = Math.min(y0 - lip, j + 1), tt1 = Math.min(y1 - lip, j + 1);
      if (tt0 <= bb0 && tt1 <= bb1) continue;
      slab(T, F, s0, s1, -0.5 - bulge, 0.5 + bulge, Math.min(bb0, tt0), tt0, Math.min(bb1, tt1), tt1, col, col);
    }
    // rough rocks along the edges, drips of rock under the arch
    for (const side of [-1, 1]) if (R() < 0.2) {
      const sc = s0 + R() * (s1 - s0), [ox, , oz] = F.Lt, col = gradient(SIDE_STOPS, F.Y(sc) / LH);
      spike(T, F.P(sc, side * (0.45 - R() * 0.04), F.Y(sc) - 0.04), 0.05 + R() * 0.04, 0.1 + R() * 0.1, col, [ox * side * 0.3, 1, oz * side * 0.3]);
    }
    if (R() < 0.3) {
      const sc = (s0 + s1) / 2, y = Math.min(b0, b1) + 0.03, len = Math.min(0.1 + R() * 0.3, y - groundAt(sc) - 0.2);
      if (len > 0.06) spike(T, F.P(sc, (R() - 0.5) * 0.7, y), 0.05 + R() * 0.05, len, UNDERSIDE);
    }
  }
}

// prayer flag bridge: a rope bridge with tall poles at its ends, strings of flags from pole to
// pole along both sides and across each end. The flags go into their own part (L.flags, when
// there is one) and flutter in the wind: each swings more the further down it hangs.
export function buildFlagsBridge(r, L) {
  buildRopeBridge(r, L);
  const W = L.wood, Fl = L.flags || L.wood, F = runFrame(r), k = r.k, H = BRIDGE_STYLES.flags.towers, R = rngOf(r);
  for (const s of [0, k]) for (const side of [-0.45, 0.45]) {
    const [px, py, pz] = F.P(s, side, F.Y(s));
    W.box(px - 0.03, py + 0.5, pz - 0.03, px + 0.03, py + H, pz + 0.03, POST, POST);
    W.box(px - 0.045, py + H, pz - 0.045, px + 0.045, py + H + 0.05, pz + 0.045, BEAM, BEAM);
  }
  let c = Math.floor(R() * FLAGS.length);
  // a flag hanging from the string at yt (yt0 / yt1 at its two edges), h long, along s or across w
  const flag = (s0, s1, w0, w1, yt0, yt1, h, tilt) => {
    const col = FLAGS[c++ % FLAGS.length], top = Math.max(yt0, yt1);
    if (Fl.uv) Fl.swayAt = y => Math.min(1, Math.max(0, (top - y) / h));
    slab(Fl, F, s0, s1, w0, w1, yt0 - h - tilt, yt0 - 0.01, yt1 - h + tilt, yt1 - 0.01, col, col);
    if (Fl.uv) Fl.swayAt = () => 0;
  };
  // along the sides: the string dips, but stays well over the hand lines
  const top0 = F.Y(0) + H - 0.03, top1 = F.Y(k) + H - 0.03, dip = Math.min(0.3, 0.05 * k);
  const line = s => { const T = s / k; return Math.max(F.Y(s) + 0.95, top0 + (top1 - top0) * T - dip * 4 * T * (1 - T)); };
  for (const side of [-0.45, 0.45]) {
    let last = null;
    for (let j = 0; j <= k * 4; j++) { const s = j / 4, p = F.P(s, side, line(s)); if (last) W.beam(last, p, 0.012, 0.012, ROPE); last = p; }
    const n = Math.max(2, Math.round(k / 0.16));
    for (let i = 0; i < n; i++) {
      const sc = (i + 0.5) * k / n, sa = sc - 0.055, sb = sc + 0.055;
      flag(sa, sb, side - 0.004, side + 0.004, line(sa), line(sb), 0.12 + R() * 0.04, (R() - 0.5) * 0.03);
    }
  }
  // across each end, from pole to pole
  for (const s of [0, k]) {
    const y = F.Y(s) + H - 0.03, across = w => y - 0.08 * (1 - (w / 0.45) ** 2);
    W.beam(F.P(s, -0.45, y), F.P(s, 0, across(0)), 0.012, 0.012, ROPE);
    W.beam(F.P(s, 0, across(0)), F.P(s, 0.45, y), 0.012, 0.012, ROPE);
    for (let i = 0; i < 6; i++) {
      const wc = -0.45 + (i + 0.5) * 0.9 / 6, yt = Math.min(across(wc - 0.05), across(wc + 0.05));
      flag(s - 0.004, s + 0.004, wc - 0.05, wc + 0.05, yt, yt, 0.12 + R() * 0.04, 0);
    }
  }
}

// the builder of each style (themes/builds.js BRIDGE_STYLES)
export const BRIDGES = { stone: buildStoneBridge, plank: buildPlankBridge, rope: buildRopeBridge, iron: buildIronBridge,
  log: buildLogBridge, chain: buildChainBridge, ice: buildIceBridge, rockarch: buildRockArch, flags: buildFlagsBridge };
