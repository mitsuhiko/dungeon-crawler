// The fixed lights of a cube and their baked shadows (the shaders' side: render/lighthook.js).
//
// A cube's fixed lights (lanterns, fires, lava, portals: what render/lightpool.js adoptLights
// finds in it that does not move) all shine all the time, each with its shadow, baked when the
// cube is shown:
//   - the lightmap (SETS RGBA8 atlases laid out in the worker, render/lightmap.js): for the sun
//     and eleven channels of lights, the signed distance of each texel of the cube's solids to
//     the shadow's edge, found by testing points round it against the light's shadow map. Drawn,
//     it gives shadow edges as sharp as a pixel, smooth, however close the camera comes.
//   - the volume (SETS RGBA8 textures, `voxel` a unit): how much of each light reaches each
//     point round the cube, for what is not lightmapped (props, figures, fluids). Its slices
//     (one a quarter unit up) lie side by side in one 2D picture, an atlas, so a light's slices
//     are one draw: a 3D texture took a draw (a render pass) for each, about 35 a light, which
//     cost the most on phones (their GPUs draw in tiles, a pass at a time).
//   - the sun's: a lightmap of its own (one channel, the signed distances like the lights') and
//     its shadow map of the fixed parts (for what is not lightmapped). Where the sun moves with
//     the time of day (under an open sky: game/daycycle.js setSunPlan, core/daycycle.js) each of
//     its places along its path is baked in turn, a little each frame (a step its shadow map, then
//     its lightmap in STRIPS strips), the next one ahead, and what shows is a blend of the two it
//     stands between (uBakeSunT: their lightmaps uBakeSunA and uBakeSunB, their shadow maps
//     uBakeSun and uBakeSun2; updateSun); a jump of the clock fades over.
// What the shadows are cast by: the cube's solids and its fixed props.
//
// Baking never holds a frame up: it goes a few steps a frame (tickBakes: the sun, then a light a
// step), as many as the GPU keeps up with (a fence after them: the next ones only once it has
// done them), while the cube is still faded out (entering through a
// portal it fades in after a moment; render/fade.js). Its lights stay dark until then and come on
// over FADE_IN, the baked shadows with them. A cube built again as it was (the quests' changes,
// a prop set come late) takes the bake it had at once (CACHE), and so does one walked into that
// was baked ahead, while the hero was still next door (game/bakeahead.js: `ahead`).
import * as THREE from 'three';
import { renderer, sun } from './scene.js';
import { BAKE, MAX_BAKED, SETS, NO_SUN, NO_VOL, lightTable, CELLS, CELL0, CELL_MAX, EDGE } from './lighthook.js';
import { lightCells as cellsOf } from '../core/lightcells.js';
import { NOON, NOON_KEY } from '../core/daycycle.js';
import { small } from './device.js';

const NEAR = 0.3;               // a light's shadow starts this far from it (not its own lamp's frame)
const CHANNELS = SETS * 4 - 1;  // channels for lights (the lightmap's first is not used: the sun has its own)
// bake steps a frame (a light each: its six shadow maps, its lightmap, its volume), at most, and no
// more than this many ms of the frame (at least a step): while the world shows, and behind the
// curtain (game/hud.js), where nothing else is drawn meanwhile (main.js)
const STEPS = 4, BUDGET = 3, HIDDEN_STEPS = 16, HIDDEN_BUDGET = 12;
const FADE_IN = 350;            // ms: a cube's lights and baked shadows come on over this, once baked
// on a small device (phones, tablets: render/device.js) fewer bakes kept (memory: ~10-28 MB each)
const CACHE = small ? 1 : 3;    // bakes of cubes no longer shown, kept to be taken again
export const AHEAD = small ? 1 : 3;   // cubes next door baked ahead (game/bakeahead.js)

// How finely a cube is baked (game/quality.js: for the cube baked next; the lightmap's texels
// a unit are the world worker's, chosen when the world starts: bakeDensity):
//   sunMap  texels a side of the sun's shadow map of the fixed parts
//   cubeMap texels a side of each light's cube of shadow maps (while baking)
//   voxel   volume samples a world unit (0: none, what is not lightmapped takes no fixed light's shadow)
//   density lightmap texels a world unit (render/lightmap.js)
//   sunLm   the sun's own lightmap that many times as fine (the same layout, a bigger picture: a
//           fence's rails, thinner than two of the lightmap's texels, kept their shape no better
//           than blobs in the sun's distances)
export const BAKE_DETAIL = {
  full: { sunMap: 2048, cubeMap: 1024, voxel: 4, density: 16, sunLm: 2 },
  light: { sunMap: 1024, cubeMap: 512, voxel: 2, density: 8, sunLm: 1 },
  lighter: { sunMap: 1024, cubeMap: 512, voxel: 0, density: 8, sunLm: 1 },
};
// (a small device bakes no finer than `light`, on any level: render/device.js)
const finest = small ? BAKE_DETAIL.light : BAKE_DETAIL.full;
let detail = finest;
export function setBakeDetail(name) {
  detail = BAKE_DETAIL[name] ?? BAKE_DETAIL.full;
  if (detail.sunMap > finest.sunMap) detail = finest;
}
export const bakeDensity = () => detail.density;

// the bakes of the cubes built (their lights follow them every frame: updateBakes)
const live = new Set();
// geometry of a cube (render/cubegeo.js, the same for a cube built again) -> its bake when it went
const kept = new Map();

