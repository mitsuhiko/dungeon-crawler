// The Squirtle (core/enemies.js SQUIRTLE): a living wave, its body made of its fluid afresh every
// few frames (render/fluidbody.js), no model. Its shape is the kids' sketch, seen from the side: its
// back rises out of its fluid at the rear and arches up and forward into the crest, and the crest
// is its head (a solid eye on either side); the curl comes down in front from under the head and
// forward again under the snout as its lower jaw, its tip turned up: between them, opening forward,
// its mouth, dark inside, which opens and closes as it breathes. Under the jaw its front comes down
// into the fluid; under the arch is the wave's hollow. Foam on the crest, the snout, the jaw's tip
// and round its feet. The shape is a handful of soft tubes and balls along that curve (`blobs`),
// posed from what it does (game/enemyai.js), melted into one:
//   - breathing it rolls and swells, its mouth opening and closing, its surface rippling; moving
//     or turning, its crest sloshes after it (a spring);
//   - spitting it rears back with its mouth wide and lunges; leaping it gathers itself low,
//     stretches out through the air, and crashes down flat, spraying;
//   - diving it sinks into its fluid; on land it shrinks, and dissolving into a puddle it slumps
//     flat and runs along the ground as one (game/enemyai.js `ashore`), rising out of its fluid
//     again where it gets back; dying it collapses into a puddle that fades.
// Its fluid's look: water clear and glossy, lava glowing, slime cloudy. Its bar, label and "!" are
// an enemy's, its silhouette where terrain hides it too; wet puddles where it goes on land
// (render/trails.js).
import * as THREE from 'three';
import { scene, camera } from './scene.js';
import { makeFluidMesh, buildFluidMesh } from './fluidbody.js';
import { SIZE, WIDE, EYES, CREST, shape, paintOf, fieldOf } from './squirtleshape.js';
import { attackOf, enemyName, ENEMY_KINDS, makeEnemy } from '../core/enemies.js';
import { WATER, LAVA, ACID } from '../core/constants.js';
import { toLinear } from '../core/oklch.js';
import { guardianColor, guardianTitle } from '../core/guardians.js';
import { makeBar, makeLevelLabel, makeAlertMark } from './bars.js';
import { soft, emit, rand } from './particles.js';
import { sfx } from '../audio/sfx.js';
import { player } from '../game/state.js';
import { uiScale } from '../game/uiscale.js';
import { fluidAround } from '../physics/dwell.js';
import { wetTrail, removeTrail } from './trails.js';

const SILHOUETTE = 0xff6a5a, SILHOUETTE_OPACITY = 0.4;
// the looks of its fluids: see-through, glossy, glowing
const LOOK = {
  [WATER]: { opacity: 0.92, roughness: 0.28, metalness: 0, glow: 0.08 },
  [LAVA]: { opacity: 1, roughness: 0.55, metalness: 0, glow: 0.55 },
  [ACID]: { opacity: 0.8, roughness: 0.18, metalness: 0.05, glow: 0.12 },
};
const SPRAY = { [WATER]: ['#ffffff', '#c8f0ff', '#8fd4f0'], [LAVA]: ['#fff0a0', '#ffa040', '#e0501a'], [ACID]: ['#f2ffc8', '#c0f070', '#78b838'] };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const toward = (x, goal, step) => x + Math.sign(goal - x) * Math.min(Math.abs(goal - x), step);
const angleTo = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
// keyframes (t, value)... -> value at t (smoothed between)
const keys = (...k) => t => {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) if (t <= k[i][0]) {
    const [t0, a] = k[i - 1], [t1, b] = k[i];
    return a + (b - a) * smooth(0, 1, (t - t0) / (t1 - t0));
  }
  return k[k.length - 1][1];
};
const color = (c, fallback) => new THREE.Color(...toLinear(c ?? fallback));

