// Drives the character from the controller state: places and turns the model, runs the
// blend trees (render/blendtree.js), plays the attack clip of the weapon in hand (Slash, Shoot,
// CrossbowShot, Cast) and lays its Hold pose over the rest, poses the ragdoll, and plays the
// get-up clip (GetUpBack / GetUpFront), morphing from the ragdoll pose into it.
import * as THREE from 'three';
import { clamp } from '../core/util.js';
import { DIRS, CHAR_SCALE } from '../core/constants.js';
import { player, state } from '../game/state.js';
import { attackOf } from '../core/enemies.js';
import { FLAT } from '../game/juice.js';
import { SWORD, swingClipTime, swingClipFrom } from '../core/combat.js';
import { character } from './character.js';
import { applyRagdollPose } from './ragdollpose.js';
import { stretchStride } from './stride.js';
import { updateHeld } from './held.js';
import { W, blend, updateBlend, resetMode } from './blendtree.js';

// learn: animation.html#getup (see learn/README.md)
const MORPH = 0.3;       // s from the ragdoll pose into the get-up clip
const GET_UP_OUT = 10;   // fade-out rate of a get-up cut short by walking
let clean = null;        // [bone, quaternion, position]: the pose the mixer produced last
let getUp = null;        // the player.getUp being played
let upAction = null;     // ... and its clip (kept while it fades out)
let morph = null;        // { t, list, quats, hips }: the ragdoll pose (world space)
// the attack being played: its serial, its action and the one before it (a chained attack
// cross-fades from that one over CHAIN_FADE), f: how far the cross-fade got, from: clip start
const attack = { serial: -1, cur: null, prev: null, f: 1, from: 0 };
const CHAIN_FADE = 0.1;

const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const angleTo = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
const _q = new THREE.Quaternion(), _w = new THREE.Quaternion(), _v = new THREE.Vector3();

// three's mixer only writes a bone when its blended value changed since the last update, so
// whatever is posed on top (breathing, strides, the ragdoll, the morph) would otherwise stick:
// put the mixer's last pose back before every update and remember the new one after it
function restorePose() { for (const [b, q, p] of clean) { b.quaternion.copy(q); b.position.copy(p); } }
function keepPose() { for (const [b, q, p] of clean) { q.copy(b.quaternion); p.copy(b.position); } }

// remember the ragdoll pose in world space; the model is turned and moved under it
// learn: animation.html#getup (see learn/README.md)
function startMorph() {
  const list = Object.values(character.bones);   // parents first
  character.group.updateMatrixWorld(true);
  morph = { t: 0, list, quats: list.map(b => b.getWorldQuaternion(new THREE.Quaternion())),
    hips: character.bones.hips.getWorldPosition(new THREE.Vector3()) };
}

// blend from the remembered ragdoll pose into the animated one, bone by bone in world space
// learn: animation.html#getup (see learn/README.md)
function applyMorph(dt) {
  morph.t += dt;
  const k = 1 - smooth(0, MORPH, morph.t), hips = character.bones.hips;
  hips.position.copy(hips.parent.worldToLocal(hips.getWorldPosition(_v).lerp(morph.hips, k)));
  morph.list.forEach((b, i) => {
    b.parent.getWorldQuaternion(_q);   // already morphed
    _w.copy(_q).multiply(b.quaternion).slerp(morph.quats[i], k);
    b.quaternion.copy(_q.invert().multiply(_w));
  });
  if (k <= 0) morph = null;
}

