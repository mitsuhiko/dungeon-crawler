// The hole Umbra comes out of (game/umbra.js emerge: where it is, core/umbra.js holeSpot): it breaks
// open in the face of the wall as his head comes through, rock and bubbles bursting out of it, stays
// open, a dark way back into the rock ringed with broken stone, while his body pours out of it, and
// closes behind the tip of his tail, the stones grinding back into it. Drawn from his `clipWall`
// ([nx, nz, d, x, y, z]: the wall's face and the hole's middle; a friend's game gets it with his row),
// so it opens and closes the same way everywhere. render/umbraview.js calls it each frame.
import * as THREE from 'three';
import { soft, emit, rand } from './particles.js';
import { diveTinted } from './underwater.js';
import { HOLE } from '../core/umbra.js';

const RUBBLE = ['#5a544c', '#3e3a35', '#7a7268'], BUBBLES = ['#e8fbff', '#bfefff', '#8fd8f0'];
const STONES = 22;

// the dark of the hole: black in its depth, the rock's brown at its broken edge, which is ragged
const HOLE_FS = `uniform float uK, uSeed; varying vec2 vUv;
  float h(float a) { return fract(sin(a * 12.9898 + uSeed) * 43758.5453); }
  float n(float a) { float i = floor(a), f = fract(a); return mix(h(i), h(i + 1.0), f * f * (3.0 - 2.0 * f)); }
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p), a = atan(p.y, p.x) / 6.2832 + 0.5;
    float edge = 0.82 + 0.13 * n(a * 9.0) + 0.06 * n(a * 23.0 + 3.0);
    if (r > edge) discard;
    float d = r / edge;
    vec3 col = mix(vec3(0.004, 0.012, 0.016), vec3(0.13, 0.11, 0.09), smoothstep(0.6, 1.0, d));
    col += vec3(0.0, 0.05, 0.06) * (1.0 - smoothstep(0.0, 0.6, d));   // (a faint glow far back in it)
    gl_FragColor = vec4(col, uK * smoothstep(1.0, 0.93, d) * 0.97 + uK * 0.03);
  }`;

let warming = null;
function make(parent) {
  const group = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(2 * HOLE.r * 1.15, 2 * HOLE.r * 1.15), new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0 }, uSeed: { value: Math.random() * 100 } }, transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: HOLE_FS }));
  disc.position.z = 0.02; disc.renderOrder = 2;
  const mat = diveTinted(new THREE.MeshStandardMaterial({ color: 0x8a8174, roughness: 1, flatShading: true }));
  const geo = new THREE.DodecahedronGeometry(1, 0);
  // the broken stones round its edge: each its own size and tilt, where it lies on the ring
  const stones = Array.from({ length: STONES }, (_, i) => {
    const m = new THREE.Mesh(geo, mat), a = (i + rand(-0.45, 0.45)) / STONES * Math.PI * 2;
    m.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
    m.userData = { a, d: HOLE.r * rand(0.88, 1.22), s: rand(0.06, 0.2), out: rand(0.02, 0.14), squash: [rand(0.6, 1.3), rand(0.6, 1.2), rand(0.5, 1)] };
    group.add(m);
    return m;
  });
  group.add(disc);
  parent?.add(group);
  return { group, disc, stones, geo, mat, k: 0, burst: false, hole: null };
}

// its shaders, compiled with Umbra's reef's (render/cubeassets.js): one, never shown
export function holeWarmup(map) {
  if (!map?.dive) return [];
  warming ??= make(null);
  return [warming.group];
}

export function disposeUmbraHole(m) {
  const h = m.hole;
  if (!h) return;
  h.group.removeFromParent(); h.geo.dispose(); h.mat.dispose(); h.disc.geometry.dispose(); h.disc.material.dispose();
  m.hole = null;
}

