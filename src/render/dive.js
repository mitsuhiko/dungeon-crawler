// Umbra's reef, drawn (game/dive.js says how it stands, game/umbra.js runs it, core/umbra.js has the
// rules): the water filling the reef like a tank, its surface far overhead shimmering with the light
// that comes through it and its sides round the box a veil of deep teal; under it everything tinted
// the deep water's colour, the deeper the more, with the light the waves gather playing on it
// (render/underwater.js DIVE); motes drifting in it. His mud (phase 3): a sheet of near-black goop
// at its level, everything under it dark.
// The diving suit on its stand while it waits, and on our hero once taken (render/divesuit.js). His
// volcanoes: a glowing crack in the floor, bubbles and a rumble, then a cone of rock spitting fire up
// through the water. His jets: waves rolling across the room, or plunging down from above
// (render/divejets.js).
import * as THREE from 'three';
import { scene } from './scene.js';
import { DIVE, diveTinted } from './underwater.js';
import { fluidMaterial, cellMaterial } from './materials.js';
import { WATER_SHORE } from './section.js';
import { restY } from './surface.js';
import { palRow } from '../themes/fluids.js';
import { WATER } from '../core/constants.js';
import { emit, soft, glow, rand } from './particles.js';
import { dressSuit, suitStand, breathe } from './divesuit.js';
import { character } from './character.js';
import { trackLight, untrackLight } from './lightpool.js';
import { UMBRA_FIGHT, ventPhase } from '../core/umbra.js';
import { drawJets, clearJets } from './divejets.js';
import { player, state } from '../game/state.js';

const SNOW = ['#d8f4ff', '#a8dcec', '#7ab8cc'], FIRE = ['#fff0a0', '#ffd25a', '#ff8a2a', '#ff4a17'], BUBBLE = ['#e8fbff', '#bfefff', '#8fd8f0'];
let view = null;
const INSET = 0.04;   // cells the water's sides and surface keep inside its box

const WATER_VS = `varying vec3 vP; varying vec3 vN; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz; vN = normal;
  gl_Position = projectionMatrix * viewMatrix * w; }`;
// the sides: a veil of deep teal, darker down
const SIDE_FS = `uniform float uTime, uK, uTop, uLow; varying vec3 vP; varying vec3 vN;
  void main() {
    float h = clamp((vP.y - uLow) / max(0.5, uTop - uLow), 0.0, 1.0);
    float ripple = 0.5 + 0.5 * sin(vP.y * 6.0 - uTime * 1.3 + (vP.x + vP.z) * 2.0);
    vec3 col = mix(vec3(0.02, 0.1, 0.14), vec3(0.08, 0.32, 0.4), h) + ripple * 0.03;
    gl_FragColor = vec4(col, uK * (0.32 - 0.12 * h + 0.04 * ripple));
  }`;
// the mud: dark goop, slowly swirling, its rim lighter
const MUD_FS = `uniform float uTime, uK; varying vec3 vP; varying vec3 vN;
  void main() {
    float s = sin(vP.x * 1.7 + sin(vP.z * 1.3 + uTime * 0.3) * 1.5 + uTime * 0.2) * sin(vP.z * 1.9 - uTime * 0.25 + sin(vP.x * 0.9) * 1.2);
    vec3 col = mix(vec3(0.05, 0.04, 0.03), vec3(0.2, 0.15, 0.1), 0.5 + 0.5 * s);
    gl_FragColor = vec4(col, uK * 0.93);
  }`;
const shader = (fs, extra = {}) => new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uK: { value: 0 }, ...extra }, vertexShader: WATER_VS,
  fragmentShader: fs, transparent: true, depthWrite: false, side: THREE.DoubleSide });

