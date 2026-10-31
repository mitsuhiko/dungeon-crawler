// What a room task shows (docs/trials.md "Room tasks", core/tasks.js), beside its braziers and its
// beacon (render/trials.js draws those, as the trials' own):
//   shards       a glowing crystal floating over its cell, turning; gone once taken
//   hidden       a small button, dim, that glints when you come close (HIDDEN.near); a pale light
//                rises over it once the room was entered HIDDEN.hint s ago
//   wardstones   a runestone with a violet crystal floating over it, its health over it like an
//                enemy's (it is one: game/tasks.js); every WARD.every s it pulses, and motes drift
//                from it to the wounded it mends; broken, it bursts into shards
//   marks        a golden diamond over the enemies the task points out (the keybearer, the last
//                few of a room to clear)
// buildTaskView adds them to the trial view (render/trials.js buildTrialView); game/trials.js sets
// them every frame (setTaskView).
import * as THREE from 'three';
import { TRIALS } from '../core/trials.js';
import { WARD, HIDDEN } from '../core/tasks.js';
import { makeBar } from './bars.js';
import { camera } from './scene.js';
import { glow as glowLayer, soft, emit, rand } from './particles.js';

const glowMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });

// the task's things, built into `group` (piece: a model of the trials' library, render/trials.js)
export function buildTaskView(t, group, piece) {
  if (!t.task) return null;
  const view = { shards: new Map(), hidden: null, wards: new Map(), marks: [], group, pulse: 0 };
  const color = new THREE.Color(TRIALS[t.kind].color);
  for (const p of t.parts || []) {
    if (p.type === 'shard') {
      const g = new THREE.Group(), gem = piece('trial_gem', { own: true });
      gem.material.color.set(color); gem.material.emissive.set(color); gem.material.emissiveIntensity = 1.2;
      gem.scale.setScalar(1.4);
      const light = new THREE.PointLight(color, 1.6, 3.2, 2); light.position.y = 0.2;
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.34, 20), glowMat(color, 0.4));
      halo.rotation.x = -Math.PI / 2; halo.position.y = -0.55;
      g.add(gem, light, halo);
      g.position.set(p.x, p.y + 0.6, p.z);
      group.add(g);
      view.shards.set(p.id, { obj: g, gem, light, part: p, gone: false });
    }
    if (p.type === 'hidden') {
      const g = new THREE.Group(), knob = piece('trial_knob', { own: true });
      knob.material.color.set(0x8a8a70); knob.material.emissive.set(color); knob.material.emissiveIntensity = 0.15;
      knob.position.set(0, 0.74, 0);
      const base = piece('trial_button');
      g.add(base, knob);
      g.scale.setScalar(0.7);
      g.position.set(p.x, p.y, p.z);
      // the light that rises over it once it has been looked for long enough
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 6, 12, 1, true), glowMat(color, 0));
      beam.position.set(p.x, p.y + 3, p.z); beam.visible = false;
      const light = new THREE.PointLight(color, 0, 3, 2); light.position.set(p.x, p.y + 0.8, p.z);
      group.add(g, beam, light);
      view.hidden = { obj: g, knob, beam, light, part: p, glint: 0, done: false };
    }
  }
  for (const w of t.wards || []) {
    const g = new THREE.Group(), stone = piece('trial_runestone'), gem = piece('trial_gem', { own: true });
    const violet = new THREE.Color(TRIALS.wardstones.color);
    gem.material.color.set(violet); gem.material.emissive.set(violet); gem.material.emissiveIntensity = 1.6;
    gem.position.y = 1.2; gem.scale.setScalar(2.2);
    const light = new THREE.PointLight(violet, 1.8, 4, 2); light.position.y = 1.2;
    const ring = new THREE.Mesh(new THREE.RingGeometry(WARD.radius - 0.05, WARD.radius + 0.05, 48), glowMat(violet, 0));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
    const bar = makeBar({ color: 0xb48cff });
    bar.group.position.y = 1.85; bar.group.visible = false;
    g.add(stone, gem, light, ring, bar.group);
    g.position.set(w.x, w.y, w.z);
    group.add(g);
    view.wards.set(`trial:${t.key}:ward${w.i}`, { obj: g, gem, light, ring, bar, w, broken: false });
  }
  return view;
}

// a golden diamond over an enemy the task points out
function mark() {
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.9, depthTest: false }));
  m.scale.y = 1.6; m.renderOrder = 1203;
  return m;
}

