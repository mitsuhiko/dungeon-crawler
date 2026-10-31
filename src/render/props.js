// Decoration props (assets/props/, clutter/, themes/, the town's and the treasure chest; one
// file per library and prop set, tools/prop-metadata.mjs PROP_FILES): instanced meshes per
// cube. The catalog (core/propcatalog.js) knows every prop from the start; a set's geometry is
// loaded when a cube shows it (loadPropSets, before the cube is entered: render/cubeassets.js).
// Materials are cloned per cube (cubes fade and get cut on their own); props with `sway` move
// in the wind; glowing props add light sources. The town's windows and lamp posts are lit at
// night only (render/night.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cutMaterial } from './section.js';
import { underwaterMaterial } from './underwater.js';
import { buildChests } from './chests.js';
import { loadGLB } from './gltf.js';
import { PROP_FILES } from '../core/propmetadata.js';
import { splitFlames, flameSet } from './flames.js';

import { props } from '../core/propcatalog.js';
import { glowSpots } from '../core/glowspots.js';
import { nightGlow, setNight, LIT_GLSL } from './night.js';
export { props } from '../core/propcatalog.js';

const wind = { value: 0 };
// every frame: the game's clock (t) and how far into the night the cube played in is (night)
export const tickProps = (t, night = 0) => { wind.value = t; setNight(night); };

// a lit window: its warm light, how bright, how far it reaches; and a lamp post's glass by day
export const WINDOW = { color: '#ffb866', gain: 1.5, reach: 3.6 }, LAMP_BY_DAY = 0.12;
const isWindow = m => m.name.endsWith('_window');

// a loaded library: its props' parts (and an animated prop's node tree and clips) into their catalog entries
export function registerProps(gltf) {
  gltf.scene.updateMatrixWorld(true);
  for (const o of gltf.scene.children) {
    // a prop is one mesh, or a group of meshes when it has a glowing material as well
    const parts = (o.isMesh ? [o] : o.children.filter(c => c.isMesh)).map(c => ({ geometry: c.geometry, material: c.material }));
    if (!parts.length) continue;
    const p = props.byName.get(o.name);
    if (!p) { console.warn('prop without metadata (tools/prop-metadata.mjs):', o.name); continue; }
    p.parts = parts; delete p.flames; delete p.wholeParts;
    // where its light comes from: its glowing geometry (core/glowspots.js), a fire's flames too
    const glow = parts.filter(x => x.material.name.endsWith('_glow')), panes = parts.filter(x => isWindow(x.material));
    const spots = list => glowSpots(list.map(x => ({ pos: x.geometry.attributes.position.array, index: x.geometry.index?.array })));
    p.lightSpots = glow.length ? spots(glow) : null;
    // (a house's windows, lit at night: a light out of each)
    p.windowSpots = panes.length ? spots(panes) : null;
    splitFlames(p);   // a fire's flames are drawn as flames (render/flames.js)
    // an animated prop (the treasure chest) keeps its whole node tree and clips (render/chests.js)
    if (o.userData.clips) Object.assign(p, { template: o, clips: gltf.animations });
  }
}

// set -> Promise (resolves when its geometry is in the catalog, or failed to load: logged, tried again next time)
const loading = new Map(), loaded = new Set(), onLoaded = [];
export const propSetLoaded = set => loaded.has(set) || !PROP_FILES[set];
// fn(set) whenever a set's geometry arrives
export const onPropSet = fn => { onLoaded.push(fn); };
export function loadPropSets(sets) {
  return Promise.all(sets.filter(set => !propSetLoaded(set)).map(set => {
    if (!loading.has(set)) loading.set(set, Promise.all(PROP_FILES[set].map(f => loadGLB('assets/' + f))).then(libraries => {
      libraries.forEach(registerProps);
      loaded.add(set);
      for (const fn of onLoaded) fn(set);
    }, e => { loading.delete(set); console.error('prop set failed to load:', set, e); }));
    return loading.get(set);
  }));
}

// the game's clock (`wind`) as a uniform of the vertex shader, declared once: a part that both
// sways and glows (a hanging lantern's glass) takes both edits, and a second declaration of the
// same uniform does not compile
const withWind = src => (/\buniform float uWind\b/.test(src) ? src : 'uniform float uWind;\n' + src);