// The surface: the game's own water (render/materials.js cellMaterial, as a standing fluid's: its
// cells, its palette's colours, its waves), a grid over the box at the level `tide` says, a little
// fainter than a pool's (it lies over the whole fight), writing no depth: drawn after everything in
// the water, the heroes too (render/character.js: 1000, what they wear 1001), it veils what lies
// under it, never the other way round
const SUB = 2;
function surfaceOf(m, [x0, z0, x1, z1]) {
  const pos = [], idx = [], nx = (x1 - x0) * SUB, nz = (z1 - z0) * SUB;
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++)
    pos.push(Math.min(x1 - INSET, Math.max(x0 + INSET, x0 + i / SUB)), 0, Math.min(z1 - INSET, Math.max(z0 + INSET, z0 + j / SUB)));
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const n = pos.length / 3, geo = new THREE.BufferGeometry(), row = m.fluidRows?.[WATER] ?? palRow(m.depth ?? 0, WATER, 0);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [0, 1, 0]).flat(), 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(n * 2).fill(0), 2));
  // (the ground under it far down, no ceiling: nothing stands in it, render/trials.js standingSurface)
  geo.setAttribute('shore', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [-1e4, 0, 0, 0]).flat(), 4));
  geo.setAttribute('pal', new THREE.BufferAttribute(Uint16Array.from({ length: n * 4 }, (_, k) => k % 4 < 2 ? row : 0), 4));
  geo.setIndex(idx);
  const tide = { level: { value: 0 }, wet: { value: 0 }, shore: WATER_SHORE };
  const mat = cellMaterial(fluidMaterial(WATER, 'full'), WATER, tide);
  Object.assign(mat, { transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.42 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 1600;
  mesh.userData.tide = tide;
  return mesh;
}

function make(reef) {
  const group = new THREE.Group(), [x0, z0, x1, z1] = reef.box, w = x1 - x0, d = z1 - z0;
  const surface = surfaceOf(state.map, reef.box);
  const sideMat = shader(SIDE_FS, { uTop: { value: reef.surface }, uLow: { value: reef.low } }), sides = [];
  for (let k = 0; k < 4; k++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry((k < 2 ? d : w) - 2 * INSET, 1), sideMat);
    m.renderOrder = 1500; sides.push(m); group.add(m);
  }
  const mud = new THREE.Mesh(new THREE.PlaneGeometry(w - 2 * INSET, d - 2 * INSET), shader(MUD_FS));
  mud.rotation.x = -Math.PI / 2; mud.renderOrder = 1400;   // (over the legs of who wades in it)
  group.add(surface, mud);
  scene.add(group);
  return { group, surface, sides, sideMat, mud, vents: new Map(), jets: [], snow: 0, k: 0, mudK: 0, t: 0, reef, stand: null };
}

// the reef as it stands now: water (its surface, null: none), mud (its level, null: none), phase,
// boss (Umbra: his volcanoes and jets); off: where the cube is drawn
export function drawDive(reef, { water, mud, phase, boss }, dt, off) {
  if (view && view.reef !== reef) clearDive();
  view ??= make(reef);
  const v = view, [x0, z0, x1, z1] = reef.box, t = (v.t += dt);
  // the water: in as it rises
  const top = water ?? reef.low;
  v.k += ((water !== null ? 1 : 0) - v.k) * Math.min(1, dt * 3);
  const show = v.k > 0.01;
  v.surface.visible = show && water !== null; v.surface.position.set(off.x, off.y, off.z);
  v.surface.userData.tide.level.value = restY(top);
  v.sideMat.uniforms.uTime.value = t; v.sideMat.uniforms.uK.value = v.k; v.sideMat.uniforms.uTop.value = top;
  const h = Math.max(0.01, top - reef.low + 0.3), mid = reef.low - 0.3 + h / 2;
  v.sides.forEach((m, k) => {
    m.visible = show;
    m.scale.y = h;
    // (a little inside the box: on its edge they would lie in the walls round the reef and fight with them)
    if (k === 0) { m.position.set(x0 + INSET + off.x, mid + off.y, (z0 + z1) / 2 + off.z); m.rotation.y = Math.PI / 2; }
    else if (k === 1) { m.position.set(x1 - INSET + off.x, mid + off.y, (z0 + z1) / 2 + off.z); m.rotation.y = -Math.PI / 2; }
    else if (k === 2) { m.position.set((x0 + x1) / 2 + off.x, mid + off.y, z0 + INSET + off.z); m.rotation.y = 0; }
    else { m.position.set((x0 + x1) / 2 + off.x, mid + off.y, z1 - INSET + off.z); m.rotation.y = Math.PI; }
  });
  // what lies under it, tinted (render/underwater.js), and his mud
  v.mudK += ((mud !== null ? 1 : 0) - v.mudK) * Math.min(1, dt * 2);
  DIVE.water.value.set(top, mud ?? -1e4, show ? v.k : 0, 0);   // (in the cube's own coordinates)
  DIVE.box.value.set(x0, z0, x1, z1);
  v.mud.visible = v.mudK > 0.01 && mud !== null;
  if (v.mud.visible) {
    // (a hair over its level: its steps may lie on whole levels, where the floors' tops are)
    v.mud.position.set((x0 + x1) / 2 + off.x, mud + 0.012 + off.y, (z0 + z1) / 2 + off.z);
    v.mud.material.uniforms.uTime.value = t; v.mud.material.uniforms.uK.value = v.mudK;
  }
  // the suit: on its stand while it waits, on our hero once taken
  suitStand(v, reef.stand, phase === 'dry' && !player.suit, off);
  if (character.ready) {
    dressSuit(character, player.suit ? player.suit.t : null);
    // (the hero, what they wear and their suit, tinted under the water like the ground: render/underwater.js)
    if (show) character.group.traverse(o => { if (o.isMesh && o.renderOrder >= 1000) [].concat(o.material).forEach(diveTinted); });   // (not the silhouette: 999)
    breathe(character, dt, !!player.diving);
  }
  // motes drifting in the water, near the hero
  if (show && water !== null && (v.snow += dt * 14) > 1) {
    for (; v.snow > 1; v.snow--) {
      const x = player.x + rand(-5, 5), z = player.z + rand(-5, 5), y = rand(reef.low, top);
      if (x < x0 || z < z0 || x > x1 || z > z1) continue;
      emit(soft, x + off.x, y + off.y, z + off.z, { v: [rand(-0.05, 0.05), rand(-0.08, 0.02), rand(-0.05, 0.05)], life: rand(2, 4), size: rand(0.015, 0.03),
        color: SNOW[(Math.random() * 3) | 0], alpha: 0.5, drag: 0.5, gravity: 0 });
    }
  }
  drawVents(v, boss?.vents ?? [], dt, off);
  drawJets(v.jets, boss?.jets ?? null, reef, dt, off);
}

