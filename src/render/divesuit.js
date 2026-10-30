// The diving suit of Umbra's reef (its model blender/divingsuit.py, assets/divingsuit.glb; game/dive.js
// says who wears it): a brass helmet with portholes, a copper corselet, a tank of two bottles on the
// back and heavy boots. Like armor (render/figure.js wear), each part sits on the bone it names, put
// there by the bone's rest frame, so it follows the body without being skinned.
//   dressSuit(f, t)   on figure f (our hero, a friend's), `t` s after it was taken (null: off): it goes
//                     on piece by piece (`STEPS`): the boots clank on, the tank swings onto the back,
//                     the corselet drops over the shoulders and the helmet comes down from above and is
//                     bolted on, a puff of air at each and sparks at the bolts; the helmet hides what is
//                     worn on the head; under water bubbles rise from it with every breath
//   suitStand(...)    the whole suit standing on its brass stand in the reef, before anybody takes it
import * as THREE from 'three';
import { loadGLB } from './gltf.js';
import { restInverse, overGhost } from './figure.js';
import { CHAR_SCALE } from '../core/constants.js';
import { UMBRA_FIGHT } from '../core/umbra.js';
import { emit, soft, glow, rand } from './particles.js';
import { sfx } from '../audio/sfx.js';

const ROOT = new URL('../../', import.meta.url);
// when each part goes on (s after taking it: from, until) and where it comes from (rig units, the
// figure's own space: Y up, +Z ahead)
const STEPS = {
  bootL: { at: [0.1, 0.6], from: [0, -0.5, 0.1] }, bootR: { at: [0.4, 0.9], from: [0, -0.5, 0.1] },
  tank: { at: [0.9, 1.6], from: [0, 0.2, -0.9] }, corselet: { at: [1.5, 2.1], from: [0, 0.9, 0] },
  helmet: { at: [2.2, 3.1], from: [0, 1.4, 0] },
};
const BOLTS = 3.2;   // s: the helmet's bolts tightened (sparks, a hiss of air); all on by UMBRA_FIGHT.suit
let template = null, loading = null;
export function loadSuit() {
  loading ??= loadGLB(new URL('assets/divingsuit.glb', ROOT).href).then(g => {
    template = g.scene.getObjectByName('DivingSuit') ?? g.scene;
    template.updateMatrixWorld(true);
    return template;
  }).catch(e => { console.error('diving suit failed to load', e); loading = null; });
  return loading;
}
const partOf = node => /_(\w+)$/.exec(node.name)?.[1] ?? 'helmet';
// a part's own meshes (not the parts hanging off it)
function ownCopy(node) {
  const copy = node.isMesh ? node.clone(false) : new THREE.Object3D();
  copy.name = node.name;
  for (const c of node.children) if (!c.userData.bone) copy.add(c.clone(true));
  copy.traverse(o => {
    if (!o.isMesh) return;
    o.material = [].concat(o.material).map(m => m.clone());
    if (o.material.length === 1) o.material = o.material[0];
    o.castShadow = true;
    o.userData.sharedGeo = true;
  });
  return copy;
}
const ease = k => { k = Math.min(1, Math.max(0, k)); return k * k * (3 - 2 * k); };
const _m = new THREE.Matrix4(), _o = new THREE.Matrix4(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

// The suit on figure f, `t` s after it was taken (null: none). Returns whether it is all there.
export function dressSuit(f, t) {
  if (t === null || t === undefined) { undress(f); return false; }
  if (!template) { loadSuit(); return false; }
  let s = f.suit;
  if (!s) {
    const inv = template.matrixWorld.clone().invert(), parts = [];
    template.traverse(node => {
      const bone = node.userData.bone && f.bones[node.userData.bone], rest = node.userData.bone && restInverse(node.userData.bone);
      if (!bone || !rest) return;
      const object = ownCopy(node), name = partOf(node);
      object.matrixAutoUpdate = false;
      object.traverse(o => { if (o.isMesh) overGhost(o); });
      bone.add(object);
      parts.push({ object, name, rest, own: inv.clone().multiply(node.matrixWorld), step: STEPS[name] ?? STEPS.helmet, on: false });
    });
    s = f.suit = { parts, bolted: false, breath: 0, hidden: [] };
  }
  for (const p of s.parts) {
    const [a, b] = p.step.at, k = ease((t - a) / (b - a)), from = p.step.from;
    p.object.visible = t >= a;
    _o.makeTranslation((1 - k) * from[0], (1 - k) * from[1], (1 - k) * from[2]);
    p.object.matrix.copy(p.rest).multiply(_o).multiply(p.own);
    p.object.matrixWorldNeedsUpdate = true;
    if (k >= 1 && !p.on) { p.on = true; landed(p, f); }
    else if (k < 1) p.on = false;
  }
  // the helmet on: what is worn on the head goes under it
  const helmet = t >= STEPS.helmet.at[0];
  for (const w of [f.worn?.head]) if (w) for (const o of w.objects) { if (helmet && o.visible) { o.visible = false; s.hidden.push(o); } }
  if (!helmet && s.hidden.length) { s.hidden.forEach(o => { o.visible = true; }); s.hidden = []; }
  if (t >= BOLTS && !s.bolted) { s.bolted = true; bolted(s, f); }
  if (t < BOLTS) s.bolted = false;
  return t >= UMBRA_FIGHT.suit;
}
function undress(f) {
  const s = f.suit;
  if (!s) return;
  for (const p of s.parts) { p.object.removeFromParent(); p.object.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(m => m.dispose()); }); }
  s.hidden.forEach(o => { o.visible = true; });
  f.suit = null;
}
const worldOf = (o, out) => o.getWorldPosition(out);
// a part clanking into place: a puff where it lands
function landed(p, f) {
  worldOf(p.object, _v);
  if (p.name === 'helmet') worldOf(f.bones.head, _v);
  sfx(p.name === 'helmet' ? 'unlock' : 'thud', { at: _v, pitch: p.name.startsWith('boot') ? 1.4 : 1.1, volume: 0.5 });
  for (let i = 0; i < 8; i++)
    emit(soft, _v.x + rand(-0.15, 0.15), _v.y + rand(-0.1, 0.15), _v.z + rand(-0.15, 0.15), { v: [rand(-0.6, 0.6), rand(0.2, 0.8), rand(-0.6, 0.6)],
      life: rand(0.3, 0.6), size: rand(0.06, 0.12), grow: 1.5, color: '#e8eef0', alpha: 0.5, drag: 2 });
}
// the helmet bolted on: sparks round its foot, a hiss of air
function bolted(s, f) {
  worldOf(f.bones.head, _v);
  sfx('whirl', { at: _v, pitch: 1.6, volume: 0.6 });
  for (let i = 0; i < 18; i++) {
    const a = rand(0, Math.PI * 2), r = 0.2;
    emit(glow, _v.x + Math.cos(a) * r, _v.y - 0.05, _v.z + Math.sin(a) * r, { v: [Math.cos(a) * rand(0.6, 1.4), rand(0.3, 1.2), Math.sin(a) * rand(0.6, 1.4)],
      life: rand(0.2, 0.45), size: rand(0.02, 0.04), color: ['#fff0a0', '#ffd25a', '#ff9a3a'][i % 3], gravity: 6, drag: 1 });
  }
  for (let i = 0; i < 10; i++)
    emit(soft, _v.x + rand(-0.1, 0.1), _v.y + 0.15, _v.z + rand(-0.1, 0.1), { v: [rand(-0.8, 0.8), rand(0.4, 1.2), rand(-0.8, 0.8)],
      life: rand(0.4, 0.8), size: rand(0.08, 0.14), grow: 1.8, color: '#f4f8fa', alpha: 0.45, drag: 2.5 });
}
// under water: a breath of bubbles out of the helmet's valve now and then
export function breathe(f, dt, under) {
  const s = f.suit;
  if (!s || !under) return;
  if ((s.breath += dt) < 1.7) return;
  s.breath = rand(-0.4, 0);
  worldOf(f.bones.head, _v);
  for (let i = 0; i < 6; i++)
    emit(soft, _v.x + rand(-0.12, 0.12), _v.y + 0.25 + i * 0.03, _v.z + rand(-0.12, 0.12), { v: [rand(-0.15, 0.15), rand(0.7, 1.3), rand(-0.15, 0.15)],
      life: rand(1.2, 2), size: rand(0.03, 0.065), color: '#e8fbff', alpha: 0.75, drag: 0.8, gravity: -0.6 });
}

