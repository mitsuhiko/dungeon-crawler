// The robot's view (docs/story.md "The robot", blender/robot.py, assets/robot.glb): a hovering egg
// of star-glass with amber eyes, little glass wings and glass gears, and an amber core that glows
// and lights what is round it. game/robot.js says where it is and what it does; here it is drawn
// there, its clips blended (lying asleep, waking, hovering, flying, talking, a cheer), faded in and
// out as it comes and goes (with the cube it is in, while a slide carries that away). Asleep its
// core only glimmers (DORMANT_GLOW).
//
// Its glass is drawn like the glassmaker's (render/glassbubble.js): see-through teal, catching the
// light on its facets, not the GLB's transmission (a second pass over the whole scene). Its light
// is a moving light source (render/lightpool.js). Ours, and playing together the others' too
// (drawOtherRobot), each a copy of the GLB with materials of its own (each fades on its own).
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadGLB } from './gltf.js';
import { cullBySphere, ownShadowDepth } from './skinned.js';
import { scene } from './scene.js';
import { trackLight, untrackLight } from './lightpool.js';
import { warm } from './warmup.js';

const URL = 'assets/robot.glb';
const CLIPS = { hover: 'RobotHover', fly: 'RobotFly', talk: 'RobotTalk', cheer: 'RobotCheer', dormant: 'RobotDormant', wake: 'RobotWake' };
const ONCE = new Set(['cheer', 'wake']);   // (played once from the start, then held: cheer, robotWake)
const BLEND = 5;                 // 1/s: how quickly one clip takes over from another
const LIGHT = 0xffc27a;          // its light: the amber of its core, a little paler
const GLOW = 1.1, REACH = 4.2;   // the light's intensity and how far it reaches (cells)
const DORMANT_GLOW = 0.2;        // its share of that while it lies asleep

// its materials, by the GLB's names: the glass and the gears see-through, the rest solid (but all
// of it fades); order: drawn after one another (the gears inside the glass)
function materials(name, m) {
  if (name === 'RobotGlass') return Object.assign(new THREE.MeshStandardMaterial({ color: '#8fdccd', emissive: '#2aa594', emissiveIntensity: 0.4,
    roughness: 0.06, metalness: 0.3, flatShading: true, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }), { order: 2 });
  if (name === 'RobotGear') return Object.assign(new THREE.MeshStandardMaterial({ color: '#c8fff3', emissive: '#3fb8a6', emissiveIntensity: 0.35,
    roughness: 0.1, metalness: 0.2, flatShading: true, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }), { order: 1 });
  m.transparent = true;   // (solid, but it fades: game/robot.js)
  return Object.assign(m, { order: 0 });
}

export const robotView = { ready: false, group: null, mixer: null, actions: {}, weights: {}, light: null, parts: [], cheer: 0 };
// the GLB as loaded, kept untouched: every view is a copy of it
let template = null;