// e: Umbra (his `clipWall`, his head at e.x, e.y + HEAD, e.z), parent: what his view hangs in, off:
// where the cube is drawn
export function umbraHole(m, e, parent, dt, off, head) {
  const cw = Array.isArray(e.clipWall) && e.clipWall.length >= 6 ? e.clipWall : null;
  if (!cw && !m.hole) return;
  const h = m.hole ??= make(parent);
  if (cw) h.at = { nx: cw[0], nz: cw[1], x: cw[3], y: cw[4], z: cw[5] };
  const w = h.at;
  if (!w) { disposeUmbraHole(m); return; }
  // open once his head comes through the wall (his intro holds it in the rock a while), shut behind his tail
  const through = cw && e.mode !== 'gone' && w.nx * head.x + w.nz * head.z - (w.nx * w.x + w.nz * w.z) > -0.5;
  if (through && !h.burst) { h.burst = true; burst(w, off); }
  const want = cw ? (h.burst ? 1 : 0) : 0, was = h.k;
  h.k = want > h.k ? Math.min(1, h.k + dt * 7) : Math.max(0, h.k - dt * 0.9);
  if (!cw && was > 0.98 && h.k <= 0.98) dust(w, off, 26);   // (closing: the stones grinding back)
  if (!cw && h.k > 0.05 && Math.random() < dt * 20) dust(w, off, 1);
  if (h.k <= 0 && !cw) { disposeUmbraHole(m); return; }
  h.group.visible = h.k > 0.001;
  h.group.position.set(w.x + off.x + w.nx * 0.01, w.y + off.y, w.z + off.z + w.nz * 0.01);
  h.group.rotation.set(0, Math.atan2(w.nx, w.nz), 0);
  // opening: a little too big, then back; closing: the stones drawn in over it
  const k = h.k, open = cw ? 1 + 0.12 * Math.sin(Math.min(1, k) * Math.PI) : k;
  h.disc.scale.setScalar(Math.max(1e-3, open * (cw ? Math.min(1, k * 1.2) : 1)));
  h.disc.material.uniforms.uK.value = Math.min(1, k * 1.5);
  for (const s of h.stones) {
    const { a, d, s: size, out, squash } = s.userData, r = d * (cw ? open : 0.25 + 0.75 * k);
    s.position.set(Math.cos(a) * r, Math.sin(a) * r, out * (cw ? 1 : k));
    s.scale.set(...squash).multiplyScalar(size * Math.min(1, 0.2 + k * 1.2) * (cw ? 1 : 0.8 + 0.6 * (1 - k)));
  }
}

// breaking open: rock and bubbles flying out of it, out along the wall's face
function burst(w, off) {
  for (let i = 0; i < 46; i++) {
    const sp = rand(1, 3.5), u = rand(-0.8, 0.8), rock = i % 2 === 0, a = rand(0, Math.PI * 2), d = rand(0, HOLE.r);
    emit(soft, w.x + off.x - w.nz * Math.cos(a) * d, w.y + off.y + Math.sin(a) * d, w.z + off.z + w.nx * Math.cos(a) * d,
      { v: [w.nx * sp - w.nz * u * 2, rand(-0.3, 1.4), w.nz * sp + w.nx * u * 2], life: rand(0.5, 1.2),
        size: rand(0.05, 0.13), color: (rock ? RUBBLE : BUBBLES)[i % 3], alpha: 0.85, drag: 1.4, gravity: rock ? 4 : -0.5 });
  }
}
// grit and silt puffing off its edge
function dust(w, off, n) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), d = HOLE.r * rand(0.5, 1.1);
    emit(soft, w.x + off.x + w.nx * 0.1 - w.nz * Math.cos(a) * d, w.y + off.y + Math.sin(a) * d, w.z + off.z + w.nz * 0.1 + w.nx * Math.cos(a) * d,
      { v: [w.nx * rand(0.2, 0.8), rand(-0.2, 0.4), w.nz * rand(0.2, 0.8)], life: rand(0.8, 1.6), size: rand(0.08, 0.2), grow: 1.8,
        color: RUBBLE[i % 3], alpha: 0.4, drag: 1.6, gravity: 0.3 });
  }
}