// a cube's cells and the lights each takes (lightCells): CELL_MAX / 4 texels a cell, four indices each
const cellTable = () => {
  const t = new THREE.DataTexture(new Float32Array(CELL_MAX * CELLS * CELLS).fill(-1), CELL_MAX / 4, CELLS * CELLS, THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
};
const uniformsOf = () => ({
  uBakeEdge: { value: new THREE.Vector2(1e-4, 1e-4) },
  uBakeR: { value: 0 }, uBakeN: { value: 0 }, uBakeT: { value: lightTable(MAX_BAKED) }, uBakeC: { value: cellTable() }, uBakeO: { value: new THREE.Vector3() },
  ...Object.fromEntries(Array.from({ length: SETS }, (_, i) => [['uBakeLm' + i, { value: null }], ['uBakeVol' + i, { value: NO_VOL }]]).flat()),
  uBakeV0: { value: new THREE.Vector3() }, uBakeVS: { value: new THREE.Vector3(1, 1, 1) }, uBakeVD: { value: new THREE.Vector4(1, 1, 1, 1) },
  uBakeSun: { value: NO_SUN }, uBakeSunM: { value: new THREE.Matrix4() },
  uBakeSunA: { value: null }, uBakeSunB: { value: null }, uBakeSunT: { value: 0 },
  uBakeSun2: { value: NO_SUN }, uBakeSunM2: { value: new THREE.Matrix4() },
  uBakeSunPA: { value: new THREE.Vector4() }, uBakeSunPB: { value: new THREE.Vector4() }, uBakeSunD: { value: new THREE.Vector3() }, uBakeSunX: { value: new THREE.Vector4(1, 1, 0, 0) },
});

// A new cube's bake: its uniforms exist before it is baked (its lights dark until then).
// group: the cube's (render/world.js); flip: Flip's turning box, not baked (its lights are moving
// ones); map: the cube's (where its sun stands: setSunPlan)
export function newBake(geo, group, flip = false, map = null) {
  const bake = { geo, group, flip, map, lights: [], cells: -1, ready: false, failed: false, job: null, readyAt: 0, owned: null, u: uniformsOf(), sun: newSun() };
  // (its shadows' edges at least EDGE wide, in its distances: render/lighthook.js)
  const density = geo?.lightmap?.density ?? 16;
  bake.u.uBakeEdge.value.set(EDGE * density / (2 * SUN_RANGE), EDGE * density / (2 * RANGE));
  live.add(bake);
  return bake;
}

// a fixed light of the cube: where it is in the cube (it is taken out of the scene: the shaders
// walk the list instead); false if the cube has as many as it can take. holder: what it hung on
// (it shines only while that shows: a portal's gate hidden once its face opens)
export function addBakedLight(bake, light, group, holder = group) {
  if (bake.lights.length >= MAX_BAKED) return false;
  group.updateWorldMatrix(true, true);
  const at = light.getWorldPosition(new THREE.Vector3());
  group.worldToLocal(at);
  bake.lights.push({ light, at, holder, channel: -1, twin: null });
  bake.cells = -1;   // (its cells are laid out again: lightCells)
  return true;
}

// how bright a light gets (`peak`: one lit at night only is dark by day, render/night.js)
const peak = l => l.userData.peak ?? l.intensity;
// which fixed lights each cell of the cube takes (core/lightcells.js), in its table by their place
// in the cube's list (the row each has in uBakeT)
function lightCells(bake) {
  const t = bake.u.uBakeC.value;
  t.image.data.set(cellsOf(bake.lights.map(s => ({ x: s.at.x, z: s.at.z, reach: s.light.distance || 6, intensity: peak(s.light) })),
    { cells: CELLS, from: CELL0, max: CELL_MAX }));
  t.needsUpdate = true;
  bake.cells = bake.lights.length;
}

// whether a fixed light's holder shows (all the way up to its cube)
const shows = (s, group) => { for (let o = s.holder; o && o !== group; o = o.parent) if (!o.visible) return false; return s.light.visible; };

// The cube's solids drawn with their baked shadows (render/partmeshes.js): their lightmap's
// texels (attribute lm).
export function bakedSurface(mat, bake) {
  if (!bake) return mat;
  mat.defines = { ...mat.defines, BAKED_LM: '' };
  const compile = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    compile.call(mat, sh, r);
    sh.vertexShader = 'attribute vec2 lm;\nvarying vec2 vBakeLm;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vBakeLm = lm;');
  };
  return mat;
}

// Everything a cube is built of shows its own cube's lights and shadows (also while travelling,
// when another cube is the one played in). Like render/fade.js: a cube's materials are its own.
export function bakeMaterials(group, bake) {
  group.traverse(o => {
    if (o.material) for (const m of [].concat(o.material)) {
      if (m.userData.bakeU) continue;
      m.userData.bakeU = bake.u;
      const compile = m.onBeforeCompile;
      m.onBeforeCompile = (sh, r) => {
        compile.call(m, sh, r);
        if ('uBakeOn' in sh.uniforms) Object.assign(sh.uniforms, bake.u);
      };
    }
  });
}

// the fixed parts stay out of three's shadow map of the sun: their shadows are baked
function outOfSun(mesh) {
  const own = Object.getPrototypeOf(mesh).intersectsFrustum;
  mesh.intersectsFrustum = function (f) { return f !== sun.shadow._frustum && own.call(this, f); };
}
// what casts the baked shadows: the solids and the props that cast shadows (render/fade.js turns
// a faded cube's off: cast0 is what they do); and the sun's only, things that stand still but may
// show or hide (`sunCast`: the portals' gates, render/markers.js), baked again when they do
// (updateSun)
const isSolid = o => o.isMesh && !o.isInstancedMesh && (o.userData.part === 'terrain' || o.userData.part === 'stone' || o.userData.part === 'wood') && !o.userData.cap;
const isProp = o => o.isInstancedMesh && (o.userData.cast0 ?? o.castShadow) && o.userData.sharedGeo;
const isStill = o => o.isMesh && !o.isInstancedMesh && o.userData.sunCast && (o.userData.cast0 ?? o.castShadow);
export function fixedParts(group) {
  const solids = [], props = [], still = [];
  group.traverse(o => { if (isSolid(o)) solids.push(o); else if (isProp(o)) props.push(o); else if (isStill(o)) still.push(o); });
  return { solids, props, still };
}
export function keepFixedOutOfSun(group) {
  const { solids, props, still } = fixedParts(group);
  for (const m of [...solids, ...props, ...still]) outOfSun(m);
}
// whether o shows (all the way up to its cube)
const showing = (o, group) => { for (; o && o !== group; o = o.parent) if (!o.visible) return false; return true; };

// Per frame: the cubes' lights where the cubes are now, as bright as they shine now, and how far
// their bakes have come on.
export function updateBakes() {
  const now = performance.now();
  for (const b of live) { updateBake(b, now); updateSun(b, now); }
}
const smooth = t => t * t * (3 - 2 * t);
function updateBake(bake, now) {
  const group = bake.group;
  group.getWorldPosition(bake.u.uBakeO.value);
  // (not baked: its lights shine without shadows, a failed bake, none at all for Flip's box)
  const on = bake.ready ? smooth(Math.min(1, (now - bake.readyAt) / FADE_IN)) : 0;
  const plain = bake.failed, lit = plain ? 1 : on;
  bake.lit = lit;
  bake.u.uBakeR.value = plain ? 0 : on;
  if (bake.cells !== bake.lights.length) lightCells(bake);
  // every light keeps its row (the cells point at it); one dark, hidden or the cube faded out
  // reaches nothing
  const table = bake.u.uBakeT.value, L = table.image.data, fade = group.visible ? (group.userData.fade ?? 1) * lit : 0;
  bake.lights.forEach((s, i) => {
    const l = s.light, o = i * 8, k = l.intensity * fade, on = k > 0 && shows(s, group);
    L[o] = s.at.x; L[o + 1] = s.at.y; L[o + 2] = s.at.z; L[o + 3] = on ? l.distance || 1e3 : 0;
    L[o + 4] = l.color.r * k; L[o + 5] = l.color.g * k; L[o + 6] = l.color.b * k; L[o + 7] = bake.ready && !plain ? s.channel : -1;
  });
  const n = fade > 0 ? bake.lights.length : 0;
  if (n || bake.u.uBakeN.value) table.needsUpdate = true;
  bake.u.uBakeN.value = n;
}

