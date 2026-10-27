// The human figure (assets/character.glb, blender/character.py), shared by the player
// (render/character.js) and the villagers (render/villagers.js), and the things a figure wears
// and holds (core/items.js WEARABLES).
//
// A figure is { group, model, bones, nodes, worn }: `bones` by their Blender names ("hand.R"),
// `nodes` by their node names in the clips ("handR"), `worn` what it has on, by slot. Anything
// with `bones` and `worn` can wear things, the player's character too.
//
// A worn or held thing's model says in its extras which bone it sits on (`socket`), how
// (`mount_quat_gltf`, `mount_offset_gltf`, from the bone's root in rig units), which still clip
// holds the arm that carries it (`hold`: the character's Hold<Name> clip) and whether it floats
// over the hand (`float`, the crystal ball, which bobs and turns there).
//
// Armor (core/items.js ARMORS, blender/armor.py) is modelled where it sits on the character in its
// rest pose, in parts: every node with a `bone` in its extras goes on that bone (a breastplate on
// the spine, shoulder plates on the upper arms, a boot on each shin), placed by the bone's rest
// frame (restInverse), so it follows the bone as the body moves. A shield says where it goes on
// the back too (`back_bone`, `back_gltf`: a matrix, column-major, in the character's space),
// for when a bow needs the hand (game/armor.js). Worn armor shows its rarity: the trim (the glTF
// material Items_Trim) takes the rarity's colour from Decent up, glows from Remarkable up and runs
// through the rainbow on OMG; Crap and Shitty trim is dull and rusty.
import * as THREE from 'three';
import { loadGLB } from './gltf.js';
import { CHAR_SCALE } from '../core/constants.js';
import { ITEMS, outfitOf } from '../core/items.js';
import { RARITY } from '../core/gear/rarities.js';
import { cloneSkinned, cullBySphere, ownShadowDepth } from './skinned.js';

const URL = 'assets/character.glb';
const sanitize = name => THREE.PropertyBinding.sanitizeNodeName(name);

// source: an untouched copy of the rig to clone figures from; stand: the standing pose (the
// first frame of Jump) as [node name, quaternion, position?]; holds: per hold name, the arm
// bones of its clip as [node name, quaternion]
export const rig = { ready: false };

// one frame of a clip as [node name, quaternion, position | null] per bone
function frameOf(clip, i = 0) {
  const pose = new Map();
  for (const t of clip.tracks) {
    const dot = t.name.lastIndexOf('.'), node = t.name.slice(0, dot), prop = t.name.slice(dot + 1);
    const at = pose.get(node) ?? pose.set(node, [node, null, null]).get(node);
    if (prop === 'quaternion') at[1] = new THREE.Quaternion().fromArray(t.values, i * 4);
    if (prop === 'position') at[2] = new THREE.Vector3().fromArray(t.values, i * 3);
  }
  return [...pose.values()].filter(p => p[1]);
}

export const rigReady = loadGLB(URL).then(gltf => {
  const extras = name => gltf.parser.json.animations.find(a => a.name === name)?.extras || {};
  const holds = {};
  for (const clip of gltf.animations) {
    const e = extras(clip.name);
    if (!e.hold) continue;
    const arm = new Set(e.arm_bones.split(',').map(sanitize));
    holds[e.hold] = frameOf(clip).filter(([node]) => arm.has(node)).map(([node, q]) => [node, q]);
  }
  const jump = gltf.animations.find(c => c.name === 'Jump');
  // the figures' copy is taken before the player's setup changes the scene (render/character.js)
  Object.assign(rig, { ready: true, source: cloneSkinned(gltf.scene), stand: frameOf(jump), holds });
  return gltf;
});
rigReady.catch(e => console.error('character failed to load', e));

const bonesOf = model => {
  const bones = {}, nodes = {};
  model.traverse(o => { if (o.isBone) { bones[o.userData.name || o.name] = o; nodes[o.name] = o; } });
  return { bones, nodes };
};

