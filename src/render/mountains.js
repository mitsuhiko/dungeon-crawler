// Monteur's mountains as they show (game/mountains.js raises them, core/mountains.js has the rules):
// the mountain built like the cube's own terrain (render/floors.js: its tops in the theme's
// colours by height, cliffs of its rock; its ladders, render/ladders.js) at its full height, in
// one group that sinks under the ground by as far as it is under its height (the ground hides
// what is under it, so it rises out of the floor and sinks back into it). Before it rises the
// floor cracks round it, glowing like his veins; rising it throws up dust and rock falls off its
// sides; falling apart it sinks in jolts, each one a thud that shakes the ground, chunks tumbling
// off its edges, dust rolling out at its foot. In the active cube's group (its fade, its cutaway).
import * as THREE from 'three';
import { DRAWN_FLUIDS, LH, DIRS } from '../core/constants.js';
import { idx, inb } from '../core/util.js';
import { MOUNTAIN } from '../core/mountains.js';
import { GeoBuilder } from './builder.js';
import { usePalette } from './palette.js';
import { themeOf } from '../themes/depth.js';
import { buildFloors } from './floors.js';
import { buildLadder } from './ladders.js';
import { packParts } from './parts.js';
import { partMeshes } from './partmeshes.js';
import { adoptFade } from './fade.js';
import { groundPatch, painted } from './meteors.js';
import { soft, emit, rand } from './particles.js';
import { quakeAt, cameraKick } from '../game/juice.js';
import { player } from '../game/state.js';
import { sfx } from '../audio/sfx.js';

const DUST = ['#d8cfbd', '#c2b8a4', '#a39a88'], CHIPS = ['#b8b0a0', '#8d877c', '#6a645a', '#ffb347'];

// its geometry: its cells' floors at their full height (the ground round them as it is), drawn as
// the cube's terrain is, with its ladders
function geometry(plan, base) {
  usePalette(themeOf(base));
  const up = new Map([...plan.cells.values()].map(m => [m.c, { ...m.f, cs: [...m.cs], top: m.top, surface: undefined, soft: false, ice: false,
    link: m.link.map(l => l?.f ?? null) }]));
  const m = { ...base, floors: [...up.values()], cols: base.cols.map((col, c) => up.has(c) ? [up.get(c)] : col), falls: [], town: null, interior: false };
  const layers = Array.from({ length: base.K ?? 1 }, () => ({ terrain: new GeoBuilder(), stone: new GeoBuilder(), wood: new GeoBuilder(),
    flags: new GeoBuilder({ sway: true }), fluids: Object.fromEntries(DRAWN_FLUIDS.map(t => [t, new GeoBuilder({ uvs: true })])) }));
  buildFloors(m, layers);
  for (const l of plan.ladders) buildLadder(l, layers[l.layer] ?? layers[0]);
  const arr = b => b.pos.length ? b.arrays() : null;
  return packParts(layers.map(L => ({ terrain: arr(L.terrain), stone: arr(L.stone), wood: arr(L.wood), flags: arr(L.flags),
    fluids: Object.fromEntries(DRAWN_FLUIDS.map(t => [t, arr(L.fluids[t])])) })), m);
}

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
const flat = { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };

// The view of mountain plan (core/mountains.js) in the world of map `base` (the cube's own)
export function buildMountainView(plan, base, world) {
  const group = new THREE.Group(), body = new THREE.Group();
  partMeshes(geometry(plan, base), body);
  body.traverse(o => { if (o.isMesh) o.userData.part = 'mountain'; });   // (not a fixed part: none of the cube's baked shadows, render/bake.js)
  body.visible = false;
  group.add(body);
  // the cracks, on the ground round its middle
  const cells = [...plan.cells.values()], { x, z } = plan.spec, y = plan.ref * LH;
  const r = Math.max(...cells.map(m => Math.hypot(m.x + 0.5 - x, m.z + 0.5 - z))) + 0.9;
  const patch = groundPatch(x, y, z, r);
  const dark = new THREE.Mesh(patch, new THREE.MeshBasicMaterial({ color: '#17110d', map: CRACKS, opacity: 0, ...flat }));
  const lit = new THREE.Mesh(patch, new THREE.MeshBasicMaterial({ color: '#ffb347', map: CRACKS, opacity: 0, ...flat, blending: THREE.AdditiveBlending }));
  for (const o of [dark, lit]) { o.position.set(x, y + 0.02, z); o.renderOrder = 1; group.add(o); }
  world.group.add(group);
  adoptFade(world.group, group);
  // its edge: the cells beside ground outside it (where dust rolls out and rock falls off)
  const edge = cells.filter(m => DIRS.some(([dx, dz]) => !inb(m.x + dx, m.z + dz) || !plan.cells.has(idx(m.x + dx, m.z + dz))));
  return { group, body, dark, lit, plan, world, edge, phase: null, jolt: -1, x, y, z, r };
}