// --- his volcanoes ---------------------------------------------------------------------------------

function ventView() {
  const g = new THREE.Group();
  const crack = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, depthWrite: false, opacity: 0 }));
  crack.rotation.x = -Math.PI / 2; crack.position.y = 0.03;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.55, 9, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a2220, roughness: 0.9, emissive: 0xff5a10, emissiveIntensity: 0.4 }));
  cone.position.y = 0.27;
  g.add(crack, cone);
  const light = new THREE.PointLight(0xff6a20, 0, 4, 2);
  light.position.y = 0.6;
  trackLight(light, g);
  scene.add(g);
  return { g, crack, cone, light };
}
function drawVents(v, vents, dt, off) {
  const C = UMBRA_FIGHT.vents, seen = new Set();
  for (const vt of vents) {
    seen.add(vt.n);
    let w = v.vents.get(vt.n);
    if (!w) v.vents.set(vt.n, w = ventView());
    const phase = ventPhase(vt), k = phase === 'warn' ? vt.t / C.warn : 1;
    w.g.position.set(vt.x + off.x, vt.y + off.y, vt.z + off.z);
    w.crack.material.opacity = 0.3 + 0.6 * k * (0.7 + 0.3 * Math.sin(vt.t * 18));
    w.crack.scale.setScalar(0.4 + 0.7 * k);
    const up = phase === 'erupt' ? Math.min(1, (vt.t - C.warn) / 0.3) : 0;
    w.cone.visible = up > 0; w.cone.scale.set(1, Math.max(0.01, up), 1);
    w.light.intensity = phase === 'erupt' ? 3 + Math.sin(vt.t * 23) : 1.4 * k;
    // bubbles while it warns, fire and smoke up through the water while it erupts
    if (phase === 'warn' && Math.random() < dt * 25)
      emit(soft, vt.x + off.x + rand(-0.4, 0.4), vt.y + off.y + 0.05, vt.z + off.z + rand(-0.4, 0.4), { v: [rand(-0.1, 0.1), rand(0.8, 1.6), rand(-0.1, 0.1)],
        life: rand(0.8, 1.4), size: rand(0.03, 0.07), color: BUBBLE[(Math.random() * 3) | 0], alpha: 0.75, drag: 1, gravity: -0.6 });
    if (phase === 'erupt') for (let i = Math.floor(dt * 60 + Math.random()); i > 0; i--) {
      emit(glow, vt.x + off.x + rand(-0.2, 0.2), vt.y + off.y + 0.5, vt.z + off.z + rand(-0.2, 0.2), { v: [rand(-0.3, 0.3), rand(2, 4), rand(-0.3, 0.3)],
        life: rand(0.5, 1.1), size: rand(0.06, 0.14), color: FIRE[i % FIRE.length], drag: 1.2, gravity: -0.8 });
      if (i % 3 === 0) emit(soft, vt.x + off.x + rand(-0.3, 0.3), vt.y + off.y + rand(1, 3.5), vt.z + off.z + rand(-0.3, 0.3), { v: [rand(-0.2, 0.2), rand(0.8, 1.6), rand(-0.2, 0.2)],
        life: rand(0.8, 1.6), size: rand(0.12, 0.25), grow: 1.6, color: '#3a3836', alpha: 0.35, drag: 1.5 });
    }
  }
  for (const [n, w] of v.vents) if (!seen.has(n)) { scene.remove(w.g); untrackLight(w.light); w.g.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); v.vents.delete(n); }
}

export function clearDive() {
  if (!view) return;
  const v = view;
  view = null;
  scene.remove(v.group);
  v.group.traverse(o => { if (!o.isMesh) return; if (!o.userData.sharedGeo) o.geometry.dispose(); [].concat(o.material).forEach(m => m.dispose()); });
  for (const w of v.vents.values()) { scene.remove(w.g); untrackLight(w.light); }
  clearJets(v.jets);
  DIVE.water.value.set(-1e4, -1e4, 0, 0);
  if (character.ready) dressSuit(character, null);
}
