// Renew (game/renew.js) has no model of his own: he is a figure like the villagers and the other
// players (render/figure.js), the hero's own rig, played with the hero's own clips (Idle, Walk, Run,
// Slash, Cast, Shoot, Roll, Jump for a leap back; JumpLandSit as he goes down), in a hood, his
// weapon of the phase in his hand (the item's model, render/character.js mountWeapon; a bow's
// string drawn as he shoots, a morning star's balls swinging on their chains, render/held.js),
// tinted his own blue grey, with his bar, his title and a silhouette where
// terrain hides him, like any boss. The animation follows his state like any enemy's
// (render/enemies.js hands him over here): the legs go round by the way he moves along his heading,
// so while time runs back (his position from the tape, game/renew.js) he walks backwards; an
// attack's clip is timed by how far into it he is, its hit frame on the clip's own contact.
// Gathering time to rewind it (mode `split`) he holds his weapon up, and clocks of light circle him.
// Beaten, he sinks down to sit and fades away in sparkles.
//
// A ghost of him (`ghost`: game/rewind.js, him as he was in a phase gone by, fighting an echo) is
// drawn pale blue and see-through, without bar or name; so is he, beaten, rising away into the sky
// (`rising`), fading as he goes; gone (`ascended`), there is no body.
//
// Also here: the echoes (game/rewind.js), each the hero's past self posed as the tape has it
// (render/partner.js showPartner's way), pale and see-through, with the weapon they held; and
// while time runs back, our own hero posed from the tape (poseHero, over the animator's pose:
// main.js applyHeroPose).
import * as THREE from 'three';
import { scene, camera } from './scene.js';
import { loadGLB } from './gltf.js';
import { CHAR_SCALE, WALK_SPEED, RUN_SPEED, WALK_ANIM, RUN_ANIM } from '../core/constants.js';
import { ITEMS } from '../core/items.js';
import { attackOf, STAGE_PROFILES } from '../core/enemies.js';
import { guardianColor, guardianTitle } from '../core/guardians.js';
import { BONES, Q } from '../net/protocol.js';
import { rig, rigReady, createFigure, loadThing, thingLoaded, wear, wearLike, takeOff } from './figure.js';
import { character, mountWeapon } from './character.js';
import { prepareHeld, updateHeld } from './held.js';
import { trackLight, untrackLight } from './lightpool.js';
import { makeBar, makeLevelLabel } from './bars.js';
import { bossBarred } from '../core/bossbar.js';
import { glow, soft, emit, rand } from './particles.js';
import { player } from '../game/state.js';
import { uiScale } from '../game/uiscale.js';

const TINT = '#8e9cbf', ECHO_TINT = '#cfe6ff', GHOST = 0xff6a5a, GHOST_OPACITY = 0.4;
const HOOD = 'wear_hood';
const FPS = 30, STAND_HIPS = 0.69;
const SWING = ['thigh.L', 'thigh.R', 'upper_arm.L', 'upper_arm.R'];
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const angleTo = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

// the clips, once the rig is in: { defs: name -> clip, contact: name -> the clip time a blow
// lands (a spell leaves) at, walkStride, runStride }
let kit = null;
const part = (clip, name, from, to) => {
  const c = THREE.AnimationUtils.subclip(clip, name, from, to, FPS);
  const t = c.tracks.find(t => t.name === 'hips.position');
  if (t) for (let i = 2; i < t.values.length; i += 3) t.values[i] = Math.min(t.values[i], STAND_HIPS);
  return c;
};
rigReady.then(gltf => {
  const clips = Object.fromEntries(gltf.animations.map(c => [c.name, c]));
  const extras = name => gltf.parser.json.animations.find(a => a.name === name)?.extras || {};
  const stride = name => extras(name).speed * clips[name].duration * CHAR_SCALE;
  kit = {
    defs: { idle: part(clips.Jump, 'Idle', 0, 2), walk: clips.Walk, run: clips.Run, slash: clips.Slash, slash2: clips.Slash.clone(),
      cast: clips.Cast, roll: clips.Roll, shoot: clips.Shoot, leap: part(clips.Jump, 'Leap', 15, 58),
      sit: part(clips.JumpLandSit, 'SitLand', 36, 78) },
    contact: { slash: extras('Slash').active_start, slash2: extras('Slash').active_start, cast: extras('Cast').active_start,
      shoot: extras('Shoot').active_start, roll: 0, leap: 0 },
    walkStride: stride('Walk'), runStride: stride('Run'),
  };
}).catch(e => console.error('Renew\'s clips failed to set up', e));

