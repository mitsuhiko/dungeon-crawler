// Render-only discovered cubes: the same parts the active cube is drawn from (render/parts.js),
// with the same looks, only darker and without cut caps, shadows, lights or animation
// (render/materials.js 'proxy'), plus the cube's landmarks (the only props shown) and its glass
// box. Every proxy is an instance in a few shared BatchedMeshes, one per part (and one for all
// landmarks), so all surroundings take about a dozen draw calls however many cubes they are.
// A proxy's fades (travel dissolve, inverted cross-fade, distance) live per instance in a small
// data texture of each batch; its `group` is a stand-in holding the fade values (render/fade.js)
// and the position travel moves, synced into the batches by cullNeighbors once a frame.
import * as THREE from 'three';
import { N, CUBE_H, BASE } from '../core/constants.js';
import { VIEW_DISTANCE, distanceFade } from '../core/viewdistance.js';
import { scene, camera } from './scene.js';
import { PARTS } from './parts.js';
import { partGeometry } from './partmeshes.js';
import { partMaterial, fluidLook, fluidGlow, PROXY, NEIGHBOR_DIM } from './materials.js';
import { makeFadable, setFade, dither } from './fade.js';
import { glassState, glassBatch, setGlassFaces, setGlassShut, setGlassSeams } from './glass.js';
import { inject } from './cutshader.js';
import { capLight } from './section.js';
import { LAYER as GHOSTS, glassLook, glassRim } from './ghosts.js';
import { props, loadPropSets, propSetLoaded, propMatrix, propBatchGeometry } from './props.js';

let current = [];   // [{ key, source, group, cull, glass, geometry, base, instances, landmarks }]
const live = new Set(), cache = new Map();   // cache keyed by worker geometry identity
const MAX_CACHE = 64, MAX_BYTES = 32 * 1024 * 1024;
let cacheBytes = 0, time = 0;
const frustum = new THREE.Frustum(), projection = new THREE.Matrix4();
const bounds = new THREE.Box3(), point = new THREE.Vector3(), center = new THREE.Vector3();
const reveal = { value: 1 }, revealFloor = { value: -1e3 };
const place = new THREE.Matrix4();

// Foreground proxies reveal the player even when no active-cube terrain needs cutting.
// Unlike cave walls, this uses only screen region/view depth, never cube-local wall tests
// (but see besideWall). Like real terrain they are only cut above a height: the active cut, or just over the
// player's feet when there is none (nothing lower can hide the player).
const CUT = 'uProxyReveal > 0.5 && (vCutW.y > (uCutY < 999.0 ? uCutY : uProxyFloor) && cutRegion(false) > 0.5 || besideWall())';
const REVEAL = `if (${CUT}) discard;\n`;
// ... and what they cut away is drawn again as glass, as in the active cube (ghosts.js)
const GLASS = `if (!(${CUT})) discard;\n`;
// A cave's or canyon's walls on the camera's sides come down (cutshader.js frontWall); so does
// the neighbour's own wall right outside them, along the same side, to the same height.
const BESIDE_WALL = `
  bool besideWall() {
    vec4 d = vec4(uWallBox.y - vCutW.x, vCutW.x - uWallBox.x, uWallBox.w - vCutW.z, vCutW.z - uWallBox.z);
    bvec4 outside = lessThan(d, vec4(0.0));
    if (int(outside.x) + int(outside.y) + int(outside.z) + int(outside.w) != 1 || min(min(d.x, d.y), min(d.z, d.w)) <= -uWallBand) return false;
    bvec4 near = lessThan(abs(d), vec4(uWallBand)), front = greaterThan(uFront, vec4(0.5));
    bool lowered = any(bvec4(near.x && front.x, near.y && front.y, near.z && front.z, near.w && front.w));
    bool kept = any(bvec4(near.x && !front.x, near.y && !front.y, near.z && !front.z, near.w && !front.w));
    return lowered && !(kept && uFrontCorners > 0.5) && vCutW.y > wallFloor(vCutW);
  }
`;

