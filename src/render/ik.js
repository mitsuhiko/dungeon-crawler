// Inverse kinematics in the game, laid over the clips every frame (blender/ik.py poses the clips
// themselves, in Blender; docs/combat.md "Posing by IK"). Three things:
//   look   a head (and the neck or the trunk under it) turns towards what it looks at, on top of
//          what the clip does with it (a bite, a roar, a nod still show), as far as a neck turns;
//          the eyes look right at it, as far as they turn in their sockets
//   feet   each foot stands on the ground under it, not on the level its body stands on: on a
//          stair, a slope or a ledge's edge one leg bends and the other stretches, and the hips go
//          down as far as the lower foot needs; a foot lifted in its stride lets go
//   reach  an arm reaches for what it strikes, round the hit, so a claw lands on the hero
//          standing higher or lower than the clip thought
//   grips  each arm's hand holds on to a point of its own (the hero's fists on a bank's edge as
//          they climb out of the water, render/animator.js), however high or far the clip has it
// A rig says which bones do what, by their Blender names (makeRig's spec); each model brings its
// own (`ik` in render/*model.js; the hero's in render/character.js, the villagers' in
// render/villagers.js, the robot's in render/robot.js).
//
// Three's mixer only writes a bone whose value changed since its last update: whatever IK turned
// is put back before the mixer runs (restoreRig), else it would pile up frame after frame.
import * as THREE from 'three';

const nameOf = o => o.userData.name || o.name;
const I = new THREE.Quaternion();
const _q = new THREE.Quaternion(), _p = new THREE.Quaternion(), _e = new THREE.Quaternion(), _d = new THREE.Quaternion();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3(), _u = new THREE.Vector3();
const _n = new THREE.Vector3(), _k = new THREE.Vector3(), _f = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _m = new THREE.Matrix4(), _s = new THREE.Vector3();
const FWD = new THREE.Vector3(0, 0, 1);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = (x, to, rate, dt) => x + (to - x) * Math.min(1, dt * rate);

// off: no IK anywhere (to compare: render/ik.js's IK.on = false from the console)
export const IK = { on: true };
// how far a head turns from where the body faces (radians: sideways, up and down), how fast it
// follows; how far the eyes turn
export const LOOK = { yaw: 1.1, pitch: 0.55, rate: 6, eyes: 0.6 };
// a foot reaches up or down at most this share of its leg (more is a ledge, a drop: not ground
// to stand on), and lets go of the ground from `lift` (between the two: a foot up in its stride)
const STEP = 0.5, LIFT = [0.22, 0.55];

// Turn `bone` by the world rotation D about its own origin, its children with it.
function turnWorld(bone, D) {
  bone.parent.getWorldQuaternion(_p);
  _q.copy(_p).invert().multiply(D).multiply(_p);
  bone.quaternion.premultiply(_q).normalize();
  bone.updateMatrixWorld(true);
}
// Move `bone` (and its children) by the world offset dv.
function moveWorld(bone, dv) {
  bone.getWorldPosition(_v).add(dv);
  bone.parent.worldToLocal(_v);
  bone.position.copy(_v);
  bone.updateMatrixWorld(true);
}

// The bone's frame at rest, as it was bound (the skeleton's space): its origin and turn.
function restFrame(mesh, bone, pos = new THREE.Vector3(), rot = new THREE.Quaternion()) {
  const j = mesh.skeleton.bones.indexOf(bone);
  _m.copy(mesh.skeleton.boneInverses[j]).invert().decompose(pos, rot, _s);
  return { pos, rot };
}