// a silhouette of figure f where terrain hides it (like an enemy's)
function silhouette(f, color = GHOST) {
  let mesh = null;
  f.model.traverse(o => { if (o.isSkinnedMesh) mesh = o; });
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: GHOST_OPACITY, depthFunc: THREE.GreaterDepth, depthWrite: false });
  const ghost = new THREE.SkinnedMesh(mesh.geometry, material);
  ghost.bind(mesh.skeleton, mesh.bindMatrix);
  ghost.renderOrder = -1; ghost.boundingSphere = mesh.boundingSphere;
  ghost.userData.sharedGeo = true;
  mesh.parent.add(ghost);
  return { mesh, material };
}
const clayOf = f => { const out = []; f.model.traverse(o => { if (o.isMesh && !o.userData.ghost) out.push(o); }); return out; };

// --- Renew ---------------------------------------------------------------------------------
function makeView(e) {
  const f = createFigure(TINT), group = f.group, clay = clayOf(f);
  for (const o of clay) { o.material.transparent = true; o.userData.base = o.material.color.clone(); }
  const { material: ghost } = silhouette(f);
  scene.add(group);
  const mixer = new THREE.AnimationMixer(f.model), actions = {}, weights = {};
  for (const [name, clip] of Object.entries(kit.defs)) {
    const a = mixer.clipAction(clip);
    a.play(); a.timeScale = 0; a.setEffectiveWeight(name === 'idle' ? 1 : 0);
    actions[name] = a; weights[name] = name === 'idle' ? 1 : 0;
  }
  mixer.update(0);
  const clean = Object.values(f.bones).map(b => [b, b.quaternion.clone(), b.position.clone()]);
  const standing = Object.fromEntries(SWING.map(n => [n, f.bones[n].quaternion.clone()]));
  const color = guardianColor('descent');
  // the bar and the label over it, together over the head (as big as the UI scale says: game/uiscale.js)
  const tag = new THREE.Group(); tag.position.y = e.profile.height + 0.12; group.add(tag);
  const hpBar = makeBar({ color, w: 1.2, onTop: true }), bar = hpBar.group;
  tag.add(bar);
  const label = makeLevelLabel(e.level, { color, onTop: true, title: guardianTitle('descent', e.profile) });
  label.position.y = 0.21; tag.add(label);
  const light = new THREE.PointLight(e.profile.light ?? '#bdf3ff', 1.1, 3.2, 2);
  light.position.y = 0.9;
  trackLight(light, group);
  const v = { figure: true, group, f, clay, ghost, mixer, actions, weights, clean, standing, tag, bar, hpBar, label, light,
    yaw: e.yaw, phase: 0, was: { x: e.x, z: e.z }, speed: 0, attacks: -1, swing: 'slash', weapon: { id: null, object: null, held: null },
    glow: 0, dead: false, seed: Math.random() * 100 };
  for (const p of STAGE_PROFILES[e.boss] ?? []) if (p.weapon) weaponFor(p.weapon);   // (all his weapons, ahead: no hitch as he changes)
  if (thingLoaded(HOOD)) wear(f, HOOD);
  else loadThing(HOOD).then(() => { if (e.view === v) wear(f, HOOD); }).catch(err => console.error('Renew\'s hood failed to load', err));
  return v;
}
// the weapon of his phase in his hand (loaded once each, his own copy)
const weapons = new Map();
function weaponFor(id) {
  if (!weapons.has(id)) weapons.set(id, loadGLB(ITEMS[id].model).then(g => g.scene).catch(err => { weapons.delete(id); console.error('Renew\'s weapon failed to load', err); return null; }));
  return weapons.get(id);
}
function arm(v, e) {
  const id = e.profile.weapon, w = v.weapon;
  if (w.id === id) return;
  w.id = id;
  if (w.object) { w.object.removeFromParent(); w.object = null; w.held = null; }
  weaponFor(id).then(model => {
    if (!model || w.id !== id || !v.group.parent) return;
    const copy = model.clone(true);
    copy.traverse(o => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone(); });
    const item = mountWeapon(v.f.bones, copy);
    w.object = copy; w.held = prepareHeld(copy, item);
  });
}
// clip time for attack time t: the wind-up onto the clip up to its contact, the rest after it
function clipTime(a, t, clip, contact) {
  const hit = Math.min(a.hitAt, a.attackTime), d = clip.duration;
  if (!contact) return clamp(t / a.attackTime, 0, 1) * d;
  return t < hit ? contact * clamp(t / hit, 0, 1) : contact + (d - contact) * clamp((t - hit) / Math.max(0.01, a.attackTime - hit), 0, 1);
}
function animate(e, dt, off) {
  if (!kit) return;
  const v = e.view || (e.view = makeView(e)), A = v.actions, W = v.weights, g = v.group;
  if (e.mode === 'dead' && e.ascended) { g.visible = false; v.light.intensity = 0; return; }   // (gone into the sky: no body left)
  g.position.set(e.x + off.x, e.y + off.y, e.z + off.z);
  v.yaw = e.mode === 'attack' ? e.yaw : angleTo(v.yaw, e.yaw, Math.min(1, dt * 14));
  g.rotation.y = v.yaw;
  g.visible = e.mode !== 'gone';
  arm(v, e);
  for (const [b, q, p] of v.clean) { b.quaternion.copy(q); b.position.copy(p); }   // (render/animator.js restorePose)
  const T = Object.fromEntries(Object.keys(A).map(n => [n, 0]));
  // the legs go round by the way he moved along his heading (backwards while time runs back)
  const along = (e.x - v.was.x) * Math.sin(e.yaw) + (e.z - v.was.z) * Math.cos(e.yaw);
  const moved = Math.abs(along) < 0.6 ? along : 0;
  v.was.x = e.x; v.was.z = e.z;
  if (dt > 1e-4) v.speed += (Math.abs(moved) / dt - v.speed) * Math.min(1, dt * 12);
  const a = e.mode === 'attack' ? attackOf(e) : null, dead = e.mode === 'dead';
  let stretch = 1, loco = 0;
  if (dead) {
    T.sit = 1;
    A.sit.time = Math.min(e.deadT, kit.defs.sit.duration);
  } else if (a) {
    // (each new blow on the other of two Slash actions: a chained one cross-fades from the last)
    if (v.attacks !== e.attacks) { v.attacks = e.attacks; if (a.clip === 'slash') v.swing = v.swing === 'slash' ? 'slash2' : 'slash'; }
    const name = a.clip === 'slash' ? v.swing : a.clip;
    T[name] = 1;
    A[name].time = clipTime(a, e.t, kit.defs[name], kit.contact[name]);
  } else if (e.mode === 'split') {   // gathering time: his weapon held up
    T.cast = 1;
    A.cast.time = kit.contact.cast * clamp(e.t / 0.5, 0, 1);
  } else {
    const s = v.speed;
    loco = smooth(0.05, 0.35, s);
    const t = clamp((s - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 0, 1);
    T.idle = 1 - loco; T.walk = loco * (1 - t); T.run = loco * t;
    const move = WALK_SPEED + (RUN_SPEED - WALK_SPEED) * t, anim = WALK_ANIM + (RUN_ANIM - WALK_ANIM) * t;
    const stride = kit.walkStride + (kit.runStride - kit.walkStride) * t;
    v.phase = ((v.phase + moved * (anim / move) / stride) % 1 + 1) % 1;
    stretch = move / anim;
  }
  for (const n in A) {
    W[n] += (T[n] - W[n]) * Math.min(1, dt * (T[n] > W[n] ? 22 : 14));
    A[n].setEffectiveWeight(W[n]);
  }
  A.walk.time = v.phase * kit.defs.walk.duration; A.run.time = v.phase * kit.defs.run.duration;
  v.mixer.update(0);
  for (const [b, q, p] of v.clean) { q.copy(b.quaternion); p.copy(b.position); }   // (keepPose)
  // longer strides than the clip's (render/stride.js), breathing, and a staff held in its pose
  const sw = (W.walk + W.run) * loco, k = 1 + (stretch - 1) * sw;
  if (Math.abs(k - 1) > 1e-3) for (const n of SWING) v.f.bones[n].quaternion.copy(v.standing[n].clone().slerp(v.f.bones[n].quaternion, k));
  v.f.bones.spine.rotateX(Math.sin((performance.now() / 1000 + v.seed) * 2.2) * 0.025 * W.idle);
  // (a staff or a bow carried in its hold, as the hero carries them)
  const kind = ITEMS[e.profile.weapon]?.weapon?.kind, hold = kind === 'staff' || kind === 'bow' ? rig.holds[kind] : null;
  const rest = 1 - Math.max(W.cast, W.slash, W.slash2, W.roll, W.sit, W.leap, W.shoot);
  if (hold && rest > 0.01) for (const [node, q] of hold) v.f.nodes[node]?.quaternion.slerp(q, rest * (1 - 0.25 * sw));
  // a leap back: up off the floor and down again
  if (a?.dodge?.hop) { const u = clamp((e.t - a.dodge.from) / (a.dodge.to - a.dodge.from), 0, 1); g.position.y += a.dodge.hop * 4 * u * (1 - u); }
  if (v.weapon.held) {   // a staff's stone glows as a spell gathers; a bow's string is drawn, an arrow on it
    const busy = a?.clip === 'cast' || a?.clip === 'shoot' || e.mode === 'split', at = a?.hitAt ?? 0.5;
    g.updateMatrixWorld(true);
    updateHeld(v.weapon.held, { sword: { active: busy, t: e.mode === 'split' ? 1 : e.t, fired: a ? e.t > at : false,
      stats: { kind: v.weapon.held.kind, activeStart: at, activeEnd: at + 0.04, duration: a?.attackTime ?? 1 } } },
      { L: v.f.bones['hand.L'], R: v.f.bones['hand.R'] }, dt);
  }
  // hit: a white flash; beaten: he fades, sparkling away
  const fade = dead ? clamp(1 - (e.deadT - e.profile.deathTime + 0.8) / 0.8, 0, 1) : 1, flash = clamp(e.hurtT / 0.22, 0, 1) * 0.6;
  // (a ghost of a phase gone by, game/rewind.js: pale blue, see-through, no bar, no name)
  // (and beaten, rising away into the sky: a ghost too, fading out as he goes up)
  const ghost = !!e.ghost || !!e.rising, rise = e.rising ? 1 - smooth(0.45, 1, e.rising.u) : 1;
  const seen = fade * (e.ghost ? 0.45 * (e.ghostAlpha ?? 1) : e.rising ? 0.6 * rise : 1);
  for (const o of v.clay) {
    o.material.color.copy(o.userData.base).lerp(WHITE, e.hovered ? Math.max(flash, 0.22) : flash);
    if (ghost) o.material.color.lerp(ECHO, 0.55);
    o.material.opacity = seen; o.material.depthWrite = !ghost;
  }
  if (dead || ghost) for (const obj of [v.weapon.object, ...Object.values(v.f.worn).flatMap(w => w.objects)]) obj?.traverse(o => {
    if (o.isMesh) for (const m of [].concat(o.material)) { m.transparent = seen < 1; m.opacity = seen; m.depthWrite = !ghost; }
  });
  v.ghost.opacity = ghost ? 0 : GHOST_OPACITY * fade;
  if (dead && e.deadT > e.profile.deathTime - 1 && fade > 0 && Math.random() < dt * 60) sparkle(e, 1, off);
  if (e.rising) { if (Math.random() < dt * 50 * rise) sparkle(e, 1.4, off); }
  else if (e.mode === 'split') clocks(v, e, dt, off);
  v.light.intensity = (e.mode === 'split' ? 2.6 : 1.1) * seen;
  v.bar.visible = v.label.visible = !dead && !ghost && e.mode !== 'gone' && !bossBarred(e);   // (he is a boss: his bar is on the screen, game/bossbar.js)
  v.bar.quaternion.copy(INV.setFromAxisAngle(UP, -v.yaw)).multiply(camera.quaternion);
  v.tag.scale.setScalar(uiScale());
  v.hpBar.set(e.hp / e.profile.hp);
  g.visible = e.mode !== 'gone' && seen > 0.01;
}
const WHITE = new THREE.Color(0xffffff), ECHO = new THREE.Color(ECHO_TINT), INV = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
const TIME = ['#ffffff', '#bdf3ff', '#ffe9a8'];
// (off: where the cube is drawn, while a portal's travel slides it: game/travel.js)
function sparkle(e, s, off) {
  emit(glow, e.x + off.x + rand(-0.25, 0.25) * s, e.y + off.y + rand(0.1, 1.1), e.z + off.z + rand(-0.25, 0.25) * s, { v: [rand(-0.2, 0.2), rand(0.4, 1.2), rand(-0.2, 0.2)],
    life: rand(0.5, 0.9), size: rand(0.05, 0.1), color: TIME[Math.floor(Math.random() * 3)], drag: 1 });
}
// gathering time: two clock faces of light circle him, their hands racing back
function clocks(v, e, dt, off) {
  if (Math.hypot(e.x - player.x, e.z - player.z) > 20) return;
  const t = e.t, r = 0.75;
  for (let i = Math.floor(90 * dt + Math.random()); i > 0; i--) {
    const k = Math.random(), ring = i % 2, a = (ring ? -1 : 1) * t * 5 + k * Math.PI * 2, y = e.y + (ring ? 0.35 : 0.95);
    emit(glow, e.x + off.x + Math.cos(a) * r, y + off.y, e.z + off.z + Math.sin(a) * r, { life: rand(0.15, 0.3), size: rand(0.05, 0.08), color: TIME[i % 3], alpha: 0.9 });
  }
  // the hands: from the middle out, turning back
  for (const [len, speed, y] of [[0.6, -3, 0.95], [0.4, -0.6, 0.95]]) {
    const a = t * speed + v.seed, u = Math.random();
    emit(glow, e.x + off.x + Math.cos(a) * len * u, e.y + off.y + y, e.z + off.z + Math.sin(a) * len * u, { life: 0.12, size: 0.05, color: '#ffffff', alpha: 0.9 });
  }
}
function dispose(e) {
  const v = e.view;
  scene.remove(v.group);
  untrackLight(v.light);
  v.mixer.stopAllAction(); v.mixer.uncacheRoot(v.f.model);
  for (const o of v.clay) o.material.dispose();
  for (const slot of Object.keys(v.f.worn)) takeOff(v.f, slot);
  v.weapon.object?.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(m => m.dispose()); });
  v.weapon.id = null;
  v.ghost.dispose();
  v.label.material.map.dispose(); v.label.material.dispose();
  e.view = null;
}

