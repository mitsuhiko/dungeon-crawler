// Loads the skinned player character and prepares its animation actions. The rig is loaded
// once for every figure (render/figure.js); the player is the figure with the clips, the
// weapons and a silhouette. It can wear things like any figure (figure.js wear, `worn`).
import * as THREE from 'three';
import { loadGLB } from './gltf.js';
import { CHAR_SCALE } from '../core/constants.js';
import { scene } from './scene.js';
import { prepareHeld } from './held.js';
import { rigReady } from './figure.js';
import { ownShadowDepth } from './skinned.js';
import { setSkinMap } from './skin.js';
import { readSkinFile, skinImage } from '../game/skinfiles.js';

const SWORD_URL = 'assets/sword.glb';
const FPS = 30;
const STAND_HIPS = 0.69;   // hips height of the standing pose (rig units)

export const character = { ready: false };

// The hero's own light (render/look.js says how strong). It is in the world's scene from the
// start and stays there, hero shown or not (followHero puts it at the figure, or turns it off):
// a point light coming or going makes three.js compile every lit shader again
// (render/lightpool.js). With the light on the figure, that happened going from the main menu
// into the game, and the shaders compiled before the hero loaded (render/warmup.js) were not
// the ones it took to draw the world.
const light = new THREE.PointLight(0xffd9a0, 1.2, 3.5, 2);
scene.add(light);
// every frame, once the figure stands where it stands (main.js)
export function followHero() {
  const g = character.group;
  if (character.ready && g.visible && g.parent === scene) light.position.set(g.position.x, g.position.y + 0.9, g.position.z);
  else light.intensity = 0;
}
const weapons = new Map();
let loadRequest = 0;

// the GLB node of a weapon model that carries its extras (blender/items.py, sword.py)
const itemNode = weapon => { let n = null; weapon.traverse(o => { if (!n && o.userData.weapon) n = o; }); return n; };

// Weapons are separate props. The character GLB contains only the body and hand sockets. A
// weapon says in its extras which socket it goes in and how it sits there (mount_quat_gltf;
// a flask readied to throw also mount_offset_gltf and mount_scale, as it is modelled to stand
// on the floor); the Old Sword (assets/sword.glb) predates that and sits like the other swords.
export function equipSword(weapon) {
  loadRequest++;
  if (character.sword) character.sword.removeFromParent();
  character.sword = weapon;
  character.held = null;
  if (!weapon) return;
  character.held = prepareHeld(weapon, mountWeapon(character.bones, weapon));
}

// put a weapon model in its socket among `bones` (the player's or another figure's), sitting
// as its extras say; returns its item node
export function mountWeapon(bones, weapon) {
  const item = itemNode(weapon), d = item?.userData ?? {};
  bones[d.socket ?? 'hand.R'].add(weapon);
  weapon.position.fromArray(d.mount_offset_gltf ?? [0, 0, 0]);   // glTF bone origins are socket heads, not Blender tails
  weapon.scale.setScalar(d.mount_scale ?? 1);
  if (d.mount_quat_gltf) weapon.quaternion.fromArray(d.mount_quat_gltf);
  else weapon.rotation.set(Math.PI / 3, 0, 0);   // +Y blade axis -> 60 degrees from forearm
  weapon.traverse(o => { if (o.isMesh) o.castShadow = true; });   // rigid on a bone: culled by its own bounds
  return item;
}

export async function prepareSword(url = SWORD_URL) {
  await characterReady;
  if (!weapons.has(url)) weapons.set(url, loadGLB(url).then(g => g.scene)
    .catch(error => { weapons.delete(url); throw error; }));
  return weapons.get(url);
}
export async function loadSword(url = SWORD_URL) {
  const request = ++loadRequest, weapon = await prepareSword(url);
  if (request === loadRequest) equipSword(weapon);
  return weapon;
}

// a frame range of a clip; the hips never rise above standing height in it, because in the
// game the controller moves the body through the air, not the animation
function part(clip, name, from, to) {
  const c = THREE.AnimationUtils.subclip(clip, name, from, to, FPS);
  const t = c.tracks.find(t => t.name === 'hips.position');
  if (t) for (let i = 2; i < t.values.length; i += 3) t.values[i] = Math.min(t.values[i], STAND_HIPS);
  return c;
}