// a new figure, its clay in `color` (default: as exported); stands in the standing pose
export function createFigure(color = null) {
  const model = cloneSkinned(rig.source);
  model.scale.setScalar(CHAR_SCALE);
  model.traverse(o => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    if (color) o.material.color.set(color);
    o.material.forceSinglePass = true;   // solid: one pass even when transparent (render/character.js)
    o.castShadow = true;
    if (o.isSkinnedMesh) cullBySphere(o); else o.frustumCulled = false;
    o.userData.sharedGeo = true;   // the rig owns the geometry
  });
  ownShadowDepth(model);
  const group = new THREE.Group();
  group.add(model);
  const f = { group, model, ...bonesOf(model), worn: {} };
  poseFigure(f);
  return f;
}

// the standing pose, the arms that carry something in their hold pose
export function poseFigure(f) {
  for (const [node, q, p] of rig.stand) {
    const b = f.nodes[node];
    if (!b) continue;
    b.quaternion.copy(q);
    if (p) b.position.copy(p);
  }
  for (const w of Object.values(f.worn)) if (w.hold) for (const [node, q] of rig.holds[w.hold] ?? []) f.nodes[node]?.quaternion.copy(q);
}

// the inverse of each bone's rest frame in the character's space (rig units, glTF Y up), by its
// Blender name: what turns a part modelled in that space into the bone's own
let rests = null;
export function restInverse(name) {
  if (!rests) {
    rests = new Map();
    const root = rig.source;
    root.updateMatrixWorld(true);
    const inv = root.matrixWorld.clone().invert();
    root.traverse(o => { if (o.isBone) rests.set(o.userData.name || o.name, inv.clone().multiply(o.matrixWorld).invert()); });
  }
  return rests.get(name) ?? null;
}

// The worn and held things' models, loaded once (by item id); wear() needs them loaded.
const things = new Map(), loading = new Map();
export function loadThing(id) {
  const def = ITEMS[id];
  if (!def?.slot) return Promise.reject(new TypeError(`Not a wearable item: ${id}`));
  if (!loading.has(id)) loading.set(id, loadGLB(def.model).then(g => { things.set(id, g.scene); return g.scene; })
    .catch(error => { loading.delete(id); throw error; }));
  return loading.get(id);
}
export const thingLoaded = id => things.has(id);

// Put item `id` on figure f (in its slot, replacing what was there). false: not loaded yet.
// Each copy has its own materials (a cube's fade changes them, render/fade.js). opts (worn as
// armor: game/armor.js): slot (the armor slot it goes in, not its own), rarity (an id: how its
// trim shines), back (a shield slung on the back; a thing carried in the off hand put away). Armor
// in parts goes on its bones (wearArmor); a hat or a thing carried (armor too) sits on its socket
// like on a villager, without the villager's hold pose; a right-hand thing carried in the off hand
// goes into the left hand, mirrored (the hero's right one holds the weapon).
export function wear(f, id, opts = {}) {
  const def = ITEMS[id], template = things.get(id);
  if (!def?.slot || !template) return false;
  let parts = false;
  template.traverse(o => { parts ||= !!o.userData.bone; });
  if (def.armor && parts) return wearArmor(f, id, template, opts);
  const key = opts.slot ?? def.slot, worn = !!opts.slot;
  takeOff(f, key);
  const object = template.clone(true);
  let node = null;
  object.traverse(o => { if (!node && o.userData.socket) node = o; });
  const d = node?.userData ?? {}, glowing = [], materials = [];
  object.traverse(o => {
    if (!o.isMesh) return;
    o.material = [].concat(o.material).map(m => {
      m = m.clone();
      // Glass must not occlude the face (or the bird's glowing core) with its depth buffer.
      if (m.transparent && m.opacity < 1) m.depthWrite = false;
      materials.push(m);
      // the gem-like part (the glTF material Items_Facets) shines in the item's glow colour
      if (def.glow && /Facets/.test(m.name)) { m.emissive.set(def.glow); m.emissiveIntensity = .6; glowing.push(m); }
      return m;
    });
    if (o.material.length === 1) o.material = o.material[0];
    o.castShadow = true;   // (rigid on a bone: culled by its own bounds, like any mesh)
    overGhost(o);
    o.userData.sharedGeo = true;   // the template owns the geometry
  });
  const socket = d.socket ?? 'hand.R', mirror = worn && key === 'shield' && socket === 'hand.R';
  f.bones[mirror ? 'hand.L' : socket].add(object);
  object.position.fromArray(d.mount_offset_gltf ?? [0, 0, 0]);
  object.quaternion.fromArray(d.mount_quat_gltf ?? [0, 0, 0, 1]);
  if (mirror) {   // the hands' frames mirror each other across their x: so does the mount
    object.position.x *= -1;
    object.quaternion.set(object.quaternion.x, -object.quaternion.y, -object.quaternion.z, object.quaternion.w);
    object.scale.x = -1;
  }
  object.visible = !(worn && opts.back);   // (the bow needs the hand)
  const rarity = def.armor ? opts.rarity ?? null : null;
  f.worn[key] = { id, slot: key, object, objects: [object], hold: worn ? null : d.hold ?? null, float: d.float ?? 0, glowing, rarity,
    back: worn && !!opts.back, shine: shine(materials.filter(m => !glowing.includes(m)), rarity),
    at: object.position.clone(), mount: object.quaternion.clone() };
  return true;
}