// render/enemies.js: the enemies drawn as figures (`figure` on their profile) come here
export const isFigure = e => !!e.profile?.figure;
export function animateFigures(list, dt, off) { for (const e of list) animate(e, dt, off); }
export function removeFigureViews(list) { for (const e of list) if (e.view?.figure) dispose(e); }

// --- poses (render/partner.js's way) --------------------------------------------------------
const qa = [], qb = [], _q = new THREE.Quaternion();
// pose figure bones (and its group) between packed poses A and B, k of the way (net/protocol.js packPose)
function applyPose(group, bones, A, B, k) {
  const mix = (x, y) => x + (y - x) * k;
  group.position.set(mix(A.p[0], B.p[0]), mix(A.p[1], B.p[1]), mix(A.p[2], B.p[2]));
  group.rotation.y = A.yaw + Math.atan2(Math.sin(B.yaw - A.yaw), Math.cos(B.yaw - A.yaw)) * k;
  bones.hips.position.set(mix(A.hips[0], B.hips[0]), mix(A.hips[1], B.hips[1]), mix(A.hips[2], B.hips[2]));
  BONES.forEach((n, i) => {
    for (let j = 0; j < 4; j++) { qa[j] = A.q[i * 4 + j] / Q; qb[j] = B.q[i * 4 + j] / Q; }
    const q = bones[n].quaternion;
    q.fromArray(qa).normalize();
    if (k > 0) q.slerp(_q.fromArray(qb).normalize(), k);
  });
}

