// Rings on the surface of the water: what spreads round a swimmer (game/swim.js), a collar where
// the body cuts the surface, a wake behind it, a ring with each stroke and where it went in.
// Drawn like the line of foam lapping in at a shore (render/materials.js cellMaterial): a thin,
// crisp line in the water's foam colour (its palette, render/waterline.js fluidAround), lit like
// its surface, broken up along its round and thinning as it spreads and fades. Flat on the
// surface (a camera-facing puff would lie over the body: render/particles.js), each a square
// that grows from r0 to r1 over its life, slowing. They ride on the surface as it is drawn
// (render/waterline.js drawnSurface: the tide lifts and lowers them) and are tested against the
// depth, so the body over the water stands in front of them and what is under it is hidden.
// All in one mesh, rewritten every frame; they go along with the cubes on a portal's travel and
// are dropped on a cut to another cube (render/particles.js rideAlong).
import * as THREE from 'three';
import { scene } from './scene.js';
import { rideAlong } from './particles.js';
import { paletteOf } from './fluidpal.js';
import { cutMaterial } from './section.js';
import { drawnSurface } from './waterline.js';

const MAX = 96;
const LIFT = 0.012;   // over the surface's highest crest (render/surface.js: none stands over drawnSurface)

const geometry = new THREE.BufferGeometry();
const attr = (name, n, usage = THREE.DynamicDrawUsage) => {
  geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(MAX * 4 * n), n).setUsage(usage));
  return geometry.attributes[name];
};
// ring: where the corner lies from the middle (world units), the radius, the line's half width;
// shape: how opaque, a seed for where it breaks up, how far along its life (0..1), how much it
// glows (its palette's: the water's foam glows as much, render/materials.js cellMaterial)
attr('position', 3); attr('ring', 4); attr('shape', 4); attr('color', 3);
{
  const index = new Uint16Array(MAX * 6), normal = attr('normal', 3, THREE.StaticDrawUsage);
  for (let i = 0; i < MAX; i++) {
    index.set([0, 2, 1, 1, 2, 3].map(k => i * 4 + k), i * 6);
    for (let v = 0; v < 4; v++) normal.array.set([0, 1, 0], (i * 4 + v) * 3);
  }
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
}
// lit like the water's surface (render/materials.js fluidMaterial: its roughness) and glowing like
// its foam, the line's shape cut out of a square; cut away with the water it lies on (render/
// section.js cutMaterial)
const material = cutMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0, vertexColors: true,
  transparent: true, depthWrite: false, side: THREE.DoubleSide }));
const cut = material.onBeforeCompile;
material.onBeforeCompile = (s, r) => {
  cut.call(material, s, r);
  s.vertexShader = 'attribute vec4 ring, shape;\nvarying vec4 vRing, vShape;\n'
    + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vRing = ring; vShape = shape;');
  s.fragmentShader = 'varying vec4 vRing, vShape;\n' + s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
    {
      float d = length(vRing.xy), ad = fwidth(d) + 1e-4, a = atan(vRing.y, vRing.x), sd = vShape.y;
      // broken up along its round, the more the further it spread
      float gn = sin(a * 5.0 + sd) + 0.5 * sin(a * 9.0 - sd * 1.7) + 0.9 - 1.3 * vShape.z, ag = fwidth(gn) + 1e-4;
      float wid = vRing.w * smoothstep(-ag, ag, gn);
      float line = 1.0 - smoothstep(wid - ad, wid + ad, abs(d - vRing.z));
      diffuseColor.a *= vShape.x * line;
      if (diffuseColor.a < 0.004) discard;
    }`).replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance = diffuseColor.rgb * vShape.w;');
};
material.customProgramCacheKey = () => 'cut-ripples';
const mesh = new THREE.Mesh(geometry, material);
// after the fluids' surfaces, before their falls (render/partmeshes.js PART_ORDER; like the
// ripples where a fall lands, render/falls.js), the bodies (render/figure.js) and the particles
mesh.renderOrder = 2.5; mesh.frustumCulled = false; mesh.visible = false;
scene.add(mesh);

const list = [];
// a ring round (x, z) on the surface of the fluid w (render/waterline.js fluidAround), growing
// from r0 to r1 (world units) over `life` seconds, its line `width` wide (world units) at first,
// as opaque as `alpha`
export function ripple(x, z, w, { r0 = 0.2, r1 = 0.5, life = 1.5, width = 0.035, alpha = 0.8 } = {}) {
  if (!w) return;
  if (list.length >= MAX) list.shift();
  const pal = paletteOf(w.row), [r, g, b] = pal.foam;
  list.push({ x, z, level: w.level, fluid: w.fluid, look: w.look, r0, r1, life, width, alpha, age: 0, seed: Math.random() * 6.28, r, g, b, glow: pal.glow });
}

rideAlong({
  shift(dx, dy, dz) { for (const q of list) { q.x += dx; q.level += dy; q.z += dz; } },
  clear() { list.length = 0; mesh.visible = false; },
});

// every frame of play
export function tickRipples(dt) {
  if (!list.length) { mesh.visible = false; return; }
  const { position, ring, shape, color } = geometry.attributes;
  let n = 0;
  for (const q of list) {
    q.age += dt;
    if (q.age >= q.life) continue;
    const k = q.age / q.life, out = 1 - (1 - k) * (1 - k);   // (slowing as it spreads)
    const r = q.r0 + (q.r1 - q.r0) * out, wid = q.width / 2 * (1 - 0.5 * k), e = r + wid + 0.02;
    const y = drawnSurface(q.level, q.fluid, q.look) + LIFT;
    position.array.set([q.x - e, y, q.z - e, q.x + e, y, q.z - e, q.x - e, y, q.z + e, q.x + e, y, q.z + e], n * 12);
    ring.array.set([-e, -e, r, wid, e, -e, r, wid, -e, e, r, wid, e, e, r, wid], n * 16);
    const fade = q.alpha * (1 - k) * Math.min(1, q.age * 8);
    for (let v = 0; v < 4; v++) {
      shape.array.set([fade, q.seed, k, q.glow], (n * 4 + v) * 4);
      color.array.set([q.r, q.g, q.b], (n * 4 + v) * 3);
    }
    list[n++] = q;
  }
  list.length = n;
  geometry.setDrawRange(0, n * 6);
  mesh.visible = n > 0;
  position.needsUpdate = ring.needsUpdate = shape.needsUpdate = color.needsUpdate = true;
}
export const rippleCount = () => list.length;