// What a figure wears or holds is drawn after its silhouette (the player's and the others' see-
// through ghost, render/character.js, render/partner.js: renderOrder 999, then the body 1000):
// drawn before it, a shield or a helm would count as terrain hiding the body, and the silhouette
// would shine through it. So it goes into the transparent pass too (fully opaque, writing depth),
// after both.
export function overGhost(mesh) {
  mesh.renderOrder = 1001;
  for (const m of [].concat(mesh.material)) { m.transparent = true; m.forceSinglePass = true; }
}

// a part of an armor model: its own meshes, not the parts hanging off it
function ownCopy(node) {
  const copy = node.isMesh ? node.clone(false) : new THREE.Object3D();
  copy.name = node.name;
  for (const c of node.children) if (!c.userData.bone) copy.add(c.clone(true));
  return copy;
}
const _m = new THREE.Matrix4();
function wearArmor(f, id, template, { rarity = null, back = false } = {}) {
  const def = ITEMS[id];
  takeOff(f, def.slot);
  template.updateMatrixWorld(true);
  const inv = template.matrixWorld.clone().invert(), objects = [], materials = [];
  template.traverse(node => {
    const d = node.userData;
    if (!d.bone) return;
    const slung = back && d.back_bone && d.back_gltf, bone = f.bones[slung ? d.back_bone : d.bone], rest = restInverse(slung ? d.back_bone : d.bone);
    if (!bone || !rest) return;
    const object = ownCopy(node);
    object.matrixAutoUpdate = false;
    object.matrix.copy(rest);
    if (slung) object.matrix.multiply(_m.fromArray(d.back_gltf));
    object.matrix.multiply(_m.multiplyMatrices(inv, node.matrixWorld));
    object.traverse(o => {
      if (!o.isMesh) return;
      o.material = [].concat(o.material).map(m => { m = m.clone(); materials.push(m); return m; });
      if (o.material.length === 1) o.material = o.material[0];
      o.castShadow = true;
      overGhost(o);
      o.userData.sharedGeo = true;   // the template owns the geometry
    });
    bone.add(object);
    objects.push(object);
  });
  f.worn[def.slot] = { id, slot: def.slot, object: objects[0], objects, hold: null, float: 0, glowing: [], rarity, back: !!back,
    shine: shine(materials, rarity) };
  return true;
}
// How worn armor shows its rarity (RARITIES in core/gear/rarities.js): the trim's colour, and from
// Remarkable up a glow that pulses (the gems glow from Decent up). -> { pulse: [materials],
// base: their glow, rainbow } or null when nothing moves.
const DULL = { crap: '#9a6a48', shitty: '#a8a294' };
function shine(materials, rarityId) {
  const r = RARITY[rarityId], trims = materials.filter(m => /Trim/.test(m.name)), gems = materials.filter(m => /Facets/.test(m.name));
  if (!r) return null;
  // the trim in a colour of the rarity's own, not times its vertex colours (a hat's band is dark)
  const plain = c => { for (const m of trims) { m.color.set(c); m.vertexColors = false; m.needsUpdate = true; } };
  if (DULL[r.id]) plain(DULL[r.id]);
  if (!r.glow) return null;
  const color = new THREE.Color().setRGB(...r.rgb);   // (linear, like the loot's glow: render/loot.js)
  plain(color.clone().lerp(WHITE, 0.15));
  const base = r.rank >= RARITY.remarkable.rank ? 0.2 + 0.15 * (r.rank - RARITY.remarkable.rank) : 0;
  const pulse = [];
  for (const m of [...trims, ...gems]) {
    if (!m.emissive) continue;
    const gem = gems.includes(m);
    if (!base && !gem) continue;
    m.emissive.copy(color); m.emissiveIntensity = gem ? Math.max(0.35, base * 1.5) : base;
    m.userData.glowBase = m.emissiveIntensity;
    pulse.push(m);
  }
  return pulse.length || r.glow.rainbow ? { pulse, trims, rainbow: !!r.glow.rainbow, steady: !base } : null;
}
const WHITE = new THREE.Color(1, 1, 1);