// the cube being played in: its lights and shadows for everything not built with it, and the
// scene's sun where its sun stands (what moves casts its shadows that way: render/scene.js)
const noon = new THREE.Vector3(...NOON), toward = new THREE.Vector3();
export function setCurrentBake(bake) {
  const dir = !bake ? noon : bake.ready && bake.sun.A ? bake.sun.step : toward.set(...planOf(bake).a.dir);
  sun.position.copy(sun.target.position).addScaledVector(dir, SUN_DIST);
  if (!bake) { BAKE.uBakeN.value = 0; BAKE.uBakeR.value = 0; return; }
  for (const k in bake.u) BAKE[k].value = bake.u[k].value;
}

// A cube's bake when it goes: kept a while (a cube built again takes it), else let go.
export function disposeBake(bake) {
  if (!bake) return;
  live.delete(bake);
  bake.job?.return();
  bake.job = null;
  if (bake.ready && !bake.failed && bake.owned) {
    stopSunJob(bake.sun);
    kept.delete(bake.geo);
    kept.set(bake.geo, { sig: bake.sig, owned: bake.owned, channels: bake.lights.map(s => s.channel), u: bake.u, sun: bake.sun });
    while (kept.size > CACHE) { const [g, k] = kept.entries().next().value; kept.delete(g); release(k.owned); releaseSun(k.sun); }
  } else {
    if (bake.owned) release(bake.owned);
    releaseSun(bake.sun);
  }
  bake.u.uBakeT.value.dispose(); bake.u.uBakeC.value.dispose();
  bake.owned = null;
  bake.ready = false;
}
function release(owned) {
  for (const t of owned.targets) t.dispose();
}

// ---- baking ----

// whether a cube's lights are baked (or never will be)
// how far a cube's fixed lights are on (0 until it is baked, fading in to 1: updateBake)
export const bakeLit = bake => !bake ? 1 : bake.flip ? 1 : bake.lit ?? 0;
export const baked = world => !world?.bake || world.bake.ready || world.bake.failed || world.bake.flip;

// Bake what is shown a little each frame: the cube played in first, then the others (a cube
// travelled into is the one played in from the start), then those built to be baked ahead
// (`ahead`: never shown, game/bakeahead.js; their suns follow the time of day like the others').
// Before drawing (main.js), after anything that builds the cube again. hidden: nothing shows
// (game/hud.js curtained): all at once.
//
// How many steps a frame: as many as the GPU keeps up with. A fence goes in after a frame's
// steps; while INFLIGHT frames' steps are not done yet, no more are given (a step is a few ms on a
// desktop's GPU, tens on a weak one: counted on the CPU, the budget never saw them). A GPU that
// cannot keep up with the frames themselves runs a frame or more behind, so one frame's steps
// may still wait while the next ones are given. Each frame with none waiting, one step more (up
// to STEPS / HIDDEN_STEPS); one that has to wait, back to one.
const INFLIGHT = 2;
const fences = [];
let pace = 1;
const gl = renderer.getContext();
// (the perf overlay, game/perf.js: frames that baked, waited for the GPU, steps taken)
export const bakeStats = { frames: 0, waits: 0, steps: 0, suns: 0 };
function gpuDone() {
  while (fences.length && gl.getSyncParameter(fences[0], gl.SYNC_STATUS) === gl.SIGNALED) gl.deleteSync(fences.shift());
  if (fences.length >= INFLIGHT) { pace = 1; bakeStats.waits++; return false; }
  if (fences.length) pace = Math.max(1, pace - 1);
  return true;
}
// learn: light.html#bake (see learn/README.md)
export function tickBakes(current, hidden = false) {
  const start = performance.now();
  const bakes = [current?.bake, ...live].filter((b, i, a) => b && a.indexOf(b) === i && (b.group.parent || b.ahead))
    .sort((a, b) => (a.ahead ? 1 : 0) - (b.ahead ? 1 : 0));
  const order = bakes.filter(b => !b.ready && !b.failed && !b.flip);
  // (none to bake: the sun's next places where it moves, the cube played in first: updateSun)
  const suns = order.length ? [] : bakes.filter(b => b.ready && b.sun.job);
  if (suns.length && gpuDone()) bakeSun(suns[0], start, hidden);
  if (order.length && gpuDone()) for (const bake of order) {
    if (!bake.job) {
      if (takeKept(bake)) continue;
      bake.job = bakeSteps(bake);
    }
    const saved = saveState(), most = hidden ? HIDDEN_STEPS : STEPS, budget = hidden ? HIDDEN_BUDGET : BUDGET;
    let steps = 0;
    try {
      for (; steps < Math.min(pace, most) && (steps === 0 || performance.now() - start < budget); steps++)
        if (bake.job.next().done) { bake.job = null; if (hidden) bake.readyAt = -Infinity; break; }   // (baked unseen: on at once)
    } catch (e) {
      console.error('bake failed', e);
      bake.failed = true; bake.job = null;
    } finally { restoreState(saved); }
    bakeStats.frames++; bakeStats.steps += steps;
    if (bake.job) { fences.push(gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)); pace = Math.min(most, pace + 1); }
    break;   // (one cube a frame)
  }
  // (the light's cube of shadow maps is only needed while baking)
  if (!order.some(b => b.job) && shared.light?.shadow.map) shared.light.shadow.dispose();
}

// one of the sun's places a little further (tickBakes)
function bakeSun(bake, start, hidden) {
  const S = bake.sun, saved = saveState(), most = hidden ? HIDDEN_STEPS : STEPS, budget = hidden ? HIDDEN_BUDGET : BUDGET;
  let steps = 0;
  try {
    for (; steps < Math.min(pace, most) && (steps === 0 || performance.now() - start < budget); steps++) {
      const r = S.job.next();
      if (r.done) { S.keys.set(r.value.id, r.value); S.job = null; S.jobId = null; bakeStats.suns++; break; }
    }
  } catch (e) {
    console.error('sun bake failed', e);
    stopSunJob(S); S.broken = true;   // (it stays where it was)
  } finally { restoreState(saved); }
  bakeStats.frames++; bakeStats.steps += steps;
  if (S.job) { fences.push(gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)); pace = Math.min(most, pace + 1); }
}

