// The game's point lights. three.js recompiles every lit shader when the number of its lights
// changes, which made entering a cube stutter, so the lights a cube or a figure brings are only
// light sources, taken out of the scene; the shaders walk lists of them instead
// (render/lighthook.js), every one of them on all the time, however far away:
//   - the ones that stay where they are become the cube's fixed lights, with baked shadows
//     (render/bake.js);
//   - the moving ones (shots, enemies, loot, the villagers' lamps, a partner) shine where they
//     are each frame (updateLightPool). Should more than MAX_MOVING ever shine at once, the
//     nearest to the focus point are taken, the farthest of them fading out as they come near the
//     first one left out.
// (The hero's own lamp is a three.js light of its own, with shadows: render/character.js.)
import * as THREE from 'three';
import { addBakedLight } from './bake.js';
import { BAKE, MAX_MOVING, FAR_MOVE, FAR_W, touch } from './lighthook.js';

const FADE = 1.5;   // how far before the first source left out a taken one has faded out (only past MAX_MOVING)
let sources = [];
const tmp = new THREE.Vector3();

// take the point lights out of a freshly built cube (group) and use them as sources; bake: the
// cube's (render/bake.js), which takes those that do not move (not on a villager)
const moves = (l, group) => { for (let o = l.parent; o && o !== group; o = o.parent) if (o.userData.villager) return true; return false; };
export function adoptLights(group, bake = null) {
  const found = [];
  group.traverse(o => { if (o.isPointLight) found.push(o); });
  for (const l of found) {
    const parent = l.parent;
    if (bake && !bake.flip && !moves(l, group) && addBakedLight(bake, l, group, parent)) { parent.remove(l); continue; }
    parent.remove(l); sources.push({ l, parent, group, gain: 1, pos: new THREE.Vector3() });
  }
}

export function releaseLights(group) { sources = sources.filter(s => s.group !== group); }

// a light that moves with `object` (an enemy, a projectile): light.position is local to it;
// it shines while the object is visible, at whatever intensity the owner sets; group: the cube
// it belongs to (fades and is released with it). It must not be in the scene itself: every
// light that comes or goes there recompiles all lit shaders (seconds, with a few of them), so
// one added to its object is taken out again. gain: how much brighter it shines than the source
// says (the lights of shots, projectiles, flask areas, loot and partners were tuned while they
// shone twice, in the scene and from the old light pool: 2 keeps their look).
// learn: light.html#kinds (see learn/README.md)
export function trackLight(light, object, group = object, gain = 1) {
  if (light.parent) light.parent.remove(light);
  sources.push({ l: light, parent: object, group, gain, pos: new THREE.Vector3() });
}
export function untrackLight(light) { sources = sources.filter(s => s.l !== light); }

export function updateLightPool(focus) {
  for (const s of sources) {
    s.parent.updateWorldMatrix(true, false);
    s.pos.copy(s.l.position).applyMatrix4(s.parent.matrixWorld);
    s.d = s.pos.distanceToSquared(focus);
  }
  let shown = sources.filter(s => s.group.visible && s.parent.visible && s.l.visible && s.l.intensity > 0);
  let cut = Infinity;
  if (shown.length > MAX_MOVING) {
    shown.sort((a, b) => a.d - b.d);
    cut = Math.sqrt(shown[MAX_MOVING].d);
    shown = shown.slice(0, MAX_MOVING);
  }
  // (their row of the lights' texture: render/lighthook.js FAR_MOVE)
  const table = BAKE.uFar.value, L = table.image.data, base = FAR_MOVE * FAR_W * 4;
  shown.forEach((s, i) => {
    const o = base + i * 8, edge = Math.min(1, Math.max(0, (cut - Math.sqrt(s.d)) / FADE));
    const k = s.l.intensity * s.gain * (s.group.userData.fade ?? 1) * edge;
    L[o] = s.pos.x; L[o + 1] = s.pos.y; L[o + 2] = s.pos.z; L[o + 3] = s.l.distance || 1e3;
    L[o + 4] = s.l.color.r * k; L[o + 5] = s.l.color.g * k; L[o + 6] = s.l.color.b * k; L[o + 7] = 0;
  });
  BAKE.uMoveN.value = shown.length;
  if (shown.length) touch(table, base, shown.length * 8);
}

export const focusPoint = (x, y, z) => tmp.set(x, y, z);
