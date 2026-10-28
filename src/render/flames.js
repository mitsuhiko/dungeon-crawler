// Fire: the open flames of the world (the trials' braziers, great fire and beacon; the props
// that burn: braziers, torches, the fire shrine). A flame is a soft, camera-facing billboard
// that a small shader paints (rising turbulence, white-yellow at its root, orange to red at its
// ragged tip, a faint glow round it), flickering with its light; the nearest fires also give
// off embers and wisps of smoke from the shared particles (render/particles.js), in the colours
// the player burns in (render/burning.js).
//
// The props' flames are their models' glowing spikes (blender/themes_geo.py flame, props.py
// build_brazier, trials.py flame): splitFlames takes those out of a fire prop's model as it is
// loaded and keeps where they stood and how big they were (p.flames); flameSet draws a cube's
// flames, one instanced mesh, with the cut and the fade like every material of the cube.
import * as THREE from 'three';
import { cutMaterial } from './section.js';
import { glow, soft, emit, rand, ring } from './particles.js';
import { scene } from './scene.js';
import { makeFadable } from './fade.js';
import { doused } from '../core/douse.js';
import { FIRES } from '../core/propcatalog.js';
import { sfx } from '../audio/sfx.js';
import { nightGlow, litAt } from './night.js';

export const FIRE_COLORS = ['#fff0a0', '#ffd25a', '#ff8a2a', '#ff4a17'];
// how a fire flickers (seed: its own phase): the flame's height and brightness and its light
export const flicker = (t, seed) => 0.8 + 0.2 * Math.sin(t * 13 + seed * 7) * Math.sin(t * 7.3 + seed * 3);
// how a glowing mushroom's (a rune's) light breathes: slowly, each in its own time
export const breathe = (t, seed) => 0.72 + 0.28 * Math.sin(t * (0.9 + seed * 0.08) + seed * 5);
// how a candle behind a window glimmers (props.js glowMaterial 'window': its pane alike)
const glimmer = (t, seed) => 0.9 + 0.1 * Math.sin(t * 4.3 + seed) * Math.sin(t * 2.1 + seed * 0.7);
const FLICKER = '(0.8 + 0.2 * sin(uTime * 13.0 + s * 7.0) * sin(uTime * 7.3 + s * 3.0))';

// the props that burn (core/propcatalog.js FIRES) and the trials' flame pieces
export const isFire = p => FIRES.has(p.base) || /^trial_.*_flame$/.test(p.name);