// what the cube looks like to its shadows: its lights and props (its solids are its geometry;
// the sun's places are baked as it goes)
function signature(bake) {
  const { props } = fixedParts(bake.group), r = v => Math.round(v * 100);
  const lights = bake.lights.map(s => [r(s.at.x), r(s.at.y), r(s.at.z), r(s.light.distance)].join(',')).join(';');
  const things = props.map(p => { let h = 0; const a = p.instanceMatrix.array; for (let i = 12; i < a.length; i += 16) h += a[i] * 3 + a[i + 1] * 5 + a[i + 2] * 7; return p.name + ':' + p.count + ':' + r(h); }).join(';');
  return lights + '|' + things;
}
// the bake the cube had when it was last built, if it looks the same
function takeKept(bake) {
  bake.sig = signature(bake);
  const k = kept.get(bake.geo);
  if (!k || k.sig !== bake.sig) return false;
  kept.delete(bake.geo);
  bake.owned = k.owned;
  bake.sun = k.sun; bake.sun.at = 0;
  bake.lights.forEach((s, i) => { s.channel = k.channels[i]; });
  for (const key in bake.u) if (!['uBakeR', 'uBakeN', 'uBakeT', 'uBakeC', 'uBakeO'].includes(key)) bake.u[key].value = k.u[key].value;
  bake.ready = true; bake.readyAt = -Infinity;
  return true;
}

function saveState() {
  const s = { target: renderer.getRenderTarget(), auto: renderer.autoClear, clear: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha() };
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 0);
  return s;
}
function restoreState(s) {
  renderer.setRenderTarget(s.target);
  renderer.autoClear = s.auto;
  renderer.setClearColor(s.clear, s.alpha);
}

// Lights whose reaches overlap get different channels: the brightest first, each the first
// channel none of its neighbours has. (Reaches overlap only where both are faint: beyond REACH of
// its reach a light gives less than a fortieth of what it gives at a unit.) A light left without
// one takes the shadow of one next to it (TWIN: the lanterns on a string), else none (-1).
// twin: the light whose shadow it shares (not baked itself).
const REACH = 0.85, TWIN = 1.2;
// learn: light.html#pots #pots-code (see learn/README.md)
function assignChannels(lights) {
  const order = [...lights].sort((a, b) => peak(b.light) * b.light.distance ** 2 - peak(a.light) * a.light.distance ** 2);
  for (const s of order) { s.channel = -1; s.twin = null; }
  for (const s of order) {
    const taken = new Set();
    for (const t of order) if (t !== s && t.channel > 0 && !t.twin && t.at.distanceTo(s.at) < (s.light.distance + t.light.distance) * REACH) taken.add(t.channel);
    for (let c = 1; c <= CHANNELS; c++) if (!taken.has(c)) { s.channel = c; break; }
    if (s.channel > 0) continue;
    const near = order.filter(t => t.channel > 0 && !t.twin && t.at.distanceTo(s.at) < TWIN).sort((a, b) => a.at.distanceTo(s.at) - b.at.distanceTo(s.at))[0];
    if (near) { s.channel = near.channel; s.twin = near; }
  }
}

// a stand-in of a mesh (same geometry and material, where it is now) for the bake's own scenes
function standIn(o) {
  const m = o.isInstancedMesh ? new THREE.InstancedMesh(o.geometry, o.material, o.count) : new THREE.Mesh(o.geometry, o.material);
  if (o.isInstancedMesh) { m.instanceMatrix = o.instanceMatrix; m.count = o.count; m.computeBoundingSphere(); }
  m.matrixAutoUpdate = false; m.matrixWorldAutoUpdate = false;
  o.updateWorldMatrix(true, false);
  m.matrix.copy(o.matrixWorld); m.matrixWorld.copy(o.matrixWorld);
  m.castShadow = true;
  return m;
}

const VERT = `
attribute vec2 lm;
varying vec3 vW, vN;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = vec4(lm * 2.0 - 1.0, 0.0, 1.0);
}`;
// a point's visibility: SUN from the sun's shadow map, else from the light's cube of shadow maps
const VISIBLE = `
uniform vec3 uLight, uSunDir;
uniform float uNear, uFar;
#ifdef SUN
  uniform highp sampler2D uMap;
  uniform mat4 uMapM;
  uniform vec2 uTexel;   // the map's texel and depth, in world units
#else
  uniform highp samplerCubeShadow uMap;
#endif
float visibleAt(vec3 q, vec3 n, bool facing) {
  #ifdef SUN
    float nl = dot(n, uSunDir);
    if (facing && nl <= 0.0) return 0.0;
    // (the map holds the first surface the sun sees, this one too: off it by a texel or two
    // along its normal, more the more it turns from the sun, and as much leeway in depth;
    // render/lighthook.js bakeSunAt the same)
    nl = clamp(nl, 0.1, 1.0);
    vec4 c = uMapM * vec4(q + n * uTexel.x * (1.0 + 1.5 * (1.0 - nl)), 1.0);
    c.xyz /= c.w;
    if (any(lessThan(c.xyz, vec3(0.0))) || any(greaterThan(c.xyz, vec3(1.0)))) return 1.0;
    float bias = uTexel.x * (0.5 + min(3.0, sqrt(1.0 - nl * nl) / nl)) / uTexel.y;
    return step(c.z - bias, texture(uMap, c.xy).r);   // (read raw: render/lighthook.js bakeSunAt)
  #else
    vec3 L = q + n * 0.02 - uLight;
    if (facing && dot(n, L) >= 0.0) return 0.0;
    vec3 a = abs(L);
    float z = max(max(a.x, a.y), a.z);
    if (z < uNear) return 1.0;
    float dp = (uFar * (z - uNear)) / (z * (uFar - uNear));
    return texture(uMap, vec4(L, dp - 0.0005));
  #endif
}`;
// The lightmap of one light: each texel's signed distance (in texels, +-range, 0.5 on the edge)
// to the nearest point on its plane the light reaches differently, from points `step` texels
// apart round it; only where a coarse look round (`coarse` texels apart, n each way) finds both.
// Written into its channel (MAX). The sun's reaches farther (SUN_RANGE, more coarsely): blending
// two of its places' distances (render/lighthook.js) moves an edge from one to the other as long
// as it moved less than that, and its tall things' shadows move up to about 5 texels from one
// place to the next.
const RANGE = 1.5, SUN_RANGE = 5;