// sway: bend with the wind, more the further from the attachment point; per-instance phase
function swayMaterial(mat, sway) {
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.uniforms.uWind = wind; sh.uniforms.uSway = { value: sway };
    sh.vertexShader = withWind('uniform float uSway;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float ph = 0.0;
      #ifdef USE_INSTANCING
        ph = instanceMatrix[3].x * 0.9 + instanceMatrix[3].z * 1.7;
      #endif
      float bend = abs(position.y) * uSway * 0.07;
      transformed.x += sin(uWind * 1.9 + ph) * bend;
      transformed.z += cos(uWind * 1.4 + ph * 1.3) * bend * 0.7;`));
  };
  mat.customProgramCacheKey = () => key + '|sway';
  return mat;
}

// spin: turn about the prop's own X axis through its hub, `spin` over its foot, `rate` radians a
// second (a mill's water wheel, world/town.js), each instance a little out of step with the others
function spinMaterial(mat, hub, rate) {
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.uniforms.uWind = wind; sh.uniforms.uSpin = { value: new THREE.Vector2(hub, rate) };
    // (cos and sin of the turn now; a function, as the normal's part may be compiled out)
    const head = `uniform vec2 uSpin;
vec2 spinTurn() {
  float ph = 0.0;
  #ifdef USE_INSTANCING
    ph = instanceMatrix[3].x * 1.3 + instanceMatrix[3].z * 0.7;
  #endif
  float a = uWind * uSpin.y + ph;
  return vec2(cos(a), sin(a));
}
vec2 spinRot(vec2 v, vec2 t) { return vec2(v.x * t.x - v.y * t.y, v.x * t.y + v.y * t.x); }
`;
    sh.vertexShader = withWind(sh.vertexShader.replace('void main() {', head + 'void main() {')
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      objectNormal.yz = spinRot(objectNormal.yz, spinTurn());`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed.yz = vec2(uSpin.x, 0.0) + spinRot(transformed.yz - vec2(uSpin.x, 0.0), spinTurn());`));
  };
  mat.customProgramCacheKey = () => key + '|spin';
  return mat;
}

// a glowing part of a prop whose light lives (`flicker`): its glow flickers like a flame ('flame',
// render/flames.js flicker) or breathes ('pulse', breathe), each instance in its own time and in
// step with its light (both seeded by where it stands: fireSeed below; wind is the game's clock)
// night: lit at night only (render/night.js; by day a lamp's glass faintly, LAMP_BY_DAY); kind
// 'steady': it does not live (a night lamp's that does not flicker); 'window': a house's window, candlelight inside flickering a little, each window in its own time
// (by where on the house it is), the house's all coming on together
function glowMaterial(mat, kind, night = false) {
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.uniforms.uWind = wind; sh.uniforms.uNight = nightGlow;
    const k = kind === 'pulse' ? '0.72 + 0.28 * sin(uWind * (0.9 + glowSeed * 0.08) + glowSeed * 5.0)'
      : kind === 'window' ? '0.9 + 0.1 * sin(uWind * 4.3 + paneSeed) * sin(uWind * 2.1 + paneSeed * 0.7 + glowSeed)'
      : kind === 'steady' ? '1.0'
      : '0.8 + 0.2 * sin(uWind * 13.0 + glowSeed * 7.0) * sin(uWind * 7.3 + glowSeed * 3.0)';
    const lit = !night ? '' : kind === 'window' ? ' * litAt(uNight, glowSeed)' : ` * mix(${LAMP_BY_DAY}, 1.0, litAt(uNight, glowSeed))`;
    sh.vertexShader = withWind(`uniform float uNight;\nvarying float vGlowK;\n${LIT_GLSL}\n` + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float glowSeed = 0.0, paneSeed = position.x * 1.2 + position.y * 0.8 + position.z;   // (slowly across the house: a window shimmers as one)
      #ifdef USE_INSTANCING
        glowSeed = mod(instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 2.3, 6.28);
      #endif
      vGlowK = (${k})${lit};`));
    sh.fragmentShader = 'varying float vGlowK;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= vGlowK;');
  };
  mat.customProgramCacheKey = () => key + '|glow-' + kind + (night ? '-night' : '');
  return mat;
}

const qt = new THREE.Quaternion(), tilt = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), at = new THREE.Vector3(), size = new THREE.Vector3();
// where a placed prop { x, y, z, yaw, s, normal } stands, in its cube (also the proxies' landmarks)
export function propMatrix(q, target = new THREE.Matrix4()) {
  qt.setFromAxisAngle(up, q.yaw);
  if (q.normal) qt.premultiply(tilt.setFromUnitVectors(up, new THREE.Vector3(...q.normal).normalize()));
  return target.compose(at.set(q.x, q.y, q.z), qt, size.setScalar(q.s ?? 1));
}
// ... or its own matrix (`matrix`, 16 numbers: a string's segments, sheared along its curve)
const placeMatrix = (q, target) => q.matrix ? target.fromArray(q.matrix) : propMatrix(q, target);

