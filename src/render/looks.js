// Items wear their looks (core/looks.js, docs/looks.md): a small pixelated texture per look,
// projected onto the model in the shader, since the item models have no UVs (vertex colours
// only, blender/items.py). Each face takes the tile of its material's slot from the side it faces
// most (a box projection in the mesh's own space, the face's normal from the derivatives: flat,
// whatever the normals), so the pattern sits on the geometry and is the same on the floor, in
// a hand, on the body and in the pictures.
//   lookTexture(key)      the look's texture, made once and kept (the least used go past KEEP)
//   dressLook(root, item) every item material in root swapped for its look's (shared by all that
//                         look alike, made once); item: a bag slot, a pickup, an id, a key, or null
//                         for the model's own
//   lookOnto(material, item)  the same on a material of one's own, in place (render/figure.js)
//   markLookScale(scene)  on load (render/gltf.js): how many texels a unit each part of the model
//                         takes (an attribute of its geometry, core/looks.js partScales)
//   pulseLooks(time)      every frame (render/loot.js, render/itemviews.js): the glowing texels
//                         pulse together, like rare armor's trim (render/figure.js animateWorn)
import * as THREE from 'three';
import { LOOK_W, LOOK_H, LOOK_TILE, lookSlot, lookKey, parseLook, paintLook, partScales } from '../core/looks.js';

// texels per model unit (the hero's rig: a breastplate gets about 56 across), more on small things
// so a coin or a potion still shows a whole tile, and on thin parts (core/looks.js partScales: a
// long sword's blade about 6 across, up to twice this)
const DENSITY = 40, MIN_TEXELS = 16;
// how bright the glowing texels are now (pulseLooks)
export const lookPulse = { value: 1 };
export const pulseLooks = time => { lookPulse.value = 0.75 + 0.25 * Math.sin(time * 3.1); };
const KEEP = 256;   // looks' textures kept (4 KB each)