function setup(gltf) {
  const model = gltf.scene;
  model.scale.setScalar(CHAR_SCALE);
  const group = new THREE.Group();
  group.add(model);
  let mesh = null;
  model.traverse(o => { if (o.isSkinnedMesh) mesh = o; if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  ownShadowDepth(model);
  // the body's meshes, for tintCharacter (not what is worn or held later)
  const clay = [];
  model.traverse(o => { if (o.isMesh) clay.push(o); });
  for (const o of clay) {
    o.material = o.material.clone();
    o.userData.skinMaterial = true;
    o.userData.clay = o.material.color.clone();
  }

  // silhouette shown where the character is hidden behind terrain
  const ghost = new THREE.SkinnedMesh(mesh.geometry, new THREE.MeshBasicMaterial({
    color: 0xffe9a8, transparent: true, opacity: 0.4, depthFunc: THREE.GreaterDepth, depthWrite: false }));
  ghost.bind(mesh.skeleton, mesh.bindMatrix);
  ghost.renderOrder = 999; ghost.frustumCulled = false;
  mesh.parent.add(ghost);
  // drawn after the silhouette, so the silhouette only shows where terrain hides the body
  mesh.material.transparent = true;
  mesh.material.forceSinglePass = true;   // a solid body: one pass, not back faces and then front ones
  mesh.renderOrder = 1000;

  // bones by their Blender names ("upper_arm.L", ...)
  const bones = {};
  model.traverse(o => { if (o.isBone) bones[o.userData.name || o.name] = o; });

  const clips = Object.fromEntries(gltf.animations.map(c => [c.name, c]));
  const extras = name => gltf.parser.json.animations.find(a => a.name === name)?.extras || {};
  const J = clips.Jump, S = clips.JumpLandSit;
  const defs = {
    idle: part(J, 'Idle', 0, 2),          // the neutral standing pose
    walk: clips.Walk, run: clips.Run,
    swim: clips.Swim, swimIdle: clips.SwimIdle,   // authored for floating chest deep
    climb: clips.Climb,   // in-place ladder grips and steps
    jump: part(J, 'JumpUp', 15, 27),      // push-off into the rising pose
    fall: part(J, 'Fall', 26, 31),        // tucked pose around the apex
    land: part(J, 'Land', 37, 58),        // compression + recovery
    sit: part(S, 'SitLand', 36, 78),      // lose balance, land on the bottom, stay sitting
    getUpBack: clips.GetUpBack, getUpFront: clips.GetUpFront,   // from lying to standing
  };
  // all actions run all the time; the animator drives their weights and times by hand
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const [k, clip] of Object.entries(defs)) {
    const a = mixer.clipAction(clip);
    a.play(); a.timeScale = 0; a.setEffectiveWeight(k === 'idle' ? 1 : 0);
    actions[k] = a;
  }
  // each kind of weapon's attack clip, twice: a chained attack cross-fades from one to the other
  const attacks = {};
  for (const [kind, name] of [['sword', 'Slash'], ['bow', 'Shoot'], ['crossbow', 'CrossbowShot'], ['staff', 'Cast'], ['throw', 'Throw']]) {
    attacks[kind] = [clips[name], clips[name].clone()].map(clip => {
      const a = mixer.clipAction(clip);
      a.play(); a.timeScale = 0; a.setEffectiveWeight(0);
      return a;
    });
  }
  // how the ranged kinds are carried: their Hold clips' arm bones and rotations, laid over the
  // other clips by the animator
  const holds = {};
  for (const clip of gltf.animations.filter(c => extras(c.name).weapon)) {
    const names = extras(clip.name).arm_bones.split(',');
    holds[extras(clip.name).weapon] = names.map(n => {
      const bone = bones[n], track = clip.tracks.find(t => t.name === `${bone.name}.quaternion`);
      return [bone, new THREE.Quaternion().fromArray(track.values, 0)];
    });
  }
  // ground covered per animation cycle, so foot speed can match the actual speed
  const stride = name => extras(name).speed * clips[name].duration * CHAR_SCALE;

  scene.add(group);
  // where the hips lie at the start of each get-up (group space, unturned): the game puts the
  // player where the feet end up
  const getUps = {};
  for (const [side, name, a] of [['back', 'GetUpBack', actions.getUpBack], ['front', 'GetUpFront', actions.getUpFront]]) {
    actions.idle.setEffectiveWeight(0); a.setEffectiveWeight(1); a.time = 0;
    mixer.update(0);
    const hips = bones.hips.getWorldPosition(new THREE.Vector3()).sub(group.position);
    a.setEffectiveWeight(0); actions.idle.setEffectiveWeight(1);
    getUps[side] = { action: a, duration: clips[name].duration, move: extras(name).move_time, lie: [hips.x, hips.z] };
  }
  const footfalls = measureFootfalls(group, bones, actions, mixer);
  // reference (standing) pose for exaggerating strides
  mixer.update(0);
  const standing = Object.fromEntries(Object.entries(bones).map(([n, b]) => [n, b.quaternion.clone()]));
  Object.assign(character, {
    ready: true, group, model, mesh, bones, mixer, actions, attacks, holds, standing, light, getUps, footfalls, worn: {}, clay, tint: null,
    sword: null, held: null, swordWeight: 0, holdWeight: 0, getUpWeight: 0,
    walkStride: stride('Walk'), runStride: stride('Run'), swimStride: stride('Swim'),
    climbStride: extras('Climb').distance * CHAR_SCALE,
  });
}

// When each foot comes down in the walk and run cycles (phase 0..1, [left, right]), for the
// footsteps (game/footsteps.js). The rig has no foot bones: the ankle is the knee plus a
// shin's length along the shin. A foot is down once it dropped most of the way to its lowest.
// On the ladder (climb: { hand, foot }) a hand grabs and a foot steps onto a rung at the top of
// its reach, before pulling down (the clip climbs in place).
function measureFootfalls(group, bones, actions, mixer) {
  const v = new THREE.Vector3(), d = new THREE.Vector3(), q = new THREE.Quaternion(), n = 64;
  mixer.update(0);
  const shin = (bones['shin.L'].getWorldPosition(v).y - group.position.y) * 0.92;   // standing: knee height
  const ankle = side => {
    const b = bones['shin.' + side];
    return b.getWorldPosition(v).y + d.set(0, 1, 0).applyQuaternion(b.getWorldQuaternion(q)).y * shin;
  };
  const down = ys => {
    const lo = Math.min(...ys), th = lo + 0.2 * (Math.max(...ys) - lo);
    for (let i = 0; i < n; i++) {
      const a = ys[(i + n - 1) % n], b = ys[i];
      if (a > th && b <= th) return ((i - 1 + (a - th) / (a - b)) / n + 1) % 1;
    }
    return ys.indexOf(lo) / n;
  };
  const top = ys => ys.indexOf(Math.max(...ys)) / n;
  const sample = name => {
    const a = actions[name], dur = a.getClip().duration, ys = { L: [], R: [], hL: [], hR: [] };
    actions.idle.setEffectiveWeight(0); a.setEffectiveWeight(1);
    for (let i = 0; i < n; i++) {
      a.time = i / n * dur; mixer.update(0);
      ys.L.push(ankle('L')); ys.R.push(ankle('R'));
      ys.hL.push(bones['hand.L'].getWorldPosition(v).y); ys.hR.push(bones['hand.R'].getWorldPosition(v).y);
    }
    a.setEffectiveWeight(0); actions.idle.setEffectiveWeight(1);
    return ys;
  };
  const out = {};
  for (const name of ['walk', 'run']) { const ys = sample(name); out[name] = [down(ys.L), down(ys.R)]; }
  const ys = sample('climb');
  out.climb = { hand: [top(ys.hL), top(ys.hR)], foot: [top(ys.L), top(ys.R)] };
  return out;
}

// Playing together every player wears their colour, on every screen: our own hero too (the
// others see it like that, render/partner.js). color: a CSS colour, or null (as exported, alone)
export function tintCharacter(color = null) {
  if (!character.ready || character.tint === color) return;
  character.tint = color;
  for (const o of character.clay) {
    // its own copy first: the materials are shared with the rig the other figures are made from
    if (!o.userData.clay) { o.material = o.material.clone(); o.userData.clay = o.material.color.clone(); }
    o.material.color.copy(color ? new THREE.Color(color) : o.userData.clay);
  }
}

let skinRequest = 0, skinTexture = null;
export async function setCharacterSkin(skin = null) {
  const request = ++skinRequest;
  try {
    await characterReady;
    if (request !== skinRequest) return;
    // Never leave a previous hero's paint on screen while a new image is loading.
    for (const mesh of character.clay) setSkinMap(mesh, null);
    skinTexture?.dispose(); skinTexture = null;
    const blob = await readSkinFile(skin);
    if (!blob || request !== skinRequest) return;
    const canvas = await skinImage(blob);
    if (request !== skinRequest) return;
    skinTexture = new THREE.CanvasTexture(canvas);
    skinTexture.colorSpace = THREE.SRGBColorSpace;
    skinTexture.generateMipmaps = false;
    skinTexture.minFilter = THREE.LinearFilter;
    for (const mesh of character.clay) setSkinMap(mesh, skinTexture);
  } catch (e) { console.error('skin failed to apply', e); }
}

export const characterReady = rigReady.then(setup);
characterReady.catch(e => console.error('character failed to set up', e));
