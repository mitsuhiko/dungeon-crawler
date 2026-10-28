// The Squirtle (core/enemies.js SQUIRTLE): a living wave, its model blender/squirtle.py, its body
// drawn as the fluid it lives in (render/squirtlelook.js: the cells, the palette of the body of
// fluid it is in; nothing of it under the surface, foam where it comes out). Its clips, played
// from what it does (game/enemyai.js):
//   - breathing (SquirtleIdle) it rolls and swells, its mouth opening and closing; moving it
//     leans into the way it goes, its lip curled over, surging (SquirtleSwim, by how fast); its
//     whole body sloshes after it as it speeds up and turns (a spring);
//   - spitting it rears back with its mouth wide and lunges (SquirtleSpit); leaping it gathers
//     itself low, stretches out through the air and crashes down flat (SquirtleLeap);
//   - diving it sinks into its fluid and rises out of it again (drawn lower: the surface hides
//     it); on land it shrinks, and dissolving it slumps into a puddle (SquirtleMelt, scrubbed) that
//     runs along the ground (game/enemyai.js `ashore`); dying it crashes and runs out into a
//     puddle (SquirtleDeath) that fades, or sinks into its fluid.
// Spray where it dives and rises, crashes, rushes along; ripples round it in water, embers off it
// in lava, bubbles in slime: in its palette's colours. A lava one lights its surroundings. Its bar,
// label and "!" are an enemy's, its silhouette where terrain hides it on land too; wet puddles where
// it goes on land, in its palette's colours too (render/trails.js).
import * as THREE from 'three';
import { scene, camera } from './scene.js';
import { squirtleModel } from './squirtlemodel.js';
import { dressEnemy } from './enemymodel.js';
import { squirtleMaterial } from './squirtlelook.js';
import { attackOf, enemyName, ENEMY_KINDS, makeEnemy } from '../core/enemies.js';
import { WATER, LAVA, ACID, LH, N } from '../core/constants.js';
import { guardianColor, guardianTitle } from '../core/guardians.js';
import { bossBarred } from '../core/bossbar.js';
import { makeBar, makeLevelLabel, makeAlertMark } from './bars.js';
import { soft, glow, emit, rand } from './particles.js';
import { sfx } from '../audio/sfx.js';
import { player, state } from '../game/state.js';
import { uiScale } from '../game/uiscale.js';
import { fluidAround } from '../physics/dwell.js';
import { wetTrail, removeTrail } from './trails.js';
import { restY } from './surface.js';
import { palRow } from '../themes/fluids.js';
import { paletteOf } from './fluidpal.js';
import { trackLight, untrackLight } from './lightpool.js';

const SILHOUETTE = 0xff6a5a, SILHOUETTE_OPACITY = 0.4;
const CREST = 1.6;   // cells from its feet to its crest (blender/squirtle.py), at size 1
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const toward = (x, goal, step) => x + Math.sign(goal - x) * Math.min(Math.abs(goal - x), step);
const angleTo = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

// the palette row of the body of fluid it is in (as its floor draws it: render/floors.js; a
// standing one's: render/trials.js), or null where it is in none
function palIn(e, wet) {
  const m = state.map;
  if (!m || !wet) return null;
  if (e.x >= 0 && e.z >= 0 && e.x < N && e.z < N)
    for (const g of m.cols[Math.floor(e.z) * N + Math.floor(e.x)] ?? [])
      if (!g.kind && g.fluid === wet.fluid && g.pal != null && Math.abs(g.surf * LH - wet.y) < 1e-3) return g.pal;
  return m.fluidRows?.[wet.fluid] ?? palRow(m.depth ?? 0, wet.fluid, 0);
}

