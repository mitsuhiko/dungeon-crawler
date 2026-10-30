// The other players when playing together (src/net/session.js): each a figure like the
// villagers (render/figure.js), tinted in their colour (net/online.js PLAYER_COLORS), posed
// bone by bone as their game posed its character,
// holding their weapon, wearing what they wear, with a silhouette where terrain hides them, a
// small light, and their name, level and health over the head, in their painted skin (over
// the tint, as our own: render/character.js setCharacterSkin; net/session.js fetches it).
// capturePose() is the other half: our own character's pose, to send.
import * as THREE from 'three';
import { loadGLB } from './gltf.js';
import { CHAR_H } from '../core/constants.js';
import { uiScale } from '../game/uiscale.js';
import { BONES, Q, packPose, wornOf } from '../net/protocol.js';
import { lerpAngle } from '../net/sync.js';
import { scene, camera } from './scene.js';
import { character, mountWeapon, wornSkin } from './character.js';
import { prepareHeld, updateHeld } from './held.js';
import { setSkinMap, skinTexture } from './skin.js';
import { rig, createFigure, takeOff, wearLike, wornKey, animateWorn, ghostMaterial } from './figure.js';
import { waterlineAt, NONE } from './waterline.js';
import { setFarLook } from './farlook.js';
import { trackLight, untrackLight } from './lightpool.js';
import { makeBar, makeLevelLabel, makeNote } from './bars.js';
import { playerColor } from '../net/online.js';
import { tr } from '../i18n/i18n.js';
import { walkPrints } from './footprints.js';
import { slimeAt } from '../game/footsteps.js';

// a player's colour, lighter (towards white by `k`)
const shade = (slot, k) => new THREE.Color(playerColor(slot)).lerp(new THREE.Color(0xffffff), k);
// the clay of player `slot`'s hero: theirs here, ours on our own hero (render/character.js
// tintCharacter), so everyone looks the same on every screen
export const playerTint = slot => '#' + shade(slot, 0.45).getHexString();
const SNAP = 2;   // cells: a jump further than this between two messages is not blended

// our own character as a pose (protocol.js packPose), null before it loaded
export function capturePose() {
  if (!character.ready) return null;
  const g = character.group, b = character.bones, quats = [];
  for (const n of BONES) quats.push(...b[n].quaternion.toArray());
  return packPose(g.position.toArray(), g.rotation.y, b.hips.position.toArray(), quats);
}

// what our character holds and wears, for the other side to show: worn things as
// 'id@rarity@back' (armor: its rarity, a shield on the back: 1; protocol.js wornOf reads them)
export function capturedLook() {
  return { armed: !!character.sword?.visible,
    worn: Object.values(character.worn ?? {}).map(w => `${w.id}@${w.rarity ?? ''}@${w.back ? 1 : 0}`), skin: wornSkin()?.id ?? null };
}

// slot -> { f, group, ghost, light, tag, bars, hp, label, note, name, weapon: { url, object, want }, worn, clay }
const figs = new Map();
// slot -> the texture of the skin player `slot` wears (setPartnerSkin); kept while their figure
// is made again
const skins = new Map();

