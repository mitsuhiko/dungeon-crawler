// The camera, in one of two views (docs/camera.md), the settings say which (game/settings.js,
// the camera key: game/camerakey.js). The overview: a fixed ~45 degree perspective camera that
// frames the whole cube; zooming in follows the player. The close view: behind the hero on an
// arm that gets shorter where something is in the way, with a wide lens. Going from one to the
// other blends where the camera is, where it looks and its lens (the close view's field of view is
// a setting).
import * as THREE from 'three';
import { N, CUBE_H, BASE, LH } from '../core/constants.js';
import { clamp } from '../core/util.js';
import { OVERVIEW_FOV, BLEND_TIME, ANCHOR, AHEAD, closeDistance, snapYaw } from '../core/view.js';
import { camera } from '../render/scene.js';
import { character } from '../render/character.js';
import { insideSolid, ceilingAt, cellAt } from '../physics/collide.js';
import { standingAt } from '../physics/fluid.js';
import { viewBlockedAt } from '../core/blockers.js';
import { player, state, view } from './state.js';
import { cameraMode, closeFov } from './settings.js';
import { kick, tremor } from './juice.js';

// learn: drawing.html#camera (see learn/README.md)
const pitch = THREE.MathUtils.degToRad(44);
const cubeCenter = new THREE.Vector3(N / 2, CUBE_H / 2 - BASE - 1.5, N / 2);
const target = new THREE.Vector3(), focus = new THREE.Vector3();
const overPos = new THREE.Vector3(), overQuat = new THREE.Quaternion();
const closePos = new THREE.Vector3(), closeQuat = new THREE.Quaternion(), look = new THREE.Vector3();
const m4 = new THREE.Matrix4();

let blend = 0;      // 0: the overview, 1: the close view
let arm = null;     // the close view's arm as it is now (null: not out)

// how far into the close view the camera is (0..1), and whether it counts as there: the cutaway
// is off, the walls stay up, the player's bar sits at the bottom of the screen
export const closeAmount = () => blend;
export const closeView = () => blend >= 0.5;
export const closeArm = () => arm;

const quatLooking = (q, from, to) => q.setFromRotationMatrix(m4.lookAt(from, to, camera.up));

function overview() {
  const follow = clamp((1 - view.zoom) / 0.6, 0, 1) * 0.9;
  target.copy(cubeCenter).lerp(focus.set(player.x, player.visY + 0.5, player.z), follow);
  // distance that fits the cube's bounding sphere into the narrower field of view
  const fovV = THREE.MathUtils.degToRad(OVERVIEW_FOV);
  const fovH = 2 * Math.atan(Math.tan(fovV / 2) * camera.aspect);
  const fitRadius = state.map?.qualmos?.kind === 'planet' ? state.map.qualmos.planetRadius : 12.5;
  const d = fitRadius / Math.sin(Math.min(fovV, fovH) / 2) * view.zoom;
  // hit kicks shove the whole view a little (scaled with the view distance)
  const s = d * 0.03;
  target.x += kick.x * s; target.y += kick.y * s; target.z += kick.z * s;
  overPos.set(
    target.x + Math.sin(view.yaw) * Math.cos(pitch) * d,
    target.y + Math.sin(pitch) * d,
    target.z + Math.cos(view.yaw) * Math.cos(pitch) * d);
  quatLooking(overQuat, overPos, target);
}

// --- the close view -----------------------------------------------------------------------------

const MIN_ARM = 0.3, CLEAR = 0.3, PROBE = 0.05, GROW = 3;   // units, units, units, 1/s
// does the close camera's arm run into something at (x, y, z)? What hides the hero from the
// overview too (tree crowns, roofs: core/blockers.js), even where it reaches out of the cube;
// out of it nothing else (but in a house: everything beyond the room, its walls are only drawn)
function solidAt(x, y, z) {
  const m = state.map, room = m.interior?.room;
  if (room) return x < room.x0 || z < room.z0 || x > room.x1 || z > room.z1 || insideSolid(x, z, y);
  if (viewBlockedAt(m, x, y, z)) return true;
  if (x < 0 || z < 0 || x >= N || z >= N) return false;
  return insideSolid(x, z, y);
}
// how long the arm from (x, y, z) along d can be, at most `len`
function reach(x, y, z, d, len) {
  for (let s = PROBE; s <= len + CLEAR; s += PROBE) {
    if (solidAt(x + d.x * s, y + d.y * s, z + d.z * s)) return Math.max(MIN_ARM, Math.min(len, s - CLEAR));
  }
  return len;
}
// fluids have no underside: the camera stays over their surface
function overFluids(p) {
  const i = cellAt(p.x, p.z);
  if (i < 0 || !state.map) return;
  for (const f of state.map.cols[i]) {
    if (!f.fluid) continue;
    const surf = f.surf * LH + 0.15;
    if (p.y < surf && p.y > f.top * LH - 1) p.y = surf;
  }
  // and standing water (a rising trial's, a boss's tide: physics/fluid.js), over everything there
  const s = standingAt(p.x, p.z);
  if (s && p.y < s.y + 0.15) p.y = s.y + 0.15;
}