// A foot's sole: the lowest point at rest of the skin the bone carries (most of each vertex's
// weight on it), in the bone's own frame; one per geometry and bone, cached. Null without skin.
const soles = new WeakMap();
function soleOf(mesh, bone) {
  const P = mesh.geometry.attributes.position, j = mesh.skeleton.bones.indexOf(bone);
  let cache = soles.get(P);
  if (!cache) soles.set(P, cache = new Map());
  if (!cache.has(j)) {
    const SI = mesh.geometry.attributes.skinIndex, SW = mesh.geometry.attributes.skinWeight;
    let best = null, low = Infinity;
    for (let i = 0; i < P.count; i++) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (SI.getComponent(i, k) === j) w += SW.getComponent(i, k);
      if (w < 0.5) continue;
      _v.fromBufferAttribute(P, i).applyMatrix4(mesh.bindMatrix);
      if (_v.y < low) { low = _v.y; best = _v.clone(); }
    }
    cache.set(j, best && best.applyMatrix4(mesh.skeleton.boneInverses[j]));
  }
  return cache.get(j)?.clone() ?? null;
}

// A rig over a model's bones, from a spec (Blender names):
//   look: [[bone, share], ...]   the chain that turns the head, root first; the shares add up to 1
//   eyes: [bone, ...]            each looks right at the target (the model's forward at rest)
//   legs: [[upper, lower, foot?], ...]   each stands on the ground (a foot bone keeps its turn)
//   arms: [[upper, lower, hand], ...]    the nearest reaches for a target
//   limits: { yaw, pitch, eyes } (LOOK's by default)
//   lock: false: its feet are not held where they come down (plantFeet; held by default)
// -> the rig, or null (no spec, no skin)
export function makeRig(model, spec) {
  if (!spec) return null;
  let mesh = null;
  model.traverse(o => { if (!mesh && o.isSkinnedMesh) mesh = o; });
  if (!mesh) return null;
  const bones = {};
  model.traverse(o => { if (o.isBone) bones[nameOf(o)] = o; });
  const get = n => bones[n] ?? null;
  const missing = [];
  const need = n => { const b = get(n); if (!b) missing.push(n); return b; };
  const look = (spec.look ?? []).map(([n, share]) => ({ bone: need(n), share })).filter(l => l.bone);
  const eyes = (spec.eyes ?? []).map(need).filter(Boolean)
    .map(bone => ({ bone, fwd: FWD.clone().applyQuaternion(restFrame(mesh, bone).rot.invert()) }));
  const chain = (names, feet) => {
    const [upper, lower, end] = names.map(need);
    if (!upper || !lower || names[2] && !end) return null;
    if (lower.parent !== upper || end && end.parent !== lower) { missing.push(names.join('/') + ' (not a chain)'); return null; }
    const tip = end ?? lower;
    // the end of the chain in the last bone's frame: its sole (a foot's lowest point), or as far
    // out along it as the upper bone is long
    const point = feet && soleOf(mesh, tip) || new THREE.Vector3(0, lower.position.length(), 0);
    // which way the knee (elbow) bends at rest, in the upper bone's frame: for when the clip
    // holds the chain straight
    const A = restFrame(mesh, upper), B = restFrame(mesh, lower).pos, T = restFrame(mesh, tip);
    const C = end ? T.pos : point.clone().applyQuaternion(T.rot).add(T.pos);
    _u.subVectors(C, A.pos).normalize();
    const bend = _n.subVectors(B, A.pos).addScaledVector(_u, -_n.dot(_u));
    if (bend.lengthSq() < 1e-6 * A.pos.distanceToSquared(B)) bend.copy(FWD);
    return { upper, lower, end, sole: point, bend: bend.normalize().applyQuaternion(A.rot.invert()).clone(), dy: 0 };
  };
  const legs = (spec.legs ?? []).map(n => chain(n, true)).filter(Boolean);
  const arms = (spec.arms ?? []).map(n => chain(n, false)).filter(Boolean);
  if (missing.length) console.warn('IK: no such bones', missing.join(', '), 'in', model.name);
  // the hips: the bone that carries every leg, lowered for the lower foot
  let pelvis = legs[0]?.upper.parent ?? null;
  while (pelvis && !legs.every(l => isAbove(pelvis, l.upper))) pelvis = pelvis.parent;
  if (!pelvis?.isBone) pelvis = null;
  const touched = new Set([...look.map(l => l.bone), ...eyes.map(e => e.bone), pelvis,
    ...[...legs, ...arms].flatMap(c => [c.upper, c.lower, c.end])].filter(Boolean));
  return { model, look, eyes, legs, arms, pelvis, limits: { ...LOOK, ...spec.limits }, lock: spec.lock !== false,
    kept: [...touched].map(b => [b, b.quaternion.clone(), b.position.clone()]), dirty: false,
    w: { look: 0, feet: 0 }, yaw: 0, pitch: 0, drop: 0, at: new THREE.Vector3(), seen: false };
}
const isAbove = (a, b) => { for (let o = b; o; o = o.parent) if (o === a) return true; return false; };

