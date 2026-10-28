// The Flimmers (core/enemies.js FLIMMER): small people, the hero's own figure (render/figure.js:
// the rig and its clips, Idle, Walk, Run and the Pummel, blender/character.py) at two thirds of
// its size, tinted their kind's colour, and blurry. There is no blur filter: the blur is the body
// drawn see-through, plus a few more copies of it on the same skeleton, each its own little way
// off and a shade off in colour, and a puffed-up shell round it that fades out towards its
// outline (one shader for all of them, BLUR below: the copies are moved in the vertex shader).
//   - Shimmering (core/enemies.js shimmerOf: whenever it is not beating you or reeling from a
//     blow) the copies wander round the body, its surface wobbles, and running they trail behind
//     it, the further the faster it goes; it leaves shimmering smudges where it runs.
//   - It comes into focus to beat you: the copies and the shell slide into the body and fade, the
//     body solid, a sharp little person (the warning); after the beating it blurs again.
//   - A blow or a shot that went through it (game/juice.js evadedFx: `flinch`) throws the copies
//     apart for a moment and the whole of it flickers aside.
//   - Killed, it dissolves: the copies fly apart, it fades and breaks up into specks of its colour
//     that drift up and go out. No body is left.
// Its bar, label and "!" are an enemy's (render/enemies.js), its silhouette where terrain hides it
// too.
import * as THREE from 'three';
import { scene, camera } from './scene.js';
import { CHAR_SCALE, WALK_SPEED, RUN_SPEED, WALK_ANIM, RUN_ANIM } from '../core/constants.js';
import { attackOf, shimmerOf, enemyName, ENEMY_KINDS, makeEnemy } from '../core/enemies.js';
import { toLinear, toHex } from '../core/oklch.js';
import { guardianColor, guardianTitle } from '../core/guardians.js';
import { bossBarred } from '../core/bossbar.js';
import { rig, rigReady, createFigure } from './figure.js';
import { makeBar, makeLevelLabel, makeAlertMark } from './bars.js';
import { glow, soft, emit, rand } from './particles.js';
import { player } from '../game/state.js';
import { uiScale } from '../game/uiscale.js';

const SILHOUETTE = 0xff6a5a, SILHOUETTE_OPACITY = 0.4;
const FPS = 30, STAND_HIPS = 0.69;
// The look, in world units (a Flimmer of the base size is ~0.72 tall) and seconds:
//   copies: each one's colour (times the kind's), how strongly it shows, how far behind the body it
//     trails per unit of speed (s);
//   wander: how far the copies wander round the body; wobble: how far its surface wobbles (the
//     body's, the copies', the shell's); puff: how far the shell stands off the body;
//   body / copy / shell: how see-through each is while blurry (the body is solid in focus);
//   focus: how fast it comes into focus (1/s) and blurs again; smudge: smudges a second, running.
export const BLUR = {
  copies: [{ tint: [1.18, 0.9, 0.9], alpha: 1, lag: 0.025 }, { tint: [0.9, 1.12, 0.95], alpha: 0.85, lag: 0.05 },
    { tint: [0.9, 0.95, 1.22], alpha: 0.7, lag: 0.075 }, { tint: [1, 1, 1], alpha: 0.55, lag: 0.1 }],
  wander: 0.06, wobble: { body: 0.006, copy: 0.012, shell: 0.018 }, puff: 0.05,
  body: 0.5, copy: 0.3, shell: 0.4, focus: { in: 9, out: 3.5 }, smudge: 9,
  // a haze over all of it: a soft cloud of its colour facing the camera (lit like the rest of it,
  // so it does not glow in the dark), this wide and tall, this strong
  haze: { w: 0.62, h: 0.95, alpha: 0.3 },
};
// the haze's soft round falloff (one texture for all: its brightness is the haze's opacity)
let hazeMap = null;
function hazeTexture() {
  if (hazeMap) return hazeMap;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d'), g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, '#fff'); g.addColorStop(0.45, '#999'); g.addColorStop(1, '#000');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return hazeMap = new THREE.CanvasTexture(c);
}
const hazeGeometry = new THREE.PlaneGeometry(1, 1);
const FLINCH = 0.35;   // s a flicker aside lasts
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const angleTo = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

// the clips, once the rig is in: { defs: name -> clip, walkStride, runStride } (strides in world
// units at the hero's size)
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
  if (!clips.Pummel) throw Error('the character has no Pummel clip');
  kit = { defs: { idle: part(clips.Jump, 'Idle', 0, 2), walk: clips.Walk, run: clips.Run, pummel: clips.Pummel },
    walkStride: stride('Walk'), runStride: stride('Run') };
}).catch(e => console.error('the Flimmers\' clips failed to set up', e));

