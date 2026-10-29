// Smoothing: decide which neighbouring floors blend into a slope (links), then give every
// floor four corner heights averaged over the linked floors around each corner.
import { N, LH, DIRS, OPP, WATER, edgePts } from '../core/constants.js';
import { idx, inb, hash32 } from '../core/util.js';

function makeLinks(ctx) {
  const { R, cols, floors, slopeNoise, headOK, pathWalks } = ctx;
  const setLink = (f, d, g) => { f.link[d] = g; g.link[OPP[d]] = f; };
  // the ground under a gorge's deck is kept low (cubegen/span.js): no slope climbs out of it,
  // or its corners could join a pad's at the deck's height
  const deck = new Set(ctx.runs.filter(r => r.span).flatMap(r => r.pieces.map(p => p.c)));
  // a spiral's railed ramp stands over its foot (cubegen/areas.js): no slope joins them, or it
  // could pull a pad's corner down with it
  const edge = (f, g) => ctx.railed?.has(f.c) && ctx.foot?.has(g.c);
  // the highest surface of the fluids in the cells round floor f's (-Infinity: none). No slope
  // runs from a bank down under the water beside it: a corner of it would sag under the surface
  // (and pinned by a ladder or stair at the lower end, nothing keeps it up)
  const near = new Map(), waterNear = f => {
    if (near.has(f)) return near.get(f);
    let s = -Infinity;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (inb(f.x + dx, f.z + dz))
      for (const w of cols[idx(f.x + dx, f.z + dz)]) if (w.fluid) s = Math.max(s, w.surf);
    near.set(f, s);
    return s;
  };
  const underWater = (f, g) => { const w = Math.max(waterNear(f), waterNear(g)); return Math.min(f.top, g.top) < w && Math.max(f.top, g.top) >= w; };
  for (const f of floors) for (const d of [0, 2]) {
    const nx = f.x + DIRS[d][0], nz = f.z + DIRS[d][1];
    if (!inb(nx, nz)) continue;
    for (const g of cols[idx(nx, nz)]) {
      const dh = Math.abs(g.top - f.top);
      if (dh > 2 || f.covered || g.covered) continue;
      if (f.fluid || g.fluid) { if (f.fluid === g.fluid && f.surf === g.surf) setLink(f, d, g); continue; }
      if (!headOK(g, f.top) || !headOK(f, g.top)) continue;
      if (dh === 0 || f.ramp || g.ramp) { setLink(f, d, g); continue; }
      if (f.prot || g.prot) continue;
      if (deck.has(f.c) && g.top > f.top || deck.has(g.c) && f.top > g.top || edge(f, g) || edge(g, f) || underWater(f, g)) continue;
      // slopes come in patches: the noise decides how smooth a region is
      const s = slopeNoise(f.x * 0.3 + 3, f.z * 0.3 + 3);
      if (R() < (dh === 1 ? 0.3 + 0.7 * s : 0.05 + 0.55 * s)) setLink(f, d, g);
    }
  }
  // the route always walks over slopes, never up cliffs
  for (const m of pathWalks) setLink(m.from, m.d, m.to);
}

const STAIR_SINK = 0.3;   // units; more than half the tallest step (render/stairs.js)