const frag = (range, coarse, n, step) => VISIBLE + `
uniform vec4 uMask;
uniform float uReach;
varying vec3 vW, vN;
void main() {
  vec3 n = normalize(vN), dx = dFdx(vW), dy = dFdy(vW);
  #ifndef SUN
    if (distance(vW, uLight) > uReach + 2.0 * length(dx) + 2.0 * length(dy)) discard;
  #endif
  float c = step(0.5, visibleAt(vW, n, true));
  bool both = false;
  for (int j = -${n}; j <= ${n} && !both; j++) for (int i = -${n}; i <= ${n}; i++) {
    vec2 o = vec2(i, j) * ${coarse.toFixed(3)};
    if (step(0.5, visibleAt(vW + dx * o.x + dy * o.y, n, true)) != c) { both = true; break; }
  }
  float d = ${range.toFixed(3)};
  if (both) {
    for (int j = -${Math.round(range / step)}; j <= ${Math.round(range / step)}; j++) for (int i = -${Math.round(range / step)}; i <= ${Math.round(range / step)}; i++) {
      vec2 o = vec2(i, j) * ${step.toFixed(3)};
      float l = length(o);
      if (l >= d + ${(step / 2).toFixed(3)}) continue;
      if (step(0.5, visibleAt(vW + dx * o.x + dy * o.y, n, true)) != c) d = l - ${(step / 2).toFixed(3)};
    }
  }
  float s = clamp(0.5 + (c > 0.5 ? d : -d) / ${(2 * range).toFixed(3)}, 0.0, 1.0);
  gl_FragColor = uMask * s;
}`;
const FRAG = frag(RANGE, RANGE / 2, 2, 0.25), SUN_FRAG = frag(SUN_RANGE, SUN_RANGE / 3, 3, 0.5);
// The volume: one slice of it, how much of the light reaches each voxel (four points in it)
const VOL_VERT = `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
// (the volume's atlas: uVD the samples across, up and deep, and the slices a row; this pixel's
// tile is its slice, where it is in the tile where it is across and deep)
const VOL_FRAG = VISIBLE + `
uniform vec4 uMask, uVD;
uniform vec3 uV0, uVS, uO;
uniform float uReach, uStep;
void main() {
  vec2 px = floor(gl_FragCoord.xy), tile = floor(px / uVD.xz);
  float z = tile.y * uVD.w + tile.x;
  if (z >= uVD.y) discard;
  vec2 uv = (px - tile * uVD.xz + 0.5) / uVD.xz;
  vec3 p = uV0 + vec3(uv.x, (z + 0.5) / uVD.y, uv.y) * uVS + uO;
  if (distance(p, uLight) > uReach + uStep) discard;
  float v = 0.0;
  for (int k = 0; k < 4; k++) {
    vec3 o = (vec3(k & 1, (k >> 1) & 1, ((k + 1) >> 1) & 1) - 0.5) * 0.5 * uStep;
    v += visibleAt(p + o, vec3(0.0), false);
  }
  gl_FragColor = uMask * (v * 0.25);
}`;
// the lightmap's empty texels (round the charts) take the nearest charted one's values
const FILL_FRAG = `
uniform sampler2D uMap, uCover;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  if (texture2D(uCover, vUv).r > 0.5) { gl_FragColor = texture2D(uMap, vUv); return; }
  float best = 1e9;
  vec4 v = vec4(0.0);
  for (int j = -3; j <= 3; j++) for (int i = -3; i <= 3; i++) {
    vec2 q = vUv + vec2(i, j) * uTexel;
    float d = float(i * i + j * j);
    if (d < best && texture2D(uCover, q).r > 0.5) { best = d; v = texture2D(uMap, q); }
  }
  gl_FragColor = v;
}`;

// The sun's the same, smoothed: within its chart (the cover, never across into another), a little
// Gaussian over its distances (5 x 5). The edge stays as sharp as before, it only loses the steps
// the texels and the shadow map's pixels left in it, which changed from one of the sun's places
// to the next and made the edges crawl as it went.
const SUN_FILL_FRAG = `
uniform sampler2D uMap, uCover;
uniform vec2 uTexel;
varying vec2 vUv;
const float G[3] = float[3](6.0, 4.0, 1.0);
void main() {
  if (texture2D(uCover, vUv).r > 0.5) {
    float sum = 0.0, weight = 0.0;
    for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
      vec2 q = vUv + vec2(i, j) * uTexel;
      if (texture2D(uCover, q).r < 0.5) continue;
      float w = G[i < 0 ? -i : i] * G[j < 0 ? -j : j];
      sum += texture2D(uMap, q).r * w; weight += w;
    }
    gl_FragColor = vec4(sum / weight);
    return;
  }
  float best = 1e9;
  vec4 v = vec4(0.0);
  for (int j = -3; j <= 3; j++) for (int i = -3; i <= 3; i++) {
    vec2 q = vUv + vec2(i, j) * uTexel;
    float d = float(i * i + j * j);
    if (d < best && texture2D(uCover, q).r > 0.5) { best = d; v = texture2D(uMap, q); }
  }
  gl_FragColor = v;
}`;

const MAX_BLEND = { blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  depthTest: false, depthWrite: false, side: THREE.DoubleSide };
const shared = {};
function materials() {
  if (shared.point) return shared;
  const u = () => ({ uLight: { value: new THREE.Vector3() }, uSunDir: { value: new THREE.Vector3() }, uNear: { value: NEAR }, uFar: { value: 1 },
    uMap: { value: null }, uMapM: { value: new THREE.Matrix4() }, uMask: { value: new THREE.Vector4() }, uReach: { value: 1 }, uTexel: { value: new THREE.Vector2(1, 1) } });
  shared.sun = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: SUN_FRAG, uniforms: u(), defines: { SUN: '' }, ...MAX_BLEND });
  shared.point = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: u(), ...MAX_BLEND });
  shared.cover = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }', side: THREE.DoubleSide, depthTest: false, depthWrite: false });
  shared.vol = new THREE.ShaderMaterial({ vertexShader: VOL_VERT, fragmentShader: VOL_FRAG,
    uniforms: { ...u(), uV0: { value: new THREE.Vector3() }, uVS: { value: new THREE.Vector3() }, uO: { value: new THREE.Vector3() }, uVD: { value: new THREE.Vector4() }, uStep: { value: 1 } }, ...MAX_BLEND });
  shared.fill = new THREE.ShaderMaterial({ vertexShader: VOL_VERT, fragmentShader: FILL_FRAG,
    uniforms: { uMap: { value: null }, uCover: { value: null }, uTexel: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false });
  shared.sunFill = new THREE.ShaderMaterial({ vertexShader: VOL_VERT, fragmentShader: SUN_FILL_FRAG,
    uniforms: { uMap: { value: null }, uCover: { value: null }, uTexel: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false });
  shared.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), shared.vol);
  shared.quad.frustumCulled = false;
  shared.quadScene = new THREE.Scene();
  shared.quadScene.add(shared.quad);
  shared.light = new THREE.PointLight(0xffffff, 1, 1, 2);
  shared.light.castShadow = true;
  shared.light.shadow.camera.near = NEAR;
  shared.light.shadow.bias = 0;
  shared.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  // (three.js draws shadow maps only inside a render: one of nothing, the light alone in the
  // scene, into a texel nobody looks at)
  shared.nowhere = new THREE.OrthographicCamera(-1e-3, 1e-3, 1e-3, -1e-3, 1e6, 1e6 + 1e-3);
  shared.dummy = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  return shared;
}
// The sun's shadow map of the fixed parts holds the first surface the sun sees: both sides of
// everything drawn (three draws the far sides only, so where a wall meets the ground its shaded
// side stood as far from the sun as the ground beside it, and the ground at its foot and round
// its corners came out lit). What is lit sees itself in the map then: the readers keep off it
// (VISIBLE, render/lighthook.js bakeSunAt).
function sunPass(light, casters) {
  const sides = new Map();
  casters.traverse(o => { if (o.material) for (const m of [].concat(o.material)) if (!sides.has(m)) { sides.set(m, m.shadowSide); m.shadowSide = THREE.DoubleSide; } });
  try { shadowPass(light, casters); } finally { for (const [m, side] of sides) m.shadowSide = side; }
}
function shadowPass(light, casters) {
  casters.add(light);
  renderer.setRenderTarget(shared.dummy);
  renderer.render(casters, shared.nowhere);
  casters.remove(light);
}
const MASKS = [0, 1, 2, 3].map(i => new THREE.Vector4(...[0, 1, 2, 3].map(j => +(i === j))));

// The baking's programs compiled ahead (render/cubeassets.js warmCube), so the first cube baked
// does not wait for the driver: its own, for render targets and scenes without the world's lights
// and fog (compiled for the screen they were others, and the first bake compiled them all while
// drawing), and three's
// programs of the shadow maps it draws, made only when one is drawn: a sun's and a light's, drawn
// once over a plain and an instanced mesh.
let warmed = false;
export function warmBake() {
  if (warmed) return [];
  warmed = true;
  const S = materials(), g = new THREE.BufferGeometry(), bare = new THREE.Scene();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setAttribute('lm', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  const box = new THREE.BoxGeometry(), stuff = new THREE.MeshStandardMaterial(), casters = new THREE.Scene();
  for (const m of [new THREE.Mesh(box, stuff), new THREE.InstancedMesh(box, stuff, 1)]) { m.castShadow = true; casters.add(m); }
  const sunlight = new THREE.DirectionalLight();
  sunlight.castShadow = true; sunlight.shadow.mapSize.set(16, 16);
  S.light.shadow.mapSize.set(16, 16); S.light.shadow.dispose();
  const saved = saveState();
  try { sunPass(sunlight, casters); shadowPass(S.light, casters); } finally {
    restoreState(saved);
    sunlight.shadow.dispose(); S.light.shadow.dispose(); box.dispose(); stuff.dispose();
  }
  return [S.sun, S.point, S.cover, S.vol, S.fill, S.sunFill].map(m => ({ object: new THREE.Mesh(g, m), material: m, scene: bare, offscreen: true }));
}

// The bake's own scenes of a cube: what casts its shadows (its solids and fixed props), what is
// lightmapped (its solids), as they stand now, and where the cube is
function scenesOf(bake) {
  const group = bake.group;
  group.updateWorldMatrix(true, true);
  const origin = group.getWorldPosition(new THREE.Vector3());
  const { solids, props, still } = fixedParts(group);
  const casters = new THREE.Scene(), sunCasters = new THREE.Scene(), lit = new THREE.Scene();
  for (const o of [...solids, ...props]) { casters.add(standIn(o)); sunCasters.add(standIn(o)); }
  for (const o of still) if (showing(o, group)) sunCasters.add(standIn(o));
  for (const o of solids) { const m = standIn(o); m.frustumCulled = false; lit.add(m); }
  bake.still = still;
  return { origin, casters, sunCasters, lit, solids };
}
// which of the still casters show (updateSun: baked again when that changes)
const stillShown = bake => (bake.still ??= fixedParts(bake.group).still).map(o => showing(o, bake.group) ? 1 : 0).join('');

// The steps of a bake (tickBakes runs them a few a frame): the sun where it stands, then each light.
function* bakeSteps(bake) {
  const S = materials(), geo = bake.geo;
  if (!geo?.lightmap) { bake.failed = true; return; }
  const scenes = scenesOf(bake), { origin, lit } = scenes;
  if (!scenes.solids.length) { bake.failed = true; return; }
  const { w, h } = geo.lightmap, D = detail;
  // (the bake light's cube of shadow maps at this bake's size)
  if (S.light.shadow.mapSize.x !== D.cubeMap) { S.light.shadow.mapSize.set(D.cubeMap, D.cubeMap); S.light.shadow.dispose(); }
  const target = () => {
    const t = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: false });
    renderer.setRenderTarget(t); renderer.clear(); return t;
  };
  const owned = { targets: [] }, temp = [];
  let done = false;
  try {
    const lm = Array.from({ length: SETS }, target), cover = target();
    temp.push(...lm, cover);
    // where the charts are, for the lights and (as fine as the sun's lightmap: kept, its places
    // are baked as it goes) for the sun
    const sunCover = sunTarget(w * D.sunLm, h * D.sunLm);
    owned.targets.push(sunCover);
    bake.sun.cover = sunCover;
    bake.u.uBakeEdge.value.x = EDGE * geo.lightmap.density * D.sunLm / (2 * SUN_RANGE);
    lit.overrideMaterial = S.cover;
    for (const t of [cover, sunCover]) { renderer.setRenderTarget(t); renderer.render(lit, S.camera); }
    lit.overrideMaterial = null;
    // the volume round the cube
    const b = geo.bounds, v0 = bake.u.uBakeV0.value, vs = bake.u.uBakeVS.value;
    v0.set(-1, b[1] - 1, -1);
    vs.set(b[3] + 1 - -1, b[4] + 2 - (b[1] - 1), b[5] + 1 - -1);
    // (VX across, VY up: its slices, VZ deep; COLS slices a row of the atlas)
    const V = D.voxel, VX = Math.ceil(vs.x * V), VY = Math.ceil(vs.y * V), VZ = Math.ceil(vs.z * V);
    const COLS = Math.ceil(Math.sqrt(VY)), ROWS = Math.ceil(VY / COLS);
    const volume = () => {
      const t = new THREE.WebGLRenderTarget(VX * COLS, VZ * ROWS, { type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: false });
      renderer.setRenderTarget(t); renderer.clear();
      return t;
    };
    const vol = V ? Array.from({ length: SETS }, volume) : [];
    owned.targets.push(...vol);
    yield;

    // the sun where it stands now (game/daycycle.js), in one go; where it moves, its next places
    // follow (updateSun)
    const sunNow = bake.sun;
    sunNow.shown = stillShown(bake);
    const plan = planOf(bake), first = yield* sunSteps(bake, keyOf(sunNow, plan.a), sunMapSize(plan), scenes);
    sunNow.keys.set(first.id, first); sunNow.A = sunNow.B = first.id; sunNow.T = 0; sunNow.fade = false;
    sunNow.dir.copy(first.dir); sunNow.step.copy(first.dir);

    // the lights, one a step
    assignChannels(bake.lights);
    const pu = S.point.uniforms, vu = S.vol.uniforms;
    for (const s of bake.lights) {
      if (s.channel < 0 || s.twin) continue;
      const at = s.at.clone().add(origin), reach = s.light.distance || 6;
      S.light.position.copy(at); S.light.distance = reach; S.light.updateMatrixWorld();
      shadowPass(S.light, scenes.casters);
      const cube = S.light.shadow.map.depthTexture, mask = MASKS[s.channel % 4], set = s.channel >> 2;
      for (const U of [pu, vu]) {
        U.uMap.value = cube; U.uLight.value.copy(at); U.uNear.value = NEAR; U.uFar.value = reach; U.uReach.value = reach; U.uMask.value.copy(mask);
      }
      renderer.setRenderTarget(lm[set]);
      lit.overrideMaterial = S.point;
      renderer.render(lit, S.camera);
      lit.overrideMaterial = null;
      // the slices of the volume it reaches: the rows of the atlas they are in, one draw
      if (V) {
        vu.uV0.value.copy(v0); vu.uVS.value.copy(vs); vu.uO.value.copy(origin); vu.uVD.value.set(VX, VY, VZ, COLS); vu.uStep.value = 1 / V;
        S.quad.material = S.vol;
        const y0 = Math.max(0, Math.floor((s.at.y - reach - v0.y) * V)), y1 = Math.min(VY - 1, Math.ceil((s.at.y + reach - v0.y) * V));
        const r0 = Math.floor(y0 / COLS), r1 = Math.floor(y1 / COLS), t = vol[set];
        t.viewport.set(0, r0 * VZ, VX * COLS, (r1 - r0 + 1) * VZ);
        renderer.setRenderTarget(t);
        renderer.render(S.quadScene, S.camera);
        t.viewport.set(0, 0, t.width, t.height);
      }
      yield;
    }

    // the charts' edges filled outwards, into the textures kept
    const filled = lm.map(src => fill(src, cover, target(), S.fill));
    owned.targets.push(...filled);
    filled.forEach((t, i) => { bake.u['uBakeLm' + i].value = t.texture; });
    vol.forEach((t, i) => { bake.u['uBakeVol' + i].value = t.texture; });
    if (V) bake.u.uBakeVD.value.set(VX, VY, VZ, COLS);
    bake.owned = owned;
    bake.ready = true; bake.readyAt = performance.now();
    done = true;
  } finally {
    lit.overrideMaterial = null;
    for (const t of temp) t.dispose();
    if (!done) { release(owned); releaseSun(bake.sun); }   // (given up: the cube went before it was baked)
  }
}

// a lightmap's charts filled out round their edges (the empty texels take the nearest charted
// one's values), from src into dst; how: S.fill, or S.sunFill (smoothing the sun's too)
function fill(src, cover, dst, how) {
  const S = materials(), { width: w, height: h } = src;
  how.uniforms.uMap.value = src.texture; how.uniforms.uCover.value = cover.texture; how.uniforms.uTexel.value.set(1 / w, 1 / h);
  S.quad.material = how;
  renderer.setRenderTarget(dst);
  renderer.render(S.quadScene, S.camera);
  return dst;
}

// ---- the sun ----

// Where a cube's sun stands (game/daycycle.js setSunPlan: under an open sky it goes round with the
// time of day): { a, b, t, next } (core/daycycle.js sunAt); null: at noon, where it always stood.
const NOON_PLAN = { a: NOON_KEY, b: NOON_KEY, t: 0, next: null };
let sunPlan = () => null;
export function setSunPlan(fn) { sunPlan = fn; }
const planOf = bake => (!bake.flip && bake.map && sunPlan(bake)) || NOON_PLAN;
const SUN_DIST = 38;      // how far the scene's sun stands from what it looks at (render/scene.js)
const SUN_EASE = 2.5;     // a second: how fast the blend shown follows the time of day (and fades over after a jump)
const STRIPS = 8;         // a sun's lightmap baked again in this many strips, a step each
const sunMapSize = () => detail.sunMap;   // (texels a side of its shadow maps: about three are kept where it moves)

// A cube's sun: its places baked (keys: id -> { id, dir, lm, map, M }), the charts' cover (for
// filling), the two shown and how far from A to B (T; fade: fading over after a jump), the one
// being baked (job, jobId), where the blend shown has it (dir: what the baked objects' shadows
// follow) and the place nearer that (step: where the scene's sun stands, render/scene.js, so the
// realtime map of what moves turns only from one place to the next and its edges do not crawl
// as the sun goes), and which of the still casters showed when it was baked (shown, gen: its
// places are baked again when that changes, keyOf).
const newSun = () => ({ keys: new Map(), cover: null, A: null, B: null, T: 0, fade: false, job: null, jobId: null, broken: false, at: 0,
  dir: new THREE.Vector3(...NOON), step: new THREE.Vector3(...NOON), shown: null, gen: 0 });
// a place of the sun as this cube bakes it (with what of its still casters shows: gen)
const keyOf = (S, k) => k && { id: `${k.id}#${S.gen}`, dir: k.dir };
function stopSunJob(S) { S.job?.return(); S.job = null; S.jobId = null; }
function dropSunKey(e) {
  e.lm?.dispose();
  e.map?.dispose();
}
function releaseSun(S) {
  stopSunJob(S);
  for (const e of S.keys.values()) dropSunKey(e);
  S.keys.clear(); S.A = S.B = null; S.T = 0; S.fade = false;
}
// a single-channel target of the lightmap's size, cleared
function sunTarget(w, h) {
  const t = new THREE.WebGLRenderTarget(w, h, { format: THREE.RedFormat, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: false });
  renderer.setRenderTarget(t); renderer.clear();
  return t;
}