const textures = new Map();   // key -> DataTexture, the most recently used last
export function lookTexture(key) {
  let t = textures.get(key);
  if (t) { textures.delete(key); textures.set(key, t); return t; }
  const look = parseLook(key);
  if (!look) return null;
  const px = paintLook(look);
  t = new THREE.DataTexture(new Uint8Array(px.buffer), LOOK_W, LOOK_H, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.colorSpace = THREE.NoColorSpace;   // (the shader reads the bytes as they are, core/looks.js)
  t.needsUpdate = true;
  textures.set(key, t);
  // (a texture let go but still drawn is simply uploaded again)
  if (textures.size > KEEP) { const [k, old] = textures.entries().next().value; textures.delete(k); old.dispose(); }
  return t;
}

// the box of every mesh of a freshly loaded model, in its own frame: its texel density, and each
// part's, kept on its geometries as the attribute lookScale (shared by every copy, however the
// copy is turned or scaled)
export function markLookScale(scene) {
  let any = false;
  scene.traverse(o => { if (o.isMesh) any ||= [].concat(o.material).some(m => lookSlot(m.name) >= 0); });
  if (!any) return;
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3();
  scene.traverse(o => { if (o.isMesh) box.expandByObject(o); });
  const size = box.getSize(new THREE.Vector3()), big = Math.max(size.x, size.y, size.z, 1e-3);
  const scale = Math.max(DENSITY, MIN_TEXELS / big);
  scene.traverse(o => {
    if (!o.isMesh || o.geometry.attributes.lookScale) return;
    const g = o.geometry, p = g.attributes.position, xyz = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { xyz[i * 3] = p.getX(i); xyz[i * 3 + 1] = p.getY(i); xyz[i * 3 + 2] = p.getZ(i); }
    g.setAttribute('lookScale', new THREE.BufferAttribute(partScales(xyz, g.index ? Array.from(g.index.array) : null, scale), 1));
  });
}

const VERT = 'attribute float lookScale;\nvarying vec3 vLookPos;\n';
const FRAG = 'uniform sampler2D uLookMap;\nuniform float uLookTile, uLookPulse;\nvarying vec3 vLookPos;\n';
// the tile's texel under this fragment: alpha 0 shades the model's colour (0.5 leaves it), up to
// 0.5 paints over it, above glows (core/looks.js)
const SAMPLE = `
  vec3 lookF = abs(cross(dFdx(vLookPos), dFdy(vLookPos)));
  vec3 lookP = vLookPos;
  vec2 lookUv = (lookF.x >= lookF.y && lookF.x >= lookF.z ? lookP.zy : lookF.y >= lookF.z ? lookP.xz : lookP.xy) + ${LOOK_TILE / 2}.0;
  const vec2 LOOK_SIZE = vec2(${LOOK_W}.0, ${LOOK_H}.0);
  vec4 lookT = textureGrad(uLookMap, (vec2(uLookTile * ${LOOK_TILE}.0, 0.0) + mod(lookUv, ${LOOK_TILE}.0)) / LOOK_SIZE,
    dFdx(lookUv) / LOOK_SIZE, dFdy(lookUv) / LOOK_SIZE);
  vec3 lookC = pow(lookT.rgb, vec3(2.2));
  float lookPaint = clamp(lookT.a * 2.0, 0.0, 1.0), lookGlow = clamp(lookT.a * 2.0 - 1.0, 0.0, 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb * lookT.rgb * 2.0, lookC, lookPaint);`;
const GLOW = `
  totalEmissiveRadiance += lookC * lookGlow * 1.6 * uLookPulse;`;

const looks = new WeakMap();   // a look's material -> { base, key }
// material m (one's own) in the look of `key` (with texture tex), in place
function patch(m, key, tex) {
  const slot = lookSlot(m.name);
  if (slot < 0 || !m.isMeshStandardMaterial) return m;
  const prev = m.onBeforeCompile, cacheKey = m.customProgramCacheKey();
  const uniforms = { uLookMap: { value: tex }, uLookTile: { value: slot }, uLookPulse: lookPulse };
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = VERT + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vLookPos = position * lookScale;');
    sh.fragmentShader = FRAG + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>' + SAMPLE)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>' + GLOW);
  };
  m.customProgramCacheKey = () => cacheKey + '|look';
  m.needsUpdate = true;
  looks.set(m, { key });
  return m;
}
export function lookOnto(material, item) {
  const key = lookKey(item), tex = key && lookTexture(key);
  return tex ? patch(material, key, tex) : material;
}

// the marks of the shader edits made on a material in place (render/fade.js, farlook.js,
// underwater.js diveTinted)
const EDITS = ['fadeU', 'farLook', 'diveTinted'];
// base material -> Map(key -> its look's material)
const made = new WeakMap();
function lookMaterial(base, key, tex) {
  if (lookSlot(base.name) < 0 || !base.isMeshStandardMaterial) return base;
  let byKey = made.get(base);
  if (!byKey) made.set(base, byKey = new Map());
  let m = byKey.get(key);
  if (!m) {
    m = base.clone();
    // (a clone keeps the base's userData but not its shader edits: the edits made in place since
    // it was loaded, by their marks, are made on it again when they come)
    for (const k of EDITS) delete m.userData[k];
    m = patch(m, key, tex);
    looks.get(m).base = base;
    byKey.set(key, m);
  }
  return m;
}
export function dressLook(root, item) {
  const key = item ? lookKey(item) : '', tex = key ? lookTexture(key) : null;
  root.traverse(o => {
    if (!o.isMesh) return;
    const one = m => { const base = looks.get(m)?.base ?? m; return tex ? lookMaterial(base, key, tex) : base; };
    o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
  });
  return root;
}
// the look a model wears now ('' for its own)
export function lookOn(root) {
  let key = '';
  root.traverse(o => { if (!key && o.isMesh) for (const m of [].concat(o.material)) key ||= looks.get(m)?.key ?? ''; });
  return key;
}