// a batch's material: the reveal, and each instance's fade from the batch's data texture.
// Neighbouring cubes share their boundary faces (each has its own cliff wall on the shared side):
// pushed back a little in depth, the proxy's always loses there, so the active cube's section
// caps show through a cut instead of fighting the proxy's wall behind them.
function batchMaterial(mat, data, key, edit = sh => sh, cut = REVEAL) {
  Object.assign(mat, { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
  mat.defines = { ...mat.defines, NO_BAKE: '' };   // (not lit by the active cube's fixed lights, render/lighthook.js)
  inject(mat, fs => fs.replace('#include <clipping_planes_fragment>',
    cut + '#include <clipping_planes_fragment>' + dither('vProxy.x', 'vProxy.y', 'vProxy.z')), key);
  const compile = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    compile.call(mat, sh, r);
    Object.assign(sh.uniforms, { uProxyReveal: reveal, uProxyFloor: revealFloor, uProxyData: data });
    sh.vertexShader = 'uniform highp sampler2D uProxyData;\nflat varying vec4 vProxy;\n' + sh.vertexShader.replace('#include <batching_vertex>',
      '#include <batching_vertex>\n#ifdef USE_BATCHING\n  vProxy = texelFetch(uProxyData, ivec2(int(getIndirectIndex(gl_DrawID)), 0), 0);\n#else\n  vProxy = vec4(1.0, 0.0, 1.0, 0.0);\n#endif');
    sh.fragmentShader = 'uniform float uProxyReveal, uProxyFloor;\nflat varying vec4 vProxy;\n' + sh.fragmentShader.replace('void main()', BESIDE_WALL + 'void main()');
    // lifted (vProxy.w: 1 - its dim, materials.js NEIGHBOR_DIM): that far back from the proxies'
    // darker tint (the material's colour) to its own colours, mixed as the eye sees it (gamma 2.2)
    if (cut === REVEAL) sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\n  diffuseColor.rgb *= pow(mix(vec3(1.0), pow(1.0 / max(diffuse, vec3(0.02)), vec3(1.0 / 2.2)), vProxy.w), vec3(2.2));');
    edit(sh);
  };
  return mat;
}

// The landmarks' batch lights each vertex by its own glow (props.js propBatchGeometry).
const glowing = sh => {
  sh.vertexShader = 'attribute vec3 glow;\nvarying vec3 vGlow;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGlow = glow;');
  sh.fragmentShader = 'varying vec3 vGlow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vGlow;');
};

// One BatchedMesh with room that grows: geometry space is compacted first and doubled when
// that is not enough, instance slots double too (with the fade texture).
class Batch {
  // glass: draw what the cut takes away again as glass (solids)
  constructor(material, order, key, edit, glass = false) {
    this.capacity = 64; this.vertices = 1 << 14; this.indices = 1 << 15;
    this.data = { value: this.fadeTexture(this.capacity) };
    this.mesh = new THREE.BatchedMesh(this.capacity, this.vertices, this.indices, batchMaterial(material, this.data, key, edit));
    // cullNeighbors culls whole cubes; transparent parts are sorted back to front among themselves
    Object.assign(this.mesh, { frustumCulled: false, perObjectFrustumCulled: false, sortObjects: material.transparent, renderOrder: order, visible: false });
    this.count = 0; this.dirty = false;
    scene.add(this.mesh);
    if (glass) scene.add(this.glassDraw(key));
  }
  // The batch drawn a second time with the glass material, among the transparent things and
  // only while the ghosts' layer is on: a stand-in with nothing of its own to draw does it, just
  // before it would draw (a BatchedMesh has one material).
  glassDraw(key) {
    const glass = this.glass = batchMaterial(glassLook(), this.data, key + '-glass', sh => { sh.fragmentShader = glassRim(sh.fragmentShader); }, GLASS);
    const standIn = this.standIn = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, colorWrite: false }));
    Object.assign(standIn, { frustumCulled: false, renderOrder: 60 });
    standIn.layers.set(GHOSTS);
    standIn.onBeforeRender = (renderer, scene, camera) => {
      if (this.mesh.visible) renderer.renderBufferDirect(camera, scene, this.mesh.geometry, glass, this.mesh, null);
    };
    return standIn;
  }
  fadeTexture(width, old) {
    const tex = new THREE.DataTexture(new Float32Array(width * 4), width, 1, THREE.RGBAFormat, THREE.FloatType);
    if (old) { tex.image.data.set(old.image.data); old.dispose(); }
    tex.needsUpdate = true;
    return tex;
  }
  addGeometry(geometry) {
    const v = geometry.attributes.position.count, i = geometry.index.count, mesh = this.mesh;
    if (mesh.unusedVertexCount < v || mesh.unusedIndexCount < i) {
      mesh.optimize();
      if (mesh.unusedVertexCount < v || mesh.unusedIndexCount < i) {
        this.vertices = Math.max(this.vertices * 2, this.vertices - mesh.unusedVertexCount + v);
        this.indices = Math.max(this.indices * 2, this.indices - mesh.unusedIndexCount + i);
        mesh.setGeometrySize(this.vertices, this.indices);
      }
    }
    return mesh.addGeometry(geometry);
  }
  addInstance(geometryId) {
    if (this.mesh.instanceCount >= this.capacity) {
      this.capacity *= 2;
      this.mesh.setInstanceCount(this.capacity);
      this.data.value = this.fadeTexture(this.capacity, this.data.value);
    }
    this.count++;
    const id = this.mesh.addInstance(geometryId);
    this.mesh.setVisibleAt(id, false);
    return id;
  }
  removeInstance(id) { this.mesh.deleteInstance(id); this.count--; }
  // matrix: null to keep the last one; fade: [fade, inverted, range fade, lift] (render/fade.js; lift:
  // 1 - its dim, materials.js NEIGHBOR_DIM)
  set(id, matrix, fade, visible) {
    if (matrix) this.mesh.setMatrixAt(id, matrix);
    const d = this.data.value.image.data, f = Math.fround;   // (stored as 32-bit floats)
    if (d[id * 4] !== f(fade[0]) || d[id * 4 + 1] !== f(fade[1]) || d[id * 4 + 2] !== f(fade[2]) || d[id * 4 + 3] !== f(fade[3])) {
      d[id * 4] = fade[0]; d[id * 4 + 1] = fade[1]; d[id * 4 + 2] = fade[2]; d[id * 4 + 3] = fade[3];
      this.dirty = true;
    }
    if (this.mesh.getVisibleAt(id) !== visible) this.mesh.setVisibleAt(id, visible);
    if (visible) this.shown = true;
  }
  commit() {
    if (this.dirty) this.data.value.needsUpdate = true;
    this.mesh.visible = !!this.shown;
    this.dirty = this.shown = false;
  }
}