// The suit standing on its stand (a brass pole on a round foot, a crossbar at the shoulders), as it
// waits in the reef: made once, kept in `holder` (its view), shown at (x, y, z) facing `yaw`.
export function suitStand(holder, at, show, off) {
  if (!show) { if (holder.stand) holder.stand.visible = false; return; }
  if (!template) { loadSuit(); return; }
  let g = holder.stand;
  if (!g) {
    g = holder.stand = new THREE.Group();
    const suit = new THREE.Group();
    suit.scale.setScalar(CHAR_SCALE);
    template.traverse(node => { if (node.userData.bone) { const o = ownCopy(node); o.matrixAutoUpdate = false; o.matrix.copy(template.matrixWorld.clone().invert().multiply(node.matrixWorld)); suit.add(o); } });
    const brass = new THREE.MeshStandardMaterial({ color: 0xb58a3e, metalness: 0.6, roughness: 0.4 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3e26, roughness: 0.85 });
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.08, 18), wood);
    foot.position.y = 0.04;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.82, 10), brass);
    pole.position.set(0, 0.45, 0.06);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 8), brass);
    bar.rotation.z = Math.PI / 2; bar.position.set(0, 0.8, 0.06);
    g.add(suit, foot, pole, bar);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    holder.group.add(g);
  }
  g.visible = true;
  g.position.set(at.x + off.x, at.y + off.y, at.z + off.z);
  g.rotation.y = at.yaw ?? 0;
}

// the friends' figures (render/partner.js): in the suit where game/dive.js says, all of it on
let suitedAt = () => false;
export const setSuitedAt = fn => { suitedAt = fn; };
export function partnerSuit(f, x, y, z) { dressSuit(f, suitedAt(x, y, z) ? UMBRA_FIGHT.suit + 1 : null); }