// every frame (game/trials.js showTrial): s the task's state; enemies: the cube's (game/enemies.js
// allEnemies), marks: those to point out, since: s in the room, player: where the hero is
export function setTaskView(world, m, s, { enemies = [], marks = [], since = 0, player = null } = {}) {
  const v = world?.trialView?.task;
  if (!v || !m || !s) return;
  const now = performance.now() / 1000, done = s.phase === 'resolved';
  for (const [id, g] of v.shards) {
    const gone = done || !!s.bits?.[id];
    if (gone && !g.gone) for (let k = 0; k < 14; k++) emit(glowLayer, g.obj.position.x, g.obj.position.y, g.obj.position.z,
      { v: [rand(-1.2, 1.2), rand(0.4, 2), rand(-1.2, 1.2)], life: rand(0.3, 0.6), size: rand(0.06, 0.12), color: '#bff4ff', alpha: 0.9, gravity: 2 });
    g.gone = gone; g.obj.visible = !gone;
  }
  const h = v.hidden;
  if (h) {
    const near = player ? Math.hypot(player.x - h.part.x, player.z - h.part.z) : Infinity, hint = !done && since >= HIDDEN.hint;
    h.glint = !done && near < HIDDEN.near ? 1 - near / HIDDEN.near : 0;
    h.beam.visible = hint; h.beam.material.opacity = hint ? 0.18 + Math.sin(now * 2) * 0.06 : 0;
    h.light.intensity = done ? 0 : h.glint * 2.2 + (hint ? 1 : 0);
    h.knob.material.emissiveIntensity = done ? 1.2 : 0.15 + h.glint * 1.4;
    if (done && !h.done) { h.knob.material.color.set(0x6cff8a); h.knob.material.emissive.set(0x6cff8a); h.knob.position.y = 0.68; }
    h.done = done;
    // a glint now and then, more the nearer you are
    if (h.glint > 0 && Math.random() < h.glint * 0.08) emit(glowLayer, h.part.x + rand(-0.15, 0.15), h.part.y + 0.55, h.part.z + rand(-0.15, 0.15),
      { v: [0, rand(0.2, 0.6), 0], life: 0.35, size: rand(0.08, 0.16), color: '#fffbe0', alpha: 0.95 });
  }
  // the wardstones as their enemies are
  const byId = new Map(enemies.map(e => [e.id, e]));
  const pulse = Math.floor(now / WARD.every), pulsed = pulse !== v.pulse;
  v.pulse = pulse;
  for (const [id, g] of v.wards) {
    const e = byId.get(id), broken = done || !e || e.mode === 'dead';
    if (broken && !g.broken && e) for (let k = 0; k < 22; k++) emit(glowLayer, g.obj.position.x, g.obj.position.y + 1.1, g.obj.position.z,
      { v: [rand(-2, 2), rand(0.5, 3), rand(-2, 2)], life: rand(0.4, 0.8), size: rand(0.06, 0.13), color: k % 2 ? '#d8c4ff' : '#7a5ac8', alpha: 0.95, gravity: 6 });
    g.broken = broken;
    g.gem.visible = !broken; g.light.intensity = broken ? 0 : 1.6 + Math.sin(now * 3 + g.w.i) * 0.4;
    g.gem.position.y = 1.15 + Math.sin(now * 1.7 + g.w.i) * 0.06; g.gem.rotation.y = now * 0.9;
    g.ring.material.opacity = broken ? 0 : 0.12 + Math.max(0, 1 - (now % WARD.every) * 2) * 0.35;
    g.bar.group.visible = !broken && !!e && (e.hovered || e.hp < e.profile.hp);
    if (g.bar.group.visible) { g.bar.set(e.hp / e.profile.hp); g.bar.group.quaternion.copy(camera.quaternion); }
    // motes to the wounded it mends
    if (!broken && pulsed) for (const q of enemies) {
      if (q.profile.ward || q.mode === 'dead' || q.hp >= q.profile.hp || Math.hypot(q.x - g.w.x, q.z - g.w.z) > WARD.radius || Math.abs(q.y - g.w.y) > 3) continue;
      const dx = q.x - g.w.x, dz = q.z - g.w.z, dy = q.y + 0.5 - (g.w.y + 1.15);
      for (let k = 0; k < 6; k++) emit(soft, g.w.x, g.w.y + 1.15, g.w.z, { v: [dx * rand(0.9, 1.3), dy + rand(0, 0.6), dz * rand(0.9, 1.3)], life: 0.9, size: rand(0.07, 0.11), color: '#c9a8ff', alpha: 0.85 });
    }
  }
  // the marks over the enemies pointed out
  while (v.marks.length < marks.length) { const mk = mark(); v.group.add(mk); v.marks.push(mk); }
  v.marks.forEach((mk, i) => {
    const e = marks[i];
    mk.visible = !!e;
    if (e) { mk.position.set(e.x, e.y + e.profile.bodyHeight + 0.75 + Math.sin(now * 3 + i) * 0.08, e.z); mk.rotation.y = now * 2; }
  });
}

// the shards turning and bobbing (render/trials.js tickTrialView)
export function tickTaskView(v, time) {
  if (!v) return;
  for (const [, g] of v.shards) if (!g.gone) {
    g.gem.rotation.y = time * 1.3; g.gem.position.y = Math.sin(time * 2 + g.part.i) * 0.08;
    g.light.intensity = 1.4 + Math.sin(time * 3 + g.part.i) * 0.4;
  }
}
