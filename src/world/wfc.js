// Wave function collapse over the grid of cubes. Each depth Y is its own horizontal grid; a
// cube's domain is every tile whose side sockets match the collapsed neighbours. A depth is
// collapsed in one go, the first time any of its cubes is needed: its layout's cubes and their
// side neighbours, lowest entropy first, with a random stream per cube. So the tiles only
// depend on the world seed, never on the order of exploration. That works because every
// depth is bounded (layout.js); an unbounded world would need a different scheme (see
// docs/world.md).
import { mulberry32, hash32 } from '../core/util.js';
import { TILES, layersOf } from './tiles.js';
import { OPP6, step, hashKey } from './coords.js';
import { depthOf } from '../themes/depth.js';
import { townOf } from './town.js';
import { spanPins } from './spans.js';
import { heightPins } from './heights.js';
import { areaPins } from './areas.js';
import { trialPins } from './trials.js';

// tile weight at cube k: the base weight scaled by the depth's theme (layout: depth -> layout)
const weightAt = (layout, k) => { const m = layout(depthOf(k)).theme.tiles; return t => t.weight * (m[t.kind] ?? 1); };

export class WFC {
  // layout: depth -> its layout (layout.js), for the cubes each depth collapses
  constructor(seed, layout) {
    this.seed = seed;
    this.layout = layout;
    this.depths = new Set();
    // Pin the town's tiles before any collapse, even when countryside is visited first.
    const meadow = TILES.find(t => t.kind === 'meadow' && t.sock.every(s => s === 'L'));
    this.tiles = new Map(townOf(seed).keys.map(k => [k, { ...meadow, K: 1 }]));
  }

  // learn: world.html#wfc-code (see learn/README.md)
  domain(k) {
    const nb = [0, 1, 2, 3].map(d => this.tiles.get(step(k, d)));
    return TILES.filter(t => nb.every((n, d) => !n || n.sock[OPP6[d]] === t.sock[d]));
  }

  entropy(dom, w) {
    const sum = dom.reduce((s, t) => s + w(t), 0);
    return Math.log(sum) - dom.reduce((s, t) => s + w(t) * Math.log(w(t)), 0) / sum;
  }

  rng(k, salt = 0) { return mulberry32(hash32(this.seed ^ hashKey(k) ^ salt)); }

  // the whole depth d at once: its cubes and their side neighbours, in a fixed order
  // learn: world.html#wfc #wfc-code (see learn/README.md)
  collapseDepth(d) {
    if (this.depths.has(d)) return;
    this.depths.add(d);
    const region = new Set();
    // span cubes (spans.js), tablelands (heights.js) and large areas (areas.js) are pinned first:
    // their faces follow the span, the escarpment or the area, they have one layer; so does a lone
    // peak's flat field (cubegen/setpieces.js), the beginning's rock too (core/intro.js)
    const L = this.layout(d), peak = [L.peak, L.firstGlass].filter(Boolean).map(k => [k, ['L', 'L', 'L', 'L']]);
    for (const [k, sock] of [...spanPins(L), ...heightPins(L), ...areaPins(L), ...peak]) {
      const tile = TILES.find(t => t.sock.every((s, i) => s === sock[i]));
      if (!this.tiles.has(k)) this.tiles.set(k, { ...tile, K: 1 });
    }
    // trial rooms (world/trials.js): flat all round, no river across them, their own layers
    for (const [k, { sock, K }] of trialPins(L)) {
      const tile = TILES.find(t => t.sock.every((s, i) => s === sock[i]));
      if (!this.tiles.has(k)) this.tiles.set(k, { ...tile, K });
    }
    for (const k of L.exists) { region.add(k); for (let i = 0; i < 4; i++) region.add(step(k, i)); }
    this.collapse([...region].sort());
    // a great lake (cubegen/setpieces.js) keeps the sockets it got, but no layers over the water
    if (L.lake) this.tiles.set(L.lake, { ...this.tiles.get(L.lake), K: 1 });
    // a trial room entered from above (world/trials.js): the room before has its layers too, for the
    // portal up there
    for (const t of L.trials || []) if (t.K > 1) { const f = this.tiles.get(t.from); if (f && f.K < t.K) this.tiles.set(t.from, { ...f, K: t.K }); }
  }

  // learn: world.html#wfc #wfc-code (see learn/README.md)
  collapse(keys) {
    const todo = new Set(keys.filter(k => !this.tiles.has(k)));
    while (todo.size) {
      let best = null, bestE = Infinity, bestDom = null;
      for (const k of todo) {
        const dom = this.domain(k), e = this.entropy(dom, weightAt(this.layout, k)) + (hashKey(k) % 1000) * 1e-6;   // tiny tie-break
        if (e < bestE) { best = k; bestE = e; bestDom = dom; }
      }
      const R = this.rng(best), w = weightAt(this.layout, best), sum = bestDom.reduce((s, t) => s + w(t), 0);
      let r = R() * sum, tile = bestDom[bestDom.length - 1];
      for (const t of bestDom) if ((r -= w(t)) < 0) { tile = t; break; }
      const near = [0, 1, 2, 3].map(d => this.tiles.get(step(best, d))?.K).filter(Boolean);
      let K = layersOf(tile.kind, R(), near);
      // a theme with fewer floating floors (themes/index.js `layers`) keeps them only now and then
      const keep = this.layout(depthOf(best)).theme.layers;
      if (keep !== undefined && K > 1 && R() >= keep) K = 1;
      this.tiles.set(best, { ...tile, K });
      todo.delete(best);
    }
  }
}