// Before the mixer runs: the bones as the clips (and whatever else is laid over them) left them,
// not as IK turned them.
export function restoreRig(rig) {
  if (!rig?.dirty) return;
  for (const [b, q, p] of rig.kept) { b.quaternion.copy(q); b.position.copy(p); }
  rig.dirty = false;
}
// The ground under a rig moved by (dx, dy, dz) (world) without the rig walking over it (both cubes
// sliding past the camera in portal travel, game/travel.js; a moving platform carrying it,
// physics/move.js and game/foggery.js): the feet it holds where they came
// down (holdFeet) go with the ground, else they stayed behind in the world and every foot
// stepped after it, its leg stretched out.
export function shiftRig(rig, dx, dy, dz) {
  if (!rig) return;
  _s.set(dx, dy, dz);
  for (const leg of rig.legs) {
    leg.lock?.add(_s); leg.goal?.add(_s); leg.step?.from.add(_s);
  }
}
function keep(rig) {
  for (const k of rig.kept) { k[1].copy(k[0].quaternion); k[2].copy(k[0].position); }
  rig.dirty = true;
}

// After the clips (and what else turns the bones): IK on top, `dt` s on.
//   look: a point (world) to look at, or null; ground(x, z, top): the height of the ground under
//   (x, z) not above `top` (world), or null (none, or the feet do not stand: in the air, swimming);
//   base: the height the body stands at; reach: { at (world point), w (0..1) } or null; grips:
//   per arm (the rig's order) { at (world point), w (0..1) } or null, or none; weight: how much
//   of it all shows (fading in and out as a whole, e.g. as it dies)
export function poseRig(rig, dt, { look = null, ground = null, base = 0, reach = null, grips = null, weight = 1 } = {}) {
  if (!rig || !IK.on) return;
  const L = rig.limits, root = rig.model.parent ?? rig.model;
  // the body's facing (its group's turn): what the head turns from
  root.getWorldQuaternion(_e);
  _f.copy(FWD).applyQuaternion(_e);
  const bodyYaw = Math.atan2(_f.x, _f.z);
  let wantLook = 0;
  const head = rig.look.at(-1)?.bone ?? rig.eyes[0]?.bone;
  if (look && head) {
    head.getWorldPosition(_a);   // (fresh: getWorldPosition updates the bones above it)
    _t.subVectors(look, _a);
    const yaw = wrap(Math.atan2(_t.x, _t.z) - bodyYaw), pitch = Math.atan2(_t.y, Math.hypot(_t.x, _t.z));
    // (behind it: it does not look, rather than wrenching its neck round from one side to the other)
    wantLook = 1 - smooth(L.yaw + 0.3, L.yaw + 0.9, Math.abs(yaw));
    if (wantLook > 0) {
      if (!rig.seen) { rig.yaw = 0; rig.pitch = 0; }
      rig.yaw = ease(rig.yaw, clamp(yaw, -L.yaw, L.yaw), L.rate, dt);
      rig.pitch = ease(rig.pitch, clamp(pitch, -L.pitch, L.pitch), L.rate, dt);
      rig.at.copy(look); rig.seen = true;
    }
  }
  rig.w.look = ease(rig.w.look, wantLook * weight, 4, dt);
  rig.w.feet = ease(rig.w.feet, ground ? weight : 0, 6, dt);
  if (rig.w.look < 1e-3) rig.seen = false;
  const feet = rig.legs.length && (rig.w.feet > 1e-3 || Math.abs(rig.drop) > 1e-4);
  const arm = reach && reach.w * weight > 1e-3 && rig.arms.length;
  const grip = grips && rig.arms.some((_, i) => grips[i]?.w * weight > 1e-3);
  if (rig.w.look < 1e-3 && !feet && !arm && !grip) return;
  rig.model.updateWorldMatrix(true, true);   // (the bones as the clips just put them)
  keep(rig);
  if (rig.w.look >= 1e-3) lookAt(rig, bodyYaw);
  if (feet) plantFeet(rig, ground, base, dt);
  if (arm) reachFor(rig, reach.at, reach.w * weight);
  if (grip) rig.arms.forEach((c, i) => {
    const g = grips[i], w = (g?.w ?? 0) * weight;
    if (w > 1e-3) solveTwo(c, _v.copy(endOf(c, _c)).lerp(g.at, w), false);
  });
}