function makeView(e) {
  const fluid = e.profile.dwells?.[0] ?? WATER, look = LOOK[fluid] ?? LOOK[WATER];
  const body = color(e.profile.colors?.body, '#3a7fd0'), foam = color(e.profile.colors?.belly, '#e6f6ff');
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: look.roughness, metalness: look.metalness,
    transparent: true, opacity: look.opacity, emissive: body.clone().multiplyScalar(look.glow) });   // (drawn after its silhouette)
  const fb = makeFluidMesh(material), group = new THREE.Group();
  fb.mesh.castShadow = true; fb.mesh.renderOrder = 1;
  group.add(fb.mesh);
  // where terrain hides it: its silhouette, drawn before it
  const ghost = new THREE.MeshBasicMaterial({ color: SILHOUETTE, transparent: true, opacity: SILHOUETTE_OPACITY, depthFunc: THREE.GreaterDepth, depthWrite: false });
  const silhouette = new THREE.Mesh(fb.geometry, ghost);
  silhouette.frustumCulled = false; silhouette.renderOrder = -1;
  group.add(silhouette);
  // the eyes: a white each, a dark pupil
  // (drawn after its silhouette, as the body is: see-through to the renderer, solid to see)
  const white = new THREE.MeshStandardMaterial({ color: '#f4f8fb', roughness: 0.3, transparent: true }), dark = new THREE.MeshStandardMaterial({ color: '#0e1626', roughness: 0.15, transparent: true });
  const ball = new THREE.SphereGeometry(1, 14, 10);
  const eyes = [-1, 1].map(side => {
    const w = new THREE.Mesh(ball, white), p = new THREE.Mesh(ball, dark);
    w.renderOrder = 2; p.renderOrder = 3;
    group.add(w, p);
    return { side, w, p };
  });
  // the bar, the label over it and the "!" over that, together over the head
  const role = e.guardian ? e.guardianRole : null, tint = guardianColor(role);
  const tag = new THREE.Group(); group.add(tag);
  const hpBar = makeBar({ onTop: true, ...role && { color: tint, w: role === 'descent' ? 1.2 : .9 } }), bar = hpBar.group;
  tag.add(bar);
  const label = makeLevelLabel(e.level, { onTop: true, ...role && { color: tint, title: guardianTitle(role, e.profile) } });
  label.position.y = .21; tag.add(label);
  const mark = makeAlertMark(); mark.position.y = .5; tag.add(mark);
  scene.add(group);
  group.userData.figure = true;   // (casts into the realtime shadow maps as the quality level asks: render/shadows.js)
  return { squirtle: true, group, fb, material, ghost, silhouette, white, dark, ball, eyes, tag, bar, hpBar, label, mark, markT: 0,
    fluid, body, colors: { body, foam, mouth: body.clone().multiplyScalar(0.12) }, glow: look.glow,
    yaw: e.yaw, size: e.profile.size ?? 1, land: 1, sink: e.under ? 1 : 0, puddle: e.under ? 1 : 0, underWas: e.under ? 1 : 0,
    breath: Math.random(), was: { x: e.x, z: e.z, vx: 0, vz: 0 }, slosh: { x: 0, z: 0, vx: 0, vz: 0 }, speed: 0,
    crashed: -1, rebuild: 0, seed: Math.random() * 100, trail: null, hurt: 0 };
}

