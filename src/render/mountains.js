// Monteur's mountains as they show (game/mountains.js raises them, core/mountains.js has the rules):
// the mountain built like the cube's own terrain (render/mountaingeo.js) at its full height, in
// one group that sinks under the ground by as far as it is under its height (the ground hides
// what is under it, so it rises out of the floor and sinks back into it). Before it rises the
// floor cracks round it, glowing like his veins; rising it throws up dust and rock falls off its
// sides; falling apart it sinks in jolts, each one a thud that shakes the ground, chunks tumbling
// off its edges, dust rolling out at its foot. In the active cube's group (its fade, its cutaway).
// Woppylava's volcano (core/mountains.js `volcano`) is drawn in dark basalt made from the theme's
// rock and underside, scorched red-brown up by its crater, its road paler ash; it rises in jolts,
// the cracks round its foot glowing like lava while it does, sparks spurting out of them.
import * as THREE from 'three';
import { LH, DIRS } from '../core/constants.js';
import { idx, inb } from '../core/util.js';
import { mountainTimes, VOLCANO } from '../core/mountains.js';
import { mountainGeometry, volcanoGlow } from './mountaingeo.js';
import { cutMaterial } from './section.js';
import { partMeshes } from './partmeshes.js';
import { adoptFade } from './fade.js';
import { groundPatch, painted } from './meteors.js';
import { soft, glow, emit, rand } from './particles.js';
import { quakeAt, cameraKick } from '../game/juice.js';
import { player } from '../game/state.js';
import { sfx } from '../audio/sfx.js';

const DUST = ['#d8cfbd', '#c2b8a4', '#a39a88'], CHIPS = ['#b8b0a0', '#8d877c', '#6a645a', '#ffb347'];
const ASH = ['#6a625c', '#4e4844', '#8a8076'], SPARKS = ['#ffd27a', '#ffb347', '#ff7a2a'];

// the cracks it rises out of: jagged lines out from its middle, forking
const CRACKS = painted((g, h) => {
  g.lineCap = 'round'; g.lineJoin = 'round';
  let seed = 7;
  const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const line = (x, y, a, len, w) => {
    g.lineWidth = w; g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < len; s += h * 0.08) {
      a += (R() - 0.5) * 0.9; x += Math.cos(a) * h * 0.08; y += Math.sin(a) * h * 0.08; g.lineTo(x, y);
      if (w > 2 && R() < 0.12) { g.stroke(); line(x, y, a + (R() < 0.5 ? -1 : 1) * (0.5 + R() * 0.6), (len - s) * 0.5, w * 0.6); g.lineWidth = w; g.beginPath(); g.moveTo(x, y); }
    }
    g.stroke();
  };
  for (let i = 0; i < 11; i++) line(h, h, i / 11 * Math.PI * 2 + R() * 0.4, h * (0.7 + R() * 0.25), h * 0.045);
  g.beginPath(); g.arc(h, h, h * 0.08, 0, Math.PI * 2); g.fill();
}, 512);
// the volcano's cracks: finer, forking further, each a white-hot core in an orange glow fading to
// red (drawn in its colours, added onto the ground)
const LAVA_CRACKS = painted((g, h) => {
  g.lineCap = 'round'; g.lineJoin = 'round';
  let seed = 13;
  const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const paths = [];
  const line = (x, y, a, len, w) => {
    const pts = [[x, y]];
    for (let s = 0; s < len; s += h * 0.04) {
      a += (R() - 0.5) * 0.8; x += Math.cos(a) * h * 0.04; y += Math.sin(a) * h * 0.04; pts.push([x, y]);
      if (w > 0.4 && R() < 0.1) line(x, y, a + (R() < 0.5 ? -1 : 1) * (0.5 + R() * 0.6), (len - s) * 0.55, w * 0.65);
    }
    paths.push({ pts, w });
  };
  for (let i = 0; i < 14; i++) line(h, h, i / 14 * Math.PI * 2 + R() * 0.3, h * (0.75 + R() * 0.2), 1);
  const stroke = (color, width, blur) => {
    g.strokeStyle = color; g.shadowColor = color; g.shadowBlur = blur;
    for (const { pts, w } of paths) {
      g.lineWidth = Math.max(1, width * w); g.beginPath(); g.moveTo(...pts[0]);
      for (const q of pts.slice(1)) g.lineTo(...q);
      g.stroke();
    }
  };
  stroke('rgba(210,36,4,0.8)', h * 0.045, h * 0.05);
  stroke('rgba(255,104,12,1)', h * 0.018, h * 0.02);
  stroke('rgba(255,200,90,1)', h * 0.006, 0);
  g.shadowBlur = 0;
  const glow = g.createRadialGradient(h, h, 0, h, h, h * 0.16);
  glow.addColorStop(0, 'rgba(255,220,140,1)'); glow.addColorStop(0.5, 'rgba(255,110,20,0.7)'); glow.addColorStop(1, 'rgba(160,30,6,0)');
  g.fillStyle = glow; g.beginPath(); g.arc(h, h, h * 0.16, 0, Math.PI * 2); g.fill();
}, 1024);
const flat = { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
// the seam round the volcano's foot it rises out of: a ring of jagged glowing cracks
const SEAM = painted((g, h) => {
  g.lineCap = 'round'; g.lineJoin = 'round';
  let seed = 11;
  const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const [r, w] of [[0.86, 0.016], [0.81, 0.008], [0.91, 0.007]]) {
    g.lineWidth = h * w; g.beginPath();
    for (let i = 0; i <= 96; i++) {
      const a = i / 96 * Math.PI * 2, q = h * (r + (R() - 0.5) * 0.04);
      if (i) g.lineTo(h + Math.cos(a) * q, h + Math.sin(a) * q); else g.moveTo(h + Math.cos(a) * q, h + Math.sin(a) * q);
    }
    g.stroke();
  }
  // forks out and in from it
  g.lineWidth = h * 0.006;
  for (let i = 0; i < 60; i++) {
    const a = R() * Math.PI * 2, r0 = 0.86 + (R() - 0.5) * 0.04, r1 = r0 + (R() < 0.5 ? -1 : 1) * (0.05 + R() * 0.08);
    g.beginPath(); g.moveTo(h + Math.cos(a) * h * r0, h + Math.sin(a) * h * r0); g.lineTo(h + Math.cos(a + (R() - 0.5) * 0.08) * h * r1, h + Math.sin(a + (R() - 0.5) * 0.08) * h * r1); g.stroke();
  }
}, 1024);

