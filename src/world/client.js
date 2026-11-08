// Main-thread side of the world: asks the worker for cubes and keeps the ones it got.
// cubes: key -> { key, map, geo, info, visits }. `get` resolves when the cube is ready to be
// entered: its map is here, opts.load(cube) is done (what it shows is loaded,
// render/cubeassets.js) and opts.warm(cube) too (its shaders are compiled); `map` when only its
// map is. Asking for cubes early (prefetch) makes walking through a portal instant. The worker
// makes the cubes in the order they were asked for, except that one asked for urgently (`get`:
// someone waits for it) goes first. opts.lightmap: the lightmap's texels a unit (render/bake.js
// bakeDensity), for every cube of this world. opts.level: the world's level (core/enemies.js
// depthLevel), 1 if not given: every map the worker makes says it (map.level), for the enemies.
//
// The maps stay (small: the map, the minimap, the quests and the saves read every cube visited),
// their geometry does not (render/cubegeo.js: about 1 MB a cube, ten times its map): the cubes
// round the one played in keep theirs (KEEP cubes either way on its layer: what is drawn round it,
// render/neighbors.js, and a cube further), the others only the most recently used up to
// opts.geometry bytes (trimGeometry). A cube whose geometry went gets it again from the worker
// (which keeps the map) when it is wanted: `get` waits for it, `geometry` asks for it.
import { cleanWorldLevel } from '../core/enemies.js';
import { makeLayouts } from './layout.js';
import { worldThemes } from '../themes/depth.js';
import { townOf } from './town.js';
import { parse } from './coords.js';

const KEEP = 4;
const ownLayer = (a, b) => {
  const p = parse(a), q = parse(b);
  return p.length === 3 && q.length === 3 && p[1] === q[1] && Math.max(Math.abs(p[0] - q[0]), Math.abs(p[2] - q[2])) <= KEEP;
};

// learn: architecture.html#worker (see learn/README.md)
export class WorldClient {
  constructor(seed, { load = null, warm = null, level = 1, geometry = 64 * 2 ** 20, ...opts } = {}) {
    this.seed = seed;
    this.level = cleanWorldLevel(level);
    this.load = load; this.warm = warm;
    this.start = townOf(seed).start;   // the inn's tile (world/town.js)
    this.town = townOf(seed);
    this.layout = makeLayouts(seed, worldThemes(seed, opts.themes || []), { trial: opts.trial });   // which cubes exist (cheap, also needed here)
    this.cubes = new Map();
    this.waiting = new Map();   // key -> { list: [resolve, reject][], urgent }
    this.geoWaiting = new Map();   // key -> a promise of the cube with its geometry again
    this.geoBudget = geometry; this.used = 0;
    this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }) => this.receive(data);
    this.worker.postMessage({ type: 'init', seed, opts: { ...opts, level: this.level } });
  }

  receive(data) {
    if (data.type === 'geo') {
      const c = this.cubes.get(data.key), w = this.geoWaiting.get(data.key);
      this.geoWaiting.delete(data.key);
      if (c && !c.geo && data.geo) Object.assign(c, { geo: data.geo, geoBytes: data.bytes });
      w?.done(c);
      return;
    }
    const { list } = this.waiting.get(data.key) || { list: [] };
    this.waiting.delete(data.key);
    if (data.type === 'error') { console.error('cube failed', data.key, data.message); list.forEach(([, rej]) => rej(new Error(data.message))); return; }
    // (asked for again while on its way: made twice, the first one kept)
    const c = this.cubes.get(data.key) ?? { key: data.key, map: data.map, geo: data.geo, geoBytes: data.bytes, info: data.info, visits: 0 };
    if (!c.geo) Object.assign(c, { geo: data.geo, geoBytes: data.bytes });
    c.used = ++this.used;
    this.cubes.set(data.key, c);
    list.forEach(([res]) => res(c));
  }

  // warm: false only loads what the cube shows (prefetching further ahead)
  get(k, { urgent = true, warm = true } = {}) {
    return this.map(k, urgent).then(c => this.geometry(k)).then(c => this.loaded(c).then(() => warm ? this.warmed(c) : null).then(() => c));
  }

  // the cube once its geometry is here (again: trimGeometry); its map must be here already
  geometry(k) {
    const c = this.cubes.get(k);
    if (!c) return this.map(k, true).then(() => this.geometry(k));
    c.used = ++this.used;
    if (c.geo) return Promise.resolve(c);
    let w = this.geoWaiting.get(k);
    if (!w) {
      let done;
      this.geoWaiting.set(k, w = { promise: new Promise(res => { done = res; }), done });
      this.worker.postMessage({ type: 'geo', key: k });
    }
    return w.promise;
  }
  // Let go of the geometry of the cubes away from cube k (its layer, KEEP cubes either way, keeps
  // its own), but the most recently used, up to geoBudget bytes. -> the bytes of geometry kept.
  trimGeometry(k) {
    const far = [...this.cubes.values()].filter(c => c.geo && c.key !== k && !ownLayer(c.key, k)).sort((a, b) => b.used - a.used);
    let bytes = 0;
    for (const c of this.cubes.values()) if (c.geo) bytes += c.geoBytes ?? 0;
    let kept = 0;
    for (const c of far) {
      if (kept + (c.geoBytes ?? 0) <= this.geoBudget) { kept += c.geoBytes ?? 0; continue; }
      bytes -= c.geoBytes ?? 0;
      c.geo = undefined;   // (not null: render/world.js buildWorld makes it from the map then)
      c.ready = false;     // (not to be walked into at once: game/flow.js readyAhead gets it again)
    }
    return bytes;
  }
  // what the cubes hold (tests/browser, the perf overlay): their geometry's bytes, how many have it
  geometryHeld() {
    let bytes = 0, cubes = 0;
    for (const c of this.cubes.values()) if (c.geo) { bytes += c.geoBytes ?? 0; cubes++; }
    return { bytes, cubes, of: this.cubes.size };
  }

  // A failure is logged and does not hold the cube up. Loading is asked for every time (what
  // loaded is kept, what failed is tried again), warming once per cube (until it worked).
  loaded(c) { return Promise.resolve(this.load?.(c)).then(() => {}, e => console.error('cube assets failed', c.key, e)); }
  warmed(c) {
    return c.warmed ??= Promise.resolve(this.warm?.(c)).then(() => {}, e => { console.error('cube warm-up failed', c.key, e); c.warmed = null; });
  }

  map(k, urgent = false) {
    const c = this.cubes.get(k);
    if (c) { c.used = ++this.used; return Promise.resolve(c); }
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