// What it does, as the shape's numbers: open (the mouth, 0..1), lean (its top forward, rad), squash
// (< 1 lower and wider), stretch (longer, for the leap), puddle (0 a wave .. 1 flat)
function pose(v, e, dt) {
  const p = { open: 0, lean: 0, squash: 1, stretch: 1 };
  v.breath = (v.breath + dt / 1.6) % 1;
  const w = v.breath * Math.PI * 2;
  p.open = Math.pow(smooth(0, 1, 0.5 - 0.5 * Math.cos(w)), 0.8) * 0.55;
  p.squash = 1 + 0.03 * Math.sin(2 * w);
  p.lean = 0.04 * Math.sin(w);
  const a = e.mode === 'attack' ? attackOf(e) : null;
  if (a?.name === 'spit') {
    const t = e.t, hit = a.hitAt;
    const rear = keys([0, 0], [0.3, 1], [hit - 0.06, 1.1], [hit, 0], [0.75, 0])(t), lunge = keys([0, 0], [hit - 0.06, 0], [hit, 1], [hit + 0.18, 1], [1.05, 0])(t);
    p.open = keys([0, 0.1], [0.2, 0.2], [hit - 0.04, 0.8], [hit, 1], [hit + 0.15, 0.9], [0.9, 0.15], [1.1, 0.1])(t);
    p.lean += -0.2 * rear + 0.18 * lunge; p.squash *= 1 - 0.06 * rear + 0.04 * lunge;
  } else if (a?.name === 'leap') {
    const t = e.t, go = a.ride.from, hit = a.hitAt, end = a.attackTime;
    const gather = keys([0, 0], [go - 0.12, 1], [go, 0.2], [hit - 0.1, 0])(t), stretch = keys([0, 0], [go - 0.08, 0], [go + 0.1, 1], [hit - 0.12, 0.8], [hit, 0])(t);
    const crash = keys([0, 0], [hit - 0.12, 0], [hit, 1], [hit + 0.25, 0.85], [end, 0.3])(t);
    p.open = keys([0, 0.1], [go, 0.6], [hit - 0.1, 1], [hit, 0.3], [hit + 0.2, 0], [end, 0.1])(t);
    p.lean += -0.25 * gather + 0.3 * stretch + 0.45 * crash;
    p.squash *= 1 - 0.3 * gather + 0.12 * stretch - 0.45 * crash;
    p.stretch = 1 + 0.25 * stretch + 0.3 * crash;
  }
  // on land it shrinks (game/enemyai.js ashore); under, it sinks into its fluid or slumps into a
  // puddle on land; dead, it collapses into one
  const wet = fluidAround(e.profile, e.x, e.y, e.z), dead = e.mode === 'dead';
  v.land = toward(v.land, e.mode === 'ashore' ? 0.6 : 1, dt / 0.4 * 0.4);
  const flat = dead || (e.under && !wet), down = !dead && e.under && !!wet;
  v.puddle = toward(v.puddle, flat ? 1 : 0, dt / (dead ? 0.7 : 0.35));
  v.sink = toward(v.sink, down ? 1 : 0, dt / (e.profile.burrow?.sink ?? 0.35));
  p.puddle = v.puddle; p.sink = v.sink; p.wet = wet;
  return p;
}