// --- the flames in a fire prop's model ---------------------------------------------------------
// A fire prop's glowing part split into its pieces (triangles joined by shared corners); the
// tall ones are flames, the rest (a glowing rim, embers in a bowl) stays. p.flames: [{ x, y, z,
// w, h }] (where the flames stood, in the prop, and their size, all of them as one fire);
// p.parts without them (p.wholeParts: as loaded, for the far proxies of landmarks).
export function splitFlames(p) {
  if (!isFire(p) || !p.parts || p.flames) return;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const parts = [];
  for (const part of p.parts) {
    if (!part.material.name.endsWith('_glow')) { parts.push(part); continue; }
    const g = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry, pos = g.attributes.position, tris = pos.count / 3;
    const parent = new Map(), find = k => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
    const key = i => `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    for (let t = 0; t < tris; t++) {
      const ks = [key(t * 3), key(t * 3 + 1), key(t * 3 + 2)];
      for (const k of ks) if (!parent.has(k)) parent.set(k, k);
      parent.set(find(ks[1]), find(ks[0])); parent.set(find(ks[2]), find(ks[0]));
    }
    const boxes = new Map(), of = t => find(key(t * 3));
    for (let i = 0; i < pos.count; i++) {
      const c = of(Math.floor(i / 3)), b = boxes.get(c) ?? boxes.set(c, [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]).get(c);
      const v = [pos.getX(i), pos.getY(i), pos.getZ(i)];
      for (let a = 0; a < 3; a++) { b[a] = Math.min(b[a], v[a]); b[a + 3] = Math.max(b[a + 3], v[a]); }
    }
    const tall = new Set([...boxes].filter(([, b]) => b[4] - b[1] > 0.04 && b[4] - b[1] > 0.8 * Math.max(b[3] - b[0], b[5] - b[2])).map(([c]) => c));
    for (const c of tall) { const b = boxes.get(c); for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], b[a]); hi[a] = Math.max(hi[a], b[a + 3]); } }
    const keep = [];
    for (let t = 0; t < tris; t++) if (!tall.has(of(t))) keep.push(t);
    if (keep.length === tris) { parts.push(part); continue; }
    if (!keep.length) continue;
    const rest = new THREE.BufferGeometry();
    for (const [name, a] of Object.entries(g.attributes)) {
      const out = new a.array.constructor(keep.length * 3 * a.itemSize);
      keep.forEach((t, j) => { for (let k = 0; k < 3 * a.itemSize; k++) out[j * 3 * a.itemSize + k] = a.array[t * 3 * a.itemSize + k]; });
      rest.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize, a.normalized));
    }
    parts.push({ geometry: rest, material: part.material });
  }
  if (lo[0] === Infinity) return;
  p.wholeParts = p.parts;
  p.parts = parts;
  // (a third bigger: the drawn flame fills less of its size than the spikes did)
  p.flames = [{ x: (lo[0] + hi[0]) / 2, y: lo[1], z: (lo[2] + hi[2]) / 2, w: 1.3 * Math.max(hi[0] - lo[0], hi[2] - lo[2]), h: 1.35 * (hi[1] - lo[1]) }];
}

// --- drawing them --------------------------------------------------------------------------------
const uTime = { value: 0 };
const vertexShader = `
attribute vec4 aFlame;   // width, height, seed, power (0: out, 1: burning)
uniform float uTime;
varying vec2 vUv;
varying float vSeed, vPower, vFlick;
#include <common>
#include <clipping_planes_pars_vertex>
void main() {
  float s = aFlame.z;
  vUv = uv; vSeed = s; vPower = aFlame.w; vFlick = ${FLICKER};
  vec3 transformed = vec3(0.0);
  #include <project_vertex>
  // facing the camera round its root, as tall as it flickers; a little below the root (it
  // glows into its bowl) and wider than the flame (its glow round it)
  float h = aFlame.y * (0.8 + 0.3 * vFlick) * min(vPower, 1.0);
  mvPosition.xy += vec2(position.x * aFlame.x * 1.7, position.y * h);
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}`;
const fragmentShader = `
uniform float uTime;
varying vec2 vUv;
varying float vSeed, vPower, vFlick;
#include <clipping_planes_pars_fragment>
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { return (0.5 * noise(p) + 0.25 * noise(p * 2.03) + 0.125 * noise(p * 4.01)) / 0.875; }
void main() {
  #include <clipping_planes_fragment>
  if (vPower <= 0.0) discard;
  float t = uTime + vSeed * 10.0, y = vUv.y * 1.15 - 0.15;   // y: 0 at the root, 1 at the top
  float x = (vUv.x - 0.5) * 1.7;                              // x: in flame widths
  // rising turbulence: a slow sway and fast licks
  float n = fbm(vec2(x * 2.0 + vSeed, y * 1.6 - t * 2.2));
  float lick = fbm(vec2(x * 4.5 - vSeed, y * 3.2 - t * 3.6));
  x += (n - 0.5) * 0.45 * max(y, 0.0);
  // a teardrop narrowing upwards, eaten away by the licks towards its tip
  float r = length(vec2(x * (2.1 + 2.6 * max(y, 0.0)), (y - 0.22) * 1.15));
  float f = (1.0 - r - lick * 0.6 * max(y, 0.0) + 0.12 * n) * smoothstep(-0.15, 0.04, y);
  float body = smoothstep(0.0, 0.3, f);
  vec3 c = mix(vec3(0.75, 0.1, 0.02), vec3(1.0, 0.4, 0.06), smoothstep(0.0, 0.35, f));
  c = mix(c, vec3(1.0, 0.7, 0.22), smoothstep(0.38, 0.7, f));
  c = mix(c, vec3(1.0, 0.93, 0.72), smoothstep(0.78, 1.0, f));
  // a faint glow round its root (added: no alpha), gone before the quad's edges
  float halo = exp(-(x * x * 14.0 + (y - 0.15) * (y - 0.15) * 10.0)) * 0.09 * smoothstep(-0.15, 0.02, y);
  if (body < 0.004 && halo < 0.004) discard;
  float k = (0.8 + 0.3 * vFlick) * min(vPower, 1.0);
  // premultiplied: the core covers what is behind it (bright on snow too), its edges and glow add
  gl_FragColor = vec4((c * body * 1.1 + vec3(1.0, 0.45, 0.12) * halo) * k, body * 0.75 * min(vPower, 1.0));
  #include <colorspace_fragment>
}`;

const sets = new Set();
const flameMaterial = () => cutMaterial(new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: { uTime },
  transparent: true, depthWrite: false, clipping: true,
  blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor }));

// One flame material that is never disposed, compiled with every cube's warm-up
// (render/cubeassets.js). three.js names a ShaderMaterial's program by ids of its shader texts,
// which it forgets once no material uses them: when a cube went, the next cube's flames got new
// ids, so a new program, compiled while drawing it (warming a cube ahead did not help, its copy
// was thrown away too). While this one lives the ids stay, and the kept program serves them all.
let pinned = null;
export function flameWarmup() {
  if (!pinned) {
    pinned = new THREE.Group();
    pinned.add(new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), flameMaterial(), 1));
    makeFadable(pinned);   // (as in a cube: the same program)
  }
  return [pinned];
}
// A cube's flames (specs: [{ x, y, z, w, h }] in its group; lights: the point lights they give,
// [{ light, gain, i, seed, pulse, steady, candle, night }], flickering with flame i (-1: none, a
// lantern's light flickers on its own; pulse: it breathes instead, a glowing mushroom's; steady: it
// does not; candle: it glimmers, a lit window's; night: lit at night only, render/night.js, its
// seed there)): one instanced mesh to add to the
// group. power(i, v): a flame lit (1) or out (0) (and on the way: it flares up, it dies down).
export function flameSet(specs, lights = []) {
  // (a quad from a little below the root, -0.15, to the top, 1, in heights; the shader's y)
  const geometry = new THREE.PlaneGeometry(1, 1.15);
  geometry.translate(0, 0.425, 0);
  const data = new Float32Array(specs.length * 4);
  specs.forEach((f, i) => data.set([f.w, f.h, f.seed ?? (f.x * 1.7 + f.z * 2.3) % 6.28, f.power ?? 1], i * 4));
  const attr = new THREE.InstancedBufferAttribute(data, 4);
  geometry.setAttribute('aFlame', attr);
  const material = flameMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, specs.length));
  mesh.count = specs.length;
  const m4 = new THREE.Matrix4();
  specs.forEach((f, i) => mesh.setMatrixAt(i, m4.makeTranslation(f.x, f.y, f.z)));
  mesh.frustumCulled = false; mesh.renderOrder = 900;
  // want: what the game wants (lit or out); wet: the flames under a fluid now (douseFlames)
  const set = { mesh, specs, lights, want: specs.map(f => f.power ?? 1), wet: specs.map(() => false), douse: null, attr, t: 0 };
  set.power = (i, v) => { set.want[i] = v; };
  sets.add(set);
  return set;
}

// The flames under `root` (a cube's world group), where they burn in the world: [{ set, i, x, y, z }]
// (set.power(i, v) lights or puts out flame i: Totnar's intro, game/reveals.js)
export function firesUnder(root) {
  const out = [];
  for (const set of sets) {
    let o = set.mesh;
    while (o && o !== root) o = o.parent;
    if (!o) continue;
    set.mesh.updateWorldMatrix(true, false);
    set.specs.forEach((f, i) => { set.mesh.localToWorld(at.set(f.x, f.y, f.z)); out.push({ set, i, x: at.x, y: at.y, z: at.z }); });
  }
  return out;
}

// A fluid rising and sinking over a cube's fires (a trial's, render/trials.js): the flames under
// it go out, and those meant to burn flare up again once it has gone (y: its surface in the
// group's coordinates, null: none). Only how they look: what is lit stays the game's.
export function douseFlames(group, y, fluid) {
  for (const set of sets) if (set.mesh.parent === group) set.douse = y == null ? null : { y, fluid };
}

// steam where a flame is put out (or flares up again out of the drained fluid)
function steam(x, y, z, w, out) {
  for (let k = 0; k < (out ? 7 : 3); k++) {
    const [dx, dz] = ring(w * 0.4);
    emit(soft, x + dx, y + rand(0, 0.15), z + dz, { v: [dx * 0.4, rand(0.5, 0.9), dz * 0.4], spread: 0.2, life: rand(0.9, 1.5),
      size: 0.12 + 0.2 * w, grow: 2.4, color: '#e8eef2', alpha: out ? 0.4 : 0.22, drag: 0.6 });
  }
}

const at = new THREE.Vector3();
const inScene = o => { while (o.parent) o = o.parent; return o === scene; };
// every frame: the flames flicker, flare up or die down, their lights with them; the fires
// near `focus` give off embers and smoke
export function tickFlames(dt, time, focus) {
  uTime.value = time;
  const near = [];
  for (const set of sets) {
    if (!inScene(set.mesh)) { if (!set.mesh.parent || set.t++ > 2) sets.delete(set); continue; }
    set.t = 0;
    let changed = false;
    set.specs.forEach((f, i) => {
      const wet = !!set.douse && doused(f.y, f.h, set.douse.y, set.douse.fluid);
      if (wet !== set.wet[i]) {
        set.wet[i] = wet;
        // (only a flame burning, or about to: an unlit brazier just gets wet)
        if (set.want[i] > 0 && set.mesh.parent.visible) {
          set.mesh.localToWorld(at.set(f.x, f.y, f.z));
          steam(at.x, at.y, at.z, f.w, wet);
          if (wet) sfx('sizzle', { at, volume: 0.5, pitch: 0.8 + Math.random() * 0.3 });
        }
      }
      const p = set.attr.array[i * 4 + 3], want = wet ? 0 : set.want[i];
      // (put out by a fluid: quickly)
      if (p !== want) { set.attr.array[i * 4 + 3] = want > p ? Math.min(want, p + dt * 2.5) : Math.max(want, p - dt * (wet ? 6 : 1.5)); changed = true; }
      const power = set.attr.array[i * 4 + 3];
      if (power <= 0 || !set.mesh.parent.visible) return;
      set.mesh.localToWorld(at.set(f.x, f.y, f.z));
      const d = at.distanceToSquared(focus);
      if (d < 100) near.push({ f, power, d, x: at.x, y: at.y, z: at.z });
    });
    if (changed) set.attr.needsUpdate = true;
    for (const { light, gain, i = 0, seed = 0, pulse, steady, candle, night = null } of set.lights)
      light.intensity = gain * (pulse ? breathe(time, seed) : steady ? 1 : candle ? glimmer(time, seed) : flicker(time, seed))
        * (set.attr.array[i * 4 + 3] ?? 1) * (night === null ? 1 : litAt(nightGlow.value, night));
  }
  near.sort((a, b) => a.d - b.d);
  for (const { f, power, x, y, z } of near.slice(0, 6)) {
    const w = f.w, h = f.h * power;
    for (let k = Math.floor((3 + 9 * h) * dt + Math.random()); k > 0; k--) {
      const [dx, dz] = ring(w * 0.35);
      emit(glow, x + dx, y + h * rand(0.25, 0.7), z + dz, { v: [dx * 0.6, rand(0.5, 1.1) * (0.6 + h), dz * 0.6], spread: 0.35,
        life: rand(0.5, 1.1), size: rand(0.03, 0.06) * (0.6 + h), grow: -0.6, color: FIRE_COLORS[k % 4], gravity: -0.4, drag: 0.9 });
    }
    if (Math.random() < (0.6 + 2 * h) * dt) {
      const [dx, dz] = ring(w * 0.2);
      emit(soft, x + dx, y + h * 0.95, z + dz, { v: [0, rand(0.35, 0.6), 0], spread: 0.15, life: rand(1.4, 2.2),
        size: 0.1 + 0.25 * w, grow: 2.2, color: '#3a3532', alpha: 0.22, drag: 0.4 });
    }
  }
}