const batches = new Map();   // part name (or 'landmark') -> Batch
const PROXY_ORDER = { solid: 0, fluid: 1, fall: 1 };   // under the active cube's fluids (partmeshes.js)
// Solids show their insides where they are cut (the reveal, besideWall) as the active cube's
// section caps do (section.js), in the proxies' darker tint (the material's colour).
const proxyCaps = caps => sh => {
  sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `if (!gl_FrontFacing) ${capLight(caps, 'diffuse')}
    #include <opaque_fragment>`);
};
function batchFor(part) {
  let b = batches.get(part.name);
  if (!b) {
    const material = partMaterial(part, 'proxy');
    if (part.cap) material.side = THREE.DoubleSide;
    batches.set(part.name, b = new Batch(material, PROXY_ORDER[part.kind], 'proxy-' + part.kind + (part.cap ? '-' + part.cap : ''),
      part.cap ? proxyCaps(part.cap) : undefined, !!part.cap));
    fluidLook(b.mesh.material, part);
    b.part = part;
  }
  return b;
}
function landmarkBatch() {
  let b = batches.get('landmark');
  if (!b) batches.set('landmark', b = new Batch(new THREE.MeshLambertMaterial({ vertexColors: true, color: PROXY.tint, side: THREE.DoubleSide }),
    0, 'proxy-landmark', glowing));
  return b;
}
let glass = null;
const glassFor = () => {
  if (!glass) { glass = glassBatch(0.6); scene.add(...glass.objects); }
  return glass;
};
const landmarkGeometry = new Map();   // prop name -> geometry id in the landmark batch (kept)

// A cube as it will be a proxy, ahead, for its shaders to be compiled (render/cubeassets.js):
// its parts go into their batches now (cached like a proxy's that went, render/warmup.js entries
// for each batch and its second draw as glass), its landmarks into theirs, and the glass. A
// batch's shader depends on its geometry's attributes, which an empty batch does not have yet.
export function proxyWarmup(geo, landmarks = []) {
  geometryFor(geo).refs--;
  trimCache();
  const out = [];
  for (const part of PARTS) if (geo.parts[part.name]) {
    const b = batchFor(part);
    out.push(b.mesh);
    if (b.glass) out.push({ object: b.mesh, material: b.glass }, b.standIn);
  }
  for (const L of landmarks) {
    const p = props.byName.get(L.name);
    if (!p?.parts || landmarkGeometry.has(L.name)) continue;
    landmarkGeometry.set(L.name, landmarkBatch().addGeometry(propBatchGeometry(p, PROXY.glow)));
  }
  if (landmarkGeometry.size) out.push(landmarkBatch().mesh);
  return [...out, ...glassFor().objects];
}

