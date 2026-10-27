// Web worker that owns the world: WFC, faces, cube generation and the cube geometry run here,
// off the main thread.
// Requests wait in a queue and are answered one at a time, in order, except that an urgent one
// (someone waits in a portal for it, world/client.js) goes to the front: the cube you walk into
// is not made after all the ones fetched ahead around it. Between two cubes the worker lets new
// requests in. A cube comes back as its map (structured clone keeps the object graph) plus what
// the minimap needs to know about its tile and faces.
import { World } from './world.js';
import { faceKey } from './coords.js';
import { isInterior } from './town.js';
import { isTestRoom } from './testrooms.js';
import { voyagePocket } from '../core/qualmos-voyage.js';
import { buildCubeParts } from '../render/cubegeo.js';
import { partBuffers } from '../render/parts.js';
import { setLightmapDensity } from '../render/lightmap.js';

let world = null;
const queue = [];   // keys still to make, the next first
let scheduled = false;

function info(k) {
  if (voyagePocket(k)) return { kind: 'meadow', sock: null, K: 1, faces: [null, null, null, null, null, null] };
  if (isInterior(k)) return { kind: 'interior', sock: null, K: world.cube(k).map.K, faces: [null, null, null, null, null, null] };
  if (isTestRoom(k)) return { kind: 'meadow', sock: null, K: world.cube(k).map.K, faces: [null, null, null, null, null, null] };
  const t = world.wfc.tiles.get(k);
  const faces = [0, 1, 2, 3, 4, 5].map(d => {
    const f = world.faces.get(faceKey(k, d));
    return f ? { portal: f.portal, river: f.river } : null;
  });
  return { kind: t.kind, sock: t.sock, K: t.K, faces };
}

function make(k) {
  try {
    const c = world.cube(k);
    const geo = buildCubeParts(c.map);
    postMessage({ type: 'cube', key: k, map: c.map, geo, info: info(k) }, partBuffers(geo));
  } catch (e) {
    postMessage({ type: 'error', key: k, message: String(e.message || e) });
  }
}

function next() {
  scheduled = false;
  if (queue.length) make(queue.shift());
  schedule();
}
function schedule() {
  if (scheduled || !queue.length) return;
  scheduled = true;
  setTimeout(next, 0);   // (a request that came in meanwhile is queued first)
}

onmessage = ({ data }) => {
  if (data.type === 'init') { setLightmapDensity(data.opts?.lightmap); world = new World(data.seed, data.opts); return; }
  if (data.type === 'cube') {
    const i = queue.indexOf(data.key);
    if (i >= 0 && !data.urgent) return;
    if (i >= 0) queue.splice(i, 1);
    if (data.urgent) queue.unshift(data.key); else queue.push(data.key);
    schedule();
  }
};