// a robot's view, made from the template: { group, model, mixer, actions, weights, light, parts, cheer }
function makeView() {
  const group = new THREE.Group(), model = cloneSkinned(template.scene);
  group.add(model);
  group.userData.figure = true;   // (casts into the realtime shadow maps as the quality level asks: render/shadows.js)
  const parts = [];
  model.traverse(o => {
    if (!o.isMesh) return;
    const name = o.material.name, m = materials(name, o.material.clone());
    m.userData.keep = true;
    o.material = m;
    o.renderOrder = 10 + m.order;
    o.castShadow = m.order === 0;   // (the glass casts none: light goes through it)
    if (o.isSkinnedMesh) cullBySphere(o, 2);
    parts.push({ material: m, opacity: m.opacity });
  });
  ownShadowDepth(model);
  const mixer = new THREE.AnimationMixer(model), actions = {}, weights = {};
  for (const [k, name] of Object.entries(CLIPS)) {
    const clip = template.animations.find(c => c.name === name);
    if (!clip) throw new Error(`robot: no clip ${name}`);
    const a = mixer.clipAction(clip);
    if (ONCE.has(k)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    a.play(); a.setEffectiveWeight(k === 'hover' ? 1 : 0);
    actions[k] = a; weights[k] = k === 'hover' ? 1 : 0;
  }
  const light = new THREE.PointLight(LIGHT, GLOW, REACH, 2);
  light.position.y = 0.9;   // (its core: blender/robot.py, the middle 0.9 over the floor)
  trackLight(light, group, group, 2);
  scene.add(group);
  group.visible = false;
  return { ready: true, group, model, mixer, actions, weights, light, parts, cheer: 0 };
}

export const robotReady = loadGLB(URL).then(gltf => {
  template = gltf;
  const view = makeView();
  Object.assign(robotView, view);
  view.group.visible = true;
  const warming = warm([view.group]);   // (its shaders, before it first shows: compiled while shown, at once)
  view.group.visible = false;
  return warming;
}).catch(e => { console.error('the robot failed to load', e); });

// it cheers (a hop and a somersault), once, then goes on as it was
export function robotCheer() { if (robotView.ready) cheer(robotView); }
function cheer(v) {
  const a = v.actions.cheer;
  a.reset().play();
  v.cheer = a.getClip().duration;
}

// it wakes (RobotWake, from the start: game/robot.js plays it while it lasts)
export function robotWake() { if (robotView.ready) robotView.actions.wake.reset().play(); }

// Draw it at `at` (the scene's coordinates: its feet, the floor under it), turned to `yaw`, `fade`
// of it showing (0: hidden); `clip`: what it does ('dormant', 'wake', 'hover', 'fly', 'talk'),
// blended into
export function drawRobot(at, yaw, fade, clip, dt) { if (robotView.ready) drawView(robotView, at, yaw, fade, clip, dt); }
// what ours shows now ('cheer' while it cheers), for the others (game/robot.js robotWord)
export const robotClip = clip => robotView.cheer > 0 ? 'cheer' : clip;

function drawView(v, at, yaw, fade, clip, dt) {
  v.group.visible = !!at && fade > 0.01;
  if (!v.group.visible) return;
  v.group.position.copy(at);
  v.group.rotation.y = yaw;
  v.group.userData.fade = fade;   // (its light fades with it: render/lightpool.js)
  v.light.intensity += ((clip === 'dormant' ? GLOW * DORMANT_GLOW : GLOW) - v.light.intensity) * Math.min(1, dt * 2);
  for (const p of v.parts) p.material.opacity = p.opacity * fade;
  v.cheer = Math.max(0, v.cheer - dt);
  const want = v.cheer > 0 ? 'cheer' : clip;
  const k = Math.min(1, dt * BLEND);
  for (const name of Object.keys(v.actions)) {
    const w = v.weights[name] += ((name === want ? 1 : 0) - v.weights[name]) * k;
    v.actions[name].setEffectiveWeight(w);
  }
  v.mixer.update(dt);
}

// The others' robots (playing together: net/session.js, game/robot.js showOtherRobot), by player
// number: a view each, made the first time it shows. Their 'cheer' comes as a clip: it plays once
// as it starts.
const others = new Map();   // slot -> { view, clip, at (s: when it was drawn last) }
export function drawOtherRobot(slot, at, yaw, fade, clip) {
  if (!template) return;
  let o = others.get(slot);
  if (!at || fade <= 0.01) { if (o) o.view.group.visible = false; return; }
  if (!o) others.set(slot, o = { view: makeView(), clip: null, at: null });
  const now = performance.now() / 1000, dt = Math.min(0.1, now - (o.at ?? now));
  o.at = now;
  if (clip === 'cheer' && o.clip !== 'cheer') cheer(o.view);
  o.clip = clip;
  drawView(o.view, at, yaw, fade, clip === 'cheer' ? 'hover' : clip, dt);
}
// player `slot` went (undefined: all of them)
export function removeOtherRobot(slot) {
  if (slot === undefined) { for (const s of [...others.keys()]) removeOtherRobot(s); return; }
  const o = others.get(slot);
  if (!o) return;
  o.view.group.removeFromParent();
  untrackLight(o.view.light);
  for (const p of o.view.parts) p.material.dispose();
  others.delete(slot);
}

// hidden (no robot, the main menu)
export function hideRobot() { if (robotView.ready) robotView.group.visible = false; }
