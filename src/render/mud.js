// Mud lying on the ground, as a field of mud (core/sollmeldon.js MUD_RES samples a cell): Sollmeldon's
// (game/mud.js runs it, core/sollmeldon.js has how it flows), glossy goop in his mire, his pool and
// the balls of mud he throws alike, all one field drawn as one sheet (drawMudField); and the
// pockets of mud round a mud pool (game/muddy.js: a field each, holding still: mudSheet).
// The field goes to the GPU as a small texture (per sample: the mud's surface, how deep it is); a
// fine sheet over it reads both smoothed (a cubic B-spline over the samples round each point), its
// vertices at the surface (it runs downhill as it flows, swells where it gathers), its pixels cut
// where the smoothed depth falls under the edge: every edge a smooth curve, round blobs, never the
// samples' corners; never quite down on the ground (it would fight with it where it is thin: the
// smoothed ground is in the texture too). Where a dry sample lies by wet ones its surface is
// carried on level with them (under the ground there), so the sheet meets a bank or a step where
// the ground does.
// Marbled like the goop of Isle Delfino: near-black mud with broad brown swirls through it that
// drift the way it runs, a lighter rim where it thins out to its edge. In the cube's coordinates,
// with its offset; cut away above the cut like the cube's fluids.
import * as THREE from 'three';
import { scene } from './scene.js';
import { inject } from './cutshader.js';
import { MUD_RES, MUD_FLOW } from '../core/sollmeldon.js';
import { GOOP_GLSL, GOOP_RIM } from './goop.js';

const SUB = 3;   // sheet vertices a sample, each way
const LIFT = '0.03';   // world units it stays over the (smoothed) ground at least