// One program for every part of every Flimmer: its uniforms move the skinned surface off the
// skeleton's pose (uShift: the whole of it, in the mesh's own units; uPuff: out along its normals;
// uJitter: a wobble over time) and fade it towards its outline (uRim).
function blurry(base, color) {
  const m = base.clone();
  m.color.copy(color); m.transparent = true; m.forceSinglePass = true;
  const u = { uShift: { value: new THREE.Vector3() }, uPuff: { value: 0 }, uJitter: { value: 0 }, uTime: { value: 0 },
    uSeed: { value: Math.random() * 10 }, uRim: { value: 0 } };
  m.userData.blur = u; m.userData.base = color.clone();
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'uniform vec3 uShift;\nuniform float uPuff, uJitter, uTime, uSeed;\n' + sh.vertexShader.replace('#include <skinning_vertex>', `#include <skinning_vertex>
      {
        vec3 q = transformed * 2.3;
        vec3 wob = vec3(sin(q.y * 4.1 + uTime * 13.0 + uSeed), sin(q.z * 3.7 + uTime * 11.0 + uSeed * 1.7),
          sin(q.x * 4.4 + uTime * 9.0 + uSeed * 2.9));
        transformed += uShift + objectNormal * uPuff + wob * uJitter;
      }`);
    sh.fragmentShader = 'uniform float uRim;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      float facing = abs(dot(normalize(normal), normalize(vViewPosition)));
      gl_FragColor.a *= mix(1.0, facing * facing, uRim);`);
  };
  m.customProgramCacheKey = () => 'flimmer-blur';
  return m;
}
// another skinned mesh on the body's skeleton, drawn with material m
function onSkeleton(body, m) {
  const mesh = new THREE.SkinnedMesh(body.geometry, m);
  mesh.bind(body.skeleton, body.bindMatrix);
  mesh.boundingSphere = body.boundingSphere; mesh.frustumCulled = body.frustumCulled;
  mesh.userData.sharedGeo = true;
  body.parent.add(mesh);
  return mesh;
}

const colorOf = profile => new THREE.Color(...toLinear(profile.colors?.skin ?? '#c8ccd8'));
function makeView(e) {
  const f = createFigure(), group = f.group, size = e.profile.size ?? 1;
  f.model.scale.multiplyScalar(size);
  let body = null;
  f.model.traverse(o => { if (o.isSkinnedMesh && !body) body = o; });
  const color = colorOf(e.profile), clay = body.material;
  body.material = blurry(clay, color);
  clay.dispose();
  // where terrain hides it: its silhouette, drawn before the body
  const ghost = new THREE.MeshBasicMaterial({ color: SILHOUETTE, transparent: true, opacity: SILHOUETTE_OPACITY, depthFunc: THREE.GreaterDepth, depthWrite: false });
  const silhouette = onSkeleton(body, ghost);
  silhouette.renderOrder = -1;
  const copies = BLUR.copies.map((c, i) => {
    const mesh = onSkeleton(body, blurry(body.material, color.clone().multiply(new THREE.Color(...c.tint))));
    mesh.material.depthWrite = false; mesh.renderOrder = 2 + i; mesh.castShadow = false;
    return { mesh, ...c, angle: i / BLUR.copies.length * Math.PI * 2 + rand(-0.4, 0.4), rate: rand(1.4, 2.2) * (i % 2 ? -1 : 1) };
  });
  const shell = onSkeleton(body, blurry(body.material, color.clone().lerp(new THREE.Color(1, 1, 1), 0.3)));
  shell.material.depthWrite = false; shell.material.userData.blur.uRim.value = 1; shell.renderOrder = 2 + copies.length; shell.castShadow = false;
  body.renderOrder = 1;
  const haze = new THREE.Mesh(hazeGeometry, new THREE.MeshStandardMaterial({ color: color.clone().lerp(new THREE.Color(1, 1, 1), 0.15),
    alphaMap: hazeTexture(), roughness: 1, metalness: 0, transparent: true, depthWrite: false, opacity: 0 }));
  haze.scale.set(BLUR.haze.w * size / 0.65, BLUR.haze.h * size / 0.65, 1); haze.position.y = e.profile.height * 0.5; haze.renderOrder = 3 + copies.length;
  group.add(haze);
  scene.add(group);
  group.userData.figure = true;   // (casts into the realtime shadow maps as the quality level asks: render/shadows.js)
  const mixer = new THREE.AnimationMixer(f.model), actions = {}, weights = {};
  for (const [name, clip] of Object.entries(kit.defs)) {
    const a = mixer.clipAction(clip);
    a.play(); a.timeScale = 0; a.setEffectiveWeight(name === 'idle' ? 1 : 0);
    actions[name] = a; weights[name] = name === 'idle' ? 1 : 0;
  }
  // the bar, the label over it and the "!" over that, together over the head
  const role = e.guardian ? e.guardianRole : null, tint = guardianColor(role);
  const tag = new THREE.Group(); tag.position.y = e.profile.height + 0.12; group.add(tag);
  const hpBar = makeBar({ onTop: true, ...role && { color: tint, w: role === 'descent' ? 1.2 : .9 } }), bar = hpBar.group;
  tag.add(bar);
  const label = makeLevelLabel(e.level, { onTop: true, ...role && { color: tint, title: guardianTitle(role, e.profile) } });
  label.position.y = .21; tag.add(label);
  const mark = makeAlertMark(); mark.position.y = .5; tag.add(mark);
  return { flimmer: true, group, f, body, silhouette, ghost, copies, shell, haze, mixer, actions, weights, tag, bar, hpBar, label, mark, markT: 0,
    yaw: e.yaw, phase: 0, was: { x: e.x, z: e.z }, speed: 0, vel: new THREE.Vector3(), focus: 0, size, color,
    smudge: toHex([color.r, color.g, color.b]), seed: Math.random() * 100, attacks: -1, dissolved: false };
}

const WHITE = new THREE.Color(1, 1, 1), HOVER = new THREE.Color(0xffd9a0), UP = new THREE.Vector3(0, 1, 0);
const inverseYaw = new THREE.Quaternion(), toLocal = new THREE.Matrix3(), shift = new THREE.Vector3(), at = new THREE.Vector3();
// (off: where the cube is drawn, while a portal's travel slides it: game/travel.js)
function animate(e, dt, off) {
  if (!kit) return;
  const v = e.view ?? (e.view = makeView(e)), A = v.actions, W = v.weights, g = v.group, dead = e.mode === 'dead';
  g.position.set(e.x + off.x, e.y + off.y, e.z + off.z);
  v.yaw = e.mode === 'attack' ? e.yaw : angleTo(v.yaw, e.yaw, Math.min(1, dt * 14));
  g.rotation.y = v.yaw;
  // how fast it goes, and which way (the copies trail behind it)
  const mx = e.x - v.was.x, mz = e.z - v.was.z, moved = Math.hypot(mx, mz) < 0.6 ? Math.hypot(mx, mz) : 0;
  v.was.x = e.x; v.was.z = e.z;
  if (dt > 1e-4) {
    const k = Math.min(1, dt * 10);
    v.speed += (moved / dt - v.speed) * k;
    if (moved) v.vel.set(mx / dt, 0, mz / dt); else v.vel.multiplyScalar(1 - k);
  }
  // the pose: dying it holds the last one; beating, the Pummel; else standing, walking or running,
  // the legs going round by the distance covered (at its size)
  if (!dead) {
    const T = { idle: 0, walk: 0, run: 0, pummel: 0 }, a = e.mode === 'attack' ? attackOf(e) : null;
    if (a?.clip === 'pummel') { T.pummel = 1; A.pummel.time = Math.min(e.t, kit.defs.pummel.duration); }
    else {
      const rel = v.speed / v.size, loco = smooth(0.05, 0.3, v.speed), t = clamp((rel - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 0, 1);
      T.idle = 1 - loco; T.walk = loco * (1 - t); T.run = loco * t;
      const move = WALK_SPEED + (RUN_SPEED - WALK_SPEED) * t, anim = WALK_ANIM + (RUN_ANIM - WALK_ANIM) * t;
      const stride = kit.walkStride + (kit.runStride - kit.walkStride) * t;
      v.phase = (v.phase + moved / v.size * (anim / move) / stride) % 1;
    }
    for (const n in A) {
      W[n] += (T[n] - W[n]) * Math.min(1, dt * (T[n] > W[n] ? 20 : 14));
      A[n].setEffectiveWeight(W[n]);
    }
    A.walk.time = v.phase * kit.defs.walk.duration; A.run.time = v.phase * kit.defs.run.duration;
    v.mixer.update(0);
  }
  blur(v, e, dt, off);
  tags(v, e, dt, dead);
}
// how blurry it is, where its copies are, how see-through all of it is; its smudges and, dying,
// how it dissolves
function blur(v, e, dt, off) {
  const dead = e.mode === 'dead', B = BLUR, s = v.size;
  const sharp = dead ? 0 : 1 - shimmerOf(e);   // (dying it blurs all the way: it dissolves)
  v.focus += (sharp - v.focus) * Math.min(1, dt * (sharp > v.focus ? B.focus.in : B.focus.out));
  const k = dead ? clamp(e.deadT / e.profile.deathTime, 0, 1) : 0, fade = 1 - smooth(0.15, 1, k);
  const haze = (1 - v.focus) * fade;   // how blurry it shows
  // a blow or a shot that went through it: thrown apart, and aside for a moment
  const fl = e.flinch;
  let jolt = 0, sx = 0, sz = 0;
  if (fl) {
    fl.t += dt;
    if (fl.t > FLINCH) e.flinch = null;
    else {
      jolt = Math.sin(Math.PI * fl.t / FLINCH);
      const l = Math.hypot(fl.dx, fl.dz) || 1;
      sx = -fl.dz / l * fl.side * 0.18 * s * jolt; sz = fl.dx / l * fl.side * 0.18 * s * jolt;
    }
  }
  const t = performance.now() / 1000 + v.seed, wander = B.wander * s * (1 + 2.5 * jolt) + 0.6 * s * k ** 1.3;
  v.group.updateMatrixWorld(true);
  toLocal.setFromMatrix4(v.body.matrixWorld).invert();
  const scale = v.body.matrixWorld.getMaxScaleOnAxis();
  const local = (x, y, z) => shift.set(x, y, z).applyMatrix3(toLocal);
  const flash = clamp(e.hurtT / 0.22, 0, 1) * 0.6, hover = e.hovered && !dead ? 0.22 : 0;
  const paint = m => m.color.copy(m.userData.base).lerp(flash > 0.1 || !hover ? WHITE : HOVER, Math.max(flash, hover));
  const set = (m, x, y, z, puff, jitter) => {
    const u = m.userData.blur;
    u.uShift.value.copy(local(x, y, z)); u.uPuff.value = puff / scale; u.uJitter.value = jitter / scale; u.uTime.value = t;
    paint(m);
  };
  // the body: solid in focus, see-through while blurry, flickering aside with a flinch
  const body = v.body.material;
  set(body, sx, 0, sz, 0, B.wobble.body * s * haze);
  body.opacity = (B.body + (1 - B.body) * v.focus) * fade;
  body.depthWrite = v.focus > 0.85 && !dead;
  // the copies, wandering round it and trailing behind it as it runs (dying: flying apart)
  v.copies.forEach((c, i) => {
    const a = c.angle + t * c.rate, r = wander * (0.6 + 0.4 * Math.sin(t * 7.1 + i * 1.3)) * (dead ? 1 : 1 - v.focus);
    const lag = c.lag * (1 - v.focus);
    set(c.mesh.material, sx + Math.cos(a) * r - v.vel.x * lag, Math.sin(t * 5.3 + i * 2.1) * r * 0.5 + (dead ? 0.3 * s * k * (i / 3) : 0),
      sz + Math.sin(a) * r - v.vel.z * lag, 0, B.wobble.copy * s * (1 + jolt));
    c.mesh.material.opacity = B.copy * c.alpha * haze;
    c.mesh.visible = c.mesh.material.opacity > 0.005;
  });
  set(v.shell.material, sx, 0, sz, B.puff * s * (1 + 0.5 * jolt + 2 * k), B.wobble.shell * s);
  v.shell.material.opacity = B.shell * haze;
  v.shell.visible = v.shell.material.opacity > 0.005;
  v.haze.material.opacity = B.haze.alpha * haze * (1 + 0.15 * Math.sin(t * 9.3));
  const cy = Math.cos(v.yaw), sy = Math.sin(v.yaw);   // (the flicker aside, in the group's turned frame)
  v.haze.position.x = sx * cy - sz * sy; v.haze.position.z = sx * sy + sz * cy;
  v.haze.quaternion.copy(inverseYaw.setFromAxisAngle(UP, -v.yaw)).multiply(camera.quaternion);   // (facing the camera)
  v.haze.visible = v.haze.material.opacity > 0.005;
  v.ghost.opacity = SILHOUETTE_OPACITY * fade;
  v.group.visible = e.mode !== 'gone' && fade > 0.01;
  const near = Math.hypot(e.x - player.x, e.z - player.z) < 14;
  // running, it leaves shimmering smudges of its colour behind
  if (!dead && near && v.speed > 0.6 && v.group.visible) for (let i = Math.floor(B.smudge * dt * haze + Math.random()); i > 0; i--)
    emit(soft, e.x + off.x + rand(-0.12, 0.12) * s, e.y + off.y + rand(0.05, 0.6) * s, e.z + off.z + rand(-0.12, 0.12) * s,
      { v: [rand(-0.15, 0.15), rand(0.05, 0.25), rand(-0.15, 0.15)], life: rand(0.5, 0.9), size: rand(0.18, 0.3) * s, grow: 0.8,
        color: v.smudge, alpha: 0.22, drag: 1.5 });
  // dissolving: specks of its colour (and white) breaking off all over it, drifting up and going out
  if (dead && near && k < 0.85) {
    const bones = Object.values(v.f.bones);
    for (let i = Math.floor(70 * dt * (1 - k) + Math.random()); i > 0; i--) {
      bones[Math.floor(Math.random() * bones.length)].getWorldPosition(at);
      emit(i % 3 ? glow : soft, at.x + rand(-0.06, 0.06), at.y + rand(-0.06, 0.06), at.z + rand(-0.06, 0.06),
        { v: [rand(-0.4, 0.4), rand(0.3, 1.1), rand(-0.4, 0.4)], life: rand(0.4, 0.8), size: rand(0.025, 0.055) * (0.6 + s), grow: -0.4,
          color: i % 3 === 1 ? '#ffffff' : v.smudge, alpha: 0.9, drag: 1.2 });
    }
  }
}
// its bar, label and "!" (as any enemy's, render/enemies.js)
function tags(v, e, dt, dead) {
  if (dead || e.mode === 'gone') { v.bar.visible = v.label.visible = v.mark.visible = false; return; }
  v.tag.position.y = e.profile.height + 0.12; v.tag.scale.setScalar(uiScale());
  v.bar.visible = !!e.guardian || !!e.hovered || !e.hordeId && e.hp < e.profile.hp;
  v.label.visible = v.bar.visible || !e.hordeId && Math.hypot(e.x - player.x, e.z - player.z) < e.profile.aggro + 1;
  if (bossBarred(e)) v.bar.visible = v.label.visible = false;   // a Temp Boss's: on the screen (game/bossbar.js)
  if (!e.guardian) v.label.setLevel(e.level, e.hovered ? enemyName(e.profile) : null);
  v.bar.quaternion.copy(inverseYaw.setFromAxisAngle(UP, -v.yaw)).multiply(camera.quaternion);
  v.hpBar.set(e.hp / e.profile.hp);
  v.markT = e.mode === 'alert' ? Math.min(v.markT + dt * 8, 1) : Math.max(v.markT - dt * 2, 0);
  v.mark.visible = v.markT > 0;
  v.mark.scale.setScalar(0.5 * (e.mode === 'alert' ? 1 + 0.35 * Math.sin(Math.PI * v.markT) : v.markT));
}
function dispose(e) {
  const v = e.view;
  scene.remove(v.group);
  v.mixer.stopAllAction(); v.mixer.uncacheRoot(v.f.model);
  for (const m of [v.body.material, v.shell.material, v.haze.material, ...v.copies.map(c => c.mesh.material)]) m.dispose();
  v.ghost.dispose();
  v.label.material.map.dispose(); v.label.material.dispose();
  e.view = null;
}

// render/enemies.js: the Flimmers come here
export const isFlimmer = e => e.profile?.species === 'flimmer';
export function animateFlimmers(list, dt, off) { for (const e of list) animate(e, dt, off); }
export function removeFlimmerViews(list) { for (const e of list) if (e.view?.flimmer) dispose(e); }
// a Flimmer made once off-screen, for the shaders it is drawn with (render/enemies.js enemyWarmup:
// one program for every kind): its parts, its silhouette, its bar and label. -> the enemies made
let warmed = false;
export function flimmerWarmup(kinds) {
  if (warmed || !kit || !kinds.some(k => ENEMY_KINDS[k]?.species === 'flimmer')) return [];
  warmed = true;
  const e = makeEnemy({ id: 'warm:flimmer', x: 0, y: 0, z: 0, yaw: 0, level: 1 }, ENEMY_KINDS.flimmer);
  e.view = makeView(e);
  scene.remove(e.view.group);
  return [e];
}
