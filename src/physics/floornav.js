// Worker-safe floor clearance and links, shared by generation and live enemy navigation.
import { LH, N, DIRS, OPP } from '../core/constants.js';
import { edgeKey, idx, inb } from '../core/util.js';
import { floorY, runY, topOf } from '../core/surfaces.js';

const free = new WeakMap();
// what stands in column c between lo and hi, other than `self`: floors, structures, pillars
export function columnClear(map, c, lo, hi, self) {
  const floors = (map.cols[c] || []).every(g => g === self
    || floorY(g, 0.5, 0.5) <= lo + 0.001 || g.bottom * LH >= hi);
  const pieces = (map.pieces[c] || []).every(p => {
    if (p === self) return true;
    if (p.kind === 'pillar') return p.bottom >= hi || p.top <= lo;
    const t = runY(p, 0.5, 0.5);
    return (p.kind === 'bridge' ? t - 0.2 : p.base) >= hi || t <= lo;
  });
  return floors && pieces;
}
// Enemies keep off any cell with a prop in it; for the player (click to move, game/orders.js)
// only the floor and its headroom count, props are checked there. Stair, bridge and landing
// pieces are walkable too (see navNeighbor), pillars never.
export function floorWalkable(map, f, height = 0.9, player = false) {
  if (!f || f.open || f.kind === 'pillar' || f.fluid || f.covered || (!player && (f.landing || map.blockers?.[f.c]?.length))) return false;
  let byHeight = free.get(f);
  if (!byHeight) { byHeight = new Map(); free.set(f, byHeight); }
  if (!byHeight.has(height)) {
    const lo = topOf(f, 0.5, 0.5);
    byHeight.set(height, columnClear(map, f.c, lo, lo + height, f));
  }
  return byHeight.get(height);
}

// the floor next to f along d (generation: floors only)
export function floorNeighbor(map, f, d, height = 0.9, ok) {
  const g = f.link[d];
  if (!(ok ? ok(g) : floorWalkable(map, g, height))) return null;
  return fenced(map, f, g, height) ? null : g;
}
function fenced(map, f, g, height) {
  const lo = Math.min(topOf(f, .5, .5), topOf(g, .5, .5));
  return !!map.fences?.get(edgeKey(f.x, f.z, g.x, g.z))?.some(e => e.ymax > lo && e.ymin < lo + height);
}

// Structures as nodes of the floor graph: a stair or bridge piece leads to the pieces before
// and after it along its run, the first and last to the run's floors (or landings), and a
// landing to the landings its walkways open to. Pieces learn their cell (x, z) here.
const structures = new WeakMap();
export function structureLinks(map) {
  let links = structures.get(map);
  if (links) return links;
  links = new Map();
  structures.set(map, links);
  const runs = map.runs || [], landings = new Map();
  const slot = n => { let l = links.get(n); if (!l) { l = [[], [], [], []]; links.set(n, l); } return l; };
  const join = (a, d, b) => { if (a && b) { slot(a)[d].push(b); slot(b)[OPP[d]].push(a); } };
  for (const r of runs) for (const p of r.pieces) { p.x = p.c % N; p.z = (p.c / N) | 0; }
  for (const r of runs) if (r.kind === 'landing') landings.set(r.from, r.pieces[0]);
  const node = n => n?.landing ? landings.get(n) : n;
  for (const r of runs) {
    if (r.kind === 'landing') {
      const p = r.pieces[0];
      for (const d of r.conn || []) {
        const x = p.x + DIRS[d][0], z = p.z + DIRS[d][1];
        const q = inb(x, z) && map.pieces[idx(x, z)].find(q => q.kind === 'landing' && Math.abs(q.y0 - p.y0) < 0.01);
        if (q) slot(p)[d].push(q);   // a walkway; the other landing adds the way back
      }
      continue;
    }
    const ps = r.pieces;
    join(node(r.from), r.d, ps[0]);
    for (let j = 1; j < ps.length; j++) join(ps[j - 1], r.d, ps[j]);
    join(ps[ps.length - 1], r.d, node(r.to));
  }
  return links;
}
// the height in the middle of node n's side d
const EDGE = [[1, .5], [0, .5], [.5, 1], [.5, 0]];
const edgeY = (n, d) => topOf(n, ...EDGE[d]);
// The node next to n along d for live navigation: its floor link or a structure, whichever
// meets n's edge closest in height, walkable for `height` (or `ok`) and not fenced off.
export function navNeighbor(map, n, d, height = 0.9, ok) {
  const extra = structureLinks(map).get(n)?.[d] ?? [], link = n.link?.[d];
  let best = null, gap = Infinity;
  for (const g of link ? [link, ...extra] : extra) {
    if (!(ok ? ok(g) : floorWalkable(map, g, height)) || fenced(map, n, g, height)) continue;
    const dy = Math.abs(edgeY(n, d) - edgeY(g, OPP[d]));
    if (dy < gap) { best = g; gap = dy; }
  }
  return best;
}