// A prop's parts as one plain geometry for the proxies' batch (render/neighbors.js): position,
// normal, color (vertex colour times the part's colour), glow (its emissive light times `glow`)
// and pane (1: a house's window, lit at night only; the batch's shader lights it, and a night
// lamp's glass, as the night goes: render/night.js), so glowing windows and braziers still glow
// in the surroundings.
export function propBatchGeometry(p, glow = 1) {
  const parts = (p.wholeParts ?? p.parts).map(({ geometry, material }) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone(), n = g.attributes.position.count;
    const base = material.color || new THREE.Color(1, 1, 1), isPane = isWindow(material) ? 1 : 0;
    const light = (material.emissive || new THREE.Color(0, 0, 0)).clone().multiplyScalar((material.emissiveIntensity ?? 1) * glow);
    const src = g.attributes.color, color = new Float32Array(n * 3), lit = new Float32Array(n * 3), panes = new Float32Array(n).fill(isPane);
    for (let i = 0; i < n; i++) {
      color[i * 3] = (src ? src.getX(i) : 1) * base.r; color[i * 3 + 1] = (src ? src.getY(i) : 1) * base.g; color[i * 3 + 2] = (src ? src.getZ(i) : 1) * base.b;
      lit[i * 3] = light.r; lit[i * 3 + 1] = light.g; lit[i * 3 + 2] = light.b;
    }
    const vec3 = a => { const v = new Float32Array(n * 3); for (let i = 0; i < n; i++) { v[i * 3] = a.getX(i); v[i * 3 + 1] = a.getY(i); v[i * 3 + 2] = a.getZ(i); } return v; };
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(vec3(g.attributes.position), 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(vec3(g.attributes.normal), 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
    out.setAttribute('glow', new THREE.Float32BufferAttribute(lit, 3));
    out.setAttribute('pane', new THREE.Float32BufferAttribute(panes, 1));
    g.dispose();
    return out;
  });
  const merged = mergeGeometries(parts);
  parts.forEach(g => g.dispose());
  merged.setIndex([...Array(merged.attributes.position.count).keys()]);
  return merged;
}

const LOWEST = 0.3;   // a ground prop's light at least this high over its foot
const fireSeed = q => (q.x * 1.7 + q.z * 2.3) % 6.28;   // (a fire's flame and light flicker as one)
// a glowing part's seed, as glowMaterial's shader has it (GLSL's mod: never below 0): when it
// comes on at night (render/night.js litAt)
export const glowSeed = q => { const v = (q.x * 1.7 + q.z * 2.3) % 6.28; return v < 0 ? v + 6.28 : v; };
// placed: [{ name, x, y, z, yaw, s, tint, night }] -> instanced meshes (and light sources) in
// group (night: a lamp lit at night only, render/night.js); water: the cube's (render/wet.js
// waterUniforms): what lies all under it wavers with the bed (render/underwater.js)
export function buildProps(placed, group, water = null) {
  // (the night lamps apart from the same prop lit all the time: their glass has its own material)
  const byName = new Map();
  for (const q of placed) { const k = q.night ? q.name + '|night' : q.name; if (!byName.has(k)) byName.set(k, []); byName.get(k).push(q); }
  const m4 = new THREE.Matrix4(), col = new THREE.Color(), flames = [], fireLights = [], glowing = [];
  for (const list of byName.values()) {
    const p = props.byName.get(list[0].name), night = !!list[0].night;
    if (p?.template) { buildChests(p, list, group); continue; }
    if (!p?.parts) continue;
    for (const part of p.parts) {
      const c = cutMaterial(part.material.clone(), 'self', true), glow = part.material.name.endsWith('_glow'), pane = isWindow(part.material);
      if (water) underwaterMaterial(c, water, p.maxY ?? p.height ?? 0);
      if (pane) glowMaterial(c, 'window', true);
      else if (glow && (p.flicker || night)) glowMaterial(c, p.flicker ?? 'steady', night);
      const mesh = new THREE.InstancedMesh(part.geometry, p.sway ? swayMaterial(c, p.sway) : p.spin ? spinMaterial(c, p.spin, p.spin_rate ?? 1) : c, list.length);
      mesh.name = p.name;
      mesh.userData.sharedGeo = true;   // the catalog owns the geometry
      list.forEach((q, i) => {
        mesh.setMatrixAt(i, placeMatrix(q, m4));
        mesh.setColorAt(i, col.set(q.tint || '#ffffff'));
      });
      // glowing parts (lantern glass, a forge's coals) are light, not matter: no shadow (a window's
      // pane lies in its frame)
      mesh.castShadow = (p.blocking || p.height > 0.8) && !glow && !pane;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    // a fire's flames, where its model's stood (the first of them for each of the props: flames
    // first0 + its index in the list)
    const first0 = flames.length;
    for (const f of p.flames ?? []) for (const q of list) {
      const at = new THREE.Vector3(f.x, f.y, f.z).applyMatrix4(placeMatrix(q, m4)), s = q.s ?? 1;
      flames.push({ x: at.x, y: at.y, z: at.z, w: f.w * s, h: f.h * s, seed: fireSeed(q) });
    }
    for (const [qi, q] of list.entries()) if (glowLights(p, q).length) glowing.push({ p, q, flame: p.flames?.length ? first0 + qi : -1 });
    // a house's windows: a light out of each, lit at night (flames.js: with the house's panes)
    for (const q of list) windowLights(p, q).forEach((w, k) => {
      const l = new THREE.PointLight(w.color, 0, w.reach, 2);
      l.position.set(w.x, w.y, w.z);
      l.userData.peak = w.gain;   // (render/bake.js: as bright as it gets, whatever it is now)
      fireLights.push({ light: l, gain: w.gain, seed: w.night + k, i: -1, candle: true, night: w.night });
      group.add(l);
    });
  }
  // every glowing prop lights its surroundings, all the time (render/lightpool.js: the cube's fixed
  // lights; the big ones first, then the brightest, should a cube ever have more than it takes); a
  // fire's light flickers with its flame, a lantern's like a flame (`flicker` 'flame'), a glowing
  // mushroom's breathes ('pulse'); a night lamp's at night only
  const big = g => g.p.landmark || g.p.vignette ? 1 : 0;
  glowing.sort((a, b) => big(b) - big(a) || b.p.intensity - a.p.intensity);
  for (const { p, q, flame } of glowing) for (const g of glowLights(p, q)) {
    const l = new THREE.PointLight(g.color, q.night ? 0 : g.gain, g.reach, 2);
    l.userData.peak = g.gain;
    l.position.set(g.x, g.y, g.z);
    if (p.flames || p.flicker || q.night) fireLights.push({ light: l, gain: g.gain, seed: fireSeed(q), i: flame, pulse: p.flicker === 'pulse',
      steady: !p.flames && !p.flicker, night: g.night });
    group.add(l);
  }
  if (flames.length || fireLights.length) group.add(flameSet(flames, fireLights).mesh);
}

// The lights placed prop q (of prop p) gives off, where they are in its cube: [{ x, y, z, color,
// gain (as bright as it gets), reach, night (lit at night only: its seed, render/night.js litAt;
// null: all the time) }]. The cube built in full makes a point light of each (buildProps), the
// surroundings shine them dimmed (render/farlights.js).
// A glowing prop: a light where each spot of its glow is (core/glowspots.js: inside the prop it
// would be shut in by its baked shadow), sharing the prop's brightness; one over it if it has no
// glow loaded. Not one that covers (cover), nor a lamp that never shines (q.unlit).
const m4l = new THREE.Matrix4(), spotAt = new THREE.Vector3();
export function glowLights(p, q) {
  if (!p?.light || p.cover || q.unlit) return [];
  const spots = p.lightSpots?.length ? p.lightSpots : [{ x: 0, y: p.attach === 'ceiling' ? -0.4 : p.landmark || p.vignette ? 1.1 : 0.5, z: 0 }];
  const gain = p.intensity * 2 / Math.sqrt(spots.length), reach = p.landmark || p.vignette ? 5 : 4;
  placeMatrix(q, m4l);
  // (a ground prop's light not down in the grass: from there it lights a puddle round it)
  return spots.map(spot => ({ ...spotAt.set(spot.x, p.attach === 'ground' ? Math.max(spot.y, LOWEST) : spot.y, spot.z).applyMatrix4(m4l),
    color: p.light, gain, reach, night: q.night ? fireSeed(q) : null }));
}
// a house's windows: a light out of each, lit at night
export function windowLights(p, q) {
  if (!p?.windowSpots) return [];
  placeMatrix(q, m4l);
  return p.windowSpots.map(spot => ({ ...spotAt.set(spot.x, Math.max(spot.y, LOWEST), spot.z).applyMatrix4(m4l),
    color: WINDOW.color, gain: WINDOW.gain, reach: WINDOW.reach, night: fireSeed(q) }));
}
export const propLights = (p, q) => [...glowLights(p, q), ...windowLights(p, q)];