// The view of mountain plan (core/mountains.js) in the world of map `base` (the cube's own)
export function buildMountainView(plan, base, world) {
  const group = new THREE.Group(), body = new THREE.Group();
  partMeshes(mountainGeometry(plan, base), body);
  body.traverse(o => { if (o.isMesh) o.userData.part = 'mountain'; });   // (not a fixed part: none of the cube's baked shadows, render/bake.js)
  // (the volcano's glow: lava trickling down its cliffs, its crater's walls; unlit, cut away with it)
  let glowMat = null;
  if (plan.spec.shape === 'volcano') {
    const { pos, col } = volcanoGlow(plan, base), geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    glowMat = cutMaterial(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    const mesh = new THREE.Mesh(geo, glowMat);
    mesh.userData.part = 'mountain';
    body.add(mesh);
  }
  body.visible = false;
  group.add(body);
  // the cracks, on the ground round its middle
  const cells = [...plan.cells.values()], { x, z } = plan.spec, y = plan.ref * LH;
  const r = Math.max(...cells.map(m => Math.hypot(m.x + 0.5 - x, m.z + 0.5 - z))) + 0.9;
  const patch = groundPatch(x, y, z, r);
  const hot = plan.spec.shape === 'volcano', map = hot ? LAVA_CRACKS : CRACKS;
  const dark = new THREE.Mesh(patch, new THREE.MeshBasicMaterial({ color: hot ? '#0e0806' : '#17110d', map, opacity: 0, ...flat }));
  const lit = new THREE.Mesh(patch, new THREE.MeshBasicMaterial({ color: hot ? '#ffd0a0' : '#ffb347', map, opacity: 0, ...flat, blending: THREE.AdditiveBlending }));
  for (const o of [dark, lit]) { o.position.set(x, y + 0.02, z); o.renderOrder = 1; group.add(o); }
  // (the volcano: the seam round its foot, glowing while it rises)
  let seam = null;
  if (plan.spec.shape === 'volcano') {
    const foot = VOLCANO.foot / 0.86 + 0.2;
    seam = new THREE.Mesh(groundPatch(x, y, z, foot), new THREE.MeshBasicMaterial({ color: '#ff6a18', map: SEAM, opacity: 0, ...flat, blending: THREE.AdditiveBlending }));
    seam.position.set(x, y + 0.03, z); seam.renderOrder = 1; seam.visible = false; group.add(seam);
  }
  world.group.add(group);
  adoptFade(world.group, group);
  // its edge: the cells beside ground outside it (where dust rolls out and rock falls off)
  const edge = cells.filter(m => DIRS.some(([dx, dz]) => !inb(m.x + dx, m.z + dz) || !plan.cells.has(idx(m.x + dx, m.z + dz))));
  return { group, body, dark, lit, seam, glow: glowMat, plan, world, edge, phase: null, jolt: -1, x, y, z, r, T: mountainTimes(plan.spec.shape), volcano: !!seam };
}

const ease = u => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
// it as it is: `phase` t s into it, `s` under its height (dt: s since the last frame)
export function tickMountainView(v, phase, t, s, dt) {
  if (!v) return;
  const T = v.T, per = n => Math.floor(n * dt * 60 + Math.random());   // (n a frame at 60 fps)
  const near = Math.max(0, 1 - Math.hypot(player.x - v.x, player.z - v.z) / (v.volcano ? 26 : 16));
  if (phase !== v.phase) started(v, phase, near);
  v.phase = phase;
  v.body.visible = phase !== 'crack';
  v.body.position.y = -s;
  // the cracks: opening, glowing, gone once it is up (the volcano's glowing on while it rises)
  const open = phase === 'crack' ? ease(t / 0.5) : phase === 'rise' ? 1 - ease(t / (v.volcano ? T.rise : 0.9)) : 0;
  v.dark.material.opacity = 0.85 * open;
  v.lit.material.opacity = v.volcano ? open * (0.8 + 0.2 * Math.sin(t * (5 + 6 * t))) : open * (phase === 'crack' ? 0.45 + 0.35 * Math.sin(t * (8 + 14 * t)) : 0.6);
  v.dark.visible = v.lit.visible = open > 0.01;
  // (its jolts rising, each a heave, and falling apart)
  const jolts = phase === 'rise' ? T.riseJolts ?? 0 : phase === 'fall' ? T.jolts : 0, len = phase === 'rise' ? T.rise : T.fall;
  const u = jolts ? Math.min(1, t / len) : 0, i = jolts ? Math.min(jolts - 1, Math.floor(u * jolts)) : -1, f = jolts ? u * jolts - i : 0;
  // (the volcano's lava: bright as it heaves up, pulsing slowly while it stands, cooling as it falls)
  if (v.glow) {
    const k = phase === 'rise' ? 1.15 : phase === 'up' ? 0.9 + 0.1 * Math.sin(t * 1.3) + 0.05 * Math.sin(t * 4.1) : phase === 'fall' ? 0.9 * (1 - 0.7 * Math.min(1, t / T.fall)) : 1;
    v.glow.color.setScalar(k);
  }
  if (v.seam) {
    // the seam at its foot: glowing up as the floor cracks, flaring with every heave, cooling once up
    const heave = phase === 'rise' ? 0.7 + 0.3 * (1 - ease(f / 0.6)) : 0;
    const lit = phase === 'crack' ? 0.8 * ease(t / T.crack) : phase === 'rise' ? heave * (1 - 0.3 * u) : phase === 'up' ? 0.7 * (1 - ease(t / 2.5)) : 0;
    v.seam.material.opacity = lit * (0.85 + 0.15 * Math.sin(t * 23));
    v.seam.visible = lit > 0.01;
  }
  if (!near) return;
  if (phase === 'crack') {
    puff(v, v.y + 0.05, per(v.volcano ? 1.2 : 0.5), 0.6);
    if (v.volcano) sparks(v, per(0.6 * t / T.crack), 0.6);
    quakeAt(v.x, v.z, 0.006 + 0.01 * (t / T.crack), 18);
  } else if (phase === 'rise' && jolts) {
    if (i !== v.jolt) {   // a heave up: the ground lurching, a roar, ash and sparks bursting out round it
      v.jolt = i;
      sfx('stomp', { at: v, pitch: 0.45 + 0.05 * i, volume: 0.6 + 0.4 * near });
      sfx('rumble', { at: v, pitch: 0.4, volume: 0.8 * near });
      quakeAt(v.x, v.z, 0.035, 22);
      if (near > 0.4) cameraKick(0, 0, 0, 0.07 * near);
      puff(v, v.y + 0.1, 26, 1.8, ASH);
      sparks(v, 30, 1.6);
      falling(v, s, 16, true);
    }
    const k = 1 - ease(f / 0.45);   // (most while it heaves, a trickle while it holds)
    puff(v, v.y + 0.1, per(2.5 * k + 0.3), 1.2, ASH);
    sparks(v, per(1.2 * k + 0.15), 1);
    falling(v, s, per(2.5 * k + 0.3));
    quakeAt(v.x, v.z, 0.016 * k + 0.004, 22);
  } else if (phase === 'rise') {
    const k = 1 - t / T.rise;
    puff(v, v.y + 0.1, per(3 * k + 0.3), 1.2);
    falling(v, s, per(2 * k + 0.5));
    quakeAt(v.x, v.z, 0.02 * k + 0.004, 18);
  } else if (phase === 'fall') {
    if (i !== v.jolt) {   // a jolt down: a thud, the ground shaking, chunks breaking off
      v.jolt = i;
      sfx('stomp', { at: v, pitch: 0.6 + 0.1 * i, volume: 0.5 + 0.5 * near });
      sfx('thud', { at: v, pitch: 0.5, volume: 0.7 * near });
      quakeAt(v.x, v.z, 0.03, 18);
      if (near > 0.5) cameraKick(0, 0, 0, -0.06 * near);
      falling(v, s, v.volcano ? 30 : 18, true);
      puff(v, v.y + 0.1, v.volcano ? 26 : 14, 1.6, v.volcano ? ASH : DUST);
    }
    puff(v, v.y + 0.1, per(v.volcano ? 1.2 : 0.6), 1, v.volcano ? ASH : DUST);
  }
}
// the sounds of a phase coming
function started(v, phase, near) {
  if (!near) return;
  if (phase === 'crack') { sfx('dig', { at: v, pitch: 0.5, volume: 0.9 }); sfx('icecrack', { at: v, pitch: 0.4, volume: 0.6 }); sfx('rumble', { at: v, pitch: 0.6, volume: 0.8 }); }
  if (phase === 'rise') { v.jolt = -1; sfx('stomp', { at: v, pitch: 0.5, volume: 1 }); sfx('rumble', { at: v, pitch: 0.45, volume: 1 }); if (near > 0.5) cameraKick(0, 0, 0, 0.08 * near); }
  if (phase === 'fall') { sfx('rumble', { at: v, pitch: 0.5, volume: 1 }); v.jolt = -1; }
  if (phase === 'up') { sfx('thud', { at: v, pitch: 0.45, volume: 0.8 }); quakeAt(v.x, v.z, 0.03, 18); }
}
// dust rolling out at its foot, from n of its edge cells
function puff(v, y, n, spread, colors = DUST) {
  for (let i = 0; i < n; i++) {
    const m = v.edge[Math.floor(Math.random() * v.edge.length)], px = m.x + rand(0, 1), pz = m.z + rand(0, 1);
    const ox = px - v.x, oz = pz - v.z, l = Math.hypot(ox, oz) || 1;
    emit(soft, px, y, pz, { v: [ox / l * rand(0.3, 1.2) * spread, rand(0.2, 0.9), oz / l * rand(0.3, 1.2) * spread], life: rand(0.9, 1.6),
      size: rand(0.35, 0.7), grow: 1.3, color: colors[i % 3], alpha: 0.4, drag: 1.2 });
  }
}
// sparks spurting out of the cracks round its foot, from n of its edge cells (`up`: how hard)
function sparks(v, n, up) {
  for (let i = 0; i < n; i++) {
    const m = v.edge[Math.floor(Math.random() * v.edge.length)], px = m.x + rand(0, 1), pz = m.z + rand(0, 1);
    const ox = px - v.x, oz = pz - v.z, l = Math.hypot(ox, oz) || 1;
    emit(glow, px, v.y + 0.05, pz, { v: [ox / l * rand(0.2, 1.4), rand(1.5, 4.5) * up, oz / l * rand(0.2, 1.4)], life: rand(0.5, 1.1),
      size: rand(0.05, 0.12), color: SPARKS[i % 3], alpha: 1, gravity: 7, drag: 0.4 });
  }
}
// rock falling off its sides from the top of n of its edge cells (`chunks`: bigger, tumbling far)
function falling(v, s, n, chunks = false) {
  for (let i = 0; i < n; i++) {
    const m = v.edge[Math.floor(Math.random() * v.edge.length)], top = Math.max(...m.cs) - s;
    if (top < v.y + 0.2) continue;
    const px = m.x + rand(0, 1), pz = m.z + rand(0, 1), ox = px - v.x, oz = pz - v.z, l = Math.hypot(ox, oz) || 1, out = chunks ? rand(1, 2.5) : rand(0.3, 1);
    emit(soft, px, top - rand(0, 0.3), pz, { v: [ox / l * out, rand(0.5, 2), oz / l * out], life: rand(0.6, 1.1), size: chunks ? rand(0.12, 0.24) : rand(0.05, 0.11),
      color: CHIPS[i % 4], alpha: 0.95, gravity: 11, drag: 0.3 });
  }
}
export function disposeMountainView(v) {
  if (!v) return;
  v.group.parent?.remove(v.group);
  v.group.traverse(o => { if (o.geometry && o.geometry !== v.dark.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => m.dispose()); });
  v.dark.geometry.dispose();
}