// Squashed flat by a giant (game/juice.js squashedFx, player.flat: s left of it): the hero lies
// flat as a pancake for a moment, then springs back up, wobbling
function squash(group, p, dt) {
  if (!(p.flat > 0)) { if (group.scale.y !== 1) group.scale.set(1, 1, 1); return; }
  p.flat = Math.max(0, p.flat - dt);
  const u = 1 - p.flat / FLAT, k = u < 0.3 ? 1 : Math.exp(-5 * (u - 0.3)) * Math.cos(9 * (u - 0.3));
  const y = 1 - 0.7 * k;
  group.scale.set(1 / Math.sqrt(Math.max(0.3, y)), y, 1 / Math.sqrt(Math.max(0.3, y)));
}
export function animateCharacter(dt, time) {
  const ch = character, p = player;
  if (!ch.ready) return;
  ch.model.scale.setScalar(CHAR_SCALE*(state.map?.qualmos?.kind==='planet'?1.18:1));
  clean ??= Object.values(ch.bones).map(b => [b, b.quaternion.clone(), b.position.clone()]);
  if (p.ragdoll) { p.flat = 0; ch.group.scale.set(1, 1, 1); applyRagdollPose(p.ragdoll.p); getUp = upAction = morph = null; ch.getUpWeight = 0; return; }
  if (p.getUp !== getUp) {
    getUp = p.getUp;
    if (getUp) {
      startMorph(); resetMode();
      if (upAction) upAction.setEffectiveWeight(0);
      upAction = ch.getUps[getUp.side].action; ch.getUpWeight = 1;
    }
  }
  restorePose();

  // Ladder motion is driven separately by signed vertical speed in the blend tree.
  const speed = Math.hypot(p.vx, p.vz);
  let yaw = p.yaw;
  if (p.sword.active) yaw = angleTo(yaw, p.sword.yaw, Math.min(1, dt * 30));   // snap round into the swing
  else if (p.climb) { const [dx, dz] = DIRS[p.climb.l.d]; yaw = angleTo(yaw, Math.atan2(dx, dz), Math.min(1, dt * 12)); }
  else if (speed > 0.2 && p.stun <= 0) yaw = angleTo(yaw, Math.atan2(p.vx, p.vz), Math.min(1, dt * (p.swimming ? 5 : 12)));
  p.yaw = yaw;
  ch.group.position.set(p.x, p.visY, p.z);
  ch.group.rotation.y = yaw;
  squash(ch.group, p, dt);
  ch.group.updateMatrixWorld(true);

  updateBlend(dt, speed, time);
  const s = p.sword, duration = (s.stats || SWORD).duration;
  if (s.active && s.serial !== attack.serial) startAttack(s);
  attack.f = Math.min(1, attack.f + dt / CHAIN_FADE);
  // a chained attack takes over at once (the cross-fade smooths it), a fresh one fades in
  const target = s.active ? Math.min(1, attack.f < 1 ? 1 : s.t / 0.04, (duration - s.t) / 0.12) : 0;
  ch.swordWeight += (Math.max(0, target) - ch.swordWeight) * Math.min(1, dt * 22);
  if (!getUp) ch.getUpWeight = Math.max(0, ch.getUpWeight - dt * GET_UP_OUT);
  const sw = ch.swordWeight, gw = upAction ? ch.getUpWeight : 0, rest = (1 - sw) * (1 - gw);
  for (const n in W) ch.actions[n].setEffectiveWeight(W[n] * rest);
  if (upAction) {
    if (getUp) upAction.time = clamp(getUp.t / getUp.duration, 0, 1) * upAction.getClip().duration;
    upAction.setEffectiveWeight(gw * (1 - sw));
    if (gw <= 0) upAction = null;
  }
  if (attack.cur) { attack.cur.time = swingClipTime(s.stats, s.t, attack.from); attack.cur.setEffectiveWeight(sw * attack.f); }
  if (attack.prev) {
    attack.prev.setEffectiveWeight(sw * (1 - attack.f));
    if (attack.f >= 1) attack.prev = null;
  }
  const shown = !p.swimming && !p.climb;
  // a thrown flask has left the hand until the throw is over (the next one is drawn then)
  if (ch.sword) ch.sword.visible = shown && !(s.active && s.fired && s.stats?.kind === 'throw');
  ch.mixer.update(0);
  keepPose();
  stretchStride(blend.stretch, (W.walk + W.run) * rest);
  // breathing on top of the idle pose
  ch.bones.spine.rotateX(Math.sin(time * 2.2) * 0.025 * W.idle * rest);
  holdWeapon(dt, shown && !getUp, rest);
  if (morph) applyMorph(dt);
  const caught=p.held?.e,grip=caught&&attackOf(caught).grab;
  if(grip?.choke){
    if(ch.sword)ch.sword.visible=false;
    p.yaw=caught.yaw+Math.PI;ch.group.rotation.y=p.yaw;
    ch.bones.head.rotateX(-.2);
    for(const side of ['L','R']){
      ch.bones[`upper_arm.${side}`].rotateX(-1.3);
      ch.bones[`forearm.${side}`].rotateX(-1.15);
      ch.bones[`thigh.${side}`].rotateX(Math.sin(time*12)*.16);
    }
  }
  if (ch.held && ch.sword?.visible) {
    ch.group.updateMatrixWorld(true);
    updateHeld(ch.held, p, { L: ch.bones['hand.L'], R: ch.bones['hand.R'] }, dt);
  }
}

// a new attack: its kind's clip, on the action of the pair the last one did not use; when the
// last one is still showing, cross-fade from it
function startAttack(s) {
  const pair = character.attacks[s.stats?.kind ?? 'sword'], next = pair[0] === attack.cur ? pair[1] : pair[0];
  for (const a of [attack.prev, attack.cur]) if (a && a !== next) a.setEffectiveWeight(0);
  const fade = attack.cur && attack.cur !== next && character.swordWeight > 0.05;
  attack.prev = fade ? attack.cur : null;
  attack.cur = next; attack.f = fade ? 0 : 1; attack.serial = s.serial; attack.from = swingClipFrom(s);
}

// bows, crossbows and staffs are carried in their Hold pose (its arm, over idle, walk, run and
// the jumps); an arm swings a little with the stride. `rest`: what the other clips still get
// (attack clips start and end in the hold pose themselves)
function holdWeapon(dt, shown, rest) {
  const ch = character, kind = shown && ch.held?.kind, hold = kind && ch.holds[kind];
  if (hold) ch.holdKind = kind;
  ch.holdWeight += ((hold ? 1 : 0) - ch.holdWeight) * Math.min(1, dt * 10);
  const bones = ch.holds[ch.holdKind];
  if (!bones || ch.holdWeight < 1e-3) return;
  const w = ch.holdWeight * rest * (1 - 0.25 * (W.walk + W.run));
  for (const [bone, q] of bones) bone.quaternion.slerp(q, w);
}

export const characterYaw = () => player.yaw;