// It looks like the fluid it is in from the start (one it pops out of, a guardian's pond of any
// fluid), else like the first it lives in.
function makeView(e, prefab) {
  const wet = fluidAround(e.profile, e.x, e.y, e.z), own = wet && e.profile.dwells?.includes(wet.fluid) ? wet : null;
  const fluid = own?.fluid ?? e.profile.dwells?.[0] ?? WATER, size = e.profile.size ?? 1;
  const { model, mesh, material: plain, parts } = dressEnemy(prefab, e.profile);
  const material = mesh.material = squirtleMaterial(fluid, parts);   // (its eyes in its kind's colours)
  plain.dispose();
  mesh.castShadow = true; mesh.renderOrder = 1;   // (after its fluid's surface)
  const tilt = new THREE.Group(), group = new THREE.Group();
  tilt.add(model); group.add(tilt);
  // where terrain hides it (on land): its silhouette, drawn before it
  const ghost = new THREE.MeshBasicMaterial({ color: SILHOUETTE, transparent: true, opacity: SILHOUETTE_OPACITY, depthFunc: THREE.GreaterDepth, depthWrite: false });
  const silhouette = new THREE.SkinnedMesh(mesh.geometry, ghost);
  silhouette.bind(mesh.skeleton, mesh.bindMatrix);
  silhouette.renderOrder = -1; silhouette.boundingSphere = mesh.boundingSphere; silhouette.userData.sharedGeo = true;
  mesh.add(silhouette);
  // the clips: by time (the loops), by what it does (the rest)
  const mixer = new THREE.AnimationMixer(model), actions = {}, weights = {};
  for (const [name, clip] of [['idle', prefab.walk], ['swim', prefab.gaits.swim], ['melt', prefab.gaits.melt], ['death', prefab.death],
    ['spit', prefab.attacks.spit], ['leap', prefab.attacks.leap]]) {
    const a = mixer.clipAction(clip);
    a.play(); a.timeScale = 0; a.setEffectiveWeight(name === 'idle' ? 1 : 0);
    actions[name] = a; weights[name] = name === 'idle' ? 1 : 0;
  }
  // the bar, the label over it and the "!" over that, together over the crest
  const role = e.guardian ? e.guardianRole : null, tint = guardianColor(role);
  const tag = new THREE.Group(); group.add(tag);
  const hpBar = makeBar({ onTop: true, ...role && { color: tint, w: role === 'descent' ? 1.2 : .9 } }), bar = hpBar.group;
  tag.add(bar);
  const label = makeLevelLabel(e.level, { onTop: true, ...role && { color: tint, title: guardianTitle(role, e.profile) } });
  label.position.y = .21; tag.add(label);
  const mark = makeAlertMark(); mark.position.y = .5; tag.add(mark);
  // lava glows
  let light = null;
  if (fluid === LAVA) {
    light = new THREE.PointLight(0xff6a20, 1.4, 3.6 * size, 2); light.position.y = 0.9 * size;
    trackLight(light, group);
  }
  scene.add(group);
  group.userData.figure = true;   // (casts into the realtime shadow maps as the quality level asks: render/shadows.js)
  const m = state.map;
  return { squirtle: true, group, tilt, model, mesh, material, flow: material.userData.flow, ghost, silhouette, mixer, actions, weights,
    tag, bar, hpBar, label, mark, markT: 0, light, fluid, pal: palIn(e, own) ?? m?.fluidRows?.[fluid] ?? palRow(m?.depth ?? 0, fluid, 0),
    yaw: e.yaw, size, land: 1, sink: e.under ? 1 : 0, puddle: e.under ? 1 : 0, underWas: e.under ? 1 : 0,
    idleT: Math.random() * 1.6, swimT: 0, was: { x: e.x, z: e.z, vx: 0, vz: 0 }, slosh: { x: 0, z: 0, vx: 0, vz: 0 }, speed: 0,
    crashed: -1, trail: null };
}