export function takeOff(f, slot) {
  const w = f.worn[slot];
  if (!w) return;
  for (const object of w.objects) {
    object.removeFromParent();
    object.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(m => m.dispose()); });
  }
  delete f.worn[slot];
}
// what figure `from` wears, on figure f too (the Renew boss's echo of the player; the inventory's
// hero); `load`: what is not loaded yet starts loading (and is missing until it is)
export function wearLike(f, from, load = false) {
  let all = true;
  for (const w of Object.values(from.worn ?? {})) {
    if (thingLoaded(w.id)) wear(f, w.id, w);
    else { all = false; if (load) loadThing(w.id).catch(e => console.error('outfit failed to load', e)); }
  }
  return all;
}
// what a worn thing is, as a key: the same key, the same look
export const wornKey = worn => Object.values(worn ?? {}).map(w => `${w.id}@${w.rarity ?? ''}@${w.back ? 1 : 0}`).sort().join(',');

// wear all of `ids` (one per slot, core/items.js outfitOf)
export function dress(f, ids) {
  for (const id of Object.values(outfitOf(ids))) wear(f, id);
}

const _q = new THREE.Quaternion(), _up = new THREE.Vector3(), _spin = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
// floating things bob over the hand and turn slowly; glowing ones pulse. After the pose.
export function animateWorn(f, time, phase = 0) {
  for (const w of Object.values(f.worn)) {
    const t = time + phase;
    if (w.float) {
      // up in the socket bone's frame, whatever way the hand is turned
      w.object.parent.getWorldQuaternion(_q).invert();
      _up.copy(Y).applyQuaternion(_q);
      w.object.position.copy(w.at).addScaledVector(_up, Math.sin(t * 2.1) * .04);
      w.object.quaternion.copy(w.mount).multiply(_spin.setFromAxisAngle(Y, t * .8));
    }
    for (const m of w.glowing) m.emissiveIntensity = .55 + .25 * Math.sin(t * 2.7);
    const s = w.shine;
    if (!s) continue;
    if (s.rainbow) {
      _c.setHSL(((t * 0.4) % 1 + 1) % 1, 1, 0.6);
      for (const m of s.trims) m.color.copy(_c);
      for (const m of s.pulse) m.emissive.copy(_c);
    }
    if (!s.steady) for (const m of s.pulse) m.emissiveIntensity = m.userData.glowBase * (0.75 + 0.25 * Math.sin(t * 3.1));
  }
}
const _c = new THREE.Color();