function trimCache() {
  for (const [source, entry] of cache) {
    if (cache.size <= MAX_CACHE && cacheBytes <= MAX_BYTES) break;
    if (entry.refs) continue;   // visible/travelling cubes are pinned
    release(source, entry);
  }
}
function release(source, entry) {
  for (const { batch, id } of entry.parts) batch.mesh.deleteGeometry(id);
  cacheBytes -= entry.bytes; cache.delete(source);
}

function geometryFor(geo) {
  let entry = cache.get(geo);
  if (entry) { cache.delete(geo); cache.set(geo, entry); entry.refs++; return entry; }
  const parts = [];
  let bytes = 0;
  for (const part of PARTS) {
    const arrays = geo.parts[part.name];
    if (!arrays) continue;
    const batch = batchFor(part), geometry = partGeometry(arrays);
    parts.push({ batch, id: batch.addGeometry(geometry) });
    for (const a of [arrays.pos, arrays.nor, arrays.col, arrays.uv, arrays.index]) if (a) bytes += a.byteLength;
  }
  const [x0, y0, z0, x1, y1, z1] = geo.bounds;
  const box = new THREE.Box3(new THREE.Vector3(0, -BASE, 0), new THREE.Vector3(N, CUBE_H - BASE, N))
    .union(new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)));
  entry = { parts, scale: geo.scale, bounds: box, bytes, refs: 1 };
  cache.set(geo, entry); cacheBytes += bytes; trimCache();
  return entry;
}

// what of a cube's props shows in the surroundings: its landmarks (map.rewardSites[].landmark) and
// its theme's little set pieces (map.vignettes, cubegen/vignettes.js), [{ name, x, y, z, yaw }]
// (the town's tiles: all they are dressed with, its houses and trees too: the town is one place,
// docs/town.md)
export const shownFar = map => map.town ? map.town.placements
  : [...(map.rewardSites || []).map(s => s.landmark).filter(Boolean), ...(map.vignettes || [])];

// landmarks: shownFar(map); their geometry is the catalog's
function addLandmarks(g) {
  if (g.disposed) return;
  for (const L of g.landmarks) {
    const p = props.byName.get(L.name);
    if (!p?.parts) continue;
    const batch = landmarkBatch();
    if (!landmarkGeometry.has(L.name)) landmarkGeometry.set(L.name, batch.addGeometry(propBatchGeometry(p, PROXY.glow)));
    g.instances.push({ batch, id: batch.addInstance(landmarkGeometry.get(L.name)), local: propMatrix(L), at: null });
  }
}

function proxy(geo, open, landmarks = []) {
  const geometry = geometryFor(geo), group = new THREE.Object3D();
  makeFadable(group, 0);
  const s = geometry.scale, local = new THREE.Matrix4().makeScale(s, s, s);
  const g = { group, cull: { visible: false }, glass: glassState(open), geometry, landmarks, disposed: false,
    instances: geometry.parts.map(({ batch, id }) => ({ batch, id: batch.addInstance(id), local, at: null })) };
  // their prop sets may still have to be loaded
  const sets = [...new Set(landmarks.map(L => props.byName.get(L.name)?.set).filter(Boolean))];
  if (sets.every(propSetLoaded)) addLandmarks(g); else loadPropSets(sets).then(() => addLandmarks(g));
  return g;
}

// Reuse common cubes across refreshes and travel. Consume them from `reuse` so callers
// dispose/fade only the departing proxies. The full source/destination keep their own fades.
// shut: its room joins only through its portals (its glass glows, render/glass.js)
// dim: how much darker than the cube you are in it is drawn (materials.js NEIGHBOR_DIM)
export function buildNeighbors(list, reuse = []) {
  return list.map(({ key, geo, dx, dz, open, shut, landmarks, seams = null, dim = NEIGHBOR_DIM.world }) => {
    const index = reuse.findIndex(g => g.key === key && g.source === geo);
    const g = index < 0 ? { key, source: geo, ...proxy(geo, open, landmarks), base: new THREE.Vector3() }
      : reuse.splice(index, 1)[0];
    g.continuing = index >= 0;
    g.base.set(dx * N, 0, dz * N);
    g.group.position.copy(g.base);
    setGlassSeams(g.glass, seams);
    setGlassFaces(g.glass, open);
    setGlassShut(g.glass, shut);
    g.dim = dim;
    live.add(g);
    return g;
  });
}

export function disposeNeighbors(list) {
  for (const g of list) {
    live.delete(g); g.disposed = true;
    for (const { batch, id } of g.instances) batch.removeInstance(id);
    g.instances = [];
    g.geometry.refs--;
  }
  trimCache();
  sync();   // at once: the main menu, for one, draws without culling
}