// how much of each clip, and where in it: what it does now
function play(v, e, dt, wet) {
  const A = v.actions, dead = e.mode === 'dead', a = e.mode === 'attack' ? attackOf(e) : null, strike = a && A[a.clip] ? a.clip : null;
  const clipT = name => A[name].getClip().duration;
  const speed = Math.max(v.speed, e.speed ?? 0);
  v.idleT = (v.idleT + dt) % clipT('idle');
  v.swimT = (v.swimT + dt * (0.7 + 0.5 * Math.min(1, speed / 2.2))) % clipT('swim');
  A.idle.time = v.idleT; A.swim.time = v.swimT;
  A.melt.time = v.puddle * 0.7;   // (melted through at 0.7 s, blender/squirtle.py)
  A.death.time = Math.min(e.deadT ?? 0, clipT('death'));
  if (strike) A[strike].time = Math.min(e.t, clipT(strike));
  const want = { idle: 0, swim: 0, melt: 0, death: 0, spit: 0, leap: 0 };
  if (dead) want.death = 1;
  else if (strike) want[strike] = 1;
  else {
    want.melt = smooth(0, 0.35, v.puddle);
    want.swim = (1 - want.melt) * clamp(speed / 1.4, 0, 1) * (wet || e.under ? 1 : 0.4);
    want.idle = 1 - want.melt - want.swim;
  }
  for (const n in A) {
    v.weights[n] = dead ? want[n] : v.weights[n] + (want[n] - v.weights[n]) * Math.min(1, dt * 12);
    A[n].setEffectiveWeight(v.weights[n]);
  }
  v.mixer.update(0);
}

const UP = new THREE.Vector3(0, 1, 0), inverseYaw = new THREE.Quaternion(), HOVER = new THREE.Color(0xffd9a0);
// (off: where the cube is drawn, while a portal's travel slides it: game/travel.js)
function animate(e, dt, off) {
  if (!squirtleModel.ready) { squirtleModel.load(); return; }
  const v = e.view ?? (e.view = makeView(e, squirtleModel)), g = v.group, dead = e.mode === 'dead';
  v.yaw = angleTo(v.yaw, e.yaw, Math.min(1, dt * (e.mode === 'attack' || dead ? 20 : 10)));
  g.rotation.y = v.yaw;
  g.visible = e.mode !== 'gone';
  if (!g.visible) { if (v.light) v.light.intensity = 0; return; }
  // its whole body sloshes after it: a spring, pushed by how it speeds up and turns
  const mx = e.x - v.was.x, mz = e.z - v.was.z, jump = Math.hypot(mx, mz) > 1;
  if (dt > 1e-4 && !jump) {
    const vx = mx / dt, vz = mz / dt, ax = vx - v.was.vx, az = vz - v.was.vz;
    const c = Math.cos(v.yaw), s = Math.sin(v.yaw), lx = ax * c - az * s, lz = ax * s + az * c;   // (into its own frame)
    const sl = v.slosh, k = 60, damp = 6;
    sl.vx += (-k * sl.x - damp * sl.vx) * dt - lx * 0.01; sl.vz += (-k * sl.z - damp * sl.vz) * dt - lz * 0.01;
    sl.x = clamp(sl.x + sl.vx * dt, -0.12, 0.12); sl.z = clamp(sl.z + sl.vz * dt, -0.12, 0.12);
    v.was.vx = vx; v.was.vz = vz; v.speed = Math.hypot(vx, vz);
  }
  v.was.x = e.x; v.was.z = e.z;
  v.tilt.rotation.set(v.slosh.z, 0, -v.slosh.x);
  // in its fluid, on land; diving under it, a puddle on land
  // (the colours of the body of its fluid it is in: its puddles on land too, render/trails.js)
  const wet = fluidAround(e.profile, e.x, e.y, e.z);
  if (wet?.fluid === v.fluid && !off.x && !off.y && !off.z) v.pal = palIn(e, wet) ?? v.pal;
  v.trailColor = paletteOf(v.pal).hex.body;
  v.land = toward(v.land, e.mode === 'ashore' ? 0.6 : 1, dt * 1.2);
  v.puddle = toward(v.puddle, !dead && e.under && !wet ? 1 : 0, dt / 0.35);
  v.sink = toward(v.sink, !dead && e.under && wet ? 1 : 0, dt / (e.profile.burrow?.sink ?? 0.35));
  const s = v.size * v.land;
  v.model.scale.setScalar(s);
  g.position.set(e.x + off.x, e.y + off.y - v.sink * (CREST * s - e.profile.bodyHeight * 0.3 * v.size + 0.1), e.z + off.z);
  play(v, e, dt, wet);
  // its look: the palette, the surface it comes out of, fading, flashing when hit, warm when hovered
  const u = v.flow, fade = dead ? 1 - smooth(e.profile.deathTime, e.profile.corpseTime, e.deadT) : 1;
  u.uPalRow.value = v.pal;
  u.uLevel.value = wet ? restY(wet.y) + off.y : -1e4;
  u.uOff.value.set(off.x, off.y, off.z);
  u.uFade.value = fade;
  u.uEyes.value = v.puddle < 0.6 && (!dead || e.deadT < 0.9) ? 1 : 0;
  const flash = clamp(e.hurtT / 0.22, 0, 1) * 0.6, hover = e.hovered && !dead ? 0.22 : 0;
  if (flash > 0.1) u.uFlash.value.setRGB(flash, flash, flash); else u.uFlash.value.copy(HOVER).multiplyScalar(hover);
  // (no silhouette in its fluid: the surface would show what it hides as hidden)
  v.ghost.opacity = wet ? 0 : SILHOUETTE_OPACITY * fade * (1 - v.puddle);
  v.silhouette.visible = v.ghost.opacity > 0.005;
  if (v.light) v.light.intensity = 1.4 * fade * (1 - v.sink) * (0.85 + 0.15 * Math.sin(performance.now() / 260 + v.idleT));
  splashes(v, e, dt, off, wet);
  wetTrail(v, e, dt, off);
  tags(v, e, dt, dead);
}