// --- our own hero while time runs back ------------------------------------------------------
let heroPose = null;
// span: { a, b, k } of packed poses, or null (the animator's pose again)
export function poseHero(span) { heroPose = span; }
// after the animator (main.js): the hero as the tape has them
export function applyHeroPose() {
  if (!heroPose || !character.ready) return;
  applyPose(character.group, character.bones, heroPose.a, heroPose.b, heroPose.k);
  character.group.updateMatrixWorld(true);
}

// --- the echoes -----------------------------------------------------------------------------
// list: [{ echo, span: { a, b, k } of the tape's frames (null: gone), alpha }] (game/rewind.js)
const echoWeapons = new Map();
export function drawEchoes(list, dt, off = { x: 0, y: 0, z: 0 }) {
  if (!rig.ready) return;
  for (const { echo, span, alpha } of list) {
    if (!span || alpha <= 0 || !span.a.pose || !span.b.pose) { if (echo.view) echo.view.group.visible = false; if (!span && echo.view) dropEcho(echo); continue; }
    const v = echo.view ?? (echo.view = makeEcho());
    applyPose(v.group, v.f.bones, span.a.pose, span.b.pose, span.k);
    v.group.position.x += off.x; v.group.position.y += off.y; v.group.position.z += off.z;
    v.group.visible = true;
    echoWeapon(v, span.k < 0.5 ? span.a.weapon : span.b.weapon);
    if (v.weapon.held) { v.group.updateMatrixWorld(true); updateHeld(v.weapon.held, IDLE, null, dt); }
    for (const m of v.materials) m.opacity = 0.5 * alpha;
    v.light.intensity = 0.9 * alpha;
    v.flicker -= dt;
    if (v.flicker <= 0 && Math.hypot(v.group.position.x - player.x, v.group.position.z - player.z) < 16) {
      v.flicker = 0.05;
      const p = v.group.position;
      emit(glow, p.x + rand(-0.2, 0.2), p.y + rand(0.1, 1), p.z + rand(-0.2, 0.2), { v: [0, rand(0.2, 0.6), 0], life: rand(0.3, 0.6),
        size: rand(0.04, 0.08), color: '#cfe6ff', alpha: 0.8 * alpha, drag: 1 });
    }
  }
}
const IDLE = { sword: { active: false } };
function makeEcho() {
  const f = createFigure(ECHO_TINT), materials = [];
  f.model.traverse(o => {
    if (!o.isMesh) return;
    o.material.transparent = true; o.material.depthWrite = false;
    o.material.emissive?.set('#5f86b8');
    materials.push(o.material);
  });
  wearLike(f, character);
  for (const w of Object.values(f.worn)) for (const obj of w.objects) obj.traverse(o => {
    if (o.isMesh) for (const m of [].concat(o.material)) { m.transparent = true; m.depthWrite = false; materials.push(m); }
  });
  const light = new THREE.PointLight('#cfe6ff', 0.9, 2.6, 2);
  light.position.y = 0.8;
  trackLight(light, f.group);
  scene.add(f.group);
  return { group: f.group, f, materials, light, weapon: { url: null, object: null, mats: [], held: null }, flicker: 0 };
}
function echoWeapon(v, url) {
  const w = v.weapon;
  if (w.url === url) return;
  w.url = url;
  if (w.object) { v.materials = v.materials.filter(m => !w.mats.includes(m)); w.mats.forEach(m => m.dispose()); w.object.removeFromParent(); w.object = null; w.held = null; }
  if (!url) return;
  if (!echoWeapons.has(url)) echoWeapons.set(url, loadGLB(url).then(g => g.scene).catch(() => null));
  echoWeapons.get(url).then(model => {
    if (!model || w.url !== url || !v.group.parent) return;
    const copy = model.clone(true), mats = [];
    const own = m => { m = m.clone(); m.transparent = true; m.depthWrite = false; mats.push(m); return m; };
    copy.traverse(o => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material); });
    const item = mountWeapon(v.f.bones, copy);
    w.object = copy; w.mats = mats; v.materials.push(...mats);
    w.held = item?.userData.weapon === 'flail' ? prepareHeld(copy, item) : null;   // (a flail's balls swing: render/held.js)
  });
}
function dropEcho(echo) {
  const v = echo.view;
  scene.remove(v.group);
  untrackLight(v.light);
  for (const m of v.materials) m.dispose();
  echo.view = null;
}
export function removeEchoViews(list) { for (const x of list) if (x.view) dropEcho(x); }