// the head turned (additively: on top of the clip) towards rig.yaw, rig.pitch from the body's
// facing, shared out along the chain; then the eyes right at the target
function lookAt(rig, bodyYaw) {
  const w = rig.w.look, cp = Math.cos(rig.pitch);
  _f.set(Math.sin(bodyYaw), 0, Math.cos(bodyYaw));
  _t.set(Math.sin(bodyYaw + rig.yaw) * cp, Math.sin(rig.pitch), Math.cos(bodyYaw + rig.yaw) * cp);
  _d.setFromUnitVectors(_f, _t);
  for (const l of rig.look) turnWorld(l.bone, _e.copy(I).slerp(_d, w * l.share));
  for (const eye of rig.eyes) {
    eye.bone.getWorldQuaternion(_e);
    _n.copy(eye.fwd).applyQuaternion(_e);
    _t.subVectors(rig.at, eye.bone.getWorldPosition(_a)).normalize();
    const angle = _n.angleTo(_t);
    if (angle < 1e-4) continue;
    _q.setFromUnitVectors(_n, _t);
    turnWorld(eye.bone, _e.copy(I).slerp(_q, w * Math.min(1, rig.limits.eyes / angle)));
  }
}

// where a chain ends (world): its foot bone's origin, or the point it carries (its sole)
function endOf(c, out) {
  if (c.end) return c.end.getWorldPosition(out);
  return out.copy(c.sole).applyMatrix4(c.lower.matrixWorld);
}
const _sole = new THREE.Vector3(), _ends = [];

// Each foot onto the ground under it, and held there while it stands (foot locking): where the
// clip has a foot down, it stays where it came down in the world, whatever the body does over it
// (turning on the spot, turning to track the hero in an attack, shoved, sliding): no skating.
// Lifted by the clip, it lets go and eases back into the clip's stride. Held too far from where
// the clip has it now (SLIP of its leg), it takes a step of its own there, in an arc, while the
// others stand (at most half of them step at once, the farthest behind first). The hips go down
// for the lowest foot.
function plantFeet(rig, ground, base, dt) {
  const w = rig.w.feet, holds = rig.lock && w > 0.5;
  let low = 0;
  rig.legs.forEach((leg, i) => {
    leg.upper.getWorldPosition(_a); leg.lower.getWorldPosition(_b);
    const end = endOf(leg, _ends[i] ??= new THREE.Vector3());
    const len = leg.len = _a.distanceTo(_b) + _b.distanceTo(end);
    (leg.hip ??= new THREE.Vector3()).copy(_a);
    _sole.copy(leg.sole).applyMatrix4((leg.end ?? leg.lower).matrixWorld);
    const h = leg.h = _sole.y - base, lift = 1 - smooth(LIFT[0] * len, LIFT[1] * len, h);
    const g = ground ? ground(_sole.x, _sole.z, base + STEP * len) : null;
    const dy = g === null || g < base - STEP * len ? 0 : clamp(g - base, -STEP * len, STEP * len);
    leg.dy = ease(leg.dy, dy * lift * w, 14, dt);
    low = Math.min(low, leg.dy);
    (leg.want ??= new THREE.Vector3()).copy(end).y += leg.dy;   // (where the clip and the ground put it)
    if (leg.end) leg.end.getWorldQuaternion(leg.wantQ ??= new THREE.Quaternion());   // (and how the clip turns its foot)
  });
  if (holds) holdFeet(rig, dt);
  else for (const leg of rig.legs) { leg.locked = false; leg.step = null; leg.carry?.set(0, 0, 0); }
  rig.drop = ease(rig.drop, low, 10, dt);
  if (rig.pelvis && rig.drop < -1e-4) moveWorld(rig.pelvis, _w.set(0, rig.drop, 0));
  rig.legs.forEach((leg, i) => {
    const goal = holds ? leg.goal : leg.want;
    if (!holds && Math.abs(leg.dy) < 1e-4 && rig.drop > -1e-4) return;
    solveTwo(leg, _ends[i].copy(goal), true, holds && leg.end ? leg.goalQ : null);
  });
}