function build(slot, name) {
  const f = createFigure(playerTint(slot)), group = f.group;
  let mesh = null;
  const clay = [];   // the body's meshes, for the skin (not what is worn or held later)
  f.model.traverse(o => { if (o.isSkinnedMesh) mesh = o; if (o.isMesh) { o.userData.skinMaterial = true; clay.push(o); } });
  if (skins.has(slot)) for (const o of clay) setSkinMap(o, skins.get(slot));
  // silhouette where terrain hides them, like our own (render/character.js)
  const ghost = new THREE.SkinnedMesh(mesh.geometry, ghostMaterial(shade(slot, 0.5)));
  ghost.bind(mesh.skeleton, mesh.bindMatrix);
  ghost.renderOrder = 999; ghost.boundingSphere = mesh.boundingSphere;   // culled with the body
  ghost.userData.sharedGeo = true;
  mesh.parent.add(ghost);
  mesh.material.transparent = true;
  mesh.material.forceSinglePass = true;   // a solid body (render/character.js)
  mesh.renderOrder = 1000;
  const light = new THREE.PointLight(shade(slot, 0.65), 0.8, 3, 2);
  light.position.y = 0.9;
  trackLight(light, group, group, 2);   // a light source, not in the scene (render/lightpool.js)
  // name, level and health, over the world like our own (render/playerbar.js)
  const tag = new THREE.Group(), bars = new THREE.Group(), hp = makeBar({ color: shade(slot, 0).getHex(), onTop: true });
  const label = makeLevelLabel(1, { onTop: true, color: '#' + shade(slot, 0.7).getHexString(), title: name });
  label.position.y = 0.16;
  const note = makeNote();
  note.position.y = 0.36;
  bars.add(hp.group);
  tag.add(bars, label, note);
  scene.add(group, tag);
  group.visible = tag.visible = false;
  return { f, group, ghost, light, tag, bars, hp, label, note, name, weapon: { url: null, object: null, want: null }, worn: '', clay };
}

// player `slot` wears the skin drawn in `canvas` (game/skinfiles.js skinImage; null: none)
export function setPartnerSkin(slot, canvas = null) {
  skins.get(slot)?.dispose();
  const texture = canvas && skinTexture(canvas);
  if (texture) skins.set(slot, texture); else skins.delete(slot);
  for (const o of figs.get(slot)?.clay ?? []) setSkinMap(o, texture);
}

// player `slot` went (undefined: all of them)
export function removePartner(slot) {
  if (slot === undefined) { for (const s of [...figs.keys()]) removePartner(s); return; }
  const fig = figs.get(slot);
  if (!fig) return;
  fig.group.removeFromParent(); fig.tag.removeFromParent();
  untrackLight(fig.light);
  figs.delete(slot);
}

// Weapons come in their own copy: the player's own models are changed for the hand they are in
// (render/held.js), so each url is loaded again here, once.
const weapons = new Map();
function weaponModel(url) {
  if (!weapons.has(url)) weapons.set(url, loadGLB(url).then(g => g.scene)
    .catch(e => { weapons.delete(url); console.error('partner weapon failed to load', e); return null; }));
  return weapons.get(url);
}
function setWeapon(fig, url) {
  const w = fig.weapon;
  if (w.want === url) return;
  w.want = url;
  if (w.object) { w.object.removeFromParent(); w.object = null; w.url = null; w.held = null; }
  if (!url) return;
  const f = fig;
  weaponModel(url).then(model => {
    if (figs.get(f.slot) !== f || w.want !== url || !model) return;
    model.removeFromParent();
    const item = mountWeapon(f.f.bones, model);
    w.object = model; w.url = url;
    w.held = item?.userData.weapon === 'flail' ? prepareHeld(model, item) : null;   // (its balls swing: render/held.js)
  });
}
// what they wear (protocol.js wornOf: [{ id, slot, rarity, back }], one per slot)
function setWorn(fig, list) {
  const worn = Object.fromEntries(list.map(w => [w.slot, w])), key = wornKey(worn);
  if (fig.worn === key) return;
  for (const slot of Object.keys(fig.f.worn)) takeOff(fig.f, slot);
  if (wearLike(fig.f, { worn }, true)) fig.worn = key;   // else: again next time, once loaded
}