// One of the sun's places baked (the steps of a bake, or tickBakes's for the places to come): its
// shadow map of the fixed parts (size² 16-bit depth, its colour let go: kept for what is not
// lightmapped), then its lightmap in `strips` strips (a step each), then filled out round the
// charts. Returns it: { id, dir, lm, map (the shadow map's depth texture), M (from the cube's
// coordinates into its shadow map) }.
function* sunSteps(bake, key, size, scenes = null) {
  const S = materials(), geo = bake.geo, b = geo.bounds, { width: w, height: h } = bake.sun.cover;
  // (as many more strips as the sun's lightmap has texels more than the lights')
  const strips = STRIPS * Math.max(1, Math.round(w * h / (geo.lightmap.w * geo.lightmap.h)));
  const e = { id: key.id, dir: new THREE.Vector3(...key.dir), lm: null, map: null, M: new THREE.Matrix4(), size, span: 1, depth: 1 };
  let temp = null, done = false;
  try {
    const { origin, sunCasters, lit } = scenes ?? scenesOf(bake);
    const centre = new THREE.Vector3((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2).add(origin);
    const radius = Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) / 2 + 1;
    e.span = radius * 2; e.depth = radius * 2 + 9;   // (world units across its map, and deep)
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.castShadow = true;
    light.position.copy(centre).addScaledVector(e.dir, radius + 5);
    light.target.position.copy(centre);
    light.updateMatrixWorld(); light.target.updateMatrixWorld();
    Object.assign(light.shadow.camera, { left: -radius, right: radius, top: radius, bottom: -radius, near: 1, far: radius * 2 + 10 });
    light.shadow.camera.updateProjectionMatrix();
    light.shadow.mapSize.set(size, size);
    const map = light.shadow.map = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true });
    map.depthTexture = e.map = new THREE.DepthTexture(size, size, THREE.UnsignedShortType);
    // (read raw, compared by hand: render/lighthook.js bakeSunAt, VISIBLE here)
    Object.assign(map.depthTexture, { format: THREE.DepthFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    try { sunPass(light, sunCasters); } finally {
      // only its depth is kept: the target goes, and its colour with it (size² RGBA that nothing
      // reads: 16 MB a place at 2048², about three places kept a cube). The target's own
      // texture.dispose() does nothing in three.js: a render target's texture goes with it.
      map.depthTexture = null; map.dispose(); light.shadow.map = null;
    }
    const mapM = light.shadow.matrix.clone();
    // (the map's matrix takes world points; the shaders give points in the cube)
    e.M.copy(mapM).multiply(new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z));
    temp = sunTarget(w, h);
    yield;
    for (let i = 0; i < strips; i++) {
      const y0 = Math.floor(h * i / strips), y1 = Math.floor(h * (i + 1) / strips), su = S.sun.uniforms;
      su.uMap.value = map.depthTexture; su.uMapM.value.copy(mapM); su.uSunDir.value.copy(e.dir); su.uMask.value.copy(MASKS[0]);
      su.uTexel.value.set(e.span / size, e.depth);
      temp.scissor.set(0, y0, w, y1 - y0); temp.scissorTest = strips > 1;
      renderer.setRenderTarget(temp);
      lit.overrideMaterial = S.sun;
      try { renderer.render(lit, S.camera); } finally { lit.overrideMaterial = null; temp.scissorTest = false; }
      yield;
    }
    e.lm = fill(temp, bake.sun.cover, sunTarget(w, h), S.sunFill);
    done = true;
    return e;
  } finally {
    temp?.dispose();
    if (!done) dropSunKey(e);
  }
}