const UP = new THREE.Vector3(0, 1, 0), inverseYaw = new THREE.Quaternion(), WHITE = new THREE.Color(1, 1, 1), HOVER = new THREE.Color(0xffd9a0);
// (off: where the cube is drawn, while a portal's travel slides it: game/travel.js)
function animate(e, dt, off) {
  const v = e.view ?? (e.view = makeView(e)), g = v.group, dead = e.mode === 'dead';
  g.position.set(e.x + off.x, e.y + off.y, e.z + off.z);
  v.yaw = e.mode === 'attack' || dead ? angleTo(v.yaw, e.yaw, Math.min(1, dt * 20)) : angleTo(v.yaw, e.yaw, Math.min(1, dt * 10));
  g.rotation.y = v.yaw;
  g.visible = e.mode !== 'gone';
  if (!g.visible) return;
  // its crest sloshes after it as it moves and turns: a spring, pushed by how it speeds up
  const mx = e.x - v.was.x, mz = e.z - v.was.z, jump = Math.hypot(mx, mz) > 1;
  if (dt > 1e-4 && !jump) {
    const vx = mx / dt, vz = mz / dt, ax = (vx - v.was.vx), az = (vz - v.was.vz);
    const c = Math.cos(v.yaw), s = Math.sin(v.yaw), lx = ax * c - az * s, lz = ax * s + az * c;   // (into the group's frame)
    const sl = v.slosh, k = 70, damp = 7;
    sl.vx += (-k * sl.x - damp * sl.vx) * dt - lx * 0.012; sl.vz += (-k * sl.z - damp * sl.vz) * dt - lz * 0.012;
    sl.x = clamp(sl.x + sl.vx * dt, -0.08, 0.08); sl.z = clamp(sl.z + sl.vz * dt, -0.08, 0.08);
    v.was.vx = vx; v.was.vz = vz; v.speed = Math.hypot(vx, vz);
  }
  v.was.x = e.x; v.was.z = e.z;
  const p = pose(v, e, dt), t = performance.now() / 1000;
  // the body, made afresh (every frame near, less often far off)
  const far = Math.hypot(e.x - player.x, e.z - player.z) > 14;
  if ((v.rebuild -= dt) <= 0 || !v.fb.cap) {
    v.rebuild = far ? 0.12 : 1 / 30;
    p.size = v.size * v.land; p.sway = Math.sin(t * 2.1 + v.seed) * 0.02; p.slosh = v.slosh;
    const sh = shape(p), S = sh.S, { s, box } = fieldOf(sh, p, t);
    buildFluidMesh(v.fb, s, box, (far ? 0.12 : 0.085) * Math.max(0.6, p.size), paintOf(v.colors, sh, p));
    // the eyes, on the posed head (gone into a puddle or under)
    const show = p.puddle < 0.4 && p.sink < 0.6;
    for (const eye of v.eyes) {
      const [wf, wh, wx] = EYES[0], [pf, ph, px] = EYES[1], a = sh.place(wf, wh, 'head'), b = sh.place(pf, ph, 'head');
      eye.w.position.set(eye.side * wx * S * WIDE, a[1], a[2]); eye.w.scale.set(0.034 * S, 0.04 * S, 0.038 * S);
      eye.p.position.set(eye.side * px * S * WIDE, b[1], b[2]); eye.p.scale.set(0.018 * S, 0.024 * S, 0.022 * S);
      eye.w.visible = eye.p.visible = show;
    }
  }
  // fading, dead; flashing when hit; warm when hovered
  const fade = dead ? 1 - smooth(e.profile.deathTime, e.profile.corpseTime, e.deadT) : 1;
  const flash = clamp(e.hurtT / 0.22, 0, 1) * 0.6, hover = e.hovered && !dead ? 0.22 : 0;
  v.material.opacity = (LOOK[v.fluid] ?? LOOK[WATER]).opacity * fade;
  v.material.emissive.copy(v.body).multiplyScalar(v.glow).lerp(flash > 0.1 || !hover ? WHITE : HOVER, Math.max(flash, hover) * 0.6);
  // (its silhouette not where its own fluid hides it)
  v.ghost.opacity = p.wet ? 0 : SILHOUETTE_OPACITY * fade * (1 - p.sink) * (1 - p.puddle);
  v.silhouette.visible = v.ghost.opacity > 0.005;
  splashes(v, e, dt, off, p);
  wetTrail(v, e, dt, off);
  tags(v, e, dt, dead, p);
}
// spray where it dives and rises, where it crashes down, dripping as it rushes along; ripples
// round it in water
function splashes(v, e, dt, off, p) {
  const near = Math.hypot(e.x - player.x, e.z - player.z) < 16, colors = SPRAY[v.fluid] ?? SPRAY[WATER], S = SIZE * v.size * v.land;
  const top = p.wet ? p.wet.y : e.y, burst = (n, up, r) => {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(0.6, 2) * r;
      emit(soft, e.x + off.x + Math.cos(a) * 0.2 * S, top + off.y + 0.05, e.z + off.z + Math.sin(a) * 0.2 * S, { v: [Math.cos(a) * sp, rand(1, up), Math.sin(a) * sp],
        life: rand(0.4, 0.8), size: rand(0.05, 0.12), color: colors[i % 3], alpha: 0.95, gravity: 9, drag: 1 });
    }
  };
  const under = e.under ? 1 : 0;
  if (under !== v.underWas) {
    v.underWas = under;
    if (near && e.mode !== 'dead') { sfx(under ? 'dig' : 'pop', { at: e }); burst(18, 2.6, 1); }
  }
  // crashing down out of a leap
  const a = e.mode === 'attack' ? attackOf(e) : null;
  if (a?.name === 'leap' && e.t >= a.hitAt && v.crashed !== e.attacks) {
    v.crashed = e.attacks;
    if (near) burst(34, 3.4, 1.8);
  }
  if (!near) return;
  // dripping as it rushes along, or runs as a puddle
  if ((v.speed > 0.6 || (e.under && !p.wet)) && Math.random() < dt * 14)
    emit(soft, e.x + off.x + rand(-0.3, 0.3) * S * 0.4, top + off.y + (e.under ? 0.04 : rand(0.1, 0.5) * S), e.z + off.z + rand(-0.3, 0.3) * S * 0.4,
      { v: [rand(-0.4, 0.4), rand(0.3, 1.2), rand(-0.4, 0.4)], life: rand(0.35, 0.6), size: rand(0.04, 0.09), color: colors[Math.floor(Math.random() * 3)], alpha: 0.9, gravity: 7, drag: 1 });
  // ripples round it in water
  if (p.wet && v.fluid === WATER && !e.under && Math.random() < dt * (v.speed > 0.3 ? 10 : 2.5))
    emit(soft, e.x + off.x + rand(-0.3, 0.3) * S * 0.3, p.wet.y + off.y + 0.02, e.z + off.z + rand(-0.3, 0.3) * S * 0.3,
      { v: [rand(-0.3, 0.3), 0.05, rand(-0.3, 0.3)], life: rand(0.7, 1.1), size: rand(0.18, 0.3), grow: 2.2, color: '#f2fcff', alpha: 0.45, drag: 1 });
}
// its bar, label and "!" (as any enemy's, render/enemies.js), over its crest
function tags(v, e, dt, dead, p) {
  if (dead || e.mode === 'gone' || (p.puddle > 0.5 || p.sink > 0.5)) { v.bar.visible = v.label.visible = v.mark.visible = false; return; }
  v.tag.position.y = Math.min(e.profile.height, CREST * SIZE * v.size * v.land + 0.15) + 0.12; v.tag.scale.setScalar(uiScale());
  v.bar.visible = !!e.guardian || !!e.hovered || !e.hordeId && e.hp < e.profile.hp;
  v.label.visible = v.bar.visible || !e.hordeId && Math.hypot(e.x - player.x, e.z - player.z) < e.profile.aggro + 1;
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
  removeTrail(v);
  v.fb.geometry.dispose(); v.ball.dispose();
  for (const m of [v.material, v.ghost, v.white, v.dark]) m.dispose();
  v.label.material.map?.dispose(); v.label.material.dispose();
  e.view = null;
}

// render/enemies.js: the Squirtles come here
export const isSquirtle = e => e.profile?.species === 'squirtle';
export function animateSquirtles(list, dt, off) { for (const e of list) animate(e, dt, off); }
export function removeSquirtleViews(list) { for (const e of list) if (e.view?.squirtle) dispose(e); }
// a Squirtle made once off-screen, for the shaders it is drawn with (render/enemies.js enemyWarmup)
const warmed = new Set();
export function squirtleWarmup(kinds) {
  const out = [];
  for (const k of kinds) {
    const kind = ENEMY_KINDS[k];
    if (kind?.species !== 'squirtle' || warmed.has(kind.dwells?.[0] ?? WATER)) continue;
    warmed.add(kind.dwells?.[0] ?? WATER);
    const e = makeEnemy({ id: 'warm:' + k, x: 0, y: 0, z: 0, yaw: 0, level: 1 }, kind);
    animate(e, 0, { x: 0, y: 0, z: 0 });
    scene.remove(e.view.group);
    out.push(e);
  }
  return out;
}