const dir = new THREE.Vector3();
function close(dt) {
  const p = player, collide = !!state.map && !state.transitioning;
  // the pivot at the shoulders, under a low ceiling a little below it
  let y = p.visY + ANCHOR;
  if (collide) y = Math.max(p.visY + 0.5, Math.min(y, ceilingAt(p.x, p.z, p.visY + 0.5) - 0.25));
  look.set(p.x, y, p.z);
  dir.set(Math.sin(view.yaw) * Math.cos(view.pitch), Math.sin(view.pitch), Math.cos(view.yaw) * Math.cos(view.pitch));
  const want = closeDistance(view.zoom);
  // travelling, the player and the cubes slide together and the map is the new cube's: the arm
  // keeps its length
  const free = collide ? reach(look.x, look.y, look.z, dir, want) : arm ?? want;
  // in at once (nothing may stand between), out again gently
  arm = arm === null || free < arm ? free : arm + (free - arm) * Math.min(1, dt * GROW);
  closePos.copy(look).addScaledVector(dir, arm);
  if (collide) overFluids(closePos);
  closePos.x += kick.x * 0.06; closePos.y += kick.y * 0.06; closePos.z += kick.z * 0.06;
  quatLooking(closeQuat, closePos, look.addScaledVector(dir, -AHEAD));
}

// the hero fades out when the camera comes very close (a narrow room, a wall at the back)
const FADE_FROM = 1, FADE_TO = 0.55;
function fadeHero() {
  if (!character.ready) return;
  const a = arm === null || blend < 0.5 ? 1 : clamp((arm - FADE_TO) / (FADE_FROM - FADE_TO), 0, 1);
  const m = character.mesh.material;
  m.opacity = a;
  m.depthWrite = a > 0.99;
}

// The ground shaking (game/juice.js quake: a giant's stomp, his landing): the view trembles
// about where it looks, a jitter of a few sines (not noise: it rolls rather than buzzes), dying away
const jolt = new THREE.Quaternion(), joltAngles = new THREE.Euler();
function shake(dt) {
  tremor.t += dt;
  tremor.a *= Math.exp(-dt * 5);
  if (tremor.a < 1e-4) { tremor.a = 0; return; }
  const t = tremor.t, a = tremor.a;
  joltAngles.set(a * (Math.sin(t * 41) + 0.6 * Math.sin(t * 67 + 1.3)) / 1.6, a * 0.6 * Math.sin(t * 29 + 2.1),
    a * 0.8 * (Math.sin(t * 53 + 0.7) + 0.5 * Math.sin(t * 83)) / 1.5);
  camera.quaternion.multiply(jolt.setFromEuler(joltAngles));
}

const ease = t => t * t * (3 - 2 * t);
// the close view only while playing (the main menu shows the cube from above)
const goal = () => (state.mode === 'play' && cameraMode() === 'close' ? 1 : 0);
// straight into the view the settings ask for, no blend (tests)
export function settleCamera() { blend = goal(); arm = null; updateCamera(0); }

export function updateCamera(dt) {
  view.yaw += (view.yawTarget - view.yaw) * Math.min(1, dt * 8);
  view.zoom += (view.zoomTarget - view.zoom) * Math.min(1, dt * 8);
  const want = goal();
  // back to the overview (the key, the settings): it looks from one of its four sides again
  if (!want && blend > 0) view.yawTarget = snapYaw(view.yawTarget);
  if (state.mode !== 'play') blend = 0;
  else blend = want > blend ? Math.min(want, blend + dt / BLEND_TIME) : Math.max(want, blend - dt / BLEND_TIME);
  // hit kicks spring back
  const decay = Math.exp(-dt * 16);
  kick.x *= decay; kick.y *= decay; kick.z *= decay;
  overview();
  if (blend > 0) close(dt);
  else arm = null;
  const t = ease(blend);
  if (t <= 0) { camera.position.copy(overPos); camera.quaternion.copy(overQuat); }
  else if (t >= 1) { camera.position.copy(closePos); camera.quaternion.copy(closeQuat); }
  else { camera.position.lerpVectors(overPos, closePos, t); camera.quaternion.slerpQuaternions(overQuat, closeQuat, t); }
  shake(dt);
  const fov = OVERVIEW_FOV + (closeFov() - OVERVIEW_FOV) * t;   // (the close view's: the settings)
  if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  camera.updateMatrixWorld();
  fadeHero();
}