const ease = u => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
// it as it is: `phase` t s into it, `s` under its height (dt: s since the last frame)
export function tickMountainView(v, phase, t, s, dt) {
  if (!v) return;
  const per = n => Math.floor(n * dt * 60 + Math.random());   // (n a frame at 60 fps)
  const near = Math.max(0, 1 - Math.hypot(player.x - v.x, player.z - v.z) / 16);
  if (phase !== v.phase) started(v, phase, near);
  v.phase = phase;
  v.body.visible = phase !== 'crack';
  v.body.position.y = -s;
  // the cracks: opening, glowing, gone once it is up
  const open = phase === 'crack' ? ease(t / 0.5) : phase === 'rise' ? 1 - ease(t / 0.9) : 0;
  v.dark.material.opacity = 0.85 * open;
  v.lit.material.opacity = open * (phase === 'crack' ? 0.45 + 0.35 * Math.sin(t * (8 + 14 * t)) : 0.6);
  v.dark.visible = v.lit.visible = open > 0.01;
  if (!near) return;
  if (phase === 'crack') {
    puff(v, v.y + 0.05, per(0.5), 0.6);
    quakeAt(v.x, v.z, 0.006 + 0.01 * (t / MOUNTAIN.crack), 18);
  } else if (phase === 'rise') {
    const k = 1 - t / MOUNTAIN.rise;
    puff(v, v.y + 0.1, per(3 * k + 0.3), 1.2);
    falling(v, s, per(2 * k + 0.5));
    quakeAt(v.x, v.z, 0.02 * k + 0.004, 18);
  } else if (phase === 'fall') {
    const u = t / MOUNTAIN.fall, i = Math.min(MOUNTAIN.jolts - 1, Math.floor(u * MOUNTAIN.jolts));
    if (i !== v.jolt) {   // a jolt down: a thud, the ground shaking, chunks breaking off
      v.jolt = i;
      sfx('stomp', { at: v, pitch: 0.6 + 0.1 * i, volume: 0.5 + 0.5 * near });
      sfx('thud', { at: v, pitch: 0.5, volume: 0.7 * near });
      quakeAt(v.x, v.z, 0.03, 18);
      if (near > 0.5) cameraKick(0, 0, 0, -0.06 * near);
      falling(v, s, 18, true);
      puff(v, v.y + 0.1, 14, 1.6);
    }
    puff(v, v.y + 0.1, per(0.6), 1);
  }
}
// the sounds of a phase coming
function started(v, phase, near) {
  if (!near) return;
  if (phase === 'crack') { sfx('dig', { at: v, pitch: 0.5, volume: 0.9 }); sfx('icecrack', { at: v, pitch: 0.4, volume: 0.6 }); sfx('rumble', { at: v, pitch: 0.6, volume: 0.8 }); }
  if (phase === 'rise') { sfx('stomp', { at: v, pitch: 0.5, volume: 1 }); sfx('rumble', { at: v, pitch: 0.45, volume: 1 }); if (near > 0.5) cameraKick(0, 0, 0, 0.08 * near); }
  if (phase === 'fall') { sfx('rumble', { at: v, pitch: 0.5, volume: 1 }); v.jolt = -1; }
  if (phase === 'up') { sfx('thud', { at: v, pitch: 0.45, volume: 0.8 }); quakeAt(v.x, v.z, 0.03, 18); }
}
// dust rolling out at its foot, from n of its edge cells
function puff(v, y, n, spread) {
  for (let i = 0; i < n; i++) {
    const m = v.edge[Math.floor(Math.random() * v.edge.length)], px = m.x + rand(0, 1), pz = m.z + rand(0, 1);
    const ox = px - v.x, oz = pz - v.z, l = Math.hypot(ox, oz) || 1;
    emit(soft, px, y, pz, { v: [ox / l * rand(0.3, 1.2) * spread, rand(0.2, 0.9), oz / l * rand(0.3, 1.2) * spread], life: rand(0.9, 1.6),
      size: rand(0.35, 0.7), grow: 1.3, color: DUST[i % 3], alpha: 0.4, drag: 1.2 });
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