// foot locking (plantFeet): each leg's goal from where the clip wants it (leg.want)
const PLANT = [0.07, 0.13];   // a foot is down below the first share of its leg, up above the second
const SLIP = 0.3;             // held this share of its leg from where the clip has it: it steps
const LOST = 1.5;             // ... this far (a jump across the floor, a slid cube): it is just there
const ARC = 0.15;             // a step lifts the foot this share of its leg
function holdFeet(rig, dt) {
  const legs = rig.legs, most = Math.max(1, Math.floor(legs.length / 2));
  let stepping = 0;
  for (const leg of legs) {
    leg.goal ??= new THREE.Vector3(); leg.lock ??= new THREE.Vector3(); leg.carry ??= new THREE.Vector3();
    if (leg.end) { leg.goalQ ??= new THREE.Quaternion(); leg.lockQ ??= new THREE.Quaternion(); leg.carryQ ??= 0; }
    const down = leg.h < (leg.locked || leg.step ? PLANT[1] : PLANT[0]) * leg.len;
    if (!down) {   // the clip lifts it: let go, easing in from where it was held
      if (leg.locked) leg.carry.subVectors(leg.lock, leg.want);
      else if (leg.step) leg.carry.subVectors(leg.goal, leg.want);
      if (leg.end && (leg.locked || leg.step)) { leg.lockQ.copy(leg.goalQ); leg.carryQ = 1; }
      leg.locked = false; leg.step = null;
      const fade = Math.exp(-dt * 10);
      leg.carry.multiplyScalar(fade);
      leg.goal.copy(leg.want).add(leg.carry);
      if (leg.end) { leg.carryQ *= fade; leg.goalQ.copy(leg.wantQ).slerp(leg.lockQ, leg.carryQ); }
      continue;
    }
    if (!leg.locked && !leg.step) {   // comes down: held where it is
      leg.lock.copy(leg.want).add(leg.carry); leg.carry.set(0, 0, 0); leg.locked = true;
      if (leg.end) { leg.lockQ.copy(leg.wantQ).slerp(leg.lockQ, leg.carryQ); leg.carryQ = 0; }
    }
    if (leg.step) stepping++;
    leg.slip = Math.hypot(leg.lock.x - leg.want.x, leg.lock.z - leg.want.z) / leg.len;
    // (a held foot the leg no longer reaches, farther than the clip has it, is dragged: it steps as
    // if it had slipped far; a leg the clip holds straight anyway is not)
    const far = leg.hip.distanceTo(leg.lock);
    if (far > 0.99 * leg.len && far > leg.hip.distanceTo(leg.want) + 0.03 * leg.len) leg.slip = Math.max(leg.slip, SLIP + 1);
    if (leg.locked && leg.slip > LOST) leg.lock.copy(leg.want);
  }
  // the farthest behind step first, as long as enough of them stand (a foot bone is held turned as it
// came down too: else it would pivot round its ankle as the body turns, its toes sweeping the floor)
  for (const leg of [...legs].filter(l => l.locked && l.slip > SLIP).sort((a, b) => b.slip - a.slip)) {
    if (stepping >= most) break;
    leg.step = { from: leg.lock.clone(), fromQ: leg.end ? leg.lockQ.clone() : null, t: 0, time: 0.12 + 0.12 * Math.min(1.5, leg.len) };
    leg.locked = false; stepping++;
  }
  for (const leg of legs) {
    if (leg.step) {
      const st = leg.step, u = Math.min(1, st.t += dt / st.time), k = u * u * (3 - 2 * u);
      leg.goal.copy(st.from).lerp(leg.want, k);
      leg.goal.y += Math.sin(Math.PI * u) * ARC * leg.len;
      if (leg.end) leg.goalQ.copy(st.fromQ).slerp(leg.wantQ, k);
      if (u >= 1) { leg.step = null; leg.locked = true; leg.lock.copy(leg.want); if (leg.end) leg.lockQ.copy(leg.wantQ); }
    } else if (leg.locked) {
      // (held where it came down, but as high as the clip and the ground under it say: easing onto a
      // step, the hips going down)
      leg.lock.y = leg.want.y;
      leg.goal.copy(leg.lock);
      if (leg.end) leg.goalQ.copy(leg.lockQ);
    }
    // (fading in or out: between the clip's and the held)
    if (rig.w.feet < 1) { leg.goal.lerp(leg.want, 1 - rig.w.feet); if (leg.end) leg.goalQ.slerp(leg.wantQ, 1 - rig.w.feet); }
  }
}