// Every frame, a baked cube's sun: what to bake next (the place it stands at, the next one, the
// one after; a job for one no longer wanted, the clock having jumped, is dropped), what to show
// (settle), what to let go, and its uniforms.
function updateSun(bake, now) {
  const S = bake.sun;
  if (!bake.ready || bake.failed || !S.A) return;
  const dt = S.at ? Math.min(0.1, Math.max(0, (now - S.at) / 1000)) : 0;
  S.at = now;
  // (a still caster showed or hid: every place again, what showed until they are)
  const shown = stillShown(bake);
  if (shown !== S.shown) { S.shown = shown; S.gen++; }
  const p = planOf(bake), plan = { a: keyOf(S, p.a), b: keyOf(S, p.b), t: p.t, next: keyOf(S, p.next) };
  const want = [plan.a, plan.b, plan.next].filter(Boolean), has = k => S.keys.has(k.id);
  if (S.job && !want.some(k => k.id === S.jobId)) stopSunJob(S);
  if (!S.job && !S.broken) {
    const k = want.find(k => !has(k));
    if (k) { S.job = sunSteps(bake, k, sunMapSize(plan)); S.jobId = k.id; }
  }
  if (has(plan.a)) settle(S, plan.a.id, has(plan.b) ? plan.b.id : plan.a.id, has(plan.b) ? plan.t : 0, dt);
  for (const [id, e] of S.keys) if (id !== S.A && id !== S.B && !want.some(k => k.id === id)) { dropSunKey(e); S.keys.delete(id); }
  const eA = S.keys.get(S.A), eB = S.keys.get(S.B) ?? eA, u = bake.u;
  S.dir.copy(eA.dir).lerp(eB.dir, eA === eB ? 0 : S.T).normalize();
  S.step.copy(eA === eB || S.T < 0.5 ? eA.dir : eB.dir);
  u.uBakeSunA.value = eA.lm.texture; u.uBakeSunB.value = eB.lm.texture; u.uBakeSunT.value = eA === eB ? 0 : S.T;
  u.uBakeSun.value = eA.map; u.uBakeSunM.value.copy(eA.M);
  u.uBakeSun2.value = eB.map; u.uBakeSunM2.value.copy(eB.M);
  u.uBakeSunPA.value.set(eA.dir.x, eA.dir.y, eA.dir.z, eA.depth); u.uBakeSunPB.value.set(eB.dir.x, eB.dir.y, eB.dir.z, eB.depth);
  u.uBakeSunD.value.copy(S.dir); u.uBakeSunX.value.set(eA.span / eA.size, eB.span / eB.size, shadeReach(eA, S.dir), shadeReach(eB, S.dir));
}
// How far round a point to look in a place's shadow map for what shades it (in the map: the step
// of its 3 x 3 look), for the sun at `dir`: as far as the shadow of a shade SHADE_FAR away moves
// from that place's sun to this one, at least a texel and a half; 0 where it stands right there
// (the map is read at the point itself: render/lighthook.js bakeSunAt).
const SHADE_FAR = 16;
const shadeReach = (e, dir) => {
  const moved = e.dir.distanceTo(dir);
  return moved < 1e-5 ? 0 : Math.max(1.5 / e.size, SHADE_FAR * moved / e.span);
};
// What shows: places A and B blended by T, following the time of day (between a and b, t of the
// way): eased along; on to the next pair as the sun goes on (or back, the clock going back a
// little); after a jump (another world's clock, a hidden tab, /daytime) fading over from what
// showed to the place nearest the sun now.
function settle(S, a, b, t, dt) {
  const step = dt * SUN_EASE;
  if (S.fade) {
    if (S.B !== a && S.B !== b) S.B = t < 0.5 ? a : b;   // (the sun moved on meanwhile)
    S.T = Math.min(1, S.T + step);
    if (S.T >= 1) { S.T = S.B === a ? 0 : 1; S.A = a; S.B = b; S.fade = false; }
    return;
  }
  if (S.A === a && S.B === b) S.T += Math.max(-step, Math.min(step, t - S.T));
  else if (S.A === S.B && S.A === a) { S.B = b; S.T = 0; }
  else if (S.A === S.B && S.A === b) { S.A = a; S.T = 1; }
  else if (S.B === a) { S.A = a; S.B = b; S.T = 0; }
  else if (S.A === b) { S.A = a; S.B = b; S.T = 1; }
  else { S.A = S.T < 0.5 ? S.A : S.B; S.B = t < 0.5 ? a : b; S.T = 0; S.fade = true; }
}

// dev: a bake's lightmap (0..SETS-1) as a PNG data URL, one channel (0-3) as grey
export function lightmapImage(bake, which = 0, channel = 0) {
  const t = bake.owned.targets.find(r => r.texture === bake.u['uBakeLm' + which].value);
  const { width: w, height: h } = t;
  const px = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(t, 0, 0, w, h, px);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d'), img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = ((h - 1 - y) * w + x) * 4, o = (y * w + x) * 4, v = px[i + channel];
    img.data[o] = img.data[o + 1] = img.data[o + 2] = v; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}
