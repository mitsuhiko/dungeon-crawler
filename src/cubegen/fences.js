// Fences: physics edges between two cells (with a height range); `show` decides if a
// wooden fence is drawn. Structures get invisible side rails, cliffs get visible fences.
import { N, LH, LAVA, DIRS, OPP, EDGE_CORNERS } from '../core/constants.js';
import { idx, inb, edgeKey } from '../core/util.js';
import { floorY, runY } from '../core/surfaces.js';
import { reachTo } from './reach.js';
import { reachable } from './escape.js';

// The invisible side rails of the structures (open sides of landings, both sides of stairs and
// bridges, towards cells in the cube): { fences, fenceList, addFence }. A cube's (addFences) and
// the town's (cubegen/town.js), which has no other fences.
export function runRails(runs) {
  const fences = new Map(), fenceList = [];
  function addFence(c, d, hfn, layer, show = true) {
    const x = c % N, z = (c / N) | 0, nx = x + DIRS[d][0], nz = z + DIRS[d][1];
    const pts = [0.07, 0.5, 0.93].map(t => {
      const fx = d === 0 ? 0.93 : d === 1 ? 0.07 : t, fz = d === 2 ? 0.93 : d === 3 ? 0.07 : t;
      return [x + fx, hfn(fx, fz), z + fz];
    });
    const ys = pts.map(p => p[1]);
    const f = { pts, ymin: Math.min(...ys), ymax: Math.max(...ys), layer, show };
    fenceList.push(f);
    const key = f.key = edgeKey(x, z, nx, nz);
    if (!fences.has(key)) fences.set(key, []);
    fences.get(key).push(f);
  }
  for (const r of runs) {
    if (r.kind === 'landing') {
      for (let d = 0; d < 4; d++) if (!r.conn.has(d) && inb(r.from.x + DIRS[d][0], r.from.z + DIRS[d][1]))
        addFence(r.c, d, () => r.y0, r.layer, false);
      continue;
    }
    for (const p of r.pieces) for (const ld of (r.dx !== 0 ? [2, 3] : [0, 1]))
      if (inb(p.c % N + DIRS[ld][0], ((p.c / N) | 0) + DIRS[ld][1])) addFence(p.c, ld, (fx, fz) => runY(p, fx, fz), r.layer, false);
  }
  return { fences, fenceList, addFence };
}

export function addFences(ctx) {
  const { R, cols, floors, pieces, runs, pathEdges, fenceNoise, stats } = ctx;
  const { fences, fenceList, addFence } = runRails(runs);

  // cliff edges: in runs (noise), around lava, never on route edges
  for (const f of floors) {
    if (f.fluid || ctx.noFence?.has(f.c)) continue;   // (a crumbling crust: its edges stay open, cubegen/trials/collapse.js)
    const runsF = fenceNoise(f.x * 0.45 + f.layer * 9, f.z * 0.45) > 0.56;
    for (let d = 0; d < 4; d++) {
      const nx = f.x + DIRS[d][0], nz = f.z + DIRS[d][1];
      if (!inb(nx, nz) || f.link[d] || pathEdges.has(f.id + ':' + d)) continue;
      const n = idx(nx, nz), [a, b] = EDGE_CORNERS[d], [na, nb] = EDGE_CORNERS[OPP[d]];
      const my = Math.min(f.cs[a], f.cs[b]);
      if (pieces[n].some(p => p.kind !== 'pillar' && Math.abs((p.y0 + p.y1) / 2 - my) < 1.6)) continue;
      // what lies on the other side: a wall, or something to fall onto
      let nt = 0, wall = false, lava = false;
      for (const g of cols[n]) {
        const gt = g.fluid ? g.surf * LH : Math.max(g.cs[na], g.cs[nb]);
        if (gt <= my - 0.05) { nt = gt; lava = g.fluid === LAVA; }
        else if (g.bottom * LH < my + 1) wall = true;
      }
      if (wall || my - nt < 0.9) continue;
      stats.cliffs++;
      // (the ramps round a pinnacle and down a great shaft are railed, cubegen/heights.js; a
      // spiral's ramp all along, cubegen/areas.js)
      const p = ctx.railed?.has(f.c) ? 1 : lava ? 0.85 : runsF || ctx.rails?.has(f.c) ? 0.9 : f.layer > 0 && my - nt > 2 ? 0.3 : 0.06;
      if (R() < p) { addFence(f.c, d, (fx, fz) => floorY(f, fx, fz), f.layer); fenceList[fenceList.length - 1].cliff = f.id; stats.fences++; }
    }
  }
  for (const f of floors) for (const d of [0, 2]) if (f.link[d] && !f.fluid && f.link[d].top !== f.top) stats.slopes++;
  ctx.fences = fences; ctx.fenceList = fenceList;
}

// a cliff fence must not be what keeps a floor from the exit: take down the fences around
// floors that are cut off now (dropping off them may be their way out)
export function openTraps(ctx) {
  if (!ctx.hub) return;
  for (let i = 0; i < 4; i++) {
    const safe = reachTo(ctx, ctx.hub, true), seen = reachable(ctx, true);
    const trapped = new Set([...seen].filter(id => !safe.has(id)));
    const drop = ctx.fenceList.filter(f => f.cliff != null && trapped.has(f.cliff));
    if (!drop.length) return;
    for (const f of drop) {
      const list = ctx.fences.get(f.key); list.splice(list.indexOf(f), 1);
      if (!list.length) ctx.fences.delete(f.key);
    }
    ctx.fenceList = ctx.fenceList.filter(f => !drop.includes(f));
    ctx.stats.fences -= drop.length; ctx.stats.unfenced = (ctx.stats.unfenced || 0) + drop.length;
  }
}