// the arm whose hand is nearest reaches `w` of the way to `at`
function reachFor(rig, at, w) {
  let best = null, near = Infinity;
  for (const arm of rig.arms) {
    const d = endOf(arm, _c).distanceToSquared(at);
    if (d < near) { near = d; best = arm; }
  }
  best.upper.getWorldPosition(_a); best.lower.getWorldPosition(_b);
  const len = _a.distanceTo(_b) + _b.distanceTo(endOf(best, _c));
  // (out of reach by far: it does not grope for it)
  const k = w * (1 - smooth(1.2 * len, 1.8 * len, _a.distanceTo(at)));
  if (k < 1e-3) return;
  solveTwo(best, _v.copy(_c).lerp(at, k), false);
}

// Two-bone IK: turn the upper and lower bone so the chain's end lands on T (as near as it
// reaches), the knee bending the way it bends now (or as at rest, when straight). keepEnd: a
// foot bone keeps its turn in the world (it stays flat; or is turned to endQ, world), a hand turns
// with the arm.
const _T = new THREE.Vector3();
export function solveTwo(c, T, keepEnd, endQ = null) {
  const { upper, lower, end } = c;
  upper.getWorldPosition(_a); lower.getWorldPosition(_b); endOf(c, _c);
  const a = _a.distanceTo(_b), b = _b.distanceTo(_c);
  if (end && keepEnd) { if (endQ) _e.copy(endQ); else end.getWorldQuaternion(_e); }
  _t.subVectors(T, _a);
  let d = _t.length();
  if (d < 1e-6 || a < 1e-6 || b < 1e-6) return;
  _u.copy(_t).divideScalar(d);
  d = clamp(d, Math.abs(a - b) + 1e-4 * (a + b), (a + b) * 0.9995);
  _n.subVectors(_b, _a);
  _k.copy(_n).addScaledVector(_u, -_n.dot(_u));
  if (_k.lengthSq() < 1e-4 * a * a) {
    upper.getWorldQuaternion(_q);
    _k.copy(c.bend).applyQuaternion(_q).addScaledVector(_u, -_k.dot(_u));
  }
  _k.normalize();
  const cos = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sin = Math.sqrt(1 - cos * cos);
  _v.copy(_a).addScaledVector(_u, a * cos).addScaledVector(_k, a * sin).sub(_a).normalize();
  turnWorld(upper, _d.setFromUnitVectors(_n.normalize(), _v));
  lower.getWorldPosition(_b); endOf(c, _c);
  _T.copy(_a).addScaledVector(_u, d).sub(_b).normalize();
  turnWorld(lower, _d.setFromUnitVectors(_c.sub(_b).normalize(), _T));
  if (end && keepEnd) {
    lower.getWorldQuaternion(_q);
    end.quaternion.copy(_q.invert().multiply(_e));
    end.updateMatrixWorld(true);
  }
}
