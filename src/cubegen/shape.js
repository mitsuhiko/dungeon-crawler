// Structure geometry: heights from the smoothed floors at both ends, bridge styles,
// sag, bases of stairs / landings and supporting pillars.
import { LH, SHEAD, OPP, EDGE_CORNERS } from '../core/constants.js';
import { runY } from '../core/surfaces.js';
import { bridgesOf, pickBridge, BRIDGE_STYLES } from '../themes/builds.js';
import { themeOf } from '../themes/depth.js';

// how much room (units) there is over both ends of bridge r, for the towers and poles of some
// styles (themes/builds.js `towers`): up to the next floor, structure or landmark overhang over
// its end floors and its first and last cells
export function roomOver(cols, pieces, r) {
  return Math.min(...[[r.from, r.cells[0], r.y0], [r.to, r.cells.at(-1), r.y1]].flatMap(([e, cell, y]) => [e.c, cell].map(c => {
    let top = Infinity;
    for (const f of cols[c]) {
      if (f !== e && f.bottom * LH > y - 0.01) top = Math.min(top, f.bottom * LH);
      if (f.siteClaimTop && f.top * LH <= y + 0.01) top = Math.min(top, f.siteClaimTop * LH);
    }
    for (const q of pieces[c]) if (q.run !== r && q.kind !== 'pillar' && Math.min(q.y0, q.y1) > y) top = Math.min(top, Math.min(q.y0, q.y1) - 0.4);
    return top - y;
  })));
}

export function shapeStructures(ctx) {
  const { R, cols, pieces, runs, pathFloors } = ctx;
  // the depth's bridge styles by weight, where they fit (themes/builds.js)
  const weights = bridgesOf(themeOf(ctx.spec), ctx.spec.forceBridge);
  const edgeY = (n, d) => { if (n.landing) return n.top * LH; const [a, b] = EDGE_CORNERS[d]; return (n.cs[a] + n.cs[b]) / 2; };
  const floorBelow = (c, y) => { let g = null; for (const f of cols[c]) if (f.top * LH <= y + 0.01) g = f; return g; };
  const groundY = g => g ? (g.fluid ? g.surf * LH : Math.min(...g.cs)) : 0;
  const bedY = g => g ? Math.min(...g.cs) : 0;   // under a fluid: its bed
  const pathCols = new Set(pathFloors.map(f => f.c));
  const pillar = (run, c, cx, cz, hx, hz, bottom, top) => {
    if (top - bottom < 0.05) return;
    const p = { kind: 'pillar', c, run, x0: cx - hx, x1: cx + hx, z0: cz - hz, z1: cz + hz, bottom, top };
    pieces[c].push(p); (run.pillars ||= []).push(p);
  };
  const pieceEnds = p => {
    if (p.kind === 'landing') { p.y0 = p.y1 = p.run.y0; return; }
    const neg = p.dx < 0 || p.dz < 0;
    p.y0 = runY(p, neg ? 1 : 0, neg ? 1 : 0); p.y1 = runY(p, neg ? 0 : 1, neg ? 0 : 1);
  };

  for (const r of runs) {
    if (r.kind === 'landing') { r.c = r.cells[0]; r.y0 = r.y1 = r.ymid = r.from.top * LH; }
    else { r.y0 = edgeY(r.from, r.d); r.y1 = edgeY(r.to, OPP[r.d]); r.ymid = (r.y0 + r.y1) / 2; }
  }
  for (const r of runs) r.pieces.forEach(pieceEnds);

  for (const r of runs) {
    if (r.kind === 'landing') {
      const y = r.y0, sup = floorBelow(r.c, y - 0.5), p = r.pieces[0];
      const supported = sup && y - sup.top * LH < SHEAD * LH;
      p.base = supported ? groundY(sup) : y - 0.35;
      if (!supported && !pathCols.has(r.c)) pillar(r, r.c, 0.5, 0.5, 0.17, 0.17, bedY(sup), y - 0.35);   // (in a fluid: down to its bed)
      continue;
    }
    const k = r.k;
    if (r.kind === 'bridge') {
      // arches only over ground (or a river, a lake of lava) close below (BRIDGE_STYLES `ground`)
      const deckLo = Math.min(r.y0, r.y1) - 0.25;
      const below = r.pieces.map(p => floorBelow(p.c, deckLo));
      const solid = below.every(g => g && deckLo - groundY(g) < 8)
        && r.pieces.every(p => !pathCols.has(p.c) && !pieces[p.c].some(q => q.run !== r && q.kind !== 'pillar' && Math.min(q.y0, q.y1) < deckLo));
      r.style = pickBridge(weights, { solid, k, room: roomOver(cols, pieces, r) }, R());
      if (r.span) r.style = r.spanStyle ?? ctx.spec.span.style;   // a span's long bridge (span.js; the town's own each)
      r.sag = BRIDGE_STYLES[r.style].sag(k, r.span);
      if (r.sag) r.pieces.forEach(pieceEnds);
    }
    r.pieces.forEach(p => {
      const lo = Math.min(p.y0, p.y1), sup = floorBelow(p.c, lo);
      p.ground = groundY(sup); p.bed = bedY(sup);
      p.supported = r.kind === 'stair' && !!sup && lo - sup.top * LH < SHEAD * LH;
      p.base = p.supported ? (sup.fluid ? p.bed : p.ground) : lo - 0.4;   // (in a fluid: on its bed)
    });
    if (r.kind !== 'bridge') continue;
    // supports under bridges (BRIDGE_STYLES `supports`): stone piers between arches, timber legs
    // under long plank and iron bridges, nothing under the ones that hang
    const supports = BRIDGE_STYLES[r.style].supports;
    if (supports === 'piers') {
      const nArch = Math.ceil(k / 3);
      r.splits = [];
      for (let i = 1; i < nArch; i++) r.splits.push(Math.round(i * k / nArch) - 0.5);
      for (const s of r.splits) {
        const p = r.pieces[Math.floor(s)];
        pillar(r, p.c, 0.5, 0.5, r.dx ? 0.2 : 0.42, r.dx ? 0.42 : 0.2, p.bed, runY(p, 0.5, 0.5) - 0.3);   // down to a river's bed
      }
    } else if (supports === 'legs' && r.span) {   // tall trestles under a span's long bridge
      if (ctx.spec.span.sky) continue;
      for (const j of [Math.round(k / 3), Math.round(2 * k / 3)]) {
        const p = r.pieces[j];
        for (const w of [-0.36, 0.36]) pillar(r, p.c, 0.5 + (r.dz ? w : 0), 0.5 + (r.dx ? w : 0), 0.09, 0.09, p.bed, runY(p, 0.5, 0.5) - 0.2);
      }
    } else if (supports === 'legs' && k >= 3) {
      r.pieces.forEach((p, j) => {
        const top = runY(p, 0.5, 0.5) - 0.2;
        // not where another structure passes underneath (the legs would stand in its way)
        const under = pieces[p.c].some(q => q.run !== r && q.kind !== 'pillar' && Math.min(q.y0, q.y1) < top);
        if (j % 2 === 1 && top - p.ground < 3.5 && !pathCols.has(p.c) && !under)
          for (const w of [-0.38, 0.38]) pillar(r, p.c, 0.5 + (r.dz ? w : 0), 0.5 + (r.dx ? w : 0), 0.06, 0.06, p.bed, top);   // (in a fluid: down to its bed)
      });
    }
  }
}