export function smooth(ctx) {
  const { floors, runs } = ctx;
  makeLinks(ctx);

  // structure endpoints: the two corners facing the stair/bridge are pinned to the floor level
  const pins = new Map();
  // A clearing edge is a shared, exactly flat boundary, including its corner vertices.
  ctx.spec.faces.forEach((face, d) => {
    if (!face.clearingBoundary) return;
    for (const f of floors) if (f.layer === 0 && [f.x === N - 1, f.x === 0, f.z === N - 1, f.z === 0][d])
      for (const [X, Z] of edgePts(f.x, f.z, d)) pins.set(f.id + ':' + X + ',' + Z, face.profile[d < 2 ? f.z : f.x] * LH);
  });
  for (const f of floors) if (f.siteAnchor || f.siteAccess || f.siteDressing || f.spot)
    for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) pins.set(f.id + ':' + (f.x + ox) + ',' + (f.z + oz), f.top * LH);
  for (const r of runs) if (r.kind !== 'landing') for (const [f, side] of [[r.from, r.d], [r.to, OPP[r.d]]])
    if (!f.landing) for (const [X, Z] of edgePts(f.x, f.z, side)) pins.set(f.id + ':' + X + ',' + Z, f.top * LH);
  // ladders: the foot and the top edge stay flat, so the ladder meets both exactly
  for (const l of ctx.ladders) for (const [f, side] of [[l.lo, l.d], [l.hi, OPP[l.d]]])
    for (const [X, Z] of edgePts(f.x, f.z, side)) pins.set(f.id + ':' + X + ',' + Z, f.top * LH);

  function computeCorner(f, ox, oz) {
    const X = f.x + ox, Z = f.z + oz;
    const inBlock = g => (g.x === X - 1 || g.x === X) && (g.z === Z - 1 || g.z === Z);
    const group = [f];
    for (let i = 0; i < group.length; i++) for (const g of group[i].link) if (g && inBlock(g) && !group.includes(g)) group.push(g);
    const pinned = group.map(g => pins.get(g.id + ':' + X + ',' + Z)).filter(v => v !== undefined);
    if (pinned.length) return pinned.reduce((a, b) => a + b) / pinned.length;
    let mean = 0;
    for (const g of group) mean += g.top;
    mean = mean / group.length * LH;
    // a little jitter for the low-poly look (identical for every floor sharing the corner)
    if (!group.some(g => g.prot || g.fluid || g.covered || g.site || g.spot))
      mean += ((hash32(X * 7919 + Z * 104729 + Math.round(mean * 8) * 31337) % 1000) / 1000 - 0.5) * 0.08;
    // A bank (a floor at a fluid's level or over it, reaching down beside it) keeps its corners
    // next to the fluid out of it: a slope sagging it under the surface would put the waterline in
    // a cell no fluid is drawn in (render/shore.js shoreIssues). Only a fluid's own cells reach
    // under its surface. And a low bank of water (a level over it, or less: where a swimmer climbs
    // out, cubegen/reach.js) keeps its corners next to it no higher than its level: a slope up
    // from it starts at the water's edge no higher than a swimmer reaches (physics/move.js).
    return Math.max(Math.min(mean, lowBankAt(group, X, Z)), bankAt(group, X, Z));
  }
  function lowBankAt(group, X, Z) {
    let cap = Infinity;
    if (!group[0].fluid) for (const [x, z] of [[X - 1, Z - 1], [X, Z - 1], [X - 1, Z], [X, Z]]) {
      if (!inb(x, z)) continue;
      for (const w of ctx.cols[idx(x, z)]) if (w.fluid === WATER && group.some(g => !g.fluid && g.top >= w.surf && g.top <= w.surf + 1 && g.bottom < w.surf))
        cap = Math.min(cap, (w.surf + 1) * LH);
    }
    return cap;
  }
  function bankAt(group, X, Z) {
    let bank = -Infinity;
    if (!group[0].fluid) for (const [x, z] of [[X - 1, Z - 1], [X, Z - 1], [X - 1, Z], [X, Z]]) {
      if (!inb(x, z)) continue;
      for (const w of ctx.cols[idx(x, z)]) if (w.fluid && group.some(g => g.top >= w.surf && g.bottom < w.surf)) bank = Math.max(bank, w.surf * LH);
    }
    return bank;
  }
  // the ground a stair rests on sinks a little: its terraces meet the flight's heights at the
  // cell edges, and would show through between steps that straddle a cell edge (or lie flush with
  // a tread). Sunk by more than half a step it stays inside the stair's body.
  const pinnedAt = f => [0, 1, 2, 3].some(k => pins.has(f.id + ':' + (f.x + (k & 1)) + ',' + (f.z + (k >> 1))));
  for (const f of floors) {
    f.cs = [0, 1, 2, 3].map(k => computeCorner(f, k & 1, k >> 1));
    if (f.underStair && !f.fluid && !pinnedAt(f)) f.cs = f.cs.map((v, k) => Math.max(v - STAIR_SINK, bankAt([f], f.x + (k & 1), f.z + (k >> 1))));
    f.split = Math.abs(f.cs[0] - f.cs[3]) <= Math.abs(f.cs[1] - f.cs[2]) ? 0 : 1;
  }
}
