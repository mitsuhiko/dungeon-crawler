// The robot's view (docs/story.md "The robot", blender/robot.py, assets/robot.glb): a hovering egg
// of star-glass with amber eyes, little glass wings and glass gears, and an amber core that glows
// and lights what is round it. game/robot.js says where it is and what it does; here it is drawn
// there, its clips blended (hovering, flying, talking, a cheer), faded in and out as it comes and
// goes (with the cube it is in, while a slide carries that away).
//
// Its glass is drawn like the glassmaker's (render/glassbubble.js): see-through teal, catching the
// light on its facets, not the GLB's transmission (a second pass over the whole scene). Its light
// is a moving light source (render/lightpool.js). One robot: ours (the others' are not shown yet).
import * as THREE from 'three';
import { loadGLB } from './gltf.js';
import { cullBySphere, ownShadowDepth } from './skinned.js';
import { scene } from './scene.js';
import { trackLight } from './lightpool.js';
import { warm } from './warmup.js';

const URL = 'assets/robot.glb';
const CLIPS = { hover: 'RobotHover', fly: 'RobotFly', talk: 'RobotTalk', cheer: 'RobotCheer' };
const BLEND = 5;                 // 1/s: how quickly one clip takes over from another
const LIGHT = 0xffc27a;          // its light: the amber of its core, a little paler
const GLOW = 1.1, REACH = 4.2;   // the light's intensity and how far it reaches (cells)

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

export const robotReady = loadGLB(URL).then(gltf => {
  const group = new THREE.Group(), model = gltf.scene;
  group.add(model);
  group.userData.figure = true;   // (casts into the realtime shadow maps as the quality level asks: render/shadows.js)
  const parts = [];
  model.traverse(o => {
    if (!o.isMesh) return;
    const name = o.material.name, m = materials(name, o.material);
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
    const clip = gltf.animations.find(c => c.name === name);
    if (!clip) throw new Error(`robot: no clip ${name}`);
    const a = mixer.clipAction(clip);
    if (k === 'cheer') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    a.play(); a.setEffectiveWeight(k === 'hover' ? 1 : 0);
    actions[k] = a; weights[k] = k === 'hover' ? 1 : 0;
  }
  const light = new THREE.PointLight(LIGHT, GLOW, REACH, 2);
  light.position.y = 0.9;   // (its core: blender/robot.py, the middle 0.9 over the floor)
  trackLight(light, group, group, 2);
  scene.add(group);
  Object.assign(robotView, { ready: true, group, model, mixer, actions, weights, light, parts });
  const warming = warm([group]);   // (its shaders, before it first shows: compiled while shown, at once)
  group.visible = false;
  return warming;
}).catch(e => { console.error('the robot failed to load', e); });

// it cheers (a hop and a somersault), once, then goes on as it was
export function robotCheer() {
  if (!robotView.ready) return;
  const a = robotView.actions.cheer;
  a.reset().play();
  robotView.cheer = a.getClip().duration;
}

// Draw it at `at` (the scene's coordinates: its feet, the floor under it), turned to `yaw`, `fade`
// of it showing (0: hidden); `clip`: what it does ('hover', 'fly', 'talk'), blended into
export function drawRobot(at, yaw, fade, clip, dt) {
  const v = robotView;
  if (!v.ready) return;
  v.group.visible = !!at && fade > 0.01;
  if (!v.group.visible) return;
  v.group.position.copy(at);
  v.group.rotation.y = yaw;
  v.group.userData.fade = fade;   // (its light fades with it: render/lightpool.js)
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

// hidden (no robot, the main menu)
export function hideRobot() { if (robotView.ready) robotView.group.visible = false; }
