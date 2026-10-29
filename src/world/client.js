// Main-thread side of the world: asks the worker for cubes and keeps the ones it got.
// cubes: key -> { key, map, geo, info, visits }. `get` resolves when the cube is ready to be
// entered: its map is here, opts.load(cube) is done (what it shows is loaded,
// render/cubeassets.js) and opts.warm(cube) too (its shaders are compiled); `map` when only its
// map is. Asking for cubes early (prefetch) makes walking through a portal instant. The worker
// makes the cubes in the order they were asked for, except that one asked for urgently (`get`:
// someone waits for it) goes first. opts.lightmap: the lightmap's texels a unit (render/bake.js
// bakeDensity), for every cube of this world. opts.level: the world's level (core/enemies.js
// depthLevel), 1 if not given: every map the worker makes says it (map.level), for the enemies.
import { key } from './coords.js';
import { cleanWorldLevel } from '../core/enemies.js';
import { makeLayouts } from './layout.js';
import { worldThemes } from '../themes/depth.js';

// learn: architecture.html#worker (see learn/README.md)
export class WorldClient {
  constructor(seed, { load = null, warm = null, level = 1, ...opts } = {}) {
    this.seed = seed;
    this.level = cleanWorldLevel(level);
    this.load = load; this.warm = warm;
    this.start = key(0, 0, 0);
    this.layout = makeLayouts(seed, worldThemes(seed, opts.themes || []), { trial: opts.trial });   // which cubes exist (cheap, also needed here)
    this.cubes = new Map();
    this.waiting = new Map();   // key -> { list: [resolve, reject][], urgent }
    this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }) => this.receive(data);
    this.worker.postMessage({ type: 'init', seed, opts: { ...opts, level: this.level } });
  }

  receive(data) {
    const { list } = this.waiting.get(data.key) || { list: [] };
    this.waiting.delete(data.key);
    if (data.type === 'error') { console.error('cube failed', data.key, data.message); list.forEach(([, rej]) => rej(new Error(data.message))); return; }
    // (asked for again while on its way: made twice, the first one kept)
    const c = this.cubes.get(data.key) ?? { key: data.key, map: data.map, geo: data.geo, info: data.info, visits: 0 };
    this.cubes.set(data.key, c);
    list.forEach(([res]) => res(c));
  }

  // warm: false only loads what the cube shows (prefetching further ahead)
  get(k, { urgent = true, warm = true } = {}) {
    return this.map(k, urgent).then(c => this.loaded(c).then(() => warm ? this.warmed(c) : null).then(() => c));
  }

  // A failure is logged and does not hold the cube up. Loading is asked for every time (what
  // loaded is kept, what failed is tried again), warming once per cube (until it worked).
  loaded(c) { return Promise.resolve(this.load?.(c)).then(() => {}, e => console.error('cube assets failed', c.key, e)); }
  warmed(c) {
    return c.warmed ??= Promise.resolve(this.warm?.(c)).then(() => {}, e => { console.error('cube warm-up failed', c.key, e); c.warmed = null; });
  }

  map(k, urgent = false) {
    const c = this.cubes.get(k);
    if (c) return Promise.resolve(c);
    return new Promise((res, rej) => {
      let w = this.waiting.get(k);
      if (!w) { this.waiting.set(k, w = { list: [], urgent }); this.worker.postMessage({ type: 'cube', key: k, urgent }); }
      else if (urgent && !w.urgent) { w.urgent = true; this.worker.postMessage({ type: 'cube', key: k, urgent }); }   // to the front
      w.list.push([res, rej]);
    });
  }

  prefetch(keys, { warm = true } = {}) { for (const k of keys) this.get(k, { urgent: false, warm }).catch(() => {}); }

  dispose() { this.worker.terminate(); }
}