// (the field, smoothed: a cubic B-spline over the 4 × 4 samples round p, cube coordinates; and its
// slope along x and z, from the spline's own derivative; and the sheet's height there, never down on
// the ground: a smooth max of the surface and the ground a little over it, no kink)
const FIELD = `
  uniform highp sampler2D uMudTex;
  uniform vec2 uMudSize, uMudOrigin;
  vec3 mudFetch(ivec2 c) { return texelFetch(uMudTex, clamp(c, ivec2(0), ivec2(uMudSize) - 1), 0).rgb; }
  vec4 mudWeights(float f) {
    float f2 = f * f, f3 = f2 * f;
    return vec4((1.0 - 3.0 * f + 3.0 * f2 - f3), (4.0 - 6.0 * f2 + 3.0 * f3), (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3), f3) / 6.0;
  }
  vec4 mudSlopes(float f) {
    return vec4(-(1.0 - f) * (1.0 - f), 3.0 * f * f - 4.0 * f, -3.0 * f * f + 2.0 * f + 1.0, f * f) * 0.5;
  }
  vec3 mudField(vec2 p, out vec3 dx, out vec3 dz) {
    vec2 t = (p - uMudOrigin) * ${MUD_RES.toFixed(1)} - 0.5, i = floor(t), f = t - i;
    vec4 wx = mudWeights(f.x), wy = mudWeights(f.y), sx = mudSlopes(f.x), sy = mudSlopes(f.y);
    ivec2 c = ivec2(i);
    vec3 s = vec3(0.0);
    dx = vec3(0.0); dz = vec3(0.0);
    for (int b = 0; b < 4; b++) for (int a = 0; a < 4; a++) {
      vec3 v = mudFetch(c + ivec2(a - 1, b - 1));
      s += wx[a] * wy[b] * v; dx += sx[a] * wy[b] * v; dz += wx[a] * sy[b] * v;
    }
    dx *= ${MUD_RES.toFixed(1)}; dz *= ${MUD_RES.toFixed(1)};
    return s;
  }
  vec3 mudField(vec2 p) { vec3 dx, dz; return mudField(p, dx, dz); }
  // the sheet's height at p and its normal there
  float mudSheet(vec2 p, out vec3 n) {
    vec3 dx, dz, f = mudField(p, dx, dz);
    float a = f.r, b = f.b + ${LIFT}, k = 0.06, h = clamp(0.5 + 0.5 * (a - b) / k, 0.0, 1.0);
    vec2 g = mix(vec2(dx.b, dz.b), vec2(dx.r, dz.r), h);
    n = normalize(vec3(-g.x, 1.0, -g.y));
    return mix(b, a, h) + k * h * (1.0 - h);
  }
`;
function material(uniforms) {
  // (and drawn a little towards the camera, like a decal: where it is thin it lies close on the ground)
  const mat = inject(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.18, metalness: 0, transparent: true, depthWrite: true,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    fs => fs.replace('#include <clipping_planes_fragment>', 'if (cutRegion(true) > 0.5) discard;\n#include <clipping_planes_fragment>'), 'cut-mud');
  const cut = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    cut(sh, r);
    Object.assign(sh.uniforms, uniforms);
    // the surface, and its slope (for the light) from the smoothed surface a little to each side
    sh.vertexShader = 'varying vec2 vMudP;\n' + FIELD + sh.vertexShader.replace('#include <beginnormal_vertex>', `
      vMudP = position.xz;
      vec3 objectNormal;
      float mudY = mudSheet(position.xz, objectNormal);
      #ifdef USE_TANGENT
        vec3 objectTangent = vec3(1.0, 0.0, 0.0);
      #endif`).replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y = mudY;');
    sh.fragmentShader = 'uniform float uMudTime, uMudEdge;\nuniform vec2 uMudDrift;\nvarying vec2 vMudP;\n'
      + FIELD + GOOP_GLSL + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      {
        // its edge: where the smoothed depth thins out under the edge (a smooth curve, a little
        // wobbly), antialiased
        float d = mudField(vMudP).g + (goopNoise(vMudP * 2.3 + 4.0) - 0.5) * 0.008;
        float aa = fwidth(d) * 0.75 + 1e-4;
        float inside = smoothstep(uMudEdge - aa, uMudEdge + aa, d);
        if (inside < 0.01) discard;
        // the goop (render/goop.js), drifting the way it runs, a lighter rim where it thins out
        vec3 col = goopColor(vMudP + uMudDrift, uMudTime);
        col = mix(col, ${GOOP_RIM}, (1.0 - smoothstep(uMudEdge, uMudEdge + 0.04, d)) * 0.7);
        diffuseColor.rgb = col;
        diffuseColor.a = inside;
      }`).replace('#include <normal_fragment_begin>', `
      // (the normal of the smoothed sheet itself, every pixel: no triangle shows in its gloss)
      vec3 mudN;
      mudSheet(vMudP, mudN);
      float faceDirection = 1.0;
      vec3 normal = normalize((viewMatrix * vec4(mudN, 0.0)).xyz);
      vec3 nonPerturbedNormal = normal;`);
  };
  mat.customProgramCacheKey = () => 'cut-mud-goop';
  return mat;
}

// A sheet of mud over a field: { draw(f, dt, off, tilt), clear() }. still: the field never changes
// (a pocket's): its samples go to the GPU once.
export function mudSheet({ still = false } = {}) {
  let mesh = null, field = null, tex = null, data = null, time = 0;
  const drift = new THREE.Vector2();
  const uniforms = { uMudTex: { value: null }, uMudSize: { value: new THREE.Vector2(1, 1) }, uMudOrigin: { value: new THREE.Vector2() },
    uMudTime: { value: 0 }, uMudDrift: { value: drift }, uMudEdge: { value: MUD_FLOW.wet * 1.4 } };

  // the sheet over a field's box: SUB vertices a sample each way (only where they are: the shader
  // puts them at the surface)
  function build(f) {
    const nx = f.w * SUB + 1, nz = f.h * SUB + 1, pos = new Float32Array(nx * nz * 3), idx = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      pos[k * 3] = f.x0 + i / (SUB * MUD_RES); pos[k * 3 + 2] = f.z0 + j / (SUB * MUD_RES);
    }
    for (let j = 0; j + 1 < nz; j++) for (let i = 0; i + 1 < nx; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    data = new Float32Array(f.w * f.h * 4);
    tex = new THREE.DataTexture(data, f.w, f.h, THREE.RGBAFormat, THREE.FloatType);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    uniforms.uMudTex.value = tex;
    uniforms.uMudSize.value.set(f.w, f.h);
    uniforms.uMudOrigin.value.set(f.x0, f.z0);
    const m = new THREE.Mesh(geo, material(uniforms));
    m.frustumCulled = false; m.renderOrder = 4; m.receiveShadow = true;
    return m;
  }
  // The texture: per sample its surface (a dry one: carried on from the wet ones round it, a few
  // rings out, else well under its ground), how deep it is and the ground
  const surf = [];
  function upload(f) {
    const { w, h, ground: G, depth: D } = f, n = w * h, wet = MUD_FLOW.wet;
    if (surf.length !== n) surf.length = n;
    for (let k = 0; k < n; k++) surf[k] = D[k] > wet && Number.isFinite(G[k]) ? G[k] + D[k] : NaN;
    for (let ring = 0; ring < 3; ring++) {
      const add = [];
      for (let k = 0; k < n; k++) {
        if (!Number.isNaN(surf[k])) continue;
        const i = k % w, j = Math.floor(k / w);
        let sum = 0, c = 0;
        for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
          const ii = i + a, jj = j + b;
          if ((a || b) && ii >= 0 && jj >= 0 && ii < w && jj < h && !Number.isNaN(surf[jj * w + ii])) { sum += surf[jj * w + ii]; c++; }
        }
        if (c) add.push([k, sum / c]);
      }
      for (const [k, y] of add) surf[k] = y;
    }
    for (let k = 0; k < n; k++) {
      const g = Number.isFinite(G[k]) ? G[k] : 0;
      data[k * 4] = Number.isNaN(surf[k]) ? g - 0.3 : surf[k];
      data[k * 4 + 1] = Number.isFinite(G[k]) ? D[k] : 0;
      data[k * 4 + 2] = Number.isFinite(G[k]) ? G[k] : data[k * 4] - 1;
    }
    tex.needsUpdate = true;
  }
  // every frame: the field's mud now (none: gone), how it is tipped (its swirls drift downhill)
  function draw(f, dt, off = { x: 0, y: 0, z: 0 }, tilt = [0, 0]) {
    const fresh = f !== field;
    if (fresh) { clear(); field = f; if (f) { mesh = build(f); scene.add(mesh); } }
    if (!mesh) return;
    time += dt;
    drift.x -= tilt[0] * dt * 0.2; drift.y -= tilt[1] * dt * 0.2;   // (the pattern moves the way the mud runs)
    uniforms.uMudTime.value = time;
    if (fresh || !still) upload(f);
    mesh.position.set(off.x, off.y, off.z);
  }
  function clear() {
    if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
    tex?.dispose();
    mesh = null; field = null; tex = null;
  }
  return { draw, clear, mesh: () => mesh };
}

// Sollmeldon's: every frame the field's mud now (none: gone), how it is tipped (game/mud.js)
const his = mudSheet();
export const drawMudField = (f, map, dt, off, tilt) => his.draw(f, dt, off, tilt);
export const clearMudField = () => his.clear();