const qa = [], qb = [], _q = new THREE.Quaternion(), IDLE = { sword: { active: false } };
// show player `slot` between messages a and b (k of the way, src/net/sync.js Timeline.at), or
// hide them (null); where: their cube as it is drawn (game/drawn.js drawnAt: the one played in, or
// one of the surroundings, where they are dimmed and dissolve with it, render/farlook.js)
export function showPartner(slot, span, name, where = null) {
  let fig = figs.get(slot);
  if (!span) { if (fig) fig.group.visible = fig.tag.visible = false; return; }
  if (!rig.ready) return;
  if (fig && fig.name !== name) { removePartner(slot); fig = null; }
  if (!fig) { fig = build(slot, name); fig.slot = slot; figs.set(slot, fig); }
  let { a, b, k } = span;
  if (a.cube !== b.cube || Math.hypot(...a.pose.p.map((x, i) => x - b.pose.p[i])) > SNAP) { a = b; k = 0; }
  k = Math.min(1, Math.max(0, k));
  const A = a.pose, B = b.pose, mix = (x, y) => x + (y - x) * k;
  fig.group.position.set(mix(A.p[0], B.p[0]), mix(A.p[1], B.p[1]), mix(A.p[2], B.p[2]));
  fig.group.rotation.y = lerpAngle(A.yaw, B.yaw, k);
  const at = fig.group.position, far = !!where?.dim;
  if (where) at.add(where.at);
  // (a wet print as they walk over slime, render/footprints.js; the water they are in: only what
  // the cube played in knows)
  fig.ghost.material.userData.floor.value = far ? NONE : waterlineAt(at.x, at.y, at.z);   // (none under the water they are in)
  if (!far) walkPrints('partner:' + slot, at.x, at.y, at.z, fig.group.rotation.y, 1, slimeAt(at.x, at.y, at.z));
  const bones = fig.f.bones;
  bones.hips.position.set(mix(A.hips[0], B.hips[0]), mix(A.hips[1], B.hips[1]), mix(A.hips[2], B.hips[2]));
  BONES.forEach((n, i) => {
    for (let j = 0; j < 4; j++) { qa[j] = A.q[i * 4 + j] / Q; qb[j] = B.q[i * 4 + j] / Q; }
    const q = bones[n].quaternion;
    q.fromArray(qa).normalize();
    if (k > 0) q.slerp(_q.fromArray(qb).normalize(), k);
  });
  setWeapon(fig, typeof b.weapon === 'string' ? b.weapon : null);
  if (fig.weapon.object) fig.weapon.object.visible = b.armed !== false;
  const now = performance.now() / 1000, dt = Math.min(0.1, now - (fig.at ?? now));
  fig.at = now;
  if (fig.weapon.held && fig.weapon.object.visible) {
    fig.group.updateMatrixWorld(true);
    updateHeld(fig.weapon.held, IDLE, null, dt);
  }
  setWorn(fig, wornOf(b.worn));
  animateWorn(fig.f, performance.now() / 1000, slot);   // (rare armor shines)
  setFarLook(fig.group, far ? where : null);   // (what they wear and hold too)
  fig.group.visible = fig.tag.visible = true;
  // the tag: over the head, facing the camera
  fig.tag.position.set(fig.group.position.x, fig.group.position.y + CHAR_H + 0.4, fig.group.position.z);
  fig.tag.scale.setScalar(uiScale());   // (the UI scale, game/uiscale.js: growing upwards from the bar)
  fig.bars.quaternion.copy(camera.quaternion);
  fig.hp.set(b.hp / (b.maxHp || 1));
  fig.label.setLevel(Number.isFinite(b.level) ? b.level : 1);
}

// where player `slot` is drawn (null: not shown)
export const partnerAt = slot => { const f = figs.get(slot); return f?.group.visible ? f.group.position : null; };

// over player `slot` while they lie downed (game/downed.js): ko [helped up %, s left], or null
export function showHelp(slot, ko, name) {
  const fig = figs.get(slot);
  if (!fig) return;
  if (!ko) { fig.note.setText(null); return; }
  fig.note.setText(ko[0] > 0 ? tr('Helping {name} up {n}%', { name, n: ko[0] }) : tr('{name} is down! Stand next to them', { name }), ko[0] > 0 ? '#9be05a' : '#ff9a8a');
}