// spray where it dives and rises, where it crashes down, dripping as it rushes along; ripples
// round it in water, embers off it in lava, bubbles in slime (its palette's colours)
function splashes(v, e, dt, off, wet) {
  const near = Math.hypot(e.x - player.x, e.z - player.z) < 16, S = v.size * v.land;
  const hex = paletteOf(v.pal).hex, colors = [hex.foam, hex.line, hex.body], lava = v.fluid === LAVA, layer = lava ? glow : soft;
  const top = wet ? wet.y : e.y, x0 = e.x + off.x, y0 = top + off.y, z0 = e.z + off.z;
  const burst = (n, up, r) => {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(0.6, 2) * r;
      emit(layer, x0 + Math.cos(a) * 0.4 * S, y0 + 0.05, z0 + Math.sin(a) * 0.4 * S, { v: [Math.cos(a) * sp, rand(1, up), Math.sin(a) * sp],
        life: rand(0.4, 0.8), size: rand(0.05, 0.12), color: colors[i % 3], alpha: 0.95, gravity: 9, drag: 1 });
    }
  };
  const under = e.under ? 1 : 0;
  if (under !== v.underWas) {
    v.underWas = under;
    if (near && e.mode !== 'dead') { sfx(under ? 'dig' : 'pop', { at: e }); burst(20, 2.8, 1); }
  }
  const a = e.mode === 'attack' ? attackOf(e) : null;
  if (a?.name === 'leap' && e.t >= a.hitAt && v.crashed !== e.attacks) {   // crashing down out of a leap
    v.crashed = e.attacks;
    if (near) { burst(36, 3.6, 1.8); sfx('splash', { at: e }); }
  }
  if (!near || e.mode === 'dead') return;
  const R = () => rand(-0.5, 0.5) * S;
  // dripping as it rushes along, or runs as a puddle
  if ((v.speed > 0.6 || (e.under && !wet)) && Math.random() < dt * 14)
    emit(layer, x0 + R() * 0.8, y0 + (e.under ? 0.04 : rand(0.1, 0.5) * S), z0 + R() * 0.8,
      { v: [rand(-0.4, 0.4), rand(0.3, 1.2), rand(-0.4, 0.4)], life: rand(0.35, 0.6), size: rand(0.04, 0.09), color: colors[Math.floor(Math.random() * 3)], alpha: 0.9, gravity: 7, drag: 1 });
  if (!wet || v.sink > 0.9) return;
  if (v.fluid === WATER && Math.random() < dt * (v.speed > 0.3 ? 10 : 2.5))   // ripples spreading round it
    emit(soft, x0 + R() * 0.7, y0 - 0.04, z0 + R() * 0.7, { v: [rand(-0.3, 0.3), 0.05, rand(-0.3, 0.3)], life: rand(0.7, 1.1),
      size: rand(0.2, 0.34), grow: 2.2, color: hex.foam, alpha: 0.4, drag: 1 });
  else if (lava && Math.random() < dt * 9)   // embers rising off it
    emit(glow, x0 + R(), y0 + rand(0, 1.2) * S, z0 + R(), { v: [rand(-0.2, 0.2), rand(0.6, 1.4), rand(-0.2, 0.2)], spread: 0.2,
      life: rand(0.5, 1), size: rand(0.04, 0.07), color: Math.random() < 0.4 ? hex.foam : hex.line, gravity: -0.3, drag: 0.8 });
  else if (v.fluid === ACID && Math.random() < dt * 6)   // bubbles popping round it
    emit(soft, x0 + R() * 0.8, y0 - 0.02, z0 + R() * 0.8, { v: [0, rand(0.2, 0.5), 0], life: rand(0.3, 0.6), size: rand(0.05, 0.1),
      color: hex.line, alpha: 0.8 });
}
// its bar, label and "!" (as any enemy's, render/enemies.js), over its crest
function tags(v, e, dt, dead) {
  if (dead || e.mode === 'gone' || v.puddle > 0.5 || v.sink > 0.5) { v.bar.visible = v.label.visible = v.mark.visible = false; return; }
  v.tag.position.y = Math.min(e.profile.height, CREST * v.size * v.land + 0.15) + 0.12; v.tag.scale.setScalar(uiScale());
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
  if (v.light) untrackLight(v.light);
  removeTrail(v);
  v.mixer.stopAllAction(); v.mixer.uncacheRoot(v.model);
  v.material.dispose(); v.ghost.dispose();
  v.label.material.map?.dispose(); v.label.material.dispose();
  v.mesh.skeleton.dispose();
  e.view = null;
}

// render/enemies.js: the Squirtles come here
export const isSquirtle = e => e.profile?.species === 'squirtle';
export function animateSquirtles(list, dt, off) { for (const e of list) animate(e, dt, off); }
export function removeSquirtleViews(list) { for (const e of list) if (e.view?.squirtle) dispose(e); }
// a Squirtle of each look made once off-screen, for the shaders it is drawn with (render/enemies.js
// enemyWarmup), once its model is in
const warmed = new Set();
export function squirtleWarmup(kinds) {
  const out = [];
  if (!squirtleModel.ready) return out;
  for (const k of kinds) {
    const kind = ENEMY_KINDS[k], fluid = kind?.dwells?.[0] ?? WATER;
    if (kind?.species !== 'squirtle' || warmed.has(fluid)) continue;
    warmed.add(fluid);
    const e = makeEnemy({ id: 'warm:' + k, x: 0, y: 0, z: 0, yaw: 0, level: 1 }, kind);
    animate(e, 0, { x: 0, y: 0, z: 0 });
    scene.remove(e.view.group);
    if (e.view.light) untrackLight(e.view.light);
    out.push(e);
  }
  return out;
}