export function clearNeighbors() { disposeNeighbors(current); current = []; }
export function clearNeighborCache() {
  // Call after clearing proxies on world reset. Live travel geometry is never invalidated.
  for (const [source, entry] of cache) if (!entry.refs) release(source, entry);
}
// instant: the new ones are there at once, not fading in (the town's tile handed over: what was
// the cube played in shows on as one of them, game/handover.js)
export function showNeighbors(list, instant = false) {
  const old = detachNeighbors();
  current = buildNeighbors(list, old);
  if (instant) for (const g of current) if (!g.continuing) setFade(g.group, 1);
  disposeNeighbors(old);
}
export const showsNeighbor = key => current.some(g => g.key === key);
export const liveNeighbors = () => [...live];   // every proxy drawn, travel's two sets too (tests)
export function detachNeighbors() { const c = current; current = []; return c; }
export function adoptNeighbors(list) { clearNeighbors(); current = list; }

// How far the neighbours are veiled (0..1: Flip's fight, game/flipworld.js state.void): gone
// altogether at 1, on top of every other fade
let veil = 0;
export function setNeighborVeil(k) { veil = Math.max(0, Math.min(1, k)); }
export function tickNeighbors(dt) {
  time += dt;
  for (const { group } of current) if (group.userData.fade < 1) setFade(group, Math.min(1, group.userData.fade + dt * 2.5));
  // lava glows and pulses out there as in the cube you are in
  for (const b of batches.values()) if (b.part?.kind === 'fluid') b.mesh.material.emissiveIntensity = fluidGlow(b.part.fluid, time);
}

// After camera, look/fog and cut updates, including both old/new sets during travel: culls
// whole cubes, then writes every proxy into the batches (sync).
// floor: the lowest height the player reveal may cut proxies at (see REVEAL)
export function cullNeighbors(x, z, revealPlayer = true, enabled = true, floor = -1e3) {
  reveal.value = revealPlayer ? 1 : 0;
  revealFloor.value = floor;
  camera.updateMatrixWorld();
  projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projection);
  for (const g of live) {
    if (!enabled) { g.cull.visible = false; continue; }
    const { position, userData } = g.group;
    bounds.copy(g.geometry.bounds).translate(position);
    const dx = Math.max(bounds.min.x - x, 0, x - bounds.max.x);
    const dz = Math.max(bounds.min.z - z, 0, z - bounds.max.z);
    const range = distanceFade(Math.hypot(dx, dz)) * (1 - veil);
    userData.rangeFadeU.value = range;
    // Fog is shader-only in Three.js. Skip boxes wholly beyond its opaque distance.
    bounds.getCenter(center); point.copy(center).applyMatrix4(camera.matrixWorldInverse);
    const radius = bounds.getSize(center).length() / 2;
    const fogged = scene.fog && -point.z - radius >= scene.fog.far;
    g.cull.visible = range > 0 && !fogged && frustum.intersectsBox(bounds);
  }
  sync();
}

// Every live proxy's place, fades and visibility into the batches and the glass; nothing else
// is drawn (instances of disposed proxies are gone, empty batches and glass hide).
function sync() {
  const boxes = [];
  for (const g of live) {
    const { position, userData } = g.group;
    const shown = g.cull.visible && g.group.visible;
    const fade = [userData.fadeU.value, userData.fadeInv.value, userData.rangeFadeU.value, 1 - (g.dim ?? 1)];
    for (const inst of g.instances) {
      const moved = !inst.at || !inst.at.equals(position);
      if (moved) { inst.at = position.clone(); place.makeTranslation(position.x, position.y, position.z).multiply(inst.local); }
      inst.batch.set(inst.id, moved ? place : null, fade, shown);
    }
    if (shown) boxes.push({ position, fade, state: g.glass });
  }
  for (const b of batches.values()) b.commit();
  if (live.size || glass) glassFor().update(boxes);
}

export const neighborStats = () => {
  const visible = [...live].filter(g => g.cull.visible && g.group.visible).length;
  return { live: live.size, visible, cached: cache.size, bytes: cacheBytes, distance: VIEW_DISTANCE,
    // what drawing them all costs: one call per batch in use, two for the glass
    draws: [...batches.values()].filter(b => b.mesh.visible).length + (visible ? 2 : 0),
    batchBytes: [...batches.values()].reduce((s, b) => s + Object.values(b.mesh.geometry.attributes)
      .reduce((t, a) => t + a.array.byteLength, b.mesh.geometry.index?.array.byteLength || 0), 0) };
};
